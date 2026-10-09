import type { TicketMetrics, FilterOptions } from '../types/metrics.js';
import { COMPARISON_EXCLUDED_ASSIGNEES } from '../constants/workflow.js';

const COMPARISON_EXCLUDED_ASSIGNEES_LOWER = new Set(
  COMPARISON_EXCLUDED_ASSIGNEES.map(name => name.toLowerCase()),
);

export function parseFilterOptions(options: {
  dev?: string;
  qa?: string;
  ticket?: string;
  type?: string;
}): FilterOptions {
  return {
    developer: options.dev,
    qa: options.qa,
    tickets: options.ticket ? options.ticket.split(',').map(k => k.trim()) : undefined,
    issueTypes: options.type ? options.type.split(',').map(t => t.trim()) : undefined,
  };
}

export function applyFilters(tickets: TicketMetrics[], filters: FilterOptions): TicketMetrics[] {
  let result = tickets;

  if (filters.developer) {
    const term = filters.developer.toLowerCase();
    result = result.filter(t =>
      t.sprintReport.assignee?.toLowerCase().includes(term),
    );
  }

  if (filters.qa) {
    const term = filters.qa.toLowerCase();
    result = result.filter(t =>
      t.sprintReport.qaAssignees.some(qa => qa.toLowerCase().includes(term)),
    );
  }

  if (filters.tickets) {
    const keys = new Set(filters.tickets.map(k => k.toUpperCase()));
    result = result.filter(t => keys.has(t.key));
  }

  if (filters.issueTypes) {
    const types = new Set(filters.issueTypes.map(t => t.toLowerCase()));
    result = result.filter(t => types.has(t.issueType.toLowerCase()));
  }

  return result;
}

/**
 * Sprint Comparison Report only: drops unassigned tickets and tickets assigned to non-dev
 * people (leads/PMs/QA leads). Matches the primary assignee only, never the QA assignee.
 * See CLAUDE.md for the full rule.
 */
export function excludeNonDevAssignees(tickets: TicketMetrics[]): TicketMetrics[] {
  return tickets.filter(t =>
    t.sprintReport.assignee != null && !COMPARISON_EXCLUDED_ASSIGNEES_LOWER.has(t.sprintReport.assignee.toLowerCase()),
  );
}
