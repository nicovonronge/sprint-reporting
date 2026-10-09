import { spawn, spawnSync } from 'node:child_process';
import { getConfig, hasClaudeToken } from '../config.js';
import { load } from '../cache/cache-manager.js';
import { calculateSprintMetrics, aggregateSprintMetrics } from './metrics-calculator.js';
import { parseFilterOptions, applyFilters } from './ticket-filter.js';
import { formatDuration } from '../utils/date-utils.js';
import type { SprintMetrics, TicketMetrics } from '../types/metrics.js';
import * as log from '../utils/logger.js';

const CLAUDE_CLI_INSTRUCTION =
  'The sprint report data and the analysis instructions are provided via standard input. Read them and respond accordingly.';

function ensureClaudeCliAvailable(): void {
  const result = spawnSync('claude', ['--version'], { shell: true, stdio: 'ignore' });
  if (result.error || result.status !== 0) {
    throw new Error(
      "The 'claude' CLI was not found on PATH. Install Claude Code and run `claude setup-token` " +
      'to generate a CLAUDE_CODE_OAUTH_TOKEN, then set it in .env.'
    );
  }
}

/**
 * Runs a one-shot, non-interactive Claude Code invocation over the given prompt and
 * returns the assistant's text response. Auth comes from CLAUDE_CODE_OAUTH_TOKEN
 * (via `claude setup-token`) rather than a Console API key, so this reuses a Claude
 * subscription instead of separate API billing.
 */
export function runClaudeCli(prompt: string, model: string): Promise<string> {
  const config = getConfig();
  if (!hasClaudeToken(config)) {
    return Promise.reject(new Error(
      'AI analysis is not configured. Run `claude setup-token` to generate a CLAUDE_CODE_OAUTH_TOKEN, then set it in .env.'
    ));
  }
  ensureClaudeCliAvailable();

  // --bare would skip CLAUDE_CODE_OAUTH_TOKEN entirely, so it's intentionally omitted.
  // A stray exported ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN outranks the OAuth token in
  // the CLI's credential precedence, so strip those to guarantee the OAuth token wins.
  const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: config.CLAUDE_CODE_OAUTH_TOKEN! };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;

  return new Promise((resolve, reject) => {
    const child = spawn(
      'claude',
      [
        '-p', CLAUDE_CLI_INSTRUCTION,
        '--output-format', 'json',
        '--model', model,
        '--allowedTools', '',
        '--permission-mode', 'dontAsk',
      ],
      { shell: true, env, stdio: ['pipe', 'pipe', 'pipe'] }
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', reject);
    child.on('close', (code) => {
      let parsed: { is_error?: boolean; result?: string } | undefined;
      try {
        parsed = JSON.parse(stdout.trim());
      } catch {
        reject(new Error(
          `claude CLI exited with code ${code} and produced no parseable JSON output. ` +
          `stderr: ${stderr.trim() || '(none)'} | stdout: ${stdout.trim() || '(none)'}`
        ));
        return;
      }

      if (code !== 0 || parsed?.is_error) {
        reject(new Error(parsed?.result ?? `claude CLI exited with code ${code} and reported an error with no message.`));
        return;
      }

      resolve(parsed?.result ?? '');
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

interface AnalyzeOptions {
  project: string;
  sprint: string[];
  model?: string;
  dev?: string;
  qa?: string;
  ticket?: string;
  type?: string;
}

export async function runAnalyze(options: AnalyzeOptions): Promise<void> {
  if (!hasClaudeToken(getConfig())) {
    log.error(
      'AI analysis is not configured. Run `claude setup-token` to generate a CLAUDE_CODE_OAUTH_TOKEN, then set it in .env.'
    );
    process.exit(1);
  }

  const projectKey = options.project.toUpperCase();
  const filters = parseFilterOptions(options);
  const model = options.model ?? 'claude-sonnet-5';

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

    log.heading(`Claude Analysis: ${sprintName}`);
    log.info(`Analyzing ${metrics.totalTickets} tickets with ${model}...`);

    const prompt = buildAnalysisPrompt(metrics);

    const text = await runClaudeCli(prompt, model);

    console.log('\n' + text);
  }
}

export function buildAnalysisPrompt(m: SprintMetrics): string {
  const ticketSummaries = m.ticketMetrics.map(t => summarizeTicket(t)).join('\n');

  return `You are analyzing sprint development metrics for a software team. Provide actionable insights, not generic advice.

Note on the figures below: Escalated-lane tickets/time are already excluded (currently-escalated tickets don't appear at all, and time spent escalated is subtracted from turnaround/swimlane totals for tickets that moved on), Todo time for tickets that never left the backlog is measured from when their sprint actually started rather than ticket creation, and all durations exclude weekends. All figures are scoped to the sprint window: status, assignee, components and points are as of the sprint end date, and cycle counts, swimlane times and turnaround only cover activity between sprint start and end (a ticket that cycled heavily in an earlier sprint is not penalised here). Don't flag the absence of an ESCALATED row or a short Todo time as an anomaly — that's expected.

## Sprint: ${m.sprintName} (${m.projectKey})
- Period: ${m.sprintStartDate ? new Date(m.sprintStartDate).toLocaleDateString() : '?'} to ${m.sprintEndDate ? new Date(m.sprintEndDate).toLocaleDateString() : '?'}
- Total tickets: ${m.totalTickets} (${m.completedTickets} completed, ${m.carriedOverTickets} carried over)
- Story points: ${m.totalStoryPoints} total (Dev: ${m.totalDevPoints}, QA: ${m.totalQaPoints})
- Avg turnaround (within sprint): ${m.avgTurnaroundMs ? formatDuration(m.avgTurnaroundMs) : 'N/A'}
- Avg dev rework cycles: ${m.avgDevCycles.toFixed(1)}
- Avg QA rework cycles: ${m.avgQaCycles.toFixed(1)}
- Total linked defects: ${m.totalDefects}

## Avg Time per Swimlane (Sprint-Scoped)
${Object.entries(m.avgSprintSwimlaneTimesMs).map(([s, ms]) => `- ${s}: ${formatDuration(ms)}`).join('\n')}

## Avg Time per Swimlane (Lifetime)
${Object.entries(m.avgLifetimeSwimlaneTimesMs).map(([s, ms]) => `- ${s}: ${formatDuration(ms)}`).join('\n')}

## Per-Ticket Data
${ticketSummaries}

## Developer Breakdown
${Object.entries(m.byDeveloper).map(([dev, tickets]) => {
  const completed = tickets.filter(t => t.sprintReport.status === 'Done').length;
  const sp = tickets.reduce((s, t) => s + (t.sprintReport.storyPoints ?? 0), 0);
  return `- ${dev}: ${tickets.length} tickets (${completed} done), ${sp} SP, avg dev cycles: ${(tickets.reduce((s, t) => s + t.sprintReport.devCycles, 0) / tickets.length).toFixed(1)}`;
}).join('\n')}

## QA Breakdown
${Object.entries(m.byQaAssignee).map(([qa, tickets]) => {
  const qaSp = tickets.reduce((s, t) => s + (t.sprintReport.qaPoints ?? 0), 0);
  return `- ${qa}: ${tickets.length} tickets, ${qaSp} QA SP, avg QA cycles: ${(tickets.reduce((s, t) => s + t.sprintReport.qaCycles, 0) / tickets.length).toFixed(1)}`;
}).join('\n')}

Please provide:
1. **Executive Summary** (2-3 paragraphs): Overall sprint health, key achievements, and concerns.
2. **Anomaly Detection**: Tickets with unusual turnaround times, excessive cycles, or outlier patterns. Explain why each is notable.
3. **Bottleneck Analysis**: Which swimlanes are taking the most time? Where is time being lost?
4. **Team Insights**: Developer and QA workload balance, cycle patterns by person.
5. **Recommendations**: Specific, actionable process improvements based on the data patterns. Be specific about which tickets or people the recommendations apply to.`;
}

function summarizeTicket(t: TicketMetrics): string {
  const sprintTimes = t.sprintReport.swimlaneTimes
    .map(st => `${st.swimlane}: ${formatDuration(st.totalMs)}`)
    .join(', ');

  const prInfo = t.github && t.github.prs.length > 0
    ? `PRs: ${t.github.prs.length}, PR time: ${t.github.totalPRTimeMs ? formatDuration(t.github.totalPRTimeMs) : 'N/A'}`
    : 'No PRs';

  return `- ${t.key} [${t.issueType}] "${t.summary}" | Assignee: ${t.sprintReport.assignee ?? 'None'} | QA: ${t.sprintReport.qaAssignees.join(', ') || 'None'} | Status: ${t.sprintReport.status} | SP: ${t.sprintReport.storyPoints ?? '-'} (Dev: ${t.sprintReport.devPoints ?? '-'}, QA: ${t.sprintReport.qaPoints ?? '-'}) | Turnaround: ${t.sprintReport.turnaroundMs ? formatDuration(t.sprintReport.turnaroundMs) : 'N/A'} | Dev cycles: ${t.sprintReport.devCycles} | QA cycles: ${t.sprintReport.qaCycles} | Defects: ${t.linkedDefects} | Sprints: ${t.sprintCount} | Sprint times: [${sprintTimes}] | ${prInfo}`;
}
