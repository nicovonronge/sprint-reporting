import { load } from '../cache/cache-manager.js';
import { getDataGuide, type DataGuide } from '../constants/data-guide.js';
import { calculateSprintMetrics, aggregateSprintMetrics } from './metrics-calculator.js';
import { applyFilters } from './ticket-filter.js';
import { buildComparisonReport, type ComparisonEntry } from './comparison-report.js';
import { SWIMLANE_ORDER, EXCLUDED_SWIMLANE } from '../constants/workflow.js';
import type { FilterOptions, SprintMetrics, TicketMetrics } from '../types/metrics.js';

/**
 * JSON exports of the sprint and comparison reports. Each export is self-describing: `info`
 * explains what the data is and which rules produced it, and `generation` records exactly what
 * was exported (sprints, filters, when the source data was fetched).
 */

export interface ExportGeneration {
  generatedAt: string;
  projectKey: string;
  filters: FilterOptions | null;
  sprints: Array<{
    sprintName: string;
    sprintStartDate: string;
    sprintEndDate: string;
    /** When this sprint's data was last downloaded from Jira. */
    dataFetchedAt: string;
  }>;
  steps: string[];
}

export interface ReportExport<T> {
  info: DataGuide;
  generation: ExportGeneration;
  data: T;
}

export type ExportedSprintMetrics = Omit<SprintMetrics, 'byDeveloper' | 'byQaAssignee'> & {
  byDeveloper: Record<string, string[]>;
  byQaAssignee: Record<string, string[]>;
};

// The by-person groupings repeat full tickets; in the export they list ticket keys instead so
// each ticket appears once (in ticketMetrics) and the file stays readable.
function keysOnly(groups: Record<string, TicketMetrics[]>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(groups).map(([name, tickets]) => [name, tickets.map(t => t.key)]));
}

function toExported(metrics: SprintMetrics): ExportedSprintMetrics {
  return { ...metrics, byDeveloper: keysOnly(metrics.byDeveloper), byQaAssignee: keysOnly(metrics.byQaAssignee) };
}

const COMMON_STEPS = [
  'Ticket data and full change history were downloaded from Jira for each sprint (and pull requests from GitHub when configured).',
  'Currently-escalated tickets, and Todo-only tickets whose sprints never started, were dropped.',
  'Status, assignee, points, components and similar fields were rebuilt from the change history as of the end of each sprint.',
  'Cycles, time in lane and turnaround were counted only inside each sprint window, in business time (weekends excluded).',
];

function sprintInfo(projectKey: string, sprintNames: string[]): ExportGeneration['sprints'] {
  return sprintNames.map(name => {
    const cached = load(projectKey, name);
    if (!cached) throw new Error(`No cached data for ${projectKey} / "${name}". Fetch it first.`);
    return {
      sprintName: cached.sprintName,
      sprintStartDate: cached.sprintStartDate,
      sprintEndDate: cached.sprintEndDate,
      dataFetchedAt: cached.fetchedAt,
    };
  });
}

function filterSteps(filters: FilterOptions | null): string[] {
  if (!filters) return [];
  const parts = [
    filters.developer && `developer contains "${filters.developer}"`,
    filters.qa && `QA assignee contains "${filters.qa}"`,
    filters.tickets && `ticket keys: ${filters.tickets.join(', ')}`,
    filters.issueTypes && `issue types: ${filters.issueTypes.join(', ')}`,
  ].filter(Boolean);
  return parts.length > 0 ? [`These filters were applied before totals and averages were calculated: ${parts.join('; ')}.`] : [];
}

export function buildSprintReportExport(
  projectKey: string,
  sprintNames: string[],
  filters: FilterOptions,
): ReportExport<{ sprints: ExportedSprintMetrics[] }> {
  const sprints = sprintInfo(projectKey, sprintNames);
  const hasFilters = Object.values(filters).some(v => v !== undefined);

  const data = sprintNames.map(name => {
    const cached = load(projectKey, name)!;
    const full = calculateSprintMetrics(cached);
    const filtered = applyFilters(full.ticketMetrics, filters);
    return toExported(filtered.length !== full.ticketMetrics.length ? aggregateSprintMetrics(filtered, cached) : full);
  });

  return {
    info: getDataGuide('sprint'),
    generation: {
      generatedAt: new Date().toISOString(),
      projectKey,
      filters: hasFilters ? filters : null,
      sprints,
      steps: [...COMMON_STEPS, ...filterSteps(hasFilters ? filters : null),
        'Totals and averages were then calculated over the tickets that remained.'],
    },
    data: { sprints: data },
  };
}

export function buildComparisonExport(
  projectKey: string,
  sprintNames: string[],
): ReportExport<{ swimlaneOrder: string[]; entries: Array<Omit<ComparisonEntry, 'metrics'> & { metrics: ExportedSprintMetrics }> }> {
  const sprints = sprintInfo(projectKey, sprintNames);
  const entries = buildComparisonReport(sprintNames.map(sprintName => ({ projectKey, sprintName })))
    .map(e => ({ ...e, metrics: toExported(e.metrics) }));

  return {
    info: getDataGuide('comparison'),
    generation: {
      generatedAt: new Date().toISOString(),
      projectKey,
      filters: null,
      sprints,
      steps: [
        ...COMMON_STEPS,
        'Tickets with no assignee, or whose assignee is on the fixed non-dev list (leads, PMs, QA leads), were removed from each sprint (see excludedTicketCount).',
        'Totals and averages were then calculated per sprint over the tickets that remained, and the sprints were sorted oldest first.',
      ],
    },
    data: { swimlaneOrder: SWIMLANE_ORDER.filter(s => s !== EXCLUDED_SWIMLANE), entries },
  };
}
