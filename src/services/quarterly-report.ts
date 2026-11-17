import { listCached, load } from '../cache/cache-manager.js';
import { getTeamName } from '../constants/workflow.js';
import { WORKDAY_START_HOUR_UTC, WORKDAY_END_HOUR_UTC } from '../utils/date-utils.js';
import { buildPeopleReport, listPeopleOptions } from './people-report.js';
import type { PeoplePeriod, PeopleReport, PeopleSummary, PersonRole } from '../types/people-report.js';
import type {
  Better,
  CompareResult,
  CompareScope,
  ComparisonRow,
  MeasureDef,
  MeasureUnit,
  MeasureValues,
  PersonComparison,
  PersonHints,
  PersonMeasures,
  QuarterlyComparison,
  QuarterlyMode,
  QuarterlyOptions,
  QuarterlyPeriodInfo,
  QuarterlyPeriodSpec,
  QuarterlyReport,
  QuarterlyRequest,
  RoleSection,
  RoleSide,
  SameDeveloperTotals,
  ScopeSummary,
  Verdict,
} from '../types/quarterly-report.js';

/**
 * Quarterly report: two periods (sprints or date ranges) of the same team, with the same people
 * reported on in each, scored period against period. Every figure comes from `buildPeopleReport`,
 * so cycles, lane time, turnaround and credit follow the people-report rules (see CLAUDE.md).
 */

const MS_PER_HOUR = 3_600_000;
export const BUSINESS_DAY_HOURS = WORKDAY_END_HOUR_UTC - WORKDAY_START_HOUR_UTC;
/** One business day: the working window (9 hours), not 24. */
export const BUSINESS_DAY_MS = BUSINESS_DAY_HOURS * MS_PER_HOUR;

const SMALL_SAMPLE_TICKETS = 20;
/** A change smaller than this (relative) counts as "Same". */
const SAME_THRESHOLD = 0.02;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------- measures

const LANE_MEASURES: Record<PersonRole, Array<{ lane: string; prefix: string; label: string }>> = {
  dev: [
    { lane: 'TO DO', prefix: 'todo', label: 'To Do' },
    { lane: 'IN DEVELOPMENT', prefix: 'dev', label: 'In Development' },
  ],
  qa: [
    { lane: 'READY FOR QA', prefix: 'ready_qa', label: 'Ready for QA' },
    { lane: 'IN QA', prefix: 'in_qa', label: 'In QA' },
  ],
};

/** The measure ids of the lane the role owns (dev: In Development, qa: In QA). */
const OWN_LANE_PREFIX: Record<PersonRole, string> = { dev: 'dev', qa: 'in_qa' };

export function measureDefs(role: PersonRole): MeasureDef[] {
  const m = (id: string, section: MeasureDef['section'], label: string, unit: MeasureUnit, better: Better): MeasureDef =>
    ({ id, section, label, unit, better });
  return [
    m('tickets', 'Throughput', 'Tickets', 'count', 'neutral'),
    m('completed', 'Throughput', 'Completed', 'count', 'higher'),
    m('completion_rate', 'Throughput', 'Completion rate', 'pct', 'higher'),
    m('story_points', 'Throughput', 'Story points', 'count', 'neutral'),
    m('completed_sp', 'Throughput', 'Completed story points', 'count', 'higher'),
    m('sp_completion', 'Throughput', 'Story point completion', 'pct', 'higher'),
    m('avg_turnaround', 'Speed', 'Avg turnaround', 'days', 'lower'),
    m('median_turnaround', 'Speed', 'Median turnaround', 'days', 'lower'),
    ...LANE_MEASURES[role].flatMap(l => [
      m(`${l.prefix}_avg`, 'Speed', `${l.label} avg`, 'days', 'lower'),
      m(`${l.prefix}_median`, 'Speed', `${l.label} median`, 'days', 'lower'),
    ]),
    m('cycles', 'Quality', role === 'dev' ? 'Dev cycles (QA Failed)' : 'QA cycles (PO Review Failed)', 'count', 'lower'),
    m('cycles_per_ticket', 'Quality', 'Cycles per ticket', 'ratio', 'lower'),
    m('rework_free', 'Quality', 'Rework-free rate', 'pct', 'higher'),
    m('linked_defects', 'Quality', 'Linked defects', 'count', 'neutral'),
    m('defects_per_ticket', 'Quality', 'Defects per ticket', 'ratio', 'lower'),
  ];
}

const days = (ms: number | null | undefined): number | null => ms == null ? null : ms / BUSINESS_DAY_MS;

/** All measure values of one summary (a person's, or the board's) for a role. Times in business days. */
export function measureValues(s: PeopleSummary, role: PersonRole): MeasureValues {
  const v: MeasureValues = {
    tickets: s.tickets,
    completed: s.completed,
    completion_rate: s.tickets > 0 ? s.completed / s.tickets : null,
    story_points: s.storyPoints,
    completed_sp: s.completedStoryPoints,
    sp_completion: s.storyPoints > 0 ? s.completedStoryPoints / s.storyPoints : null,
    avg_turnaround: days(s.avgTurnaroundMs),
    median_turnaround: days(s.medianTurnaroundMs),
    cycles: s.totalCycles,
    cycles_per_ticket: s.tickets > 0 ? s.totalCycles / s.tickets : null,
    rework_free: s.reworkFreeRate,
    linked_defects: s.linkedDefects,
    defects_per_ticket: s.tickets > 0 ? s.linkedDefects / s.tickets : null,
  };
  for (const l of LANE_MEASURES[role]) {
    const stat = s.lanes.find(x => x.swimlane === l.lane);
    v[`${l.prefix}_avg`] = days(stat?.avgMs);
    v[`${l.prefix}_median`] = days(stat?.medianMs);
  }
  return v;
}

/** Plain-language form of a figure, for notes and chat ("85%", "1.25 days", "12"). */
export function formatMeasureValue(value: number | null | undefined, unit: MeasureUnit): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  if (unit === 'pct') return `${Math.round(value * 100)}%`;
  if (unit === 'days') return `${value.toFixed(2)} days`;
  if (unit === 'ratio') return value.toFixed(2);
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function averageOf(rows: MeasureValues[], id: string): number | null {
  const values = rows.map(r => r[id]).filter((v): v is number => v != null && !Number.isNaN(v));
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

// ---------------------------------------------------------------- scoring

function score(def: MeasureDef, previous: number | null, current: number | null): Pick<ComparisonRow, 'change' | 'changeKind' | 'result'> {
  const changeKind = def.unit === 'pct' ? 'pts' as const : 'pct' as const;
  if (previous == null || current == null) {
    return { change: null, changeKind: null, result: def.better === 'neutral' ? 'Volume' : 'No data' };
  }
  const change = def.unit === 'pct' ? current - previous : previous !== 0 ? (current - previous) / Math.abs(previous) : null;
  if (def.better === 'neutral') return { change, changeKind: change == null ? null : changeKind, result: 'Volume' };

  const rel = previous !== 0 ? (current - previous) / Math.abs(previous) : current === 0 ? 0 : Infinity;
  let result: CompareResult;
  if (Math.abs(rel) < SAME_THRESHOLD) result = 'Same';
  else result = (def.better === 'lower') === (current < previous) ? 'Better' : 'Worse';
  return { change, changeKind: change == null ? null : changeKind, result };
}

export function compareScope(scope: CompareScope, defs: MeasureDef[], previous: MeasureValues, current: MeasureValues): ComparisonRow[] {
  return defs.map(def => ({
    scope,
    measure: def.id,
    section: def.section,
    label: def.label,
    unit: def.unit,
    better: def.better,
    previous: previous[def.id] ?? null,
    current: current[def.id] ?? null,
    ...score(def, previous[def.id] ?? null, current[def.id] ?? null),
  }));
}

/**
 * "Improved" if the whole board has at least 3 more Better than Worse and neither cycles per ticket
 * nor the rework-free rate got worse; "Not an overall improvement" if at least 3 more Worse than
 * Better; otherwise "Mixed".
 */
export function verdictFor(boardRows: ComparisonRow[]): { verdict: Verdict; better: number; worse: number; scored: number } {
  const scored = boardRows.filter(r => r.result !== 'Volume');
  const better = scored.filter(r => r.result === 'Better').length;
  const worse = scored.filter(r => r.result === 'Worse').length;
  const reworkWorse = boardRows.some(r => (r.measure === 'cycles_per_ticket' || r.measure === 'rework_free') && r.result === 'Worse');
  const verdict: Verdict = better >= worse + 3 && !reworkWorse ? 'Improved'
    : worse >= better + 3 ? 'Not an overall improvement'
      : 'Mixed';
  return { verdict, better, worse, scored: scored.length };
}

// ---------------------------------------------------------------- assembling

export interface PeriodInput {
  label: string;
  info: QuarterlyPeriodInfo;
  dev: PeopleReport[];
  qa: PeopleReport[];
}

export interface AssembleInput {
  projectKey: string;
  mode: QuarterlyMode;
  previous: PeriodInput;
  current: PeriodInput;
}

function sideFrom(reports: PeopleReport[], role: PersonRole): RoleSide | null {
  if (reports.length === 0) return null;
  const people: PersonMeasures[] = reports
    .filter(r => r.summary.tickets > 0)
    .map(r => ({ person: r.person, tickets: r.summary.tickets, values: measureValues(r.summary, role) }));
  const board = measureValues(reports[0].team, role);
  return {
    people,
    board,
    boardTickets: reports[0].team.tickets,
    average: Object.fromEntries(Object.keys(board).map(id => [id, averageOf(people.map(p => p.values), id)])),
  };
}

function sectionFrom(previous: PeopleReport[], current: PeopleReport[], role: PersonRole): RoleSection | null {
  const p = sideFrom(previous, role);
  const c = sideFrom(current, role);
  return p && c ? { measures: measureDefs(role), previous: p, current: c } : null;
}

const PERSON_METRICS = ['tickets', 'completed', 'completion_rate', 'completed_sp', 'median_turnaround', 'own_lane_median', 'cycles', 'rework_free', 'defects_per_ticket'];

function personComparisons(section: RoleSection | null, role: PersonRole): PersonComparison[] {
  if (!section) return [];
  const out: PersonComparison[] = [];
  const defs = new Map(section.measures.map(d => [d.id, d]));
  for (const cur of section.current.people) {
    const prev = section.previous.people.find(p => p.person === cur.person);
    if (!prev) continue;
    for (const metric of PERSON_METRICS) {
      const own = metric === 'own_lane_median';
      const id = own ? `${OWN_LANE_PREFIX[role]}_median` : metric;
      const def = defs.get(id);
      if (!def) continue;
      out.push({
        person: cur.person,
        role,
        metric,
        label: own ? 'Own lane median (In Development / In QA)' : def.label,
        unit: def.unit,
        // The people chart is about performance, so volume measures read as "higher is better" there.
        better: def.better === 'neutral' ? 'higher' : def.better,
        previous: prev.values[id] ?? null,
        current: cur.values[id] ?? null,
      });
    }
  }
  return out;
}

function sameDeveloperTotals(dev: RoleSection | null, qa: RoleSection | null): SameDeveloperTotals[] {
  if (!dev) return [];
  const prevNames = new Set([...dev.previous.people, ...(qa?.previous.people ?? [])].map(p => p.person));
  const curNames = new Set([...dev.current.people, ...(qa?.current.people ?? [])].map(p => p.person));
  const both = new Set([...curNames].filter(n => prevNames.has(n)));
  const totals = (period: 'previous' | 'current'): SameDeveloperTotals => {
    const rows = dev[period].people.filter(p => both.has(p.person));
    const sum = (id: string) => rows.reduce((s, p) => s + (p.values[id] ?? 0), 0);
    return {
      period, developers: rows.length, tickets: sum('tickets'), completed: sum('completed'),
      completedStoryPoints: sum('completed_sp'), devCycles: sum('cycles'),
    };
  };
  return [totals('previous'), totals('current')];
}

function personHints(r: PeopleReport): PersonHints {
  const cyc = (t: PeopleReport['tickets'][number]) => r.role === 'dev' ? t.devCycles : t.qaCycles;
  const ownLane = r.role === 'dev' ? 'IN DEVELOPMENT' : 'IN QA';
  const d2 = (ms: number) => (ms / BUSINESS_DAY_MS).toFixed(2);
  const t = r.tickets;
  return {
    role: r.role,
    person: r.person,
    cyclesByTicket: t.filter(x => cyc(x) > 0).sort((a, b) => cyc(b) - cyc(a)).map(x => `${x.key} x${cyc(x)}: ${x.summary}`),
    openWithPoints: t.filter(x => !x.completed && x.storyPoints).map(x => `${x.key} (${x.storyPoints} SP, ${x.status}): ${x.summary}`),
    mostLinkedDefects: t.filter(x => x.linkedDefects > 0).sort((a, b) => b.linkedDefects - a.linkedDefects).slice(0, 4)
      .map(x => `${x.key} (${x.linkedDefects}): ${x.summary}`),
    longestOwnLane: t.filter(x => (x.laneTimesMs[ownLane] ?? 0) > 0).sort((a, b) => b.laneTimesMs[ownLane] - a.laneTimesMs[ownLane]).slice(0, 5)
      .map(x => `${x.key} (${d2(x.laneTimesMs[ownLane])} d): ${x.summary}`),
    longestWaits: t.map(x => ({ x, w: (x.laneTimesMs['READY FOR QA'] ?? 0) + (x.laneTimesMs['PO REVIEW'] ?? 0) }))
      .filter(e => e.w > 0).sort((a, b) => b.w - a.w).slice(0, 5)
      .map(e => `${e.x.key} (${d2(e.w)} d in Ready for QA + PO Review): ${e.x.summary}`),
  };
}

/** Everything that has been worked out already from the two periods' people reports. Pure: no cache or Jira access. */
export function assembleQuarterlyReport(input: AssembleInput): QuarterlyReport {
  const { previous, current } = input;
  const dev = sectionFrom(previous.dev, current.dev, 'dev');
  const qa = sectionFrom(previous.qa, current.qa, 'qa');

  const rows: ComparisonRow[] = [];
  if (dev) {
    rows.push(...compareScope('board', dev.measures, dev.previous.board, dev.current.board));
    rows.push(...compareScope('devAverage', dev.measures, dev.previous.average, dev.current.average));
  }
  if (qa) rows.push(...compareScope('qaBoard', qa.measures, qa.previous.board, qa.current.board));

  const summary: ScopeSummary[] = (['board', 'devAverage', 'qaBoard'] as const)
    .filter(scope => rows.some(r => r.scope === scope))
    .map(scope => {
      const scored = rows.filter(r => r.scope === scope && r.result !== 'Volume');
      return {
        scope, measures: scored.length,
        better: scored.filter(r => r.result === 'Better').length,
        worse: scored.filter(r => r.result === 'Worse').length,
        same: scored.filter(r => r.result === 'Same').length,
      };
    });

  // The verdict is about the whole developer board; with no developers chosen, the QA board stands in.
  const verdictRows = rows.filter(r => r.scope === (dev ? 'board' : 'qaBoard'));
  const v = verdictFor(verdictRows);

  const names = (r: PeopleReport[]) => r.filter(x => x.summary.tickets > 0).map(x => x.person);
  const prevPeople = new Set([...names(previous.dev), ...names(previous.qa)]);
  const curPeople = new Set([...names(current.dev), ...names(current.qa)]);

  const comparison: QuarterlyComparison = {
    rows,
    summary,
    verdict: v.verdict,
    boardBetter: v.better,
    boardWorse: v.worse,
    boardScored: v.scored,
    people: [...personComparisons(dev, 'dev'), ...personComparisons(qa, 'qa')],
    onlyInCurrent: [...curPeople].filter(n => !prevPeople.has(n)),
    onlyInPrevious: [...prevPeople].filter(n => !curPeople.has(n)),
    sameDevelopers: sameDeveloperTotals(dev, qa),
  };

  return {
    projectKey: input.projectKey,
    teamName: getTeamName(input.projectKey),
    generatedAt: new Date().toISOString(),
    mode: input.mode,
    previous: previous.info,
    current: current.info,
    dev,
    qa,
    comparison,
    hints: [...current.dev, ...current.qa].filter(r => r.summary.tickets > 0).map(personHints),
    checks: buildChecks(input, dev, qa, rows),
  };
}

function buildChecks(input: AssembleInput, dev: RoleSection | null, qa: RoleSection | null, rows: ComparisonRow[]): string[] {
  const checks: string[] = [];
  const { previous, current } = input;

  for (const [period, label] of [[previous, previous.label], [current, current.label]] as const) {
    for (const r of [...period.dev, ...period.qa]) {
      const role = r.role === 'dev' ? 'developer' : 'QA tester';
      if (r.summary.tickets === 0) checks.push(`${r.person} has no tickets as a ${role} in ${label}, so is left out of that period's figures.`);
      else if (r.summary.tickets < SMALL_SAMPLE_TICKETS) {
        checks.push(`${label} ${role} ${r.person}: small sample (${r.summary.tickets} tickets), so medians are a fairer guide than averages.`);
      }
    }
  }
  for (const [section, role] of [[dev, 'developers'], [qa, 'QA testers']] as const) {
    if (!section) continue;
    if (section.previous.people.length === 0) checks.push(`No ${role} have tickets in ${previous.label}, so ${role} averages cannot be compared.`);
    if (section.current.people.length === 0) checks.push(`No ${role} have tickets in ${current.label}, so ${role} averages cannot be compared.`);
  }

  const a = previous.info.days, b = current.info.days;
  if (a > 0 && b > 0 && Math.abs(a - b) / Math.max(a, b) > 0.25) {
    checks.push(`The periods are different lengths (${a} days in ${previous.label}, ${b} days in ${current.label}), so totals such as tickets and completed points are not like-for-like. Rates, medians and per-ticket figures are.`);
  }
  const pStart = previous.info.sprints[0]?.sprintStartDate, cStart = current.info.sprints[0]?.sprintStartDate;
  if (pStart && cStart && pStart > cStart) checks.push(`${previous.label} starts after ${current.label}. Check the periods are the right way round.`);

  for (const r of rows.filter(x => x.label.includes('cycles (') && x.previous === 0 && x.current === 0)) {
    checks.push(`${r.label} is zero in both periods for the ${r.scope} scope, so cycle and rework measures cannot separate the periods (no rework moves recorded, or the workflow does not use those statuses).`);
  }
  checks.push('Linked defects count over each ticket\'s whole life, so tickets from the two periods have had different lengths of time to collect them.');
  return checks;
}

// ---------------------------------------------------------------- building from the fetched data

function uniq(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map(v => v.trim()).filter(Boolean))];
}

function validPeriod(p: PeoplePeriod | undefined, label: string): PeoplePeriod {
  if (!p || !DATE_RE.test(p.from) || !DATE_RE.test(p.to) || Number.isNaN(Date.parse(p.from)) || Number.isNaN(Date.parse(p.to))) {
    throw new Error(`${label} needs valid "from" and "to" dates (YYYY-MM-DD).`);
  }
  if (p.from > p.to) throw new Error(`${label}: the "from" date must not be after the "to" date.`);
  return p;
}

/** Names of the sprints a period draws on: the chosen ones, plus (date-range mode) fetched sprints overlapping the dates. */
function resolveSprintNames(projectKey: string, spec: QuarterlyPeriodSpec, mode: QuarterlyMode): string[] {
  const names = uniq(spec.sprintNames);
  if (mode === 'dateRange' && spec.period) {
    const start = `${spec.period.from}T00:00:00.000Z`, end = `${spec.period.to}T23:59:59.999Z`;
    for (const c of listCached()) {
      if (c.projectKey.toUpperCase() !== projectKey.toUpperCase() || !c.sprintStartDate) continue;
      const sprintEnd = c.sprintEndDate || new Date().toISOString();
      if (c.sprintStartDate <= end && sprintEnd >= start) names.push(c.sprintName);
    }
  }
  return [...new Set(names)];
}

function validateRequest(req: QuarterlyRequest): void {
  if (!req.projectKey) throw new Error('projectKey is required.');
  if (req.mode !== 'sprints' && req.mode !== 'dateRange') throw new Error('mode must be "sprints" or "dateRange".');
  if (req.mode === 'sprints') {
    const prev = uniq(req.previous.sprintNames), cur = uniq(req.current.sprintNames);
    if (prev.length === 0 || cur.length === 0) throw new Error('Choose at least one sprint for the previous period and one for the current period.');
    const shared = prev.filter(n => cur.includes(n));
    if (shared.length > 0) throw new Error(`A sprint can only be in one period: ${shared.join(', ')}.`);
  } else {
    const p = validPeriod(req.previous.period, 'The previous period');
    const c = validPeriod(req.current.period, 'The current period');
    if (p.from <= c.to && c.from <= p.to) throw new Error('The previous and current date ranges must not overlap.');
  }
}

function periodLabel(spec: QuarterlyPeriodSpec, fallback: string): string {
  return spec.label?.trim() || fallback;
}

function periodInfo(label: string, mode: QuarterlyMode, spec: QuarterlyPeriodSpec, any: PeopleReport): QuarterlyPeriodInfo {
  const sprints = any.sprints;
  const dateFmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  if (mode === 'dateRange' && spec.period) {
    const span = Math.round((Date.parse(spec.period.to) - Date.parse(spec.period.from)) / 86_400_000) + 1;
    return { label, description: `${spec.period.from} to ${spec.period.to}`, period: spec.period, sprints, days: span };
  }
  const first = sprints[0], last = sprints[sprints.length - 1];
  const endIso = last?.sprintEndDate || last?.sprintStartDate;
  const span = first?.sprintStartDate && endIso ? Math.round((Date.parse(endIso) - Date.parse(first.sprintStartDate)) / 86_400_000) : 0;
  const names = sprints.map(s => s.sprintName).join(', ');
  const range = first?.sprintStartDate && endIso ? ` (${dateFmt(first.sprintStartDate)} to ${dateFmt(endIso)})` : '';
  return { label, description: `${sprints.length === 1 ? names : `${first?.sprintName} to ${last?.sprintName}`}${range}`, period: null, sprints, days: span };
}

/** Who can be reported on, and which of the chosen sprints still need fetching. */
export function listQuarterlyOptions(req: QuarterlyRequest): QuarterlyOptions {
  validateRequest(req);
  const side = (spec: QuarterlyPeriodSpec) => {
    const names = resolveSprintNames(req.projectKey, spec, req.mode);
    return listPeopleOptions(req.projectKey, names, req.mode === 'dateRange' ? spec.period : undefined);
  };
  const prev = side(req.previous), cur = side(req.current);

  const merge = (a: Array<{ name: string; tickets: number }>, b: Array<{ name: string; tickets: number }>) => {
    const byName = new Map<string, { name: string; previousTickets: number; currentTickets: number }>();
    for (const p of a) byName.set(p.name, { name: p.name, previousTickets: p.tickets, currentTickets: 0 });
    for (const p of b) {
      const entry = byName.get(p.name) ?? { name: p.name, previousTickets: 0, currentTickets: 0 };
      entry.currentTickets = p.tickets;
      byName.set(p.name, entry);
    }
    return [...byName.values()].sort((x, y) => x.name.localeCompare(y.name));
  };
  return { missing: { previous: prev.missing, current: cur.missing }, dev: merge(prev.dev, cur.dev), qa: merge(prev.qa, cur.qa) };
}

/** The people reports behind a quarterly report, per period and role, before any scoring. */
export interface QuarterlyPeopleData {
  previous: PeriodInput;
  current: PeriodInput;
}

export function collectQuarterlyPeople(req: QuarterlyRequest): QuarterlyPeopleData {
  validateRequest(req);
  const developers = uniq(req.developers), qaTesters = uniq(req.qaTesters);
  if (developers.length === 0 && qaTesters.length === 0) throw new Error('Choose at least one developer or QA tester.');

  const prevLabel = periodLabel(req.previous, 'Previous');
  const curLabel = periodLabel(req.current, 'Current');
  if (prevLabel.toLowerCase() === curLabel.toLowerCase()) throw new Error('The two periods need different names.');

  const prevNames = resolveSprintNames(req.projectKey, req.previous, req.mode);
  const curNames = resolveSprintNames(req.projectKey, req.current, req.mode);
  for (const [names, label] of [[prevNames, prevLabel], [curNames, curLabel]] as const) {
    const missing = names.filter(n => !load(req.projectKey, n));
    if (missing.length > 0) throw new Error(`No cached data for ${req.projectKey}: ${missing.join(', ')}. Fetch them first (${label}).`);
    if (names.length === 0) throw new Error(`No fetched sprints for ${label}. Fetch the sprints it covers first.`);
  }

  const reportsFor = (names: string[], spec: QuarterlyPeriodSpec) => {
    const period = req.mode === 'dateRange' ? spec.period : undefined;
    return {
      dev: developers.map(p => buildPeopleReport(req.projectKey, names, p, 'dev', period)),
      qa: qaTesters.map(p => buildPeopleReport(req.projectKey, names, p, 'qa', period)),
    };
  };
  const prev = reportsFor(prevNames, req.previous);
  const cur = reportsFor(curNames, req.current);
  const anyPrev = [...prev.dev, ...prev.qa][0], anyCur = [...cur.dev, ...cur.qa][0];

  return {
    previous: { label: prevLabel, info: periodInfo(prevLabel, req.mode, req.previous, anyPrev), ...prev },
    current: { label: curLabel, info: periodInfo(curLabel, req.mode, req.current, anyCur), ...cur },
  };
}

export function buildQuarterlyReport(req: QuarterlyRequest): QuarterlyReport {
  const { previous, current } = collectQuarterlyPeople(req);
  return assembleQuarterlyReport({ projectKey: req.projectKey, mode: req.mode, previous, current });
}
