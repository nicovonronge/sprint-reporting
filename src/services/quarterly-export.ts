import { getDataGuide } from '../constants/data-guide.js';
import { getTeamName } from '../constants/workflow.js';
import { fileSafe, peopleTicketsTable, toCsv, zipFiles } from './bulk-export.js';
import { BUSINESS_DAY_HOURS, collectQuarterlyPeople, compareScope, measureDefs, measureValues, type QuarterlyPeopleData } from './quarterly-report.js';
import type { PeopleReport, PersonRole } from '../types/people-report.js';
import type { MeasureDef, MeasureValues, QuarterlyMode, QuarterlyNotes, QuarterlyReport, QuarterlyRequest, RoleSection } from '../types/quarterly-report.js';

/** Downloads of the quarterly report: a JSON export (data plus guide), CSVs and a ZIP of both. */

const STEPS = [
  'Each chosen developer and QA tester was reported on separately in each period, exactly as in the people report (same credit rules, same board baseline).',
  'Developers and QA testers with no tickets in a period are left out of that period\'s figures and averages.',
  'Developer average is the plain average of the people\'s figures. Board is every ticket in the same sprints or dates (QA board: every ticket with a QA assignee).',
  'Each measure was compared previous against current and marked Better, Worse or Same (under 2% change). Tickets, story points and linked defects are volume and are not scored.',
  'The verdict follows the fixed rule in the data guide.',
  'Times in the JSON are business days (a business day is 9 hours). Times in the CSV files are business hours.',
];

/** The JSON file: { info, generation, data, notes }, like the other report exports. */
export function buildQuarterlyExport(report: QuarterlyReport, notes: QuarterlyNotes | null) {
  return {
    info: getDataGuide('quarterly'),
    generation: {
      generatedAt: report.generatedAt,
      projectKey: report.projectKey,
      teamName: report.teamName,
      mode: report.mode,
      previous: { label: report.previous.label, description: report.previous.description, period: report.previous.period, sprints: report.previous.sprints.map(s => s.sprintName) },
      current: { label: report.current.label, description: report.current.description, period: report.current.period, sprints: report.current.sprints.map(s => s.sprintName) },
      developers: report.dev?.current.people.map(p => p.person) ?? [],
      qaTesters: report.qa?.current.people.map(p => p.person) ?? [],
      notesWrittenByAi: notes !== null,
      steps: STEPS,
    },
    data: report,
    notes,
  };
}

const round = (v: number | null | undefined, places: number): number | null =>
  v == null ? null : Math.round(v * 10 ** places) / 10 ** places;

/** CSV cell for a measure: times become business hours, rates whole percentages. */
function cell(def: MeasureDef, value: number | null | undefined): number | null {
  if (value == null) return null;
  if (def.unit === 'days') return round(value * BUSINESS_DAY_HOURS, 2);
  if (def.unit === 'pct') return round(value * 100, 1);
  return round(value, 2);
}

const unitName = (u: MeasureDef['unit']) => u === 'days' ? 'business hours' : u === 'pct' ? 'percent' : u;

/** One row per measure and scope: previous, current, change and result. */
export function quarterlyCompareCsv(report: QuarterlyReport): string {
  const defs = new Map<string, MeasureDef>();
  for (const sec of [report.dev, report.qa]) for (const d of sec?.measures ?? []) defs.set(d.id, d);
  const rows = report.comparison.rows.map(r => {
    const def = defs.get(r.measure)!;
    return [
      report.teamName ?? '', report.projectKey, r.scope, r.section, r.label, unitName(r.unit),
      cell(def, r.previous), cell(def, r.current),
      r.change == null ? '' : r.changeKind === 'pts' ? round(r.change * 100, 1) : round(r.change * 100, 0),
      r.changeKind === 'pts' ? 'percentage points' : r.changeKind === 'pct' ? 'percent' : '',
      r.result,
    ];
  });
  return toCsv(['team', 'project', 'scope', 'section', 'measure', 'unit', report.previous.label, report.current.label, 'change', 'change_unit', 'result'], rows);
}

/** One row per person, plus the average and board rows, for every period and role. */
export function quarterlyPeopleCsv(report: QuarterlyReport): string {
  const rows: Array<Array<string | number | null>> = [];
  const add = (sec: RoleSection | null, role: string) => {
    if (!sec) return;
    for (const [side, label] of [[sec.previous, report.previous.label], [sec.current, report.current.label]] as const) {
      const emit = (group: string, person: string, values: MeasureValues) => rows.push([
        report.teamName ?? '', report.projectKey, label, role, group, person,
        ...sec.measures.map(d => cell(d, values[d.id])),
      ]);
      for (const p of side.people) emit('person', p.person, p.values);
      emit('average', 'Average', side.average);
      emit('board', 'Board', side.board);
    }
  };
  add(report.dev, 'dev');
  add(report.qa, 'qa');

  // Dev and QA have different lane columns, so use the union of measure ids in first-seen order.
  const defs = new Map<string, MeasureDef>();
  for (const sec of [report.dev, report.qa]) for (const d of sec?.measures ?? []) if (!defs.has(d.id)) defs.set(d.id, d);
  const ids = [...defs.keys()];
  const rowsAligned = rows.map(r => {
    const head = r.slice(0, 6);
    const role = r[3] as string;
    const sec = role === 'dev' ? report.dev! : report.qa!;
    const byId = new Map(sec.measures.map((d, i) => [d.id, r[6 + i]]));
    return [...head, ...ids.map(id => byId.get(id) ?? null)];
  });
  return toCsv(
    ['team', 'project', 'period', 'role', 'group', 'person', ...ids.map(id => `${id}${defs.get(id)!.unit === 'days' ? '_business_hours' : defs.get(id)!.unit === 'pct' ? '_pct' : ''}`)],
    rowsAligned,
  );
}

// ---------------------------------------------------------------- per person (for KPI / AI use)

const PERSON_STEPS = [
  'Each chosen developer and QA tester has one JSON file per role, holding both periods side by side: the headline figures, the board figures for context, the change from previous to current, and the full people report (summary, lanes, every ticket) for each period.',
  'No AI-written notes and no team verdict are included. The files hold the measured figures only.',
  'Each person was reported on exactly as in the people report (same credit rules, same board baseline). People with no tickets in either period are left out.',
  'In the JSON "kpi" figures, times are business days (a business day is 9 hours) and rates are fractions from 0 to 1. The full people reports keep times in milliseconds of business time, as the people report does.',
  'CSV times are business hours (days times 9) and rates are whole percentages.',
];

/** Change rows for one person or board: no scope column, since the file says whose figures they are. */
function changeRows(defs: MeasureDef[], previous: MeasureValues, current: MeasureValues) {
  return compareScope('board', defs, previous, current).map(({ scope: _scope, ...row }) => row);
}

interface PersonRoleFile {
  person: string;
  role: PersonRole;
  file: string;
  json: unknown;
  previous: PeopleReport;
  current: PeopleReport;
}

function personFiles(data: QuarterlyPeopleData, projectKey: string, mode: QuarterlyMode, notesSkipped: string[]): PersonRoleFile[] {
  const used = new Set<string>();
  const out: PersonRoleFile[] = [];
  for (const role of ['dev', 'qa'] as const) {
    const prevReports = data.previous[role], curReports = data.current[role];
    const defs = measureDefs(role);
    for (const cur of curReports) {
      const prev = prevReports.find(r => r.person === cur.person);
      if (!prev) continue;
      if (prev.summary.tickets === 0 && cur.summary.tickets === 0) {
        notesSkipped.push(`${cur.person} (${role}) has no tickets in either period and is not exported.`);
        continue;
      }
      const side = (r: PeopleReport) => ({ tickets: r.summary.tickets, person: measureValues(r.summary, role), board: measureValues(r.team, role), boardTickets: r.team.tickets });
      const p = side(prev), c = side(cur);
      const { dataGuide: _a, ...previousReport } = prev;
      const { dataGuide: _b, ...currentReport } = cur;
      const file = `people/${fileSafe(`${cur.person}_${role}`, used)}.json`;
      out.push({
        person: cur.person, role, file, previous: prev, current: cur,
        json: {
          person: cur.person,
          role,
          projectKey,
          teamName: getTeamName(projectKey),
          mode,
          periods: { previous: data.previous.info, current: data.current.info },
          measures: defs,
          kpi: {
            previous: p,
            current: c,
            change: { person: changeRows(defs, p.person, c.person), board: changeRows(defs, p.board, c.board) },
          },
          previous: previousReport,
          current: currentReport,
        },
      });
    }
  }
  return out;
}

const kpiHeader = (d: MeasureDef) => `${d.id}${d.unit === 'days' ? '_business_hours' : d.unit === 'pct' ? '_pct' : ''}`;

/** One row per person, role, period and group (person or board), with every measure. */
function personKpiCsv(files: PersonRoleFile[], data: QuarterlyPeopleData, projectKey: string): string {
  const defs = new Map<string, MeasureDef>();
  for (const role of ['dev', 'qa'] as const) for (const d of measureDefs(role)) if (!defs.has(d.id)) defs.set(d.id, d);
  const ids = [...defs.keys()];
  const rows: Array<Array<string | number | null>> = [];
  for (const f of files) {
    for (const [period, info, r] of [['previous', data.previous.info, f.previous], ['current', data.current.info, f.current]] as const) {
      const roleDefs = new Map(measureDefs(f.role).map(d => [d.id, d]));
      for (const [group, summary] of [['person', r.summary], ['board', r.team]] as const) {
        const values = measureValues(summary, f.role);
        rows.push([
          getTeamName(projectKey) ?? '', projectKey, period, info.label, f.role, f.person, group,
          ...ids.map(id => { const d = roleDefs.get(id); return d ? cell(d, values[id]) : null; }),
        ]);
      }
    }
  }
  return toCsv(['team', 'project', 'period', 'period_label', 'role', 'person', 'group', ...ids.map(id => kpiHeader(defs.get(id)!))], rows);
}

/**
 * ZIP for KPI / AI use, one person at a time: index.json, kpi.csv, tickets.csv and one JSON per person and role
 * (previous and current side by side). No AI notes and no verdict.
 */
export function buildQuarterlyPersonZip(req: QuarterlyRequest): Buffer {
  return personZipFrom(collectQuarterlyPeople(req), req.projectKey, req.mode);
}

/** Pure part of the person ZIP: no cache or Jira access. */
export function personZipFrom(data: QuarterlyPeopleData, projectKey: string, mode: QuarterlyMode): Buffer {
  const req = { projectKey, mode };
  const skipped: string[] = [];
  const files = personFiles(data, req.projectKey, req.mode, skipped);
  if (files.length === 0) throw new Error('None of the chosen people have tickets in either period.');

  const ticketRows = (['previous', 'current'] as const).map(period =>
    peopleTicketsTable(files.map(f => f[period]), { headers: ['period', 'period_label'], values: () => [period, data[period].info.label] }));
  // Lane columns can differ between the two periods, so line them up under one header set.
  const headers = [...new Set(ticketRows.flatMap(t => t.headers))];
  const rows = ticketRows.flatMap(t => t.rows.map(row => headers.map(h => { const i = t.headers.indexOf(h); return i < 0 ? null : row[i]; })));

  const index = {
    info: { quarterly: getDataGuide('quarterly'), people: getDataGuide('people') },
    generation: {
      generatedAt: new Date().toISOString(),
      projectKey: req.projectKey,
      teamName: getTeamName(req.projectKey),
      mode: req.mode,
      previous: { label: data.previous.info.label, description: data.previous.info.description, period: data.previous.info.period, sprints: data.previous.info.sprints.map(s => s.sprintName) },
      current: { label: data.current.info.label, description: data.current.info.description, period: data.current.info.period, sprints: data.current.info.sprints.map(s => s.sprintName) },
      people: files.map(f => ({ person: f.person, role: f.role, file: f.file })),
      notExported: skipped,
      files: ['index.json', 'kpi.csv', 'tickets.csv', ...files.map(f => f.file)],
      steps: PERSON_STEPS,
    },
  };

  return zipFiles([
    { name: 'index.json', data: JSON.stringify(index, null, 2) },
    { name: 'kpi.csv', data: personKpiCsv(files, data, req.projectKey) },
    { name: 'tickets.csv', data: toCsv(headers, rows) },
    ...files.map(f => ({ name: f.file, data: JSON.stringify(f.json, null, 2) })),
  ]);
}

/** ZIP: report.json (info, generation, data, notes), compare.csv and people.csv. */
export function buildQuarterlyZip(report: QuarterlyReport, notes: QuarterlyNotes | null): Buffer {
  return zipFiles([
    { name: 'report.json', data: JSON.stringify(buildQuarterlyExport(report, notes), null, 2) },
    { name: 'compare.csv', data: quarterlyCompareCsv(report) },
    { name: 'people.csv', data: quarterlyPeopleCsv(report) },
  ]);
}
