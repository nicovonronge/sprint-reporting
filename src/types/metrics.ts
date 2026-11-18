import type { TicketGitHubData } from './github.js';

export interface StatusTransition {
  fromStatus: string | null;
  toStatus: string;
  fromSwimlane: string | null;
  toSwimlane: string;
  timestamp: string;
}

export interface SwimlaneTimeEntry {
  entered: string;
  exited: string | null;
  durationMs: number;
}

export interface SwimlaneTime {
  swimlane: string;
  totalMs: number;
  entries: SwimlaneTimeEntry[];
}

/**
 * Ticket data scoped to the sprint window: fields hold their value as of the sprint end date,
 * and cycle counts / durations only cover activity between sprint start and end.
 */
export interface SprintReportData {
  asOf: string;
  status: string;
  assignee: string | null;
  qaAssignees: string[];
  storyPoints: number | null;
  devPoints: number | null;
  qaPoints: number | null;
  rootCause: string | null;
  workCategory: string | null;
  priority: string | null;
  components: string[];
  labels: string[];
  fixVersions: string[];
  affectsVersions: string[];

  turnaroundMs: number | null;
  swimlaneTimes: SwimlaneTime[];
  devCycles: number;
  qaCycles: number;
}

export interface TicketMetrics {
  key: string;
  summary: string;
  issueType: string;
  currentStatus: string;
  createdDate: string;
  updatedDate: string | null;
  statusChangedDate: string | null;
  resolvedDate: string | null;
  parentKey: string | null;
  parentSummary: string | null;
  reporter: string | null;
  creator: string | null;
  subtaskCount: number;
  watchers: number;

  // Sprint-scoped report data (period only, values as of sprint end)
  sprintReport: SprintReportData;

  // Lifetime metrics (full ticket history)
  lifetimeTurnaroundMs: number | null;
  lifetimeSwimlaneTimes: SwimlaneTime[];

  // Sprint carry-over
  sprintCount: number;
  sprintNames: string[];
  /** Every sprint the ticket has ever been in, with its state and start date (null if unplanned). */
  sprintDetails: Array<{ name: string; state: string; startDate: string | null }>;
  carryOverCount: number;

  linkedDefects: number;
  linkedDefectKeys: string[];

  github: TicketGitHubData | null;
  transitions: StatusTransition[];
}

export interface SprintMetrics {
  sprintName: string;
  sprintStartDate: string;
  sprintEndDate: string;
  projectKey: string;
  /** Team that owns the project (see TEAMS in constants/workflow.ts); null if the project isn't listed. */
  teamName: string | null;

  totalTickets: number;
  completedTickets: number;
  newTickets: number;
  carriedOverTickets: number;

  totalStoryPoints: number;
  totalDevPoints: number;
  totalQaPoints: number;

  avgTurnaroundMs: number | null;
  avgSprintSwimlaneTimesMs: Record<string, number>;
  avgLifetimeSwimlaneTimesMs: Record<string, number>;

  avgDevCycles: number;
  avgQaCycles: number;
  totalDefects: number;

  ticketMetrics: TicketMetrics[];
  byDeveloper: Record<string, TicketMetrics[]>;
  byQaAssignee: Record<string, TicketMetrics[]>;
}

export interface FilterOptions {
  developer?: string;
  qa?: string;
  tickets?: string[];
  issueTypes?: string[];
}
