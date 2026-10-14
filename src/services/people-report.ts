import { load, listCached, type CachedSprintData } from '../cache/cache-manager.js';
import { statusAt } from './point-in-time.js';
import { calculateSprintMetrics, calculateTicketMetrics } from './metrics-calculator.js';
import { getDataGuide } from '../constants/data-guide.js';
import {
  SWIMLANE_ORDER, EXCLUDED_SWIMLANE, STATUS_TO_SWIMLANE, CUSTOM_FIELDS, DEV_CYCLE_STATUS, QA_CYCLE_STATUS, BUG_ISSUE_TYPE,
} from '../constants/workflow.js';
import type { JiraIssue } from '../types/jira.js';
import type { TicketMetrics } from '../types/metrics.js';
import type {
  CreditedAs,
  LaneStat,
  PeopleIssueTypeEntry,
  PeopleOptions,
  PeoplePeriod,
  PeopleReport,
  PeopleSummary,
  PeopleTicket,
  PersonRole,
  PreviousPeriod,
  ReportedBug,
} from '../types/people-report.js';

// Lanes each role actually controls; the others are context (e.g. a dev doesn't control how long
// a ticket waits for QA). See CLAUDE.md "People report".
const PRIMARY_LANES: Record<PersonRole, string[]> = {
  dev: ['TO DO', 'IN DEVELOPMENT'],
  qa: ['READY FOR QA', 'IN QA'],
};

interface Row {
  sprintName: string;
  sprintStartDate: string;
  sprintEndDate: string;
  ticket: TicketMetrics;
  /** Selected sprints this row's ticket belongs to (just the one in sprint mode). */
  sprintNames: string[];
  /** Anything happened to the ticket inside the row's window. */
  active: boolean;
}

const REPORT_LANES = SWIMLANE_ORDER.filter(s => s !== EXCLUDED_SWIMLANE);

function startMs(data: CachedSprintData): number {
  return data.sprintStartDate ? new Date(data.sprintStartDate).getTime() : 0;
}

function loadSprints(projectKey: string, sprintNames: string[]): { sprints: CachedSprintData[]; missing: string[] } {
  const sprints: CachedSprintData[] = [];
  const missing: string[] = [];
  for (const name of sprintNames) {
    const data = load(projectKey, name);
    if (data) sprints.push(data);
    else missing.push(name);
  }
  return { sprints: sprints.sort((a, b) => startMs(a) - startMs(b)), missing };
}

function hasActivity(ticket: TicketMetrics): boolean {
  const r = ticket.sprintReport;
  return r.swimlaneTimes.length > 0 || r.turnaroundMs !== null || r.devCycles > 0 || r.qaCycles > 0;
}

function peopleOf(ticket: TicketMetrics, role: PersonRole): string[] {
  if (role === 'dev') return ticket.sprintReport.assignee ? [ticket.sprintReport.assignee] : [];
  return ticket.sprintReport.qaAssignees;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validates the dates and widens them to whole UTC days: from 00:00:00 to 23:59:59.999. */
function periodWindow(period: PeoplePeriod): { start: string; end: string } {
  if (!DATE_RE.test(period.from) || !DATE_RE.test(period.to)
    || Number.isNaN(Date.parse(period.from)) || Number.isNaN(Date.parse(period.to))) {
    throw new Error('Dates must be valid YYYY-MM-DD values.');
  }
  if (period.from > period.to) throw new Error('The "from" date must not be after the "to" date.');
  return { start: `${period.from}T00:00:00.000Z`, end: `${period.to}T23:59:59.999Z` };
}

/**
 * Rows for the report. Sprint mode: one row per ticket per sprint, measured over that sprint.
 * Date-range mode: one row per ticket, measured over the custom window — every point-in-time
 * field (status, assignee, points, ...) is rebuilt as of the window end and cycles, lane time and
 * turnaround only count activity inside the window. Tickets come from the selected sprints and
 * those with activity in the window are kept, plus still-open tickets with none (flagged as
 * no activity). Tickets that were already Done before the window are dropped.
 */
function buildRows(sprints: CachedSprintData[], period?: PeoplePeriod): Row[] {
  if (!period) {
    return sprints.flatMap(data => calculateSprintMetrics(data).ticketMetrics.map(ticket => ({
      sprintName: data.sprintName,
      sprintStartDate: data.sprintStartDate,
      sprintEndDate: data.sprintEndDate,
      ticket,
      sprintNames: [data.sprintName],
      active: hasActivity(ticket),
    })));
  }

  const { start, end } = periodWindow(period);
  // The same issue can sit in several fetched sprints; use the most recently fetched copy.
  const latest = new Map<string, { issue: CachedSprintData['issues'][number]; fetchedAt: string; sprintNames: string[] }>();
  for (const data of sprints) {
    for (const issue of data.issues) {
      const seen = latest.get(issue.key);
      if (!seen) {
        latest.set(issue.key, { issue, fetchedAt: data.fetchedAt, sprintNames: [data.sprintName] });
      } else {
        seen.sprintNames.push(data.sprintName);
        if (data.fetchedAt > seen.fetchedAt) { seen.issue = issue; seen.fetchedAt = data.fetchedAt; }
      }
    }
  }

  const rows: Row[] = [];
  for (const { issue, sprintNames } of latest.values()) {
    const ticket = calculateTicketMetrics(issue, start, end, null);
    if (!ticket) continue;
    const active = hasActivity(ticket);
    // A quiet ticket that is still open is committed work that did not move: keep it, flagged.
    // A quiet ticket that was already Done before the range is finished work from earlier: drop it.
    if (!active && STATUS_TO_SWIMLANE[ticket.sprintReport.status] === 'DONE') continue;
    rows.push({ sprintName: `${period.from} to ${period.to}`, sprintStartDate: start, sprintEndDate: end, ticket, sprintNames, active });
  }
  return rows;
}

/** Who can be reported on, and which requested sprints still need fetching. */
export function listPeopleOptions(projectKey: string, sprintNames: string[], period?: PeoplePeriod): PeopleOptions {
  const { sprints, missing } = loadSprints(projectKey, sprintNames);
  const counts: Record<PersonRole, Map<string, Set<string>>> = { dev: new Map(), qa: new Map() };

  for (const { ticket } of buildRows(sprints, period)) {
    for (const role of ['dev', 'qa'] as const) {
      for (const person of peopleOf(ticket, role)) {
        if (!counts[role].has(person)) counts[role].set(person, new Set());
        counts[role].get(person)!.add(ticket.key);
      }
    }
  }

  const toList = (m: Map<string, Set<string>>) =>
    [...m.entries()].map(([name, keys]) => ({ name, tickets: keys.size }))
      .sort((a, b) => a.name.localeCompare(b.name));

  return { missing, dev: toList(counts.dev), qa: toList(counts.qa) };
}

export function buildPeopleReport(
  projectKey: string,
  sprintNames: string[],
  person: string,
  role: PersonRole,
  period?: PeoplePeriod,
  previousPeriod?: PeoplePeriod,
): PeopleReport {
  const { sprints, missing } = loadSprints(projectKey, sprintNames);
  if (missing.length > 0) {
    throw new Error(`No cached data for ${projectKey}: ${missing.join(', ')}. Fetch them first.`);
  }

  const allRows = buildRows(sprints, period);
  const refEnd = period ? periodWindow(period).end : latestEnd(sprints);

  // A ticket is credited on either field: dev assignee or QA assignee (creditedAs says which).
  const personRows = allRows.filter(r => creditFor(r.ticket, person).length > 0);
  // Team baseline for QA only counts tickets that had a QA assignee, mirroring the person's scope.
  const teamRows = role === 'qa' ? allRows.filter(r => peopleOf(r.ticket, 'qa').length > 0) : allRows;

  const tickets = rollupTickets(personRows, refEnd, role, person);
  const reported = buildReportedBugs(sprints, person, period, refEnd);

  return {
    projectKey,
    person,
    accountId: findAccountId(sprints, person),
    role,
    generatedAt: new Date().toISOString(),
    mode: period ? 'dateRange' : 'sprints',
    period: period ?? null,
    sprints: sprints.map(s => ({
      sprintName: s.sprintName,
      sprintStartDate: s.sprintStartDate,
      sprintEndDate: s.sprintEndDate,
    })),
    summary: summarize(tickets, role),
    previousPeriod: period && previousPeriod ? buildPrevious(projectKey, previousPeriod, person, role) : null,
    team: summarize(rollupTickets(teamRows, refEnd, role), role),
    bySprint: period ? [] : sprints.map(s => ({
      sprintName: s.sprintName,
      sprintStartDate: s.sprintStartDate,
      sprintEndDate: s.sprintEndDate,
      summary: summarize(rollupTickets(personRows.filter(r => r.sprintName === s.sprintName), refEnd, role, person), role),
    })),
    byIssueType: byIssueType(tickets, role),
    tickets,
    reportedBugs: reported.bugs,
    reportedBugsComplete: reported.complete,
    dataGuide: getDataGuide('people'),
  };
}

function latestEnd(sprints: CachedSprintData[]): string {
  return sprints.map(s => s.sprintEndDate).filter(Boolean).sort().at(-1) ?? new Date().toISOString();
}

function creditFor(ticket: TicketMetrics, person: string): CreditedAs[] {
  const credit: CreditedAs[] = [];
  if (ticket.sprintReport.assignee === person) credit.push('assignee');
  if (ticket.sprintReport.qaAssignees.includes(person)) credit.push('qaAssignee');
  return credit;
}

/** Account id of the person, from any fetched ticket that names them (assignee, reporter, QA). */
function findAccountId(sprints: CachedSprintData[], person: string): string | null {
  for (const data of sprints) {
    for (const issue of [...data.issues, ...(data.reportedBugs ?? [])]) {
      const f = issue.fields;
      if (f.assignee?.displayName === person) return f.assignee.accountId;
      if (f.reporter?.displayName === person) return f.reporter.accountId;
      const qa = (f[CUSTOM_FIELDS.QA_ASSIGNEE] as Array<{ accountId?: string; displayName: string }> | null) ?? [];
      const hit = qa.find(u => u.displayName === person && u.accountId);
      if (hit) return hit.accountId!;
    }
  }
  return null;
}

/**
 * The same person and role over an earlier date range. Its tickets come from every fetched sprint
 * of the project that overlaps that range, so it works without picking sprints a second time.
 */
function buildPrevious(projectKey: string, previous: PeoplePeriod, person: string, role: PersonRole): PreviousPeriod {
  const { start, end } = periodWindow(previous);
  const pool = listCached().filter(c => {
    if (c.projectKey.toUpperCase() !== projectKey.toUpperCase() || !c.sprintStartDate) return false;
    const sprintEnd = c.sprintEndDate || new Date().toISOString();
    return c.sprintStartDate <= end && sprintEnd >= start;
  }).sort((a, b) => startMs(a) - startMs(b));

  if (pool.length === 0) return { period: previous, sprintsUsed: [], summary: null, team: null };

  const rows = buildRows(pool, previous);
  const personRows = rows.filter(r => creditFor(r.ticket, person).length > 0);
  const teamRows = role === 'qa' ? rows.filter(r => peopleOf(r.ticket, 'qa').length > 0) : rows;
  return {
    period: previous,
    sprintsUsed: pool.map(s => s.sprintName),
    summary: summarize(rollupTickets(personRows, end, role, person), role),
    team: summarize(rollupTickets(teamRows, end, role), role),
  };
}

/**
 * Bugs the person reported (Jira reporter) that were created in the period, from the sprint
 * tickets plus the extra bugs collected at fetch time. Complete only if every selected sprint
 * was fetched with that collection.
 */
function buildReportedBugs(
  sprints: CachedSprintData[],
  person: string,
  period: PeoplePeriod | undefined,
  refEnd: string,
): { bugs: ReportedBug[]; complete: boolean } {
  const complete = sprints.length > 0 && sprints.every(s => s.reportedBugs !== undefined);

  // Newest fetched copy of each bug wins; remember whether a selected sprint holds it.
  const latest = new Map<string, { issue: JiraIssue; fetchedAt: string; inSprint: boolean }>();
  for (const data of sprints) {
    const entries = [
      ...data.issues.filter(i => i.fields.issuetype.name === BUG_ISSUE_TYPE).map(issue => ({ issue, inSprint: true })),
      ...(data.reportedBugs ?? []).map(issue => ({ issue, inSprint: false })),
    ];
    for (const { issue, inSprint } of entries) {
      const seen = latest.get(issue.key);
      if (!seen) {
        latest.set(issue.key, { issue, fetchedAt: data.fetchedAt, inSprint });
      } else {
        seen.inSprint = seen.inSprint || inSprint;
        if (data.fetchedAt > seen.fetchedAt) { seen.issue = issue; seen.fetchedAt = data.fetchedAt; }
      }
    }
  }

  const windows = period
    ? [periodWindow(period)]
    : sprints.filter(s => s.sprintStartDate).map((s, i, all) => {
      const sprintEnd = s.sprintEndDate || new Date().toISOString();
      const next = all[i + 1]?.sprintStartDate;
      // Back-to-back sprints: bugs raised in the gap between them count towards the earlier one.
      const adjacent = next && Date.parse(next) - Date.parse(sprintEnd) <= 7 * 24 * 60 * 60 * 1000;
      return { start: s.sprintStartDate, end: adjacent ? next : sprintEnd };
    });

  const bugs: ReportedBug[] = [];
  for (const { issue, inSprint } of latest.values()) {
    if (issue.fields.reporter?.displayName !== person) continue;
    const createdMs = Date.parse(issue.fields.created);
    const window = windows.find(w => createdMs >= Date.parse(w.start) && createdMs <= Date.parse(w.end));
    if (!window) continue;
    const asOf = Date.parse(window.end) < Date.now() ? window.end : new Date().toISOString();
    const sprintDetails = sprintDetailsOf(issue);
    bugs.push({
      key: issue.key,
      summary: issue.fields.summary,
      created: issue.fields.created,
      priority: issue.fields.priority?.name ?? null,
      statusAtPeriodEnd: statusAt(issue, asOf),
      statusNow: issue.fields.status.name,
      resolved: issue.fields.resolutiondate ?? null,
      fixVersions: issue.fields.fixVersions?.map(v => v.name) ?? [],
      parentKey: issue.fields.parent?.key ?? null,
      sprints: sprintDetails.map(s => s.name),
      nextPI: isNextPI(sprintDetails, refEnd),
      inSelectedSprints: inSprint,
    });
  }

  bugs.sort((a, b) => a.created.localeCompare(b.created));
  return { bugs, complete };
}

type SprintDetail = TicketMetrics['sprintDetails'][number];

function sprintDetailsOf(issue: JiraIssue): SprintDetail[] {
  const field = (issue.fields[CUSTOM_FIELDS.SPRINT] as Array<{ name: string; state: string; startDate?: string }> | null) ?? [];
  return field.map(s => ({ name: s.name, state: s.state, startDate: s.startDate ?? null }));
}

/**
 * Next-PI work: every sprint the ticket is in starts after the period (or has not been planned
 * yet). A ticket that also sat in a sprint inside the period belongs to this one.
 */
function isNextPI(sprints: SprintDetail[], periodEnd: string): boolean {
  if (sprints.length === 0) return false;
  const endMs = Date.parse(periodEnd);
  return sprints.every(s => s.state === 'future' || (s.startDate !== null && Date.parse(s.startDate) > endMs));
}

/**
 * One entry per ticket across the selected sprints. Cycles and lane time are period-scoped per
 * sprint, so they sum; points, status and completion come from the latest sprint the ticket
 * appears in (rows are already in chronological order). `person` is only given for the person's
 * own tickets (it drives creditedAs).
 */
function rollupTickets(rows: Row[], refEnd: string, role: PersonRole, person?: string): PeopleTicket[] {
  const byKey = new Map<string, PeopleTicket>();

  for (const row of rows) {
    const { sprintNames, ticket } = row;
    const r = ticket.sprintReport;
    let entry = byKey.get(ticket.key);
    if (!entry) {
      entry = {
        key: ticket.key,
        summary: ticket.summary,
        issueType: ticket.issueType,
        creditedAs: [],
        noActivityInRange: true,
        nextPI: false,
        sprints: [],
        allSprints: [],
        lifetimeSprintCount: 0,
        status: r.status,
        statusNow: ticket.currentStatus,
        created: ticket.createdDate,
        resolved: ticket.resolvedDate,
        firstDoneDate: null,
        priority: null,
        labels: [],
        components: [],
        rootCause: null,
        fixVersions: [],
        parentKey: null,
        parentSummary: null,
        storyPoints: r.storyPoints,
        devStoryPoints: r.devPoints,
        qaStoryPoints: r.qaPoints,
        completed: false,
        turnaroundMs: null,
        devCycles: 0,
        qaCycles: 0,
        cycles: 0,
        linkedDefects: ticket.linkedDefects,
        linkedDefectKeys: ticket.linkedDefectKeys,
        laneTimesMs: {},
        lifetimeTurnaroundMs: ticket.lifetimeTurnaroundMs,
        lifetimeLaneTimesMs: {},
        qaFailedDates: [],
        poReviewFailedDates: [],
        poReviewEnteredDates: [],
        transitions: [],
      };
      byKey.set(ticket.key, entry);
    }

    entry.sprints.push(...sprintNames);
    entry.noActivityInRange = entry.noActivityInRange && !row.active;
    if (person) {
      for (const c of creditFor(ticket, person)) if (!entry.creditedAs.includes(c)) entry.creditedAs.push(c);
    }

    // Values as of the end of the latest sprint the ticket appears in.
    entry.status = r.status;
    entry.statusNow = ticket.currentStatus;
    entry.resolved = ticket.resolvedDate;
    entry.priority = r.priority;
    entry.labels = r.labels;
    entry.components = r.components;
    entry.rootCause = r.rootCause;
    entry.fixVersions = r.fixVersions;
    entry.parentKey = ticket.parentKey;
    entry.parentSummary = ticket.parentSummary;
    entry.storyPoints = r.storyPoints ?? entry.storyPoints;
    entry.devStoryPoints = r.devPoints ?? entry.devStoryPoints;
    entry.qaStoryPoints = r.qaPoints ?? entry.qaStoryPoints;
    entry.completed = STATUS_TO_SWIMLANE[r.status] === 'DONE';
    entry.turnaroundMs = r.turnaroundMs ?? entry.turnaroundMs;
    entry.devCycles += r.devCycles;
    entry.qaCycles += r.qaCycles;
    entry.cycles = cyclesFor(entry, role);
    for (const lane of r.swimlaneTimes) {
      entry.laneTimesMs[lane.swimlane] = (entry.laneTimesMs[lane.swimlane] ?? 0) + lane.totalMs;
    }

    // Lifetime view (identical in every row of the same ticket, so the latest copy is fine).
    const details = [...ticket.sprintDetails].sort((a, b) => (a.startDate ?? '9').localeCompare(b.startDate ?? '9'));
    entry.allSprints = details.map(s => s.name);
    entry.lifetimeSprintCount = details.length;
    entry.nextPI = isNextPI(details, refEnd);
    entry.lifetimeTurnaroundMs = ticket.lifetimeTurnaroundMs;
    entry.lifetimeLaneTimesMs = Object.fromEntries(
      ticket.lifetimeSwimlaneTimes.map(l => [l.swimlane, l.totalMs]),
    );
    entry.transitions = ticket.transitions.map(t => ({
      fromStatus: t.fromStatus, toStatus: t.toStatus, timestamp: t.timestamp,
    }));
    entry.firstDoneDate = ticket.transitions.find(t => STATUS_TO_SWIMLANE[t.toStatus] === 'DONE')?.timestamp ?? null;

    // Event dates inside this row's window, merged across sprints without duplicates.
    const inWindow = (ts: string) =>
      (!row.sprintStartDate || Date.parse(ts) >= Date.parse(row.sprintStartDate))
      && (!row.sprintEndDate || Date.parse(ts) <= Date.parse(row.sprintEndDate));
    const addDates = (target: string[], match: (t: TicketMetrics['transitions'][number]) => boolean) => {
      for (const t of ticket.transitions) {
        if (match(t) && inWindow(t.timestamp) && !target.includes(t.timestamp)) target.push(t.timestamp);
      }
      target.sort();
    };
    addDates(entry.qaFailedDates, t => t.toStatus === DEV_CYCLE_STATUS);
    addDates(entry.poReviewFailedDates, t => t.toStatus === QA_CYCLE_STATUS);
    addDates(entry.poReviewEnteredDates, t => STATUS_TO_SWIMLANE[t.toStatus] === 'PO REVIEW');
  }

  return [...byKey.values()];
}

function cyclesFor(t: PeopleTicket, role: PersonRole): number {
  return role === 'dev' ? t.devCycles : t.qaCycles;
}

function sum(values: number[]): number {
  return values.reduce((s, v) => s + v, 0);
}

function avg(values: number[]): number | null {
  return values.length > 0 ? sum(values) / values.length : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function summarize(tickets: PeopleTicket[], role: PersonRole): PeopleSummary {
  const turnarounds = tickets.map(t => t.turnaroundMs).filter((v): v is number => v !== null);
  const totalCycles = sum(tickets.map(t => cyclesFor(t, role)));
  const withoutRework = tickets.filter(t => cyclesFor(t, role) === 0).length;

  const lanes: LaneStat[] = REPORT_LANES.flatMap(swimlane => {
    const values = tickets.map(t => t.laneTimesMs[swimlane]).filter((v): v is number => v !== undefined && v > 0);
    if (values.length === 0) return [];
    return [{
      swimlane,
      primary: PRIMARY_LANES[role].includes(swimlane),
      tickets: values.length,
      totalMs: sum(values),
      avgMs: avg(values)!,
      medianMs: median(values)!,
    }];
  });

  return {
    tickets: tickets.length,
    completed: tickets.filter(t => t.completed).length,
    storyPoints: sum(tickets.map(t => t.storyPoints ?? 0)),
    completedStoryPoints: sum(tickets.filter(t => t.completed).map(t => t.storyPoints ?? 0)),
    avgTurnaroundMs: avg(turnarounds),
    medianTurnaroundMs: median(turnarounds),
    totalCycles,
    avgCyclesPerTicket: tickets.length > 0 ? totalCycles / tickets.length : 0,
    ticketsWithoutRework: withoutRework,
    reworkFreeRate: tickets.length > 0 ? withoutRework / tickets.length : null,
    linkedDefects: sum(tickets.map(t => t.linkedDefects)),
    devStoryPoints: sum(tickets.map(t => t.devStoryPoints ?? 0)),
    qaStoryPoints: sum(tickets.map(t => t.qaStoryPoints ?? 0)),
    completedDevStoryPoints: sum(tickets.filter(t => t.completed).map(t => t.devStoryPoints ?? 0)),
    completedQaStoryPoints: sum(tickets.filter(t => t.completed).map(t => t.qaStoryPoints ?? 0)),
    ticketsWithNoActivity: tickets.filter(t => t.noActivityInRange).length,
    ticketsAsAssignee: tickets.filter(t => t.creditedAs.includes('assignee')).length,
    ticketsAsQaAssignee: tickets.filter(t => t.creditedAs.includes('qaAssignee')).length,
    lanes,
  };
}

function byIssueType(tickets: PeopleTicket[], role: PersonRole): PeopleIssueTypeEntry[] {
  const groups = new Map<string, PeopleTicket[]>();
  for (const t of tickets) {
    if (!groups.has(t.issueType)) groups.set(t.issueType, []);
    groups.get(t.issueType)!.push(t);
  }

  return [...groups.entries()]
    .map(([issueType, group]) => ({
      issueType,
      tickets: group.length,
      storyPoints: sum(group.map(t => t.storyPoints ?? 0)),
      avgTurnaroundMs: avg(group.map(t => t.turnaroundMs).filter((v): v is number => v !== null)),
      avgCycles: sum(group.map(t => cyclesFor(t, role))) / group.length,
    }))
    .sort((a, b) => b.tickets - a.tickets);
}
