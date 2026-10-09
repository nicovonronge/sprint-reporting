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
  lanes: LaneStat[];
}

export interface PeopleTicket {
  key: string;
  summary: string;
  issueType: string;
  sprints: string[];
  status: string;
  storyPoints: number | null;
  completed: boolean;
  turnaroundMs: number | null;
  devCycles: number;
  qaCycles: number;
  cycles: number;
  linkedDefects: number;
  laneTimesMs: Record<string, number>;
}

export interface PeopleSprintEntry {
  sprintName: string;
  sprintStartDate: string;
  sprintEndDate: string;
  summary: PeopleSummary;
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
  person: string;
  role: PersonRole;
  generatedAt: string;
  sprints: Array<{ sprintName: string; sprintStartDate: string; sprintEndDate: string }>;
  summary: PeopleSummary;
  /** Same measures for every ticket in the selected sprints, as context. */
  team: PeopleSummary;
  bySprint: PeopleSprintEntry[];
  byIssueType: PeopleIssueTypeEntry[];
  tickets: PeopleTicket[];
  /** Plain-language explanation of every figure above, so the export is self-describing. */
  dataGuide: DataGuide;
}

export interface PeopleOptions {
  /** Requested sprints with no fetched data yet. */
  missing: string[];
  dev: Array<{ name: string; tickets: number }>;
  qa: Array<{ name: string; tickets: number }>;
}
