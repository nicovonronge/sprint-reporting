import { load } from '../cache/cache-manager.js';
import { calculateSprintMetrics, aggregateSprintMetrics } from '../services/metrics-calculator.js';
import { parseFilterOptions, applyFilters } from '../services/ticket-filter.js';
import { renderTerminalReport } from './terminal-reporter.js';
import * as log from '../utils/logger.js';

interface ReportOptions {
  project: string;
  sprint: string[];
  html?: boolean;
  open?: boolean;
  output?: string;
  dev?: string;
  qa?: string;
  ticket?: string;
  type?: string;
}

export async function runReport(options: ReportOptions): Promise<void> {
  const projectKey = options.project.toUpperCase();
  const filters = parseFilterOptions(options);

  for (const sprintName of options.sprint) {
    const cached = load(projectKey, sprintName);
    if (!cached) {
      log.error(`No cached data for ${projectKey} / "${sprintName}". Run 'sprint-report fetch' first.`);
      continue;
    }

    const fullMetrics = calculateSprintMetrics(cached);
    const filteredTickets = applyFilters(fullMetrics.ticketMetrics, filters);

    const metrics = filteredTickets.length !== fullMetrics.ticketMetrics.length
      ? aggregateSprintMetrics(filteredTickets, cached)
      : fullMetrics;

    if (filteredTickets.length === 0) {
      log.warn(`No tickets match the specified filters for "${sprintName}".`);
      continue;
    }

    if (filteredTickets.length !== fullMetrics.ticketMetrics.length) {
      log.info(`Showing ${filteredTickets.length} of ${fullMetrics.ticketMetrics.length} tickets (filtered)`);
    }

    renderTerminalReport(metrics);

    if (options.html) {
      const { renderHtmlReport } = await import('./html-reporter.js');
      const outputPath = await renderHtmlReport(metrics, options.output);
      log.success(`HTML report saved to ${outputPath}`);

      if (options.open) {
        const { default: openBrowser } = await import('open');
        await openBrowser(outputPath);
      }
    }
  }
}
