import type { PeoplePeriod, PersonRole } from './people-report.js';

/** 'sprints' = previous/current are sets of whole sprints. 'dateRange' = previous/current are two date ranges. */
export type QuarterlyMode = 'sprints' | 'dateRange';

export interface QuarterlyPeriodSpec {
  /** Name shown in the report (for example "Q2"). Defaults to "Previous" / "Current". */
  label?: string;
  /** Sprint mode: the sprints of the period. Date-range mode: sprints to take tickets from (fetched sprints that overlap the dates are added automatically). */
  sprintNames?: string[];
  /** Date-range mode only: inclusive UTC calendar days. */
  period?: PeoplePeriod;
}

export interface QuarterlyRequest {
  projectKey: string;
  mode: QuarterlyMode;
  previous: QuarterlyPeriodSpec;
  current: QuarterlyPeriodSpec;
  /** People reported on as developers (assignee). */
  developers: string[];
  /** People reported on as QA testers (QA assignee). */
  qaTesters: string[];
}

export type MeasureUnit = 'count' | 'pct' | 'days' | 'ratio';
/** 'neutral' measures describe volume and are not scored. */
export type Better = 'higher' | 'lower' | 'neutral';
export type MeasureSection = 'Throughput' | 'Speed' | 'Quality';

export interface MeasureDef {
  id: string;
  section: MeasureSection;
  label: string;
  unit: MeasureUnit;
  better: Better;
}

/** Measure id to value. Times are business days (a business day is 9 hours). Null = not available. */
export type MeasureValues = Record<string, number | null>;

export interface PersonMeasures {
  person: string;
  tickets: number;
  values: MeasureValues;
}

export interface RoleSide {
  people: PersonMeasures[];
  /** Plain average of the people's figures (people with no value for a measure are left out of that average). */
  average: MeasureValues;
  /** Everyone in the same window: every ticket (dev) or every ticket with a QA assignee (QA). */
  board: MeasureValues;
  boardTickets: number;
}

export interface RoleSection {
  measures: MeasureDef[];
  previous: RoleSide;
  current: RoleSide;
}

export interface QuarterlyPeriodInfo {
  label: string;
  /** For example "Sprints 3.1 to 3.6 (1 July to 30 September 2026)" or "2026-07-01 to 2026-09-30". */
  description: string;
  period: PeoplePeriod | null;
  sprints: Array<{ sprintName: string; sprintStartDate: string; sprintEndDate: string }>;
  /** Calendar days covered (first start to last end, or the date range). */
  days: number;
}

export type CompareResult = 'Better' | 'Worse' | 'Same' | 'Volume' | 'No data';
export type CompareScope = 'board' | 'devAverage' | 'qaBoard';

export interface ComparisonRow {
  scope: CompareScope;
  measure: string;
  section: MeasureSection;
  label: string;
  unit: MeasureUnit;
  better: Better;
  previous: number | null;
  current: number | null;
  /** Rates (unit pct): difference as a fraction (0.05 = +5 points). Everything else: relative change as a fraction. Null if not defined. */
  change: number | null;
  changeKind: 'pts' | 'pct' | null;
  result: CompareResult;
}

export interface ScopeSummary {
  scope: CompareScope;
  measures: number;
  better: number;
  worse: number;
  same: number;
}

export type Verdict = 'Improved' | 'Mixed' | 'Not an overall improvement';

export interface PersonComparison {
  person: string;
  role: PersonRole;
  metric: string;
  label: string;
  unit: MeasureUnit;
  better: Better;
  previous: number | null;
  current: number | null;
}

export interface SameDeveloperTotals {
  period: 'previous' | 'current';
  developers: number;
  tickets: number;
  completed: number;
  completedStoryPoints: number;
  devCycles: number;
}

export interface QuarterlyComparison {
  rows: ComparisonRow[];
  summary: ScopeSummary[];
  verdict: Verdict;
  /** Whole-board scored measures that got better / worse (drives the verdict). */
  boardBetter: number;
  boardWorse: number;
  boardScored: number;
  /** People with a report in both periods, per key measure. */
  people: PersonComparison[];
  onlyInCurrent: string[];
  onlyInPrevious: string[];
  sameDevelopers: SameDeveloperTotals[];
}

/** Ticket-level facts for the current period that help explain a person's figures (also given to the AI notes). */
export interface PersonHints {
  role: PersonRole;
  person: string;
  /** "SQM-1 x2: title" - tickets carrying this person's cycles, most first. */
  cyclesByTicket: string[];
  /** Open tickets with story points, with their status at the end of the period. */
  openWithPoints: string[];
  mostLinkedDefects: string[];
  /** Longest time in the person's own lane (In Development / In QA), in business days. */
  longestOwnLane: string[];
  /** Longest combined wait in Ready for QA + PO Review, in business days. */
  longestWaits: string[];
}

export interface QuarterlyReport {
  projectKey: string;
  teamName: string | null;
  generatedAt: string;
  mode: QuarterlyMode;
  previous: QuarterlyPeriodInfo;
  current: QuarterlyPeriodInfo;
  /** Null when no developers were chosen. */
  dev: RoleSection | null;
  /** Null when no QA testers were chosen. */
  qa: RoleSection | null;
  comparison: QuarterlyComparison;
  hints: PersonHints[];
  /** Things to keep in mind when reading the report (small samples, different period lengths, ...). */
  checks: string[];
}

/** AI-written notes. Every figure in the text was filled from the report data, never typed by the model. */
export interface QuarterlyNotes {
  /** Plain-language verdict sentence (starts with the verdict label). */
  verdict: string;
  teamChange: string;
  /** Short note per person, keyed "dev:Name" or "qa:Name". */
  people: Record<string, string>;
  /** Problems found while checking the AI text (typed numbers, unknown people). Empty when clean. */
  warnings: string[];
  generatedAt: string;
  model: string;
}

export interface QuarterlyOptions {
  /** Requested sprints (plus overlapping fetched ones in date-range mode) with no fetched data yet, per period. */
  missing: { previous: string[]; current: string[] };
  /** Everyone with tickets in either period, with ticket counts in each. */
  dev: Array<{ name: string; previousTickets: number; currentTickets: number }>;
  qa: Array<{ name: string; previousTickets: number; currentTickets: number }>;
}
