import type { DataGuide } from '../constants/data-guide.js';

export type PersonRole = 'dev' | 'qa';

export interface LaneStat {
  swimlane: string;
  /** Lanes this role controls (Dev: To Do/In Development, QA: Ready for QA/In QA). */
  primary: boolean;
  /** Tickets that spent any time in this lane. */
  tickets: number;
  totalMs: number;
  avgMs: number;
  medianMs: number;
}

export interface PeopleSummary {
  tickets: number;
  completed: number;
  storyPoints: number;
  completedStoryPoints: number;
  avgTurnaroundMs: number | null;
  medianTurnaroundMs: number | null;
  /** Dev role: QA Failed cycles. QA role: PO Review Failed cycles. */
  totalCycles: number;
  avgCyclesPerTicket: number;
  ticketsWithoutRework: number;
  /** 0-1 share of tickets with no rework cycles; null when there are no tickets. */
  reworkFreeRate: number | null;
  linkedDefects: number;
  /** Dev / QA share of the story points (the "Dev SP" and "QA SP" fields). */
  devStoryPoints: number;
  qaStoryPoints: number;
  completedDevStoryPoints: number;
  completedQaStoryPoints: number;
  /** Tickets that had no activity inside the period (committed work that did not move). */
  ticketsWithNoActivity: number;
  /** Tickets credited via the assignee field / via the QA assignee field (a ticket can be both). */
  ticketsAsAssignee: number;
  ticketsAsQaAssignee: number;
  lanes: LaneStat[];
}

export type CreditedAs = 'assignee' | 'qaAssignee';

export interface PeopleTransition {
  fromStatus: string | null;
  toStatus: string;
  timestamp: string;
}

export interface PeopleTicket {
  key: string;
  summary: string;
  issueType: string;
  /** How the person is credited: as the dev assignee, as a QA assignee, or both. */
  creditedAs: CreditedAs[];
  /** True when nothing happened to the ticket inside the period (it is still committed work). */
  noActivityInRange: boolean;
  /** True when every sprint the ticket is in starts after the period (it belongs to the next PI). */
  nextPI: boolean;
  sprints: string[];
  /** Every sprint the ticket has ever been in, oldest first. */
  allSprints: string[];
  lifetimeSprintCount: number;
  /** Status at the end of the period. */
  status: string;
  /** Status when the data was fetched. */
  statusNow: string;
  created: string;
  resolved: string | null;
  /** First time the ticket reached the Done lane, ever. */
  firstDoneDate: string | null;
  priority: string | null;
  labels: string[];
  components: string[];
  rootCause: string | null;
  fixVersions: string[];
  parentKey: string | null;
  parentSummary: string | null;
  storyPoints: number | null;
  devStoryPoints: number | null;
  qaStoryPoints: number | null;
  completed: boolean;
  turnaroundMs: number | null;
  devCycles: number;
  qaCycles: number;
  cycles: number;
  linkedDefects: number;
  linkedDefectKeys: string[];
  laneTimesMs: Record<string, number>;
  /** Whole-life figures (not limited to the period). */
  lifetimeTurnaroundMs: number | null;
  lifetimeLaneTimesMs: Record<string, number>;
  /** When each QA Failed / PO Review Failed move happened inside the period. */
  qaFailedDates: string[];
  poReviewFailedDates: string[];
  /** When the ticket entered PO Review inside the period. */
  poReviewEnteredDates: string[];
  /** Every status change over the whole life of the ticket. */
  transitions: PeopleTransition[];
}

/** A bug the person raised (Jira reporter), whether or not it was in one of the sprints. */
export interface ReportedBug {
  key: string;
  summary: string;
  created: string;
  priority: string | null;
  statusAtPeriodEnd: string;
  statusNow: string;
  resolved: string | null;
  fixVersions: string[];
  parentKey: string | null;
  sprints: string[];
  nextPI: boolean;
  /** True when the bug is in one of the selected sprints (so it is also in "tickets" if credited). */
  inSelectedSprints: boolean;
}

/** The same person measured over the period before, for "versus last period" checks. */
export interface PreviousPeriod {
  period: PeoplePeriod;
  /** Fetched sprints that overlap the previous period (the pool its tickets came from). */
  sprintsUsed: string[];
  summary: PeopleSummary | null;
  team: PeopleSummary | null;
}

export interface PeopleSprintEntry {
  sprintName: string;
  sprintStartDate: string;
  sprintEndDate: string;
  summary: PeopleSummary;
}

/** Inclusive calendar dates (YYYY-MM-DD, UTC) that replace the sprint boundaries. */
export interface PeoplePeriod {
  from: string;
  to: string;
}

export interface PeopleIssueTypeEntry {
  issueType: string;
  tickets: number;
  storyPoints: number;
  avgTurnaroundMs: number | null;
  avgCycles: number;
}

/**
 * Multi-sprint performance report for one person in one role on one project. Built from each
 * sprint's `sprintReport` data, so cycles and lane time never double-count across sprints.
 */
export interface PeopleReport {
  projectKey: string;
  /** Team that owns the project; null if the project isn't in TEAMS. */
  teamName: string | null;
  person: string;
  /** The person's Jira account id, when it appears on any fetched ticket. */
  accountId: string | null;
  role: PersonRole;
  generatedAt: string;
  /** 'sprints' = whole sprints, each measured as of its own end. 'dateRange' = one custom window. */
  mode: 'sprints' | 'dateRange';
  /** Set in dateRange mode: everything is measured as of the end of this window. */
  period: PeoplePeriod | null;
  /** The sprints included (in dateRange mode: the pool the tickets were taken from). */
  sprints: Array<{ sprintName: string; sprintStartDate: string; sprintEndDate: string }>;
  summary: PeopleSummary;
  /** Date-range mode only, when a previous period was asked for. */
  previousPeriod: PreviousPeriod | null;
  /** Same measures for every ticket in the selected sprints / window, as context. */
  team: PeopleSummary;
  /** Empty in dateRange mode. */
  bySprint: PeopleSprintEntry[];
  byIssueType: PeopleIssueTypeEntry[];
  tickets: PeopleTicket[];
  /** Bugs the person reported in the period (from the sprints plus the extra bugs collected at fetch time). */
  reportedBugs: ReportedBug[];
  /** False when some selected sprint was fetched before extra bugs were collected: the list may be short, re-fetch. */
  reportedBugsComplete: boolean;
  /** Plain-language explanation of every figure above, so the export is self-describing. */
  dataGuide: DataGuide;
}

export interface PeopleOptions {
  /** Requested sprints with no fetched data yet. */
  missing: string[];
  dev: Array<{ name: string; tickets: number }>;
  qa: Array<{ name: string; tickets: number }>;
}
