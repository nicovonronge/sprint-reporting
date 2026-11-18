import { load } from '../cache/cache-manager.js';
import { calculateSprintMetrics, aggregateSprintMetrics } from './metrics-calculator.js';
import { excludeNonDevAssignees } from './ticket-filter.js';
import { STATUS_TO_SWIMLANE, EXCLUDED_SWIMLANE, getTeamName } from '../constants/workflow.js';
import type { SprintMetrics } from '../types/metrics.js';

export interface SprintSelection {
  projectKey: string;
  sprintName: string;
}

export interface ComparisonEntry {
  projectKey: string;
  teamName: string | null;
  sprintName: string;
  sprintStartDate: string;
  sprintEndDate: string;
  metrics: SprintMetrics;
  rawTicketCount: number;
  excludedTicketCount: number;
  currentlyEscalatedCount: number;
}

/**
 * Sprint Comparison Report only: builds one SprintMetrics per selected sprint, after dropping
 * non-dev assignees (excludeNonDevAssignees), sorted chronologically so trend charts read
 * left-to-right regardless of pick order. See CLAUDE.md for the full rule.
 */
export function buildComparisonReport(selections: SprintSelection[]): ComparisonEntry[] {
  const entries = selections.map(({ projectKey, sprintName }) => {
    const cached = load(projectKey, sprintName);
    if (!cached) {
      throw new Error(`No cached data for ${projectKey} / "${sprintName}". Fetch it first.`);
    }

    const fullMetrics = calculateSprintMetrics(cached);
    const filteredTickets = excludeNonDevAssignees(fullMetrics.ticketMetrics);
    const metrics = aggregateSprintMetrics(filteredTickets, cached);

    const currentlyEscalatedCount = cached.issues.filter(
      issue => STATUS_TO_SWIMLANE[issue.fields.status.name] === EXCLUDED_SWIMLANE,
    ).length;

    return {
      projectKey,
      teamName: getTeamName(projectKey),
      sprintName,
      sprintStartDate: cached.sprintStartDate,
      sprintEndDate: cached.sprintEndDate,
      metrics,
      rawTicketCount: fullMetrics.ticketMetrics.length,
      excludedTicketCount: fullMetrics.ticketMetrics.length - filteredTickets.length,
      currentlyEscalatedCount,
    };
  });

  return entries.sort(
    (a, b) => new Date(a.sprintStartDate).getTime() - new Date(b.sprintStartDate).getTime(),
  );
}
