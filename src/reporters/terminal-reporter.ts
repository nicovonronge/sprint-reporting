import Table from 'cli-table3';
import chalk from 'chalk';
import type { SprintMetrics, TicketMetrics } from '../types/metrics.js';
import { formatDuration, formatDurationShort } from '../utils/date-utils.js';
import { SWIMLANE_ORDER } from '../constants/workflow.js';
import * as log from '../utils/logger.js';

export function renderTerminalReport(metrics: SprintMetrics): void {
  renderSprintSummary(metrics);
  renderTicketTable(metrics.ticketMetrics);
  renderSwimlaneBreakdown(metrics);
  renderDeveloperSummary(metrics);
  renderQaSummary(metrics);
  renderGitHubSummary(metrics);
}

function renderSprintSummary(m: SprintMetrics): void {
  log.heading(`Sprint: ${m.sprintName} (${m.projectKey})`);

  const table = new Table({ style: { head: ['cyan'] } });

  table.push(
    { 'Total Tickets': m.totalTickets },
    { 'Completed': `${m.completedTickets} / ${m.totalTickets}` },
    { 'New in Sprint': m.newTickets },
    { 'Carried Over': m.carriedOverTickets },
    { 'Story Points': `${m.totalStoryPoints} (Dev: ${m.totalDevPoints}, QA: ${m.totalQaPoints})` },
    { 'Avg Turnaround (Lifetime)': m.avgLifetimeTurnaroundMs ? formatDuration(m.avgLifetimeTurnaroundMs) : 'N/A' },
    { 'Avg Dev Cycles': m.avgDevCycles.toFixed(1) },
    { 'Avg QA Cycles': m.avgQaCycles.toFixed(1) },
    { 'Total Defects': m.totalDefects },
  );

  console.log(table.toString());
}

function renderTicketTable(tickets: TicketMetrics[]): void {
  log.heading('Ticket Details');

  const table = new Table({
    head: [
      chalk.cyan('Key'),
      chalk.cyan('Type'),
      chalk.cyan('Summary'),
      chalk.cyan('Assignee'),
      chalk.cyan('Status'),
      chalk.cyan('Turnaround'),
      chalk.cyan('Sprint Time'),
      chalk.cyan('Dev Cy'),
      chalk.cyan('QA Cy'),
      chalk.cyan('Defects'),
      chalk.cyan('SP'),
      chalk.cyan('Sprints'),
    ],
    colWidths: [12, 8, 30, 14, 16, 12, 12, 8, 8, 8, 6, 8],
    wordWrap: true,
  });

  for (const t of tickets) {
    const totalSprintTime = t.sprintSwimlaneTimes.reduce((s, st) => s + st.totalMs, 0);

    table.push([
      t.key,
      t.issueType.substring(0, 6),
      t.summary.substring(0, 28),
      (t.assignee ?? '-').substring(0, 12),
      statusColor(t.currentStatus),
      t.lifetimeTurnaroundMs ? formatDurationShort(t.lifetimeTurnaroundMs) : '-',
      totalSprintTime > 0 ? formatDurationShort(totalSprintTime) : '-',
      cycleColor(t.devCycles),
      cycleColor(t.qaCycles),
      t.linkedDefects > 0 ? chalk.red(t.linkedDefects.toString()) : chalk.dim('0'),
      t.storyPoints?.toString() ?? '-',
      t.sprintCount > 1 ? chalk.yellow(t.sprintCount.toString()) : chalk.dim('1'),
    ]);
  }

  console.log(table.toString());
}

function renderSwimlaneBreakdown(metrics: SprintMetrics): void {
  log.heading('Avg Time per Swimlane (Sprint-Scoped)');

  const table = new Table({
    head: [chalk.cyan('Swimlane'), chalk.cyan('Avg Time (Sprint)'), chalk.cyan('Avg Time (Lifetime)')],
  });

  for (const swimlane of SWIMLANE_ORDER) {
    const sprintMs = metrics.avgSprintSwimlaneTimesMs[swimlane];
    const lifetimeMs = metrics.avgLifetimeSwimlaneTimesMs[swimlane];
    if (!sprintMs && !lifetimeMs) continue;

    table.push([
      swimlane,
      sprintMs ? formatDuration(sprintMs) : '-',
      lifetimeMs ? formatDuration(lifetimeMs) : '-',
    ]);
  }

  console.log(table.toString());
}

function renderDeveloperSummary(metrics: SprintMetrics): void {
  log.heading('Developer Summary');

  const table = new Table({
    head: [
      chalk.cyan('Developer'),
      chalk.cyan('Tickets'),
      chalk.cyan('Completed'),
      chalk.cyan('SP'),
      chalk.cyan('Dev SP'),
      chalk.cyan('Avg Turnaround'),
      chalk.cyan('Avg Dev Cycles'),
    ],
  });

  for (const [dev, tickets] of Object.entries(metrics.byDeveloper)) {
    const completed = tickets.filter(t => t.currentStatus === 'Done').length;
    const sp = tickets.reduce((s, t) => s + (t.storyPoints ?? 0), 0);
    const devSp = tickets.reduce((s, t) => s + (t.devPoints ?? 0), 0);
    const turnarounds = tickets
      .map(t => t.lifetimeTurnaroundMs)
      .filter((v): v is number => v !== null);
    const avgTurnaround = turnarounds.length > 0
      ? turnarounds.reduce((s, v) => s + v, 0) / turnarounds.length
      : null;
    const avgDevCycles = tickets.reduce((s, t) => s + t.devCycles, 0) / tickets.length;

    table.push([
      dev,
      tickets.length,
      completed,
      sp,
      devSp,
      avgTurnaround ? formatDuration(avgTurnaround) : '-',
      avgDevCycles.toFixed(1),
    ]);
  }

  console.log(table.toString());
}

function renderQaSummary(metrics: SprintMetrics): void {
  log.heading('QA Summary');

  const table = new Table({
    head: [
      chalk.cyan('QA Assignee'),
      chalk.cyan('Tickets'),
      chalk.cyan('QA SP'),
      chalk.cyan('Avg QA Cycles'),
      chalk.cyan('Avg Time in QA'),
    ],
  });

  for (const [qa, tickets] of Object.entries(metrics.byQaAssignee)) {
    const qaSp = tickets.reduce((s, t) => s + (t.qaPoints ?? 0), 0);
    const avgQaCycles = tickets.reduce((s, t) => s + t.qaCycles, 0) / tickets.length;
    const qaTimes = tickets
      .flatMap(t => t.lifetimeSwimlaneTimes)
      .filter(st => st.swimlane === 'IN QA')
      .map(st => st.totalMs);
    const avgQaTime = qaTimes.length > 0
      ? qaTimes.reduce((s, v) => s + v, 0) / qaTimes.length
      : null;

    table.push([
      qa,
      tickets.length,
      qaSp,
      avgQaCycles.toFixed(1),
      avgQaTime ? formatDuration(avgQaTime) : '-',
    ]);
  }

  console.log(table.toString());
}

function renderGitHubSummary(metrics: SprintMetrics): void {
  const withPRs = metrics.ticketMetrics.filter(t => t.github && t.github.prs.length > 0);
  const withoutPRs = metrics.ticketMetrics.length - withPRs.length;

  log.heading('GitHub Summary');

  const table = new Table({ style: { head: ['cyan'] } });

  table.push(
    { 'Tickets with PRs': withPRs.length },
    { 'Tickets without PRs': withoutPRs },
  );

  const prTimes = withPRs
    .map(t => t.github!.totalPRTimeMs)
    .filter((v): v is number => v !== null);

  if (prTimes.length > 0) {
    const avg = prTimes.reduce((s, v) => s + v, 0) / prTimes.length;
    table.push({ 'Avg PR Time (create → merge)': formatDuration(avg) });
  }

  console.log(table.toString());

  if (withPRs.length > 0) {
    const prTable = new Table({
      head: [chalk.cyan('Ticket'), chalk.cyan('PRs'), chalk.cyan('PR Time'), chalk.cyan('Branch')],
      colWidths: [12, 6, 14, 40],
      wordWrap: true,
    });

    for (const t of withPRs) {
      const gh = t.github!;
      prTable.push([
        t.key,
        gh.prs.length,
        gh.totalPRTimeMs ? formatDuration(gh.totalPRTimeMs) : '-',
        gh.prs.map(p => p.headBranch).join(', '),
      ]);
    }

    console.log(prTable.toString());
  }
}

function statusColor(status: string): string {
  if (status === 'Done') return chalk.green(status);
  if (status === 'In development') return chalk.blue(status);
  if (status === 'In QA') return chalk.magenta(status);
  if (status === 'QA Failed' || status === 'PO Review Failed') return chalk.red(status);
  return chalk.yellow(status);
}

function cycleColor(count: number): string {
  if (count === 0) return chalk.dim('0');
  if (count === 1) return chalk.yellow(count.toString());
  return chalk.red(count.toString());
}
