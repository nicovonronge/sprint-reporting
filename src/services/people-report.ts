import { load, type CachedSprintData } from '../cache/cache-manager.js';
import { calculateSprintMetrics } from './metrics-calculator.js';
import { getDataGuide } from '../constants/data-guide.js';
import { SWIMLANE_ORDER, EXCLUDED_SWIMLANE, STATUS_TO_SWIMLANE } from '../constants/workflow.js';
import type { TicketMetrics } from '../types/metrics.js';
import type {
  LaneStat,
  PeopleIssueTypeEntry,
  PeopleOptions,
  PeopleReport,
  PeopleSummary,
  PeopleTicket,
  PersonRole,
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

function peopleOf(ticket: TicketMetrics, role: PersonRole): string[] {
  if (role === 'dev') return ticket.sprintReport.assignee ? [ticket.sprintReport.assignee] : [];
  return ticket.sprintReport.qaAssignees;
}

/** Who can be reported on, and which requested sprints still need fetching. */
export function listPeopleOptions(projectKey: string, sprintNames: string[]): PeopleOptions {
  const { sprints, missing } = loadSprints(projectKey, sprintNames);
  const counts: Record<PersonRole, Map<string, Set<string>>> = { dev: new Map(), qa: new Map() };

  for (const data of sprints) {
    for (const ticket of calculateSprintMetrics(data).ticketMetrics) {
      for (const role of ['dev', 'qa'] as const) {
        for (const person of peopleOf(ticket, role)) {
          if (!counts[role].has(person)) counts[role].set(person, new Set());
          counts[role].get(person)!.add(ticket.key);
        }
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
): PeopleReport {
  const { sprints, missing } = loadSprints(projectKey, sprintNames);
  if (missing.length > 0) {
    throw new Error(`No cached data for ${projectKey}: ${missing.join(', ')}. Fetch them first.`);
  }

  const allRows: Row[] = [];
  for (const data of sprints) {
    for (const ticket of calculateSprintMetrics(data).ticketMetrics) {
      allRows.push({
        sprintName: data.sprintName,
        sprintStartDate: data.sprintStartDate,
        sprintEndDate: data.sprintEndDate,
        ticket,
      });
    }
  }

  const personRows = allRows.filter(r => peopleOf(r.ticket, role).includes(person));
  // Team baseline for QA only counts tickets that had a QA assignee, mirroring the person's scope.
  const teamRows = role === 'qa' ? allRows.filter(r => peopleOf(r.ticket, 'qa').length > 0) : allRows;

  const tickets = rollupTickets(personRows);

  return {
    projectKey,
    person,
    role,
    generatedAt: new Date().toISOString(),
    sprints: sprints.map(s => ({
      sprintName: s.sprintName,
      sprintStartDate: s.sprintStartDate,
      sprintEndDate: s.sprintEndDate,
    })),
    summary: summarize(tickets, role),
    team: summarize(rollupTickets(teamRows), role),
    bySprint: sprints.map(s => ({
      sprintName: s.sprintName,
      sprintStartDate: s.sprintStartDate,
      sprintEndDate: s.sprintEndDate,
      summary: summarize(rollupTickets(personRows.filter(r => r.sprintName === s.sprintName)), role),
    })),
    byIssueType: byIssueType(tickets, role),
    tickets,
    dataGuide: getDataGuide('people'),
  };
}

/**
 * One entry per ticket across the selected sprints. Cycles and lane time are period-scoped per
 * sprint, so they sum; points, status and completion come from the latest sprint the ticket
 * appears in (rows are already in chronological order).
 */
function rollupTickets(rows: Row[]): PeopleTicket[] {
  const byKey = new Map<string, PeopleTicket>();

  for (const { sprintName, ticket } of rows) {
    const r = ticket.sprintReport;
    let entry = byKey.get(ticket.key);
    if (!entry) {
      entry = {
        key: ticket.key,
        summary: ticket.summary,
        issueType: ticket.issueType,
        sprints: [],
        status: r.status,
        storyPoints: r.storyPoints,
        completed: false,
        turnaroundMs: null,
        devCycles: 0,
        qaCycles: 0,
        cycles: 0,
        linkedDefects: ticket.linkedDefects,
        laneTimesMs: {},
      };
      byKey.set(ticket.key, entry);
    }

    entry.sprints.push(sprintName);
    entry.status = r.status;
    entry.storyPoints = r.storyPoints ?? entry.storyPoints;
    entry.completed = STATUS_TO_SWIMLANE[r.status] === 'DONE';
    entry.turnaroundMs = r.turnaroundMs ?? entry.turnaroundMs;
    entry.devCycles += r.devCycles;
    entry.qaCycles += r.qaCycles;
    for (const lane of r.swimlaneTimes) {
      entry.laneTimesMs[lane.swimlane] = (entry.laneTimesMs[lane.swimlane] ?? 0) + lane.totalMs;
    }
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
