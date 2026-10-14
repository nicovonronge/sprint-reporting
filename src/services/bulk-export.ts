import { deflateRawSync, crc32 } from 'node:zlib';
import { getDataGuide } from '../constants/data-guide.js';
import { getTeamName } from '../constants/workflow.js';
import { load } from '../cache/cache-manager.js';
import { calculateSprintMetrics, aggregateSprintMetrics } from './metrics-calculator.js';
import { applyFilters } from './ticket-filter.js';
import { buildSprintReportExport } from './export-builder.js';
import { buildPeopleReport } from './people-report.js';
import type { FilterOptions } from '../types/metrics.js';
import type { PeoplePeriod, PeopleReport, PeopleSummary, PersonRole } from '../types/people-report.js';

/**
 * Bulk downloads: many people reports, or many sprint reports, in one file. Nothing here talks to
 * Jira; everything is built from the already-fetched data, like the single reports.
 */

// ---------------------------------------------------------------- ZIP / CSV helpers

export interface ZipEntry {
  name: string;
  data: string | Buffer;
}

/** Minimal ZIP writer (deflate, UTF-8 names). Enough for text files; avoids a dependency. */
export function zipFiles(entries: ZipEntry[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  // Fixed DOS timestamp (2020-01-01 00:00) keeps output reproducible.
  const dosTime = 0;
  const dosDate = ((2020 - 1980) << 9) | (1 << 5) | 1;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const packed = deflateRawSync(raw);
    const crc = crc32(raw) >>> 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);        // version needed
    local.writeUInt16LE(0x0800, 6);    // flags: UTF-8 names
    local.writeUInt16LE(8, 8);         // deflate
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, name, packed);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);          // version made by
    dir.writeUInt16LE(20, 6);          // version needed
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(dosTime, 12);
    dir.writeUInt16LE(dosDate, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(packed.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);

    offset += local.length + name.length + packed.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBuf, end]);
}

type Cell = string | number | boolean | null | undefined;

function csvCell(value: Cell): string {
  if (value == null) return '';
  let s = String(value);
  // Stop spreadsheet apps treating ticket summaries as formulas.
  if (/^[=+\-@\t\r]/.test(s) && typeof value === 'string') s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** CSV with a UTF-8 BOM and CRLF line ends so Excel opens it correctly. */
export function toCsv(headers: string[], rows: Cell[][]): string {
  return '﻿' + [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Safe, unique file name part for a person or sprint. */
function fileSafe(name: string, used: Set<string>): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'unnamed';
  let candidate = base;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${base}_${i}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

/** Business milliseconds as business hours (a business day is 9h), 2 decimals. */
const hours = (ms: number | null | undefined): number | null => ms == null ? null : Math.round((ms / 3_600_000) * 100) / 100;
const pct = (v: number | null | undefined): number | null => v == null ? null : Math.round(v * 1000) / 10;
const dateOnly = (iso: string | null | undefined): string => iso ? iso.slice(0, 10) : '';

/** (person - team) / team as a whole percentage; null when it cannot be worked out. */
function diffPct(person: number | null, team: number | null): number | null {
  if (person == null || team == null || team === 0) return null;
  return Math.round(((person - team) / team) * 100);
}

// ---------------------------------------------------------------- People bulk

export interface PeopleBulkRequest {
  projectKey: string;
  sprintNames: string[];
  people: string[];
  role: PersonRole;
  period?: PeoplePeriod;
  previousPeriod?: PeoplePeriod;
}

export interface PeopleBulkResult {
  reports: PeopleReport[];
  /** People that could not be built, with the reason. */
  skipped: Array<{ person: string; reason: string }>;
}

/** Same as the single report, once per person. `dataGuide` is dropped: bulk files carry it once. */
export function buildPeopleReports(req: PeopleBulkRequest): PeopleBulkResult {
  const reports: PeopleReport[] = [];
  const skipped: PeopleBulkResult['skipped'] = [];
  const seen = new Set<string>();
  for (const person of req.people) {
    if (seen.has(person)) continue;
    seen.add(person);
    try {
      reports.push(buildPeopleReport(req.projectKey, req.sprintNames, person, req.role, req.period, req.previousPeriod));
    } catch (err: any) {
      // A missing sprint fails every person alike, so surface it instead of listing everyone as skipped.
      if (/No cached data/.test(err.message ?? '')) throw err;
      skipped.push({ person, reason: err.message ?? String(err) });
    }
  }
  return { reports, skipped };
}

const SUMMARY_HEADERS = [
  'person', 'role', 'team', 'project', 'mode', 'period_from', 'period_to', 'sprints',
  'tickets', 'completed', 'story_points', 'completed_story_points', 'dev_story_points', 'qa_story_points',
  'avg_turnaround_business_hours', 'median_turnaround_business_hours',
  'cycles', 'cycles_per_ticket', 'tickets_without_rework', 'no_rework_pct',
  'linked_defects', 'tickets_no_activity', 'credited_as_assignee', 'credited_as_qa_assignee', 'bugs_reported',
  'team_tickets', 'team_avg_turnaround_business_hours', 'team_cycles_per_ticket', 'team_no_rework_pct',
  'turnaround_vs_team_pct', 'cycles_vs_team_pct',
];

function summaryRow(r: PeopleReport, laneNames: string[]): Cell[] {
  const s = r.summary, t = r.team;
  const laneAvg = (sum: PeopleSummary, lane: string) => hours(sum.lanes.find(l => l.swimlane === lane)?.avgMs);
  return [
    r.person, r.role, r.teamName ?? '', r.projectKey, r.mode, r.period?.from ?? '', r.period?.to ?? '', r.sprints.map(x => x.sprintName).join('; '),
    s.tickets, s.completed, s.storyPoints, s.completedStoryPoints, s.devStoryPoints, s.qaStoryPoints,
    hours(s.avgTurnaroundMs), hours(s.medianTurnaroundMs),
    s.totalCycles, Math.round(s.avgCyclesPerTicket * 100) / 100, s.ticketsWithoutRework, pct(s.reworkFreeRate),
    s.linkedDefects, s.ticketsWithNoActivity, s.ticketsAsAssignee, s.ticketsAsQaAssignee, r.reportedBugs?.length ?? '',
    t.tickets, hours(t.avgTurnaroundMs), Math.round(t.avgCyclesPerTicket * 100) / 100, pct(t.reworkFreeRate),
    diffPct(s.avgTurnaroundMs, t.avgTurnaroundMs), diffPct(s.avgCyclesPerTicket, t.avgCyclesPerTicket),
    ...laneNames.map(l => laneAvg(s, l)),
  ];
}

/** One row per person: the headline numbers, the team comparison and average hours per lane. */
export function peopleSummaryCsv(reports: PeopleReport[]): string {
  const laneNames = [...new Set(reports.flatMap(r => r.summary.lanes.map(l => l.swimlane)))].sort();
  return toCsv(
    [...SUMMARY_HEADERS, ...laneNames.map(l => `avg_${l.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_business_hours`)],
    reports.map(r => summaryRow(r, laneNames)),
  );
}

/** One row per (person, ticket) so tickets can be filtered and pivoted. */
export function peopleTicketsCsv(reports: PeopleReport[]): string {
  const laneNames = [...new Set(reports.flatMap(r => r.tickets.flatMap(t => Object.keys(t.laneTimesMs))))].sort();
  const headers = [
    'person', 'role', 'team', 'ticket', 'summary', 'issue_type', 'credited_as', 'sprints', 'status_at_period_end', 'status_now',
    'created', 'resolved', 'completed', 'story_points', 'dev_story_points', 'qa_story_points', 'priority',
    'turnaround_business_hours', 'role_cycles', 'dev_cycles', 'qa_cycles', 'linked_defects', 'no_activity_in_period', 'next_pi',
    ...laneNames.map(l => `${l.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_business_hours`),
  ];
  const rows = reports.flatMap(r => r.tickets.map(t => [
    r.person, r.role, r.teamName ?? '', t.key, t.summary, t.issueType, t.creditedAs.join('+'), t.sprints.join('; '), t.status, t.statusNow,
    dateOnly(t.created), dateOnly(t.resolved), t.completed, t.storyPoints, t.devStoryPoints, t.qaStoryPoints, t.priority,
    hours(t.turnaroundMs), r.role === 'dev' ? t.devCycles : t.qaCycles, t.devCycles, t.qaCycles, t.linkedDefects,
    t.noActivityInRange, t.nextPI,
    ...laneNames.map(l => hours(t.laneTimesMs[l])),
  ]));
  return toCsv(headers, rows);
}

const PEOPLE_BULK_STEPS = [
  'Each person was reported on separately, exactly as in the single people report (same credit rules, same team baseline).',
  'Times in the CSV files are business hours (Mon-Fri 08:00-17:00 UTC; a business day is 9 hours). The JSON files keep milliseconds.',
  'Per-person JSON files leave out the data guide; it is in index.json once.',
];

/** ZIP: index.json, summary.csv, tickets.csv and one JSON report per person. */
export function buildPeopleBulkZip(req: PeopleBulkRequest): Buffer {
  const { reports, skipped } = buildPeopleReports(req);
  const used = new Set<string>();
  const files = reports.map(r => ({ person: r.person, file: `people/${fileSafe(r.person, used)}.json` }));

  const index = {
    info: getDataGuide('people'),
    generation: {
      generatedAt: new Date().toISOString(),
      projectKey: req.projectKey,
      teamName: getTeamName(req.projectKey),
      role: req.role,
      period: req.period ?? null,
      previousPeriod: req.period ? req.previousPeriod ?? null : null,
      sprints: req.sprintNames,
      people: reports.map(r => r.person),
      skipped,
      files: ['index.json', 'summary.csv', 'tickets.csv', ...files.map(f => f.file)],
      steps: PEOPLE_BULK_STEPS,
    },
    reports: files,
  };

  return zipFiles([
    { name: 'index.json', data: JSON.stringify(index, null, 2) },
    { name: 'summary.csv', data: peopleSummaryCsv(reports) },
    { name: 'tickets.csv', data: peopleTicketsCsv(reports) },
    ...reports.map((r, i) => {
      const { dataGuide: _guide, ...rest } = r;
      return { name: files[i].file, data: JSON.stringify(rest, null, 2) };
    }),
  ]);
}

// ---------------------------------------------------------------- Sprint report bulk

/** ZIP: index.json, sprints.csv (one row per sprint) and one full JSON export per sprint. */
export function buildSprintReportBulkZip(projectKey: string, sprintNames: string[], filters: FilterOptions): Buffer {
  const used = new Set<string>();
  const exports = sprintNames.map(name => ({
    name,
    file: `sprints/${fileSafe(name, used)}.json`,
    export: buildSprintReportExport(projectKey, [name], filters),
  }));

  const rows = sprintNames.map(name => {
    const cached = load(projectKey, name)!;
    const full = calculateSprintMetrics(cached);
    const filtered = applyFilters(full.ticketMetrics, filters);
    const m = filtered.length !== full.ticketMetrics.length ? aggregateSprintMetrics(filtered, cached) : full;
    return [
      m.teamName ?? '', m.projectKey, m.sprintName, dateOnly(m.sprintStartDate), dateOnly(m.sprintEndDate), m.totalTickets, m.completedTickets,
      m.newTickets, m.carriedOverTickets, m.totalStoryPoints, m.totalDevPoints, m.totalQaPoints,
      hours(m.avgTurnaroundMs), Math.round(m.avgDevCycles * 100) / 100, Math.round(m.avgQaCycles * 100) / 100, m.totalDefects,
      Object.entries(m.avgSprintSwimlaneTimesMs).map(([lane, ms]) => `${lane}=${hours(ms)}`).join('; '),
    ];
  });
  const csv = toCsv([
    'team', 'project', 'sprint', 'start', 'end', 'tickets', 'completed', 'new_tickets', 'carried_over_tickets',
    'story_points', 'dev_points', 'qa_points', 'avg_turnaround_business_hours', 'avg_dev_cycles', 'avg_qa_cycles', 'defects',
    'avg_hours_per_lane',
  ], rows);

  const first = exports[0]?.export;
  const index = {
    info: getDataGuide('sprint'),
    generation: {
      generatedAt: new Date().toISOString(),
      projectKey,
      teamName: getTeamName(projectKey),
      filters: first?.generation.filters ?? null,
      sprints: exports.flatMap(e => e.export.generation.sprints),
      files: ['index.json', 'sprints.csv', ...exports.map(e => e.file)],
      steps: [
        ...(first?.generation.steps ?? []),
        'sprints.csv times are business hours; the JSON files keep milliseconds. Each sprint JSON carries its own copy of the data guide.',
      ],
    },
  };

  return zipFiles([
    { name: 'index.json', data: JSON.stringify(index, null, 2) },
    { name: 'sprints.csv', data: csv },
    ...exports.map(e => ({ name: e.file, data: JSON.stringify(e.export, null, 2) })),
  ]);
}
