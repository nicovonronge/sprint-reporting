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

export interface TicketMetrics {
  key: string;
  summary: string;
  issueType: string;
  assignee: string | null;
  qaAssignees: string[];
  storyPoints: number | null;
  devPoints: number | null;
  qaPoints: number | null;
  rootCause: string | null;
  workCategory: string | null;
  currentStatus: string;
  createdDate: string;

  // Lifetime metrics (full ticket history)
  lifetimeTurnaroundMs: number | null;
  lifetimeSwimlaneTimes: SwimlaneTime[];

  // Sprint-scoped metrics (clamped to sprint window)
  sprintSwimlaneTimes: SwimlaneTime[];

  // Sprint carry-over
  sprintCount: number;
  sprintNames: string[];
  carryOverCount: number;

  devCycles: number;
  qaCycles: number;
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

  totalTickets: number;
  completedTickets: number;
  newTickets: number;
  carriedOverTickets: number;

  totalStoryPoints: number;
  totalDevPoints: number;
  totalQaPoints: number;

  avgLifetimeTurnaroundMs: number | null;
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
