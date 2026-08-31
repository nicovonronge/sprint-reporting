import type { CachedSprintData } from '../cache/cache-manager.js';
import type { JiraIssue, JiraSprint } from '../types/jira.js';
import type { TicketMetrics, SprintMetrics, SwimlaneTime } from '../types/metrics.js';
import type { TicketGitHubData } from '../types/github.js';
import {
  parseTransitions,
  computeSwimlaneTimes,
  isTodoOnly,
  extractSwimlaneMs,
  stripSwimlane,
  rebaseSwimlaneTime,
} from './changelog-parser.js';
import { countDevCycles, countQaCycles } from './cycle-counter.js';
import { detectLinkedDefects } from './defect-detector.js';
import { CUSTOM_FIELDS, SWIMLANE_ORDER, STATUS_TO_SWIMLANE, EXCLUDED_SWIMLANE } from '../constants/workflow.js';
import { businessMsBetween } from '../utils/date-utils.js';

export function calculateTicketMetrics(
  issue: JiraIssue,
  sprintStartDate: string,
  sprintEndDate: string,
  githubPRs: TicketGitHubData | null,
): TicketMetrics | null {
  // Currently-escalated tickets are out-of-band interruptions, not reportable current state.
  if (STATUS_TO_SWIMLANE[issue.fields.status.name] === EXCLUDED_SWIMLANE) return null;

  const transitions = parseTransitions(issue);
  let lifetimeSwimlaneTimes = computeSwimlaneTimes(issue, transitions);
  let sprintSwimlaneTimes = (sprintStartDate && sprintEndDate)
    ? computeSwimlaneTimes(issue, transitions, sprintStartDate, sprintEndDate)
    : [];

  // Escalated time is an interruption: subtract it from totals and hide the category for
  // tickets that passed through Escalated but have since moved on.
  const escalatedMs = extractSwimlaneMs(lifetimeSwimlaneTimes, EXCLUDED_SWIMLANE);
  lifetimeSwimlaneTimes = stripSwimlane(lifetimeSwimlaneTimes, EXCLUDED_SWIMLANE);
  sprintSwimlaneTimes = stripSwimlane(sprintSwimlaneTimes, EXCLUDED_SWIMLANE);

  // Sprint carry-over
  const sprintField = issue.fields[CUSTOM_FIELDS.SPRINT] as JiraSprint[] | null;
  const sprintNames = sprintField?.map(s => s.name) ?? [];
  const sprintCount = sprintNames.length;
  const carryOverCount = Math.max(0, sprintCount - 1);

  // Backlog tickets refined into Todo aren't necessarily in an active sprint yet — measure
  // Todo time from the first sprint that actually started, not from creation/refinement date.
  if (isTodoOnly(lifetimeSwimlaneTimes)) {
    const startedSprints = (sprintField ?? [])
      .filter((s): s is JiraSprint & { startDate: string } =>
        (s.state === 'active' || s.state === 'closed') && !!s.startDate,
      )
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    if (startedSprints.length === 0) return null;

    const firstStartedDate = startedSprints[0].startDate;
    lifetimeSwimlaneTimes = rebaseSwimlaneTime(lifetimeSwimlaneTimes, 'TO DO', firstStartedDate);
    sprintSwimlaneTimes = rebaseSwimlaneTime(sprintSwimlaneTimes, 'TO DO', firstStartedDate);
  }

  const devCycles = countDevCycles(transitions);
  const qaCycles = countQaCycles(transitions);
  const defects = detectLinkedDefects(issue);

  // Lifetime turnaround: first entry into any status → last Done transition, minus any time
  // spent escalated along the way.
  const rawLifetimeTurnaroundMs = computeLifetimeTurnaround(issue, transitions);
  const lifetimeTurnaroundMs = rawLifetimeTurnaroundMs !== null
    ? Math.max(0, rawLifetimeTurnaroundMs - escalatedMs)
    : null;

  // QA Assignees
  const qaField = issue.fields[CUSTOM_FIELDS.QA_ASSIGNEE] as Array<{ displayName: string }> | null;
  const qaAssignees = qaField?.map(u => u.displayName) ?? [];

  // Root cause
  const rootCause = (issue.fields[CUSTOM_FIELDS.ROOT_CAUSE] as { value: string } | null)?.value ?? null;

  // Work category
  const workCategory = (issue.fields[CUSTOM_FIELDS.WORK_CATEGORY] as { value: string } | null)?.value ?? null;

  return {
    key: issue.key,
    summary: issue.fields.summary,
    issueType: issue.fields.issuetype.name,
    assignee: issue.fields.assignee?.displayName ?? null,
    qaAssignees,
    storyPoints: (issue.fields[CUSTOM_FIELDS.STORY_POINTS] as number | null) ?? null,
    devPoints: (issue.fields[CUSTOM_FIELDS.DEV_POINTS] as number | null) ?? null,
    qaPoints: (issue.fields[CUSTOM_FIELDS.QA_POINTS] as number | null) ?? null,
    rootCause,
    workCategory,
    currentStatus: issue.fields.status.name,
    createdDate: issue.fields.created,
    lifetimeTurnaroundMs,
    lifetimeSwimlaneTimes,
    sprintSwimlaneTimes,
    sprintCount,
    sprintNames,
    carryOverCount,
    devCycles,
    qaCycles,
    linkedDefects: defects.count,
    linkedDefectKeys: defects.keys,
    github: githubPRs,
    transitions,
  };
}

export function calculateSprintMetrics(data: CachedSprintData): SprintMetrics {
  const tickets: TicketMetrics[] = data.issues
    .map(issue => {
      const prs = data.githubData[issue.key];
      const githubData = prs ? buildGitHubData(prs) : null;
      return calculateTicketMetrics(issue, data.sprintStartDate, data.sprintEndDate, githubData);
    })
    .filter((t): t is TicketMetrics => t !== null);

  return aggregateSprintMetrics(tickets, data);
}

export function aggregateSprintMetrics(
  tickets: TicketMetrics[],
  data: CachedSprintData,
): SprintMetrics {
  const completed = tickets.filter(t => {
    const swimlane = STATUS_TO_SWIMLANE[t.currentStatus];
    return swimlane === 'DONE';
  });

  const newTickets = tickets.filter(t => t.carryOverCount === 0).length;
  const carriedOver = tickets.filter(t => t.carryOverCount > 0).length;

  const sum = (arr: (number | null)[]): number =>
    arr.reduce((s: number, v) => s + (v ?? 0), 0);

  const avg = (arr: number[]): number =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  // Average lifetime turnaround (only for completed tickets)
  const turnaroundValues = completed
    .map(t => t.lifetimeTurnaroundMs)
    .filter((v): v is number => v !== null);

  // Average swimlane times
  const avgSprintSwimlane = averageSwimlaneTimes(tickets.map(t => t.sprintSwimlaneTimes));
  const avgLifetimeSwimlane = averageSwimlaneTimes(tickets.map(t => t.lifetimeSwimlaneTimes));

  // Group by developer
  const byDeveloper: Record<string, TicketMetrics[]> = {};
  for (const t of tickets) {
    const dev = t.assignee ?? 'Unassigned';
    if (!byDeveloper[dev]) byDeveloper[dev] = [];
    byDeveloper[dev].push(t);
  }

  // Group by QA assignee
  const byQaAssignee: Record<string, TicketMetrics[]> = {};
  for (const t of tickets) {
    for (const qa of t.qaAssignees) {
      if (!byQaAssignee[qa]) byQaAssignee[qa] = [];
      byQaAssignee[qa].push(t);
    }
    if (t.qaAssignees.length === 0) {
      if (!byQaAssignee['Unassigned']) byQaAssignee['Unassigned'] = [];
      byQaAssignee['Unassigned'].push(t);
    }
  }

  return {
    sprintName: data.sprintName,
    sprintStartDate: data.sprintStartDate,
    sprintEndDate: data.sprintEndDate,
    projectKey: data.projectKey,
    totalTickets: tickets.length,
    completedTickets: completed.length,
    newTickets,
    carriedOverTickets: carriedOver,
    totalStoryPoints: sum(tickets.map(t => t.storyPoints)),
    totalDevPoints: sum(tickets.map(t => t.devPoints)),
    totalQaPoints: sum(tickets.map(t => t.qaPoints)),
    avgLifetimeTurnaroundMs: turnaroundValues.length > 0 ? avg(turnaroundValues) : null,
    avgSprintSwimlaneTimesMs: avgSprintSwimlane,
    avgLifetimeSwimlaneTimesMs: avgLifetimeSwimlane,
    avgDevCycles: avg(tickets.map(t => t.devCycles)),
    avgQaCycles: avg(tickets.map(t => t.qaCycles)),
    totalDefects: sum(tickets.map(t => t.linkedDefects)),
    ticketMetrics: tickets,
    byDeveloper,
    byQaAssignee,
  };
}

function computeLifetimeTurnaround(
  issue: JiraIssue,
  transitions: import('../types/metrics.js').StatusTransition[],
): number | null {
  if (transitions.length === 0) return null;

  const doneTransitions = transitions.filter(t =>
    STATUS_TO_SWIMLANE[t.toStatus] === 'DONE',
  );
  if (doneTransitions.length === 0) return null;

  const lastDone = doneTransitions[doneTransitions.length - 1];

  return businessMsBetween(issue.fields.created, lastDone.timestamp);
}

function averageSwimlaneTimes(allTimes: SwimlaneTime[][]): Record<string, number> {
  const totals: Record<string, number[]> = {};

  for (const ticketTimes of allTimes) {
    for (const st of ticketTimes) {
      if (!totals[st.swimlane]) totals[st.swimlane] = [];
      totals[st.swimlane].push(st.totalMs);
    }
  }

  const result: Record<string, number> = {};
  for (const [swimlane, values] of Object.entries(totals)) {
    result[swimlane] = values.reduce((s, v) => s + v, 0) / values.length;
  }

  return result;
}

function buildGitHubData(prs: import('../types/github.js').GitHubPR[]): TicketGitHubData {
  const sorted = [...prs].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const firstCreated = sorted.length > 0 ? sorted[0].createdAt : null;

  const merged = sorted.filter(p => p.mergedAt);
  const lastMerged = merged.length > 0 ? merged[merged.length - 1].mergedAt : null;

  const totalPRTimeMs = (firstCreated && lastMerged)
    ? new Date(lastMerged).getTime() - new Date(firstCreated).getTime()
    : null;

  return { prs, firstPRCreated: firstCreated, lastPRMerged: lastMerged, totalPRTimeMs };
}
