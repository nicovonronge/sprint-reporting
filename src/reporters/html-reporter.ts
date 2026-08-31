import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { SprintMetrics } from '../types/metrics.js';
import { formatDuration } from '../utils/date-utils.js';
import { SWIMLANE_ORDER } from '../constants/workflow.js';

const OUTPUT_DIR = join(process.cwd(), 'output');

export async function renderHtmlReport(metrics: SprintMetrics, outputPath?: string): Promise<string> {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  const fileName = outputPath ?? join(OUTPUT_DIR, `${metrics.projectKey}_${slugify(metrics.sprintName)}.html`);
  const html = generateHtml(metrics);
  writeFileSync(fileName, html, 'utf-8');
  return fileName;
}

function slugify(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
}

function generateHtml(m: SprintMetrics): string {
  const swimlaneColors = [
    '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#6b7280',
  ];

  const swimlaneLabels = SWIMLANE_ORDER.filter(s =>
    m.avgSprintSwimlaneTimesMs[s] || m.avgLifetimeSwimlaneTimesMs[s],
  );

  const ticketDataJson = JSON.stringify(m.ticketMetrics).replace(/</g, '\\u003c');
  const swimlaneLabelsJson = JSON.stringify(swimlaneLabels);
  const swimlaneRows = swimlaneLabels.map(s => {
    const sprintMs = m.avgSprintSwimlaneTimesMs[s] ?? 0;
    const lifetimeMs = m.avgLifetimeSwimlaneTimesMs[s] ?? 0;
    return `<tr><td>${s}</td><td>${formatDuration(sprintMs)}</td><td>${formatDuration(lifetimeMs)}</td></tr>`;
  }).join('');

  const ticketColumnDefs: { key: string; label: string; type: 'text' | 'number' }[] = [
    { key: 'key', label: 'Key', type: 'text' },
    { key: 'type', label: 'Type', type: 'text' },
    { key: 'summary', label: 'Summary', type: 'text' },
    { key: 'assignee', label: 'Assignee', type: 'text' },
    { key: 'qa', label: 'QA', type: 'text' },
    { key: 'status', label: 'Status', type: 'text' },
    { key: 'turnaround', label: 'Turnaround', type: 'number' },
    { key: 'devCycles', label: 'Dev Cy', type: 'number' },
    { key: 'qaCycles', label: 'QA Cy', type: 'number' },
    { key: 'defects', label: 'Defects', type: 'number' },
    { key: 'sp', label: 'SP', type: 'number' },
    { key: 'sprints', label: 'Sprints', type: 'number' },
    ...swimlaneLabels.map(s => ({ key: `sw_${s}`, label: s, type: 'number' as const })),
  ];

  const ticketHeaderRow = ticketColumnDefs.map(c =>
    `<th class="th-sort" onclick="sortTicketTable('${c.key}')">${c.label}<span class="sort-arrow" id="arrow-${c.key}"></span></th>`,
  ).join('');

  const ticketFilterRow = ticketColumnDefs.map(c =>
    `<th><input class="filter-input" placeholder="${c.type === 'number' ? '>5 <10 =3' : 'filter...'}" oninput="filterTicketTable('${c.key}', this.value)" /></th>`,
  ).join('');

  // Per-ticket swimlane data for stacked bar chart
  const ticketLabels = m.ticketMetrics.map(t => t.key);
  const datasets = swimlaneLabels.map((swimlane, i) => {
    const data = m.ticketMetrics.map(t => {
      const st = t.sprintSwimlaneTimes.find(s => s.swimlane === swimlane);
      return st ? +(st.totalMs / 3_600_000).toFixed(2) : 0;
    });
    return `{ label: '${swimlane}', data: [${data.join(',')}], backgroundColor: '${swimlaneColors[i % swimlaneColors.length]}' }`;
  });

  // Cycle data
  const devCycleData = m.ticketMetrics.map(t => t.devCycles);
  const qaCycleData = m.ticketMetrics.map(t => t.qaCycles);

  // SP vs turnaround scatter
  const scatterData = m.ticketMetrics
    .filter(t => t.storyPoints && t.lifetimeTurnaroundMs)
    .map(t => `{ x: ${t.storyPoints}, y: ${(t.lifetimeTurnaroundMs! / 86_400_000).toFixed(2)} }`);

  // Developer throughput
  const devLabels = Object.keys(m.byDeveloper);
  const devTicketCounts = devLabels.map(d => m.byDeveloper[d].length);
  const devSPCounts = devLabels.map(d =>
    m.byDeveloper[d].reduce((s, t) => s + (t.storyPoints ?? 0), 0),
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sprint Report: ${m.sprintName} (${m.projectKey})</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; padding: 2rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.2rem; margin: 2rem 0 1rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin: 1rem 0; }
    .card { background: #fff; border-radius: 8px; padding: 1.2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .card .label { font-size: 0.75rem; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }
    .card .value { font-size: 1.5rem; font-weight: 700; margin-top: 0.25rem; }
    .chart-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin: 1rem 0; }
    .chart-container { background: #fff; border-radius: 8px; padding: 1.2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th { background: #1e293b; color: #fff; text-align: left; padding: 0.6rem 0.8rem; font-size: 0.8rem; text-transform: uppercase; }
    th.th-sort { cursor: pointer; user-select: none; white-space: nowrap; }
    th.th-sort:hover { background: #334155; }
    .sort-arrow { margin-left: 0.25rem; color: #60a5fa; }
    tr.filter-row-inline th { background: #f1f5f9; padding: 0.3rem 0.4rem; }
    .filter-input {
      width: 100%; background: #fff; border: 1px solid #cbd5e1; border-radius: 4px;
      padding: 0.25rem 0.4rem; color: #1e293b; font-size: 0.75rem; text-transform: none; font-weight: normal;
    }
    .filter-input::placeholder { color: #94a3b8; }
    .filter-input:focus { outline: none; border-color: #2563eb; }
    td { padding: 0.5rem 0.8rem; border-bottom: 1px solid #e2e8f0; font-size: 0.85rem; }
    tr:hover td { background: #f1f5f9; }
    .status-done { color: #16a34a; font-weight: 600; }
    .status-active { color: #2563eb; font-weight: 600; }
    .status-failed { color: #dc2626; font-weight: 600; }
    .cycle-warn { color: #d97706; font-weight: 600; }
    .cycle-bad { color: #dc2626; font-weight: 600; }
    .meta { color: #64748b; font-size: 0.8rem; margin-top: 0.5rem; }
    @media (max-width: 768px) { .chart-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <h1>Sprint Report: ${m.sprintName}</h1>
  <p class="meta">Project: ${m.projectKey} | ${m.sprintStartDate ? new Date(m.sprintStartDate).toLocaleDateString() : '?'} — ${m.sprintEndDate ? new Date(m.sprintEndDate).toLocaleDateString() : '?'} | Generated: ${new Date().toLocaleDateString()}</p>

  <div class="summary-grid">
    <div class="card"><div class="label">Total Tickets</div><div class="value">${m.totalTickets}</div></div>
    <div class="card"><div class="label">Completed</div><div class="value">${m.completedTickets}/${m.totalTickets}</div></div>
    <div class="card"><div class="label">Carried Over</div><div class="value">${m.carriedOverTickets}</div></div>
    <div class="card"><div class="label">Story Points</div><div class="value">${m.totalStoryPoints}</div></div>
    <div class="card"><div class="label">Avg Turnaround</div><div class="value">${m.avgLifetimeTurnaroundMs ? formatDuration(m.avgLifetimeTurnaroundMs) : 'N/A'}</div></div>
    <div class="card"><div class="label">Avg Dev Cycles</div><div class="value">${m.avgDevCycles.toFixed(1)}</div></div>
    <div class="card"><div class="label">Avg QA Cycles</div><div class="value">${m.avgQaCycles.toFixed(1)}</div></div>
    <div class="card"><div class="label">Total Defects</div><div class="value">${m.totalDefects}</div></div>
  </div>

  <div class="chart-grid">
    <div class="chart-container"><canvas id="swimlaneChart"></canvas></div>
    <div class="chart-container"><canvas id="cycleChart"></canvas></div>
    <div class="chart-container"><canvas id="scatterChart"></canvas></div>
    <div class="chart-container"><canvas id="devChart"></canvas></div>
  </div>

  <h2>Swimlane Breakdown</h2>
  <table>
    <thead><tr><th>Swimlane</th><th>Avg Sprint Time</th><th>Avg Lifetime</th></tr></thead>
    <tbody>${swimlaneRows}</tbody>
  </table>

  <h2>Ticket Details</h2>
  <table id="ticket-table">
    <thead>
      <tr>${ticketHeaderRow}</tr>
      <tr class="filter-row-inline">${ticketFilterRow}</tr>
    </thead>
    <tbody id="ticket-table-body"></tbody>
  </table>

  <script>
    const ticketLabels = ${JSON.stringify(ticketLabels)};

    new Chart(document.getElementById('swimlaneChart'), {
      type: 'bar',
      data: { labels: ticketLabels, datasets: [${datasets.join(',')}] },
      options: {
        responsive: true,
        plugins: { title: { display: true, text: 'Time per Swimlane (Sprint, hours)' } },
        scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: 'Hours' } } }
      }
    });

    new Chart(document.getElementById('cycleChart'), {
      type: 'bar',
      data: {
        labels: ticketLabels,
        datasets: [
          { label: 'Dev Cycles', data: [${devCycleData.join(',')}], backgroundColor: '#f59e0b' },
          { label: 'QA Cycles', data: [${qaCycleData.join(',')}], backgroundColor: '#ef4444' }
        ]
      },
      options: {
        responsive: true,
        plugins: { title: { display: true, text: 'Rework Cycles per Ticket' } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
      }
    });

    new Chart(document.getElementById('scatterChart'), {
      type: 'scatter',
      data: { datasets: [{ label: 'SP vs Days', data: [${scatterData.join(',')}], backgroundColor: '#3b82f6' }] },
      options: {
        responsive: true,
        plugins: { title: { display: true, text: 'Story Points vs Turnaround (days)' } },
        scales: { x: { title: { display: true, text: 'Story Points' } }, y: { title: { display: true, text: 'Days' } } }
      }
    });

    new Chart(document.getElementById('devChart'), {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(devLabels)},
        datasets: [
          { label: 'Tickets', data: [${devTicketCounts.join(',')}], backgroundColor: '#3b82f6' },
          { label: 'Story Points', data: [${devSPCounts.join(',')}], backgroundColor: '#10b981' }
        ]
      },
      options: {
        responsive: true,
        plugins: { title: { display: true, text: 'Developer Throughput' } }
      }
    });

    const ticketData = ${ticketDataJson};
    const ticketSwimlaneLabels = ${swimlaneLabelsJson};
    const ticketState = { columns: getTicketColumns(ticketSwimlaneLabels), sortKey: null, sortDir: 1, filters: {} };

    function getTicketColumns(swimlaneLabels) {
      const columns = [
        { key: 'key', label: 'Key', type: 'text', get: t => t.key },
        { key: 'type', label: 'Type', type: 'text', get: t => t.issueType },
        { key: 'summary', label: 'Summary', type: 'text', get: t => t.summary },
        { key: 'assignee', label: 'Assignee', type: 'text', get: t => t.assignee || '', fmt: v => v || '-' },
        { key: 'qa', label: 'QA', type: 'text', get: t => (t.qaAssignees || []).join(', '), fmt: v => v || '-' },
        {
          key: 'status', label: 'Status', type: 'text', get: t => t.currentStatus,
          cellClass: v => v === 'Done' ? 'status-done' : (v === 'QA Failed' || v === 'PO Review Failed') ? 'status-failed' : 'status-active',
        },
        {
          key: 'turnaround', label: 'Turnaround', type: 'number',
          get: t => t.lifetimeTurnaroundMs ? t.lifetimeTurnaroundMs / 3600000 : null,
          fmt: v => v == null ? '-' : formatDurationClient(v * 3600000),
        },
        {
          key: 'devCycles', label: 'Dev Cy', type: 'number', get: t => t.devCycles,
          cellClass: v => v === 0 ? '' : v === 1 ? 'cycle-warn' : 'cycle-bad',
        },
        {
          key: 'qaCycles', label: 'QA Cy', type: 'number', get: t => t.qaCycles,
          cellClass: v => v === 0 ? '' : v === 1 ? 'cycle-warn' : 'cycle-bad',
        },
        { key: 'defects', label: 'Defects', type: 'number', get: t => t.linkedDefects },
        { key: 'sp', label: 'SP', type: 'number', get: t => t.storyPoints ?? null, fmt: v => v == null ? '-' : v },
        {
          key: 'sprints', label: 'Sprints', type: 'number', get: t => t.sprintCount, raw: true,
          fmt: v => v > 1 ? '<strong>' + v + '</strong>' : '1',
        },
      ];

      swimlaneLabels.forEach(s => {
        columns.push({
          key: 'sw_' + s, label: s, type: 'number',
          get: t => {
            const st = (t.sprintSwimlaneTimes || []).find(entry => entry.swimlane === s);
            return st && st.totalMs ? st.totalMs / 3600000 : null;
          },
          fmt: v => v == null ? '-' : formatDurationClient(v * 3600000),
        });
      });

      return columns;
    }

    function formatDurationClient(ms) {
      if (ms < 0) return '0m';
      const totalMinutes = Math.floor(ms / 60000);
      const totalHours = Math.floor(totalMinutes / 60);
      const totalDays = Math.floor(totalHours / 24);
      const minutes = totalMinutes % 60;
      const hours = totalHours % 24;
      const parts = [];
      if (totalDays > 0) parts.push(totalDays + 'd');
      if (hours > 0) parts.push(hours + 'h');
      if (minutes > 0 && totalDays === 0) parts.push(minutes + 'm');
      return parts.length > 0 ? parts.join(' ') : '< 1m';
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function matchesTicketFilter(raw, display, filterValue, isNumeric) {
      filterValue = filterValue.trim();
      if (!filterValue) return true;
      if (isNumeric) {
        const m = filterValue.match(/^(>=|<=|>|<|=)?\\s*(-?\\d+(\\.\\d+)?)$/);
        if (m) {
          if (raw == null) return false;
          const op = m[1] || '=';
          const val = parseFloat(m[2]);
          if (op === '>') return raw > val;
          if (op === '<') return raw < val;
          if (op === '>=') return raw >= val;
          if (op === '<=') return raw <= val;
          return Math.abs(raw - val) < 0.005;
        }
      }
      return String(display).toLowerCase().includes(filterValue.toLowerCase());
    }

    function compareTicketValues(a, b, type) {
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      if (type === 'number') return a - b;
      return String(a).toLowerCase().localeCompare(String(b).toLowerCase());
    }

    function renderTicketRows() {
      const { columns, sortKey, sortDir, filters } = ticketState;

      let rows = ticketData.filter(t => columns.every(c => {
        const f = filters[c.key];
        if (!f) return true;
        const raw = c.get(t);
        const display = c.fmt ? c.fmt(raw) : (raw ?? '-');
        return matchesTicketFilter(raw, display, f, c.type === 'number');
      }));

      if (sortKey) {
        const col = columns.find(c => c.key === sortKey);
        rows = rows.slice().sort((a, b) => compareTicketValues(col.get(a), col.get(b), col.type) * sortDir);
      }

      const body = document.getElementById('ticket-table-body');
      if (!body) return;
      body.innerHTML = rows.map(t => {
        return '<tr>' + columns.map(c => {
          const raw = c.get(t);
          const display = c.fmt ? c.fmt(raw) : (raw ?? '-');
          const cellHtml = c.raw ? display : escapeHtml(String(display));
          const cls = c.cellClass ? c.cellClass(raw) : '';
          return '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + cellHtml + '</td>';
        }).join('') + '</tr>';
      }).join('');

      columns.forEach(c => {
        const arrow = document.getElementById('arrow-' + c.key);
        if (arrow) arrow.textContent = sortKey === c.key ? (sortDir === 1 ? ' ▲' : ' ▼') : '';
      });
    }

    function sortTicketTable(key) {
      if (ticketState.sortKey === key) {
        ticketState.sortDir = -ticketState.sortDir;
      } else {
        ticketState.sortKey = key;
        ticketState.sortDir = 1;
      }
      renderTicketRows();
    }

    function filterTicketTable(key, value) {
      ticketState.filters[key] = value;
      renderTicketRows();
    }

    renderTicketRows();
  </script>
</body>
</html>`;
}
