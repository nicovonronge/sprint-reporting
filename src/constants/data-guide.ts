import {
  SWIMLANE_STATUSES,
  EXCLUDED_SWIMLANE,
  DEV_CYCLE_STATUS,
  QA_CYCLE_STATUS,
} from './workflow.js';

/**
 * Plain-language explanation of what the report data means. One source of truth: shown in the
 * web UI's "i" panel and embedded in JSON exports so a person (or an AI) reading the numbers
 * knows how they were produced. Keep this in step with the rules in CLAUDE.md.
 */

export type GuideKind = 'general' | 'sprint' | 'comparison' | 'people';

export interface GuideSection {
  title: string;
  points: string[];
}

export interface DataGuide {
  kind: GuideKind;
  title: string;
  intro: string;
  sections: GuideSection[];
  /** Field-by-field meaning of the exported JSON, keyed by field name. */
  fields?: Record<string, string>;
}

const laneList = Object.entries(SWIMLANE_STATUSES)
  .map(([lane, statuses]) => `${lane}: ${statuses.join(', ')}`);

const GENERAL: GuideSection[] = [
  {
    title: 'Where the data comes from',
    points: [
      'Ticket data and history come from Jira. Pull request times come from GitHub (only if GitHub is set up).',
      'Everything is read from the data already downloaded ("fetched") for each sprint. Re-fetch a sprint to refresh it.',
      'Status, assignee, components, points and so on are rebuilt from the ticket\'s change history, so we can say what a ticket looked like at any moment.',
    ],
  },
  {
    title: 'Lanes (swimlanes)',
    points: [
      'Each Jira status belongs to a lane. Time in a lane is the time spent in any of its statuses.',
      ...laneList,
      'Any status not in this list is shown as UNKNOWN.',
    ],
  },
  {
    title: 'How time is measured',
    points: [
      'All durations are business time: Saturdays and Sundays do not count (UTC day boundaries).',
      'In the screens, time is shown as minutes, hours or days. In exported JSON, all durations are in milliseconds (fields ending in "Ms").',
      'The one exception is GitHub pull request time. That is normal wall-clock time, weekends included.',
    ],
  },
  {
    title: 'Cycles (rework)',
    points: [
      `A dev cycle is counted each time a ticket moves into "${DEV_CYCLE_STATUS}". It means QA sent the ticket back to the developer.`,
      `A QA cycle is counted each time a ticket moves into "${QA_CYCLE_STATUS}". It means the PO review sent the ticket back to QA.`,
      'A lower number is better. Zero means the ticket never bounced back.',
    ],
  },
  {
    title: 'Escalated tickets',
    points: [
      `${EXCLUDED_SWIMLANE} is treated as an interruption, not normal work.`,
      'A ticket that is in Escalated right now is left out of the report completely.',
      'A ticket that was escalated earlier but has moved on stays in. The time it spent escalated is taken off its turnaround, and the Escalated lane is never shown.',
    ],
  },
  {
    title: 'Tickets that only ever sat in To Do',
    points: [
      'Tickets are often refined into To Do before their sprint starts.',
      'If a ticket has only ever been in To Do, its To Do time is counted from the start of the first sprint it was in that actually started (active or closed), not from when it was created.',
      'If none of its sprints ever started, the ticket is left out of the report.',
    ],
  },
];

const SPRINT: GuideSection[] = [
  {
    title: 'What "sprint report" data means',
    points: [
      'Each ticket has a "sprintReport" block. It describes the ticket for that sprint only.',
      'Cycles, time in each lane and turnaround only count what happened between the sprint start and end. If a ticket cycled 20 times last month and once this sprint, this sprint shows 1.',
      'Details like status, assignee, QA assignees, story points, dev/QA points, root cause, work category, priority, components, labels and versions are the value at the END of the sprint.',
      'A value set in an earlier sprint still shows. For example story points set in sprint 3.2 are still shown in sprint 3.4. Changes made after the sprint ended are not shown.',
    ],
  },
  {
    title: 'Turnaround',
    points: [
      'Turnaround runs from the later of (ticket created, sprint start) to the last time the ticket moved to Done on or before the sprint end.',
      'Escalated time is taken off.',
      'It is empty if the ticket was not finished during that sprint.',
    ],
  },
  {
    title: 'Which tickets appear',
    points: [
      'Every ticket in the sprint appears, even if nothing changed on it during the sprint.',
      'Tickets that sat in Dev all sprint with no moves still show their time in that lane.',
      'Carry-over: a ticket that was in more than one sprint is counted as carried over (sprintCount, carryOverCount).',
    ],
  },
  {
    title: 'Lifetime data',
    points: [
      'Lifetime fields cover the whole life of the ticket, not just the sprint: lifetimeTurnaroundMs, lifetimeSwimlaneTimes and transitions.',
      'They are kept separate so they are never mixed up with sprint numbers.',
      'linkedDefects is also a lifetime count for the ticket.',
    ],
  },
];

const COMPARISON: GuideSection[] = [
  {
    title: 'Sprint comparison report',
    points: [
      'Shows trends across several sprints you have already downloaded, for one team.',
      'It uses the same sprint-period numbers described above.',
      'Tickets with no assignee, or whose assignee is on the fixed non-dev list (leads, PMs, QA leads), are left out. This is so admin, refinement and escalation tickets do not distort the trend of dev capacity.',
      'Only the main assignee is checked, never the QA assignee. A ticket tested by someone on the list still counts.',
      'This filter is only used here. The normal single-sprint report and the people report do not use it.',
    ],
  },
];

const PEOPLE: GuideSection[] = [
  {
    title: 'What the people report is',
    points: [
      'It combines several sprints into one review of a single person in a single role (Developer or QA) on a single project.',
      'You choose the sprints. They normally match a KPI season.',
      'It is built from each sprint\'s sprint-period numbers, so nothing is counted twice when a ticket spans sprints.',
    ],
  },
  {
    title: 'Who gets credit for a ticket',
    points: [
      'In each sprint, a ticket is credited to the developer who was the assignee at the END of that sprint, and to the QA people who were QA assignees at the END of that sprint.',
      'If a ticket changed hands, each person is credited only for the sprints where they held it at the end.',
      'A ticket that appears in several sprints is counted once. Its cycles and lane time are added up across the sprints. Points, status and "completed" come from the latest sprint it appears in.',
    ],
  },
  {
    title: 'Role-specific measures',
    points: [
      `Developer cycles = "${DEV_CYCLE_STATUS}" moves. QA cycles = "${QA_CYCLE_STATUS}" moves.`,
      'The lanes a role controls are marked primary. Developer: TO DO and IN DEVELOPMENT. QA: READY FOR QA and IN QA. Other lanes are context only, because the person does not control that waiting time.',
      '"No-rework tickets" is the share of tickets with zero cycles for that role.',
    ],
  },
  {
    title: 'Team comparison',
    points: [
      'The "team" figures use every ticket in the same sprints, so a person can be compared with everyone else.',
      'For QA, the team figures only include tickets that had a QA assignee.',
      'The percentage difference is (person - team) / team. For time, cycles and rework, lower is better.',
    ],
  },
  {
    title: 'Reading it fairly',
    points: [
      'Use the median as well as the average. One very slow ticket can distort an average.',
      'Check the ticket count. A few tickets is a small sample.',
      'Ticket size matters. Compare by issue type and points, not only totals.',
      'Linked defects are lifetime counts for the ticket, not just the selected sprints.',
    ],
  },
];

const PEOPLE_FIELDS: Record<string, string> = {
  projectKey: 'Jira project the report is for.',
  person: 'The person being reviewed.',
  role: '"dev" = reviewed as the ticket assignee. "qa" = reviewed as a QA assignee.',
  generatedAt: 'When the report was produced.',
  sprints: 'The sprints included, with start and end dates.',
  summary: 'Totals for this person across all included sprints.',
  team: 'The same totals for everyone in the same sprints, for comparison.',
  bySprint: 'The person\'s summary split per sprint, oldest first.',
  byIssueType: 'The person\'s tickets grouped by issue type (Story, Bug, ...).',
  tickets: 'One entry per ticket the person was credited with, across all sprints.',
  'summary.tickets': 'Number of different tickets.',
  'summary.completed': 'Tickets whose status at the end of their latest sprint was in the Done lane.',
  'summary.storyPoints': 'Story points of all the tickets.',
  'summary.completedStoryPoints': 'Story points of the completed tickets only.',
  'summary.avgTurnaroundMs': 'Average turnaround in milliseconds (business time), over tickets finished in the sprints. Null if none.',
  'summary.medianTurnaroundMs': 'Median turnaround in milliseconds. Less affected by one slow ticket than the average.',
  'summary.totalCycles': 'Rework cycles for the role (dev: QA Failed, qa: PO Review Failed).',
  'summary.avgCyclesPerTicket': 'totalCycles divided by tickets.',
  'summary.ticketsWithoutRework': 'Tickets with zero cycles for the role.',
  'summary.reworkFreeRate': 'ticketsWithoutRework divided by tickets, from 0 to 1.',
  'summary.linkedDefects': 'Defects linked to the tickets (lifetime, not limited to the sprints).',
  'summary.lanes': 'Time in each lane, only for tickets that spent time there.',
  'summary.lanes[].primary': 'True for the lanes this role controls.',
  'summary.lanes[].tickets': 'Tickets that spent time in the lane.',
  'summary.lanes[].totalMs': 'Total business milliseconds in the lane.',
  'summary.lanes[].avgMs': 'Average milliseconds per ticket in the lane.',
  'summary.lanes[].medianMs': 'Median milliseconds per ticket in the lane.',
  'tickets[].sprints': 'Names of the included sprints the ticket was credited in.',
  'tickets[].status': 'Status at the end of the latest included sprint it appears in.',
  'tickets[].storyPoints': 'Story points as of the end of the latest sprint it appears in.',
  'tickets[].completed': 'True if that status is in the Done lane.',
  'tickets[].turnaroundMs': 'Turnaround in milliseconds if the ticket finished during the sprints, otherwise null.',
  'tickets[].devCycles': 'QA Failed moves inside the included sprints.',
  'tickets[].qaCycles': 'PO Review Failed moves inside the included sprints.',
  'tickets[].cycles': 'The cycles that count for this role.',
  'tickets[].linkedDefects': 'Defects linked to the ticket (lifetime).',
  'tickets[].laneTimesMs': 'Business milliseconds in each lane, added up across the included sprints.',
};

const SPRINT_FIELDS: Record<string, string> = {
  sprintName: 'Name of the sprint.',
  sprintStartDate: 'When the sprint started.',
  sprintEndDate: 'When the sprint ended (or is planned to end).',
  projectKey: 'Jira project (team) key.',
  totalTickets: 'Tickets in the report after the rules above were applied.',
  completedTickets: 'Tickets whose status at the END of the sprint was in the Done lane.',
  newTickets: 'Tickets that were only ever in this one sprint.',
  carriedOverTickets: 'Tickets that were in more than one sprint.',
  totalStoryPoints: 'Sum of story points as of the end of the sprint. totalDevPoints and totalQaPoints work the same way.',
  avgTurnaroundMs: 'Average sprint-period turnaround in milliseconds (business time), over completed tickets that finished during the sprint. Null if none.',
  avgSprintSwimlaneTimesMs: 'Average milliseconds per lane inside the sprint, keyed by lane name. Only tickets that spent time in a lane are averaged for that lane.',
  avgLifetimeSwimlaneTimesMs: 'The same average but over the whole life of each ticket, not just the sprint.',
  avgDevCycles: 'Average dev cycles (QA Failed moves inside the sprint) per ticket.',
  avgQaCycles: 'Average QA cycles (PO Review Failed moves inside the sprint) per ticket.',
  totalDefects: 'Sum of linkedDefects over the tickets (lifetime counts).',
  ticketMetrics: 'One entry per ticket. See the ticketMetrics[] fields below.',
  byDeveloper: 'Developer name (assignee at sprint end, or "Unassigned") to the list of ticket keys. In the export this holds keys only; full tickets are in ticketMetrics.',
  byQaAssignee: 'QA assignee name (at sprint end, or "Unassigned") to the list of ticket keys. Keys only, as above. A ticket with several QA assignees is listed under each.',
  'ticketMetrics[].key': 'Jira ticket key.',
  'ticketMetrics[].summary': 'Ticket title.',
  'ticketMetrics[].issueType': 'Story, Bug, Task and so on.',
  'ticketMetrics[].currentStatus': 'Status RIGHT NOW (when the data was fetched). For status at the end of the sprint use sprintReport.status.',
  'ticketMetrics[].createdDate': 'When the ticket was created.',
  'ticketMetrics[].updatedDate': 'When the ticket was last updated (at fetch time).',
  'ticketMetrics[].statusChangedDate': 'When the ticket last changed status category (at fetch time).',
  'ticketMetrics[].reporter': 'Who reported the ticket (current value).',
  'ticketMetrics[].creator': 'Who created the ticket (current value).',
  'ticketMetrics[].subtaskCount': 'Number of subtasks (current value).',
  'ticketMetrics[].watchers': 'Number of watchers (current value).',
  'ticketMetrics[].sprintReport': 'The sprint-period view of the ticket. Everything inside it follows the sprint rules above.',
  'ticketMetrics[].sprintReport.asOf': 'The moment the "as of the end of the sprint" values were taken.',
  'ticketMetrics[].sprintReport.status': 'Status at the end of the sprint.',
  'ticketMetrics[].sprintReport.assignee': 'Developer assigned at the end of the sprint.',
  'ticketMetrics[].sprintReport.qaAssignees': 'QA assignees at the end of the sprint.',
  'ticketMetrics[].sprintReport.storyPoints': 'Story points at the end of the sprint. devPoints and qaPoints work the same way.',
  'ticketMetrics[].sprintReport.rootCause': 'Root cause at the end of the sprint. workCategory, priority, components, labels, fixVersions and affectsVersions work the same way.',
  'ticketMetrics[].sprintReport.turnaroundMs': 'Sprint-period turnaround in milliseconds (business time, escalated time removed). Null if the ticket did not finish during the sprint.',
  'ticketMetrics[].sprintReport.swimlaneTimes': 'Time in each lane inside the sprint only. Each item has swimlane, totalMs and entries (entered, exited, durationMs).',
  'ticketMetrics[].sprintReport.devCycles': 'QA Failed moves inside the sprint.',
  'ticketMetrics[].sprintReport.qaCycles': 'PO Review Failed moves inside the sprint.',
  'ticketMetrics[].lifetimeTurnaroundMs': 'Turnaround over the whole life of the ticket: created to last Done, minus escalated time.',
  'ticketMetrics[].lifetimeSwimlaneTimes': 'Time in each lane over the whole life of the ticket.',
  'ticketMetrics[].sprintCount': 'How many sprints the ticket has been in (at fetch time).',
  'ticketMetrics[].sprintNames': 'Names of those sprints.',
  'ticketMetrics[].carryOverCount': 'sprintCount minus 1 (never below 0).',
  'ticketMetrics[].linkedDefects': 'Number of defects linked to the ticket (lifetime).',
  'ticketMetrics[].linkedDefectKeys': 'Keys of those defects.',
  'ticketMetrics[].github': 'Pull request data, or null. Times here are wall-clock (weekends included): firstPRCreated, lastPRMerged, totalPRTimeMs.',
  'ticketMetrics[].transitions': 'Every status change of the ticket over its whole life (fromStatus, toStatus, their lanes, timestamp).',
};

const COMPARISON_FIELDS: Record<string, string> = {
  swimlaneOrder: 'Lane names in workflow order (Escalated is never included).',
  entries: 'One entry per sprint, oldest first.',
  'entries[].projectKey': 'Jira project key.',
  'entries[].sprintName': 'Sprint name.',
  'entries[].sprintStartDate': 'Sprint start.',
  'entries[].sprintEndDate': 'Sprint end.',
  'entries[].metrics': 'The sprint report numbers for this sprint, after the non-dev assignee filter. Same fields as the sprint report export.',
  'entries[].rawTicketCount': 'Tickets in the sprint before the non-dev assignee filter.',
  'entries[].excludedTicketCount': 'Tickets removed by the filter (no assignee, or a lead/PM/QA lead assignee).',
  'entries[].currentlyEscalatedCount': 'Tickets left out of the report because they are in Escalated right now.',
};

const GUIDES: Record<GuideKind, Omit<DataGuide, 'kind'>> = {
  general: {
    title: 'About this data',
    intro: 'How the numbers in this tool are produced. These rules apply to every report.',
    sections: GENERAL,
  },
  sprint: {
    title: 'About the sprint report',
    intro: 'This report describes each ticket for one sprint only: what happened inside the sprint, and how the ticket looked at the end of it.',
    sections: [...SPRINT, ...GENERAL],
    fields: SPRINT_FIELDS,
  },
  comparison: {
    title: 'About the sprint comparison report',
    intro: 'Trends across several sprints for one team.',
    sections: [...COMPARISON, ...SPRINT, ...GENERAL],
    fields: { ...COMPARISON_FIELDS, ...SPRINT_FIELDS },
  },
  people: {
    title: 'About the people report',
    intro: 'A review of one person in one role across the sprints you chose.',
    sections: [...PEOPLE, ...SPRINT, ...GENERAL],
    fields: PEOPLE_FIELDS,
  },
};

export function getDataGuide(kind: GuideKind): DataGuide {
  return { kind, ...GUIDES[kind] };
}

export function isGuideKind(value: unknown): value is GuideKind {
  return typeof value === 'string' && value in GUIDES;
}
