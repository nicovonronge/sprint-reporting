import { formatDuration } from '../utils/date-utils.js';

export function getUiHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sprint Report Tool</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }

    .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }

    h1 { font-size: 1.8rem; font-weight: 700; margin-bottom: 0.5rem; }
    h2 { font-size: 1.3rem; margin: 2rem 0 1rem; color: #94a3b8; border-bottom: 1px solid #1e293b; padding-bottom: 0.5rem; }
    h3 { font-size: 1.1rem; margin: 1.5rem 0 0.75rem; color: #cbd5e1; }

    .header { text-align: center; padding: 2rem 0; }
    .header p { color: #64748b; }

    /* Wizard steps */
    .wizard { max-width: 700px; margin: 0 auto; }
    .step { display: none; }
    .step.active { display: block; }

    .step-label { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; margin-bottom: 1rem; }

    .option-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.75rem; }
    .option-card {
      background: #1e293b; border: 2px solid #334155; border-radius: 10px; padding: 1.2rem;
      cursor: pointer; transition: all 0.15s;
    }
    .option-card:hover { border-color: #3b82f6; background: #1e3a5f; }
    .option-card.selected { border-color: #3b82f6; background: #1e3a5f; }
    .option-card .name { font-weight: 600; font-size: 1rem; }
    .option-card .key { color: #64748b; font-size: 0.85rem; }
    .option-card .badge {
      display: inline-block; padding: 0.15rem 0.5rem; border-radius: 999px;
      font-size: 0.7rem; font-weight: 600; text-transform: uppercase;
    }
    .badge-active { background: #166534; color: #4ade80; }
    .badge-future { background: #1e3a5f; color: #60a5fa; }
    .badge-closed { background: #1e293b; color: #64748b; }
    .badge-cached { background: #134e2f; color: #34d399; }

    .sprint-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .sprint-item {
      background: #1e293b; border: 2px solid #334155; border-radius: 8px; padding: 0.8rem 1rem;
      cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 0.75rem;
    }
    .sprint-item:hover { border-color: #3b82f6; }
    .sprint-item.selected { border-color: #3b82f6; background: #1e3a5f; }
    .sprint-item input[type="checkbox"] { accent-color: #3b82f6; width: 18px; height: 18px; }
    .sprint-item .sprint-name { flex: 1; font-weight: 500; }
    .sprint-item .sprint-dates { color: #64748b; font-size: 0.8rem; }

    .action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    .action-card {
      background: #1e293b; border: 2px solid #334155; border-radius: 10px; padding: 1.5rem;
      cursor: pointer; transition: all 0.15s; text-align: center;
    }
    .action-card:hover { border-color: #3b82f6; background: #1e3a5f; }
    .action-card .icon { font-size: 2rem; margin-bottom: 0.5rem; }
    .action-card .title { font-weight: 600; }
    .action-card .desc { color: #64748b; font-size: 0.85rem; margin-top: 0.25rem; }

    .filter-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-top: 1rem; }
    .filter-row input {
      background: #1e293b; border: 1px solid #334155; border-radius: 6px; padding: 0.6rem 0.8rem;
      color: #e2e8f0; font-size: 0.9rem; width: 100%;
    }
    .filter-row input::placeholder { color: #475569; }
    .filter-row input:focus { outline: none; border-color: #3b82f6; }

    .btn {
      display: inline-flex; align-items: center; gap: 0.5rem;
      background: #3b82f6; color: #fff; border: none; border-radius: 8px; padding: 0.7rem 1.5rem;
      font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: background 0.15s;
    }
    .btn:hover { background: #2563eb; }
    .btn:disabled { background: #334155; color: #64748b; cursor: not-allowed; }
    .btn-secondary { background: #334155; }
    .btn-secondary:hover { background: #475569; }

    .btn-row { display: flex; gap: 0.75rem; margin-top: 1.5rem; justify-content: flex-end; }

    /* Progress */
    .progress { display: none; text-align: center; padding: 3rem; }
    .progress.active { display: block; }
    .spinner { width: 40px; height: 40px; border: 4px solid #334155; border-top: 4px solid #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .progress-text { color: #94a3b8; }

    /* Results */
    #results { display: none; }
    #results.active { display: block; }

    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; }
    .stat-card { background: #1e293b; border-radius: 8px; padding: 1rem; }
    .stat-card .label { font-size: 0.7rem; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }
    .stat-card .value { font-size: 1.5rem; font-weight: 700; margin-top: 0.2rem; }

    .chart-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1rem 0; }
    .chart-box { background: #1e293b; border-radius: 8px; padding: 1rem; }

    table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 8px; overflow: hidden; font-size: 0.85rem; }
    th { background: #334155; text-align: left; padding: 0.5rem 0.6rem; font-size: 0.75rem; text-transform: uppercase; color: #94a3b8; }
    th.th-sort { cursor: pointer; user-select: none; white-space: nowrap; }
    th.th-sort:hover { color: #e2e8f0; }
    .sort-arrow { margin-left: 0.25rem; color: #3b82f6; }
    tr.filter-row-inline th { background: #1e293b; padding: 0.3rem 0.4rem; }
    .filter-input {
      width: 100%; background: #0f172a; border: 1px solid #334155; border-radius: 4px;
      padding: 0.25rem 0.4rem; color: #e2e8f0; font-size: 0.75rem; text-transform: none; font-weight: normal;
    }
    .filter-input::placeholder { color: #475569; }
    .filter-input:focus { outline: none; border-color: #3b82f6; }
    td { padding: 0.45rem 0.6rem; border-bottom: 1px solid #1e293b; }
    tr:hover td { background: #263548; }
    .text-green { color: #4ade80; }
    .text-yellow { color: #fbbf24; }
    .text-red { color: #f87171; }
    .text-dim { color: #64748b; }

    .analysis-box { background: #1e293b; border-radius: 8px; padding: 1.5rem; line-height: 1.7; white-space: pre-wrap; }

    .back-link { color: #3b82f6; cursor: pointer; font-size: 0.9rem; margin-bottom: 1rem; display: inline-block; }
    .back-link:hover { text-decoration: underline; }

    .compare-entry { text-align: center; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid #1e293b; }
    .compare-entry a { color: #3b82f6; cursor: pointer; font-size: 0.9rem; }
    .compare-entry a:hover { text-decoration: underline; }
    .hint { color: #64748b; font-size: 0.8rem; margin-top: 0.5rem; }

    @media (max-width: 768px) {
      .chart-grid, .action-grid, .filter-row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Sprint Report Tool</h1>
      <p>Measure ticket turnaround times across your teams</p>
    </div>

    <!-- WIZARD -->
    <div class="wizard" id="wizard">
      <!-- Step 1: Team -->
      <div class="step active" id="step-team">
        <div class="step-label" id="step-team-label">Step 1 of 4 — Select Team</div>
        <div class="option-grid" id="team-grid"></div>
        <div class="compare-entry">
          <a id="compare-entry-link" onclick="toggleCompareFlow()">&#128200; Sprint Comparison Report — compare trends across sprints you've already downloaded</a>
        </div>
      </div>

      <!-- Step 2: Sprint -->
      <div class="step" id="step-sprint">
        <div class="step-label">Step 2 of 4 — Select Sprint(s)</div>
        <div class="sprint-list" id="sprint-list"></div>
        <div class="btn-row">
          <button class="btn btn-secondary" onclick="goStep('step-team')">Back</button>
          <button class="btn" id="btn-sprint-next" disabled onclick="goStep('step-action')">Next</button>
        </div>
      </div>

      <!-- Sprint Comparison: pick cached sprints for the chosen team -->
      <div class="step" id="step-compare-sprints">
        <div class="step-label">Sprint Comparison Report — Select Sprints (from downloaded data)</div>
        <div class="sprint-list" id="compare-sprint-list"></div>
        <div class="hint">Select at least 2 sprints to see a trend.</div>
        <div class="btn-row">
          <button class="btn btn-secondary" onclick="backToTeamFromCompare()">Back</button>
          <button class="btn" id="btn-compare-generate" disabled onclick="generateComparison()">Generate Comparison</button>
        </div>
      </div>

      <!-- Step 3: Action -->
      <div class="step" id="step-action">
        <div class="step-label">Step 3 of 4 — What would you like to do?</div>
        <div class="action-grid">
          <div class="action-card" onclick="selectAction('fetch')">
            <div class="icon">&#128229;</div>
            <div class="title">Fetch Data</div>
            <div class="desc">Pull from Jira & GitHub</div>
          </div>
          <div class="action-card" onclick="selectAction('report')">
            <div class="icon">&#128202;</div>
            <div class="title">View Report</div>
            <div class="desc">Charts & tables from cached data</div>
          </div>
          <div class="action-card" onclick="selectAction('analyze')">
            <div class="icon">&#129302;</div>
            <div class="title">AI Analysis</div>
            <div class="desc">Claude insights & recommendations</div>
          </div>
          <div class="action-card" onclick="selectAction('full')">
            <div class="icon">&#9889;</div>
            <div class="title">Full Pipeline</div>
            <div class="desc">Fetch + Report + Analysis</div>
          </div>
        </div>
        <div class="btn-row">
          <button class="btn btn-secondary" onclick="goStep('step-sprint')">Back</button>
        </div>
      </div>

      <!-- Step 4: Filters -->
      <div class="step" id="step-filters">
        <div class="step-label">Step 4 of 4 — Filters (optional)</div>
        <div class="filter-row">
          <input type="text" id="filter-dev" placeholder="Developer name..." />
          <input type="text" id="filter-qa" placeholder="QA assignee..." />
          <input type="text" id="filter-tickets" placeholder="Ticket keys (e.g. SQM-123,SQM-456)" />
          <input type="text" id="filter-types" placeholder="Issue types (e.g. Story,Bug)" />
        </div>
        <label id="force-refresh-row" style="display:flex;align-items:center;gap:0.5rem;margin-top:1rem;color:#94a3b8;font-size:0.85rem;cursor:pointer;">
          <input type="checkbox" id="force-refresh-analysis" style="accent-color:#3b82f6;width:16px;height:16px;" />
          Re-run AI analysis instead of using a saved result
        </label>
        <div class="btn-row">
          <button class="btn btn-secondary" onclick="goStep('step-action')">Back</button>
          <button class="btn" onclick="execute()">Run</button>
        </div>
      </div>
    </div>

    <!-- PROGRESS -->
    <div class="progress" id="progress">
      <div class="spinner"></div>
      <div class="progress-text" id="progress-text">Working...</div>
    </div>

    <!-- RESULTS -->
    <div id="results">
      <span class="back-link" onclick="reset()">&#8592; Start Over</span>
      <div id="results-content"></div>
    </div>
  </div>

  <script>
    let state = { team: null, sprints: [], action: null, flow: 'wizard', compareSprints: [] };
    const ticketTables = {};

    // Load teams on start
    fetch('/api/teams').then(r => r.json()).then(teams => {
      const grid = document.getElementById('team-grid');
      teams.forEach(t => {
        const card = document.createElement('div');
        card.className = 'option-card';
        card.innerHTML = '<div class="name">' + t.name + '</div><div class="key">' + t.key + '</div>';
        card.onclick = () => selectTeam(t.key, t.name);
        grid.appendChild(card);
      });
    });

    function goStep(id) {
      document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
      document.getElementById(id).classList.add('active');
    }

    function selectTeam(key, name) {
      state.team = key;
      if (state.flow === 'compare') {
        goStep('step-compare-sprints');
        loadComparisonSprints(key);
      } else {
        goStep('step-sprint');
        loadSprints(key);
      }
    }

    function toggleCompareFlow() {
      state.flow = state.flow === 'compare' ? 'wizard' : 'compare';
      state.compareSprints = [];
      updateCompareEntryUI();
    }

    function updateCompareEntryUI() {
      const label = document.getElementById('step-team-label');
      const link = document.getElementById('compare-entry-link');
      if (state.flow === 'compare') {
        label.textContent = 'Sprint Comparison Report — Select a Team';
        link.textContent = "✕ Cancel comparison mode (back to normal report)";
      } else {
        label.textContent = 'Step 1 of 4 — Select Team';
        link.textContent = "📈 Sprint Comparison Report — compare trends across sprints you've already downloaded";
      }
    }

    function backToTeamFromCompare() {
      state.flow = 'wizard';
      state.compareSprints = [];
      updateCompareEntryUI();
      goStep('step-team');
    }

    function loadComparisonSprints(projectKey) {
      const list = document.getElementById('compare-sprint-list');
      list.innerHTML = '<div style="color:#64748b">Loading cached sprints...</div>';
      state.compareSprints = [];
      document.getElementById('btn-compare-generate').disabled = true;

      fetch('/api/cached-sprints/' + projectKey).then(r => r.json()).then(sprints => {
        if (sprints.length === 0) {
          list.innerHTML = '<div style="color:#64748b">No cached data for this team yet. Fetch some sprints first from the normal wizard flow.</div>';
          return;
        }

        list.innerHTML = '';
        sprints.forEach(s => {
          const item = document.createElement('div');
          item.className = 'sprint-item';
          const dates = s.sprintStartDate
            ? new Date(s.sprintStartDate).toLocaleDateString() + ' - ' + (s.sprintEndDate ? new Date(s.sprintEndDate).toLocaleDateString() : '?')
            : '';
          item.innerHTML = '<input type="checkbox" />'
            + '<div class="sprint-name">' + s.sprintName + '</div>'
            + '<span class="badge badge-closed">' + s.issueCount + ' tickets</span>'
            + '<div class="sprint-dates">' + dates + '</div>';

          item.onclick = (e) => {
            if (e.target.tagName === 'INPUT') return;
            const cb = item.querySelector('input');
            cb.checked = !cb.checked;
            cb.dispatchEvent(new Event('change'));
          };

          item.querySelector('input').addEventListener('change', (e) => {
            if (e.target.checked) {
              item.classList.add('selected');
              state.compareSprints.push(s.sprintName);
            } else {
              item.classList.remove('selected');
              state.compareSprints = state.compareSprints.filter(n => n !== s.sprintName);
            }
            document.getElementById('btn-compare-generate').disabled = state.compareSprints.length < 2;
          });

          list.appendChild(item);
        });
      }).catch(err => {
        list.innerHTML = '<div style="color:#f87171">Error: ' + err.message + '</div>';
      });
    }

    async function generateComparison() {
      showProgress('Building comparison report...');
      try {
        const res = await fetch('/api/comparison-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectKey: state.team, sprintNames: state.compareSprints }),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
        const data = await res.json();
        hideProgress();
        showResults(renderComparisonReport(data));
      } catch (err) {
        hideProgress();
        showResults('<div style="text-align:center;padding:3rem;color:#f87171"><h2>Error</h2><p>' + escapeHtml(err.message) + '</p><button class="btn btn-secondary" onclick="reset()" style="margin-top:1rem">Try Again</button></div>');
      }
    }

    function loadSprints(projectKey) {
      const list = document.getElementById('sprint-list');
      list.innerHTML = '<div style="color:#64748b">Loading sprints...</div>';

      fetch('/api/sprints/' + projectKey).then(r => r.json()).then(sprints => {
        list.innerHTML = '';
        state.sprints = [];

        sprints.forEach(s => {
          const item = document.createElement('div');
          item.className = 'sprint-item';
          const badgeClass = s.state === 'active' ? 'badge-active' : s.state === 'future' ? 'badge-future' : 'badge-closed';
          const dates = s.startDate ? new Date(s.startDate).toLocaleDateString() + ' - ' + (s.endDate ? new Date(s.endDate).toLocaleDateString() : '?') : '';
          const cachedBadge = s.cachedAt
            ? '<span class="badge badge-cached" title="Fetched ' + new Date(s.cachedAt).toLocaleString() + '">&#10003; Cached</span>'
            : '';
          item.innerHTML = '<input type="checkbox" />'
            + '<div class="sprint-name">' + s.name + '</div>'
            + '<span class="badge ' + badgeClass + '">' + s.state + '</span>'
            + cachedBadge
            + '<div class="sprint-dates">' + dates + '</div>';

          item.onclick = (e) => {
            if (e.target.tagName === 'INPUT') return;
            const cb = item.querySelector('input');
            cb.checked = !cb.checked;
            cb.dispatchEvent(new Event('change'));
          };

          item.querySelector('input').addEventListener('change', (e) => {
            if (e.target.checked) {
              item.classList.add('selected');
              state.sprints.push(s.name);
            } else {
              item.classList.remove('selected');
              state.sprints = state.sprints.filter(n => n !== s.name);
            }
            document.getElementById('btn-sprint-next').disabled = state.sprints.length === 0;
          });

          list.appendChild(item);
        });
      }).catch(err => {
        list.innerHTML = '<div style="color:#f87171">Error: ' + err.message + '</div>';
      });
    }

    function selectAction(action) {
      state.action = action;
      if (action === 'fetch') {
        execute();
      } else {
        document.getElementById('force-refresh-row').style.display = (action === 'analyze' || action === 'full') ? 'flex' : 'none';
        goStep('step-filters');
      }
    }

    function showProgress(text) {
      document.getElementById('wizard').style.display = 'none';
      document.getElementById('results').className = '';
      document.getElementById('progress').classList.add('active');
      document.getElementById('progress-text').textContent = text;
    }

    function hideProgress() {
      document.getElementById('progress').classList.remove('active');
    }

    function getFilters() {
      return {
        dev: document.getElementById('filter-dev').value || undefined,
        qa: document.getElementById('filter-qa').value || undefined,
        tickets: document.getElementById('filter-tickets').value || undefined,
        types: document.getElementById('filter-types').value || undefined,
      };
    }

    async function execute() {
      const filters = getFilters();
      const action = state.action;

      try {
        if (action === 'fetch' || action === 'full') {
          showProgress('Fetching data from Jira & GitHub...');
          const res = await fetch('/api/fetch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectKey: state.team, sprintNames: state.sprints }),
          });
          if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
        }

        if (action === 'report' || action === 'full') {
          showProgress('Generating report...');
          let allHtml = '';
          for (const sprint of state.sprints) {
            const res = await fetch('/api/report', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ projectKey: state.team, sprintName: sprint, filters }),
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
            const metrics = await res.json();
            allHtml += renderMetrics(metrics);
          }
          hideProgress();
          showResults(allHtml);
        }

        if (action === 'analyze' || action === 'full') {
          showProgress('Running Claude AI analysis...');
          let analysisHtml = '';
          for (const sprint of state.sprints) {
            const forceRefresh = document.getElementById('force-refresh-analysis').checked;
            const res = await fetch('/api/analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ projectKey: state.team, sprintName: sprint, filters, forceRefresh }),
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
            const data = await res.json();
            const savedNote = data.cached
              ? '<p style="color:#64748b;font-size:0.85rem;margin-bottom:0.75rem">Using saved analysis from ' + new Date(data.generatedAt).toLocaleString() + '</p>'
              : '';
            analysisHtml += '<h2>AI Analysis: ' + sprint + '</h2>' + savedNote + '<div class="analysis-box">' + escapeHtml(data.analysis) + '</div>';
          }
          hideProgress();
          const existing = document.getElementById('results-content').innerHTML;
          showResults(existing + analysisHtml);
        }

        if (action === 'fetch') {
          hideProgress();
          showResults('<div style="text-align:center;padding:3rem"><h2 style="color:#4ade80">Data fetched successfully!</h2><p style="color:#94a3b8;margin-top:0.5rem">You can now run a Report or AI Analysis.</p><button class="btn" onclick="reset()" style="margin-top:1rem">Continue</button></div>');
        }
      } catch (err) {
        hideProgress();
        showResults('<div style="text-align:center;padding:3rem;color:#f87171"><h2>Error</h2><p>' + escapeHtml(err.message) + '</p><button class="btn btn-secondary" onclick="reset()" style="margin-top:1rem">Try Again</button></div>');
      }
    }

    function showResults(html) {
      document.getElementById('wizard').style.display = 'none';
      document.getElementById('results-content').innerHTML = html;
      document.getElementById('results').classList.add('active');
    }

    function reset() {
      state = { team: null, sprints: [], action: null, flow: 'wizard', compareSprints: [] };
      updateCompareEntryUI();
      document.getElementById('results').className = '';
      document.getElementById('results-content').innerHTML = '';
      document.getElementById('wizard').style.display = '';
      document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
      document.getElementById('step-team').classList.add('active');
      document.querySelectorAll('.sprint-item').forEach(s => { s.classList.remove('selected'); s.querySelector('input').checked = false; });
      document.getElementById('filter-dev').value = '';
      document.getElementById('filter-qa').value = '';
      document.getElementById('filter-tickets').value = '';
      document.getElementById('filter-types').value = '';
      document.getElementById('force-refresh-analysis').checked = false;
    }

    function renderMetrics(m) {
      let html = '<h2>' + m.sprintName + ' (' + m.projectKey + ')</h2>';
      const swimlaneLabels = Object.keys(m.avgSprintSwimlaneTimesMs).filter(s => m.avgSprintSwimlaneTimesMs[s] || m.avgLifetimeSwimlaneTimesMs[s]);

      // Summary cards
      html += '<div class="summary-grid">';
      html += statCard('Total Tickets', m.totalTickets);
      html += statCard('Completed', m.completedTickets + '/' + m.totalTickets);
      html += statCard('Carried Over', m.carriedOverTickets);
      html += statCard('Story Points', m.totalStoryPoints + ' (D:' + m.totalDevPoints + ' Q:' + m.totalQaPoints + ')');
      html += statCard('Avg Turnaround', m.avgLifetimeTurnaroundMs ? formatMs(m.avgLifetimeTurnaroundMs) : 'N/A');
      html += statCard('Avg Dev Cycles', m.avgDevCycles.toFixed(1));
      html += statCard('Avg QA Cycles', m.avgQaCycles.toFixed(1));
      html += statCard('Defects', m.totalDefects);
      html += '</div>';

      // Charts
      const chartId1 = 'chart-swimlane-' + Math.random().toString(36).slice(2);
      const chartId2 = 'chart-cycles-' + Math.random().toString(36).slice(2);
      html += '<div class="chart-grid">';
      html += '<div class="chart-box"><canvas id="' + chartId1 + '"></canvas></div>';
      html += '<div class="chart-box"><canvas id="' + chartId2 + '"></canvas></div>';
      html += '</div>';

      // Ticket table
      const ticketTableId = 'ticket-table-' + Math.random().toString(36).slice(2);
      const ticketColumns = getTicketColumns(swimlaneLabels);
      ticketTables[ticketTableId] = { tickets: m.ticketMetrics, columns: ticketColumns, sortKey: null, sortDir: 1, filters: {} };

      html += '<h3>Ticket Details</h3><table id="' + ticketTableId + '"><thead>';
      html += '<tr>' + ticketColumns.map(c =>
        '<th class="th-sort" onclick="sortTicketTable(\\'' + ticketTableId + '\\',\\'' + c.key + '\\')">'
        + escapeHtml(c.label)
        + '<span class="sort-arrow" id="' + ticketTableId + '-arrow-' + c.key + '"></span></th>'
      ).join('') + '</tr>';
      html += '<tr class="filter-row-inline">' + ticketColumns.map(c =>
        '<th><input class="filter-input" placeholder="' + (c.type === 'number' ? '>5 <10 =3' : 'filter...') + '" '
        + 'oninput="filterTicketTable(\\'' + ticketTableId + '\\',\\'' + c.key + '\\', this.value)" /></th>'
      ).join('') + '</tr>';
      html += '</thead><tbody id="' + ticketTableId + '-body"></tbody></table>';

      // Dev summary
      html += '<h3>Developer Summary</h3><table><thead><tr><th>Developer</th><th>Tickets</th><th>Completed</th><th>SP</th><th>Dev Cycles</th></tr></thead><tbody>';
      Object.entries(m.byDeveloper).forEach(([dev, tickets]) => {
        const completed = tickets.filter(t => t.currentStatus === 'Done').length;
        const sp = tickets.reduce((s, t) => s + (t.storyPoints || 0), 0);
        const avgCycles = (tickets.reduce((s, t) => s + t.devCycles, 0) / tickets.length).toFixed(1);
        html += '<tr><td>' + dev + '</td><td>' + tickets.length + '</td><td>' + completed + '</td><td>' + sp + '</td><td>' + avgCycles + '</td></tr>';
      });
      html += '</tbody></table>';

      // Render charts after DOM update
      setTimeout(() => {
        const swimlaneValues = swimlaneLabels.map(s => ((m.avgSprintSwimlaneTimesMs[s] || 0) / 3600000).toFixed(2));
        const colors = ['#ef4444','#f59e0b','#3b82f6','#8b5cf6','#06b6d4','#10b981','#6b7280'];

        const el1 = document.getElementById(chartId1);
        if (el1) new Chart(el1, {
          type: 'bar',
          data: { labels: swimlaneLabels, datasets: [{ label: 'Avg Hours (Sprint)', data: swimlaneValues, backgroundColor: colors }] },
          options: { responsive: true, plugins: { title: { display: true, text: 'Avg Time per Swimlane (hours)', color: '#94a3b8' }, legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } } }
        });

        const el2 = document.getElementById(chartId2);
        if (el2) new Chart(el2, {
          type: 'bar',
          data: {
            labels: m.ticketMetrics.map(t => t.key),
            datasets: [
              { label: 'Dev Cycles', data: m.ticketMetrics.map(t => t.devCycles), backgroundColor: '#f59e0b' },
              { label: 'QA Cycles', data: m.ticketMetrics.map(t => t.qaCycles), backgroundColor: '#ef4444' }
            ]
          },
          options: { responsive: true, plugins: { title: { display: true, text: 'Rework Cycles', color: '#94a3b8' } }, scales: { x: { ticks: { color: '#94a3b8', maxRotation: 90 } }, y: { ticks: { color: '#94a3b8', stepSize: 1 }, beginAtZero: true } } }
        });

        renderTicketRows(ticketTableId);
      }, 100);

      return html;
    }

    function renderComparisonReport(data) {
      const entries = data.entries;
      const swimlaneOrder = data.swimlaneOrder;

      const totalExcluded = entries.reduce((s, e) => s + e.excludedTicketCount, 0);
      const dateRange = entries.length > 0
        ? new Date(entries[0].sprintStartDate).toLocaleDateString() + ' – ' + new Date(entries[entries.length - 1].sprintEndDate || entries[entries.length - 1].sprintStartDate).toLocaleDateString()
        : '';

      let html = '<h2>Sprint Comparison Report</h2>';
      html += '<p style="color:#94a3b8;margin-bottom:1rem">' + entries.length + ' sprints (' + dateRange + ') &middot; '
        + totalExcluded + ' ticket(s) excluded across all sprints (unassigned or non-dev assignee)</p>';

      html += '<h3>Per-Sprint Overview</h3><table><thead><tr>'
        + '<th>Sprint</th><th>Total</th><th>Completed</th><th>Carried Over</th><th>Excluded</th><th>Currently Escalated</th>'
        + '</tr></thead><tbody>';
      entries.forEach(e => {
        html += '<tr><td>' + escapeHtml(e.sprintName) + '</td><td>' + e.metrics.totalTickets + '</td><td>' + e.metrics.completedTickets
          + '</td><td>' + e.metrics.carriedOverTickets + '</td><td>' + e.excludedTicketCount + '</td><td>' + e.currentlyEscalatedCount + '</td></tr>';
      });
      html += '</tbody></table>';

      const ids = {
        tickets: 'cmp-tickets-' + Math.random().toString(36).slice(2),
        size: 'cmp-size-' + Math.random().toString(36).slice(2),
        sizeDist: 'cmp-sizedist-' + Math.random().toString(36).slice(2),
        todo: 'cmp-todo-' + Math.random().toString(36).slice(2),
        otherSwimlanes: 'cmp-other-' + Math.random().toString(36).slice(2),
        turnaround: 'cmp-turnaround-' + Math.random().toString(36).slice(2),
        cycles: 'cmp-cycles-' + Math.random().toString(36).slice(2),
        defects: 'cmp-defects-' + Math.random().toString(36).slice(2),
      };

      html += '<h3>Trends</h3><div class="chart-grid">';
      Object.values(ids).forEach(id => {
        html += '<div class="chart-box"><canvas id="' + id + '"></canvas></div>';
      });
      html += '</div>';

      setTimeout(() => renderComparisonCharts(ids, entries, swimlaneOrder), 100);

      return html;
    }

    function chartIfPresent(id, type, chartData, title, scales) {
      const el = document.getElementById(id);
      if (!el) return;
      new Chart(el, {
        type,
        data: chartData,
        options: {
          responsive: true,
          plugins: { title: { display: true, text: title, color: '#94a3b8' } },
          scales,
        },
      });
    }

    function renderComparisonCharts(ids, entries, swimlaneOrder) {
      const labels = entries.map(e => e.sprintName);
      const colors = ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#6b7280'];
      const axisColor = '#94a3b8';
      const commonScales = { x: { ticks: { color: axisColor } }, y: { ticks: { color: axisColor }, beginAtZero: true } };

      chartIfPresent(ids.tickets, 'bar', {
        labels,
        datasets: [
          { label: 'Total', data: entries.map(e => e.metrics.totalTickets), backgroundColor: colors[2] },
          { label: 'Completed', data: entries.map(e => e.metrics.completedTickets), backgroundColor: colors[4] },
          { label: 'Carried Over', data: entries.map(e => e.metrics.carriedOverTickets), backgroundColor: colors[1] },
        ],
      }, 'Tickets per Sprint', commonScales);

      chartIfPresent(ids.size, 'line', {
        labels,
        datasets: [{
          label: 'Avg Story Points / Ticket',
          data: entries.map(e => e.metrics.totalTickets > 0 ? +(e.metrics.totalStoryPoints / e.metrics.totalTickets).toFixed(2) : 0),
          borderColor: colors[2], backgroundColor: colors[2], tension: 0.25,
        }],
      }, 'Avg Story Points per Ticket', commonScales);

      const buckets = ['1-3', '5-8', '13+', 'Unestimated'];
      const bucketOf = sp => sp == null ? 'Unestimated' : sp <= 3 ? '1-3' : sp <= 8 ? '5-8' : '13+';
      chartIfPresent(ids.sizeDist, 'bar', {
        labels,
        datasets: buckets.map((b, i) => ({
          label: b,
          data: entries.map(e => e.metrics.ticketMetrics.filter(t => bucketOf(t.storyPoints) === b).length),
          backgroundColor: colors[i % colors.length],
        })),
      }, 'Ticket Size Distribution', {
        x: { stacked: true, ticks: { color: axisColor } },
        y: { stacked: true, ticks: { color: axisColor }, beginAtZero: true },
      });

      chartIfPresent(ids.todo, 'line', {
        labels,
        datasets: [{
          label: 'Avg Hours in To Do',
          data: entries.map(e => +((e.metrics.avgSprintSwimlaneTimesMs['TO DO'] || 0) / 3600000).toFixed(2)),
          borderColor: colors[0], backgroundColor: colors[0], tension: 0.25,
        }],
      }, 'Time in To Do (avg business hours)', commonScales);

      const otherLanes = swimlaneOrder.filter(s => s !== 'TO DO' && s !== 'DONE');
      chartIfPresent(ids.otherSwimlanes, 'line', {
        labels,
        datasets: otherLanes.map((lane, i) => ({
          label: lane,
          data: entries.map(e => +((e.metrics.avgSprintSwimlaneTimesMs[lane] || 0) / 3600000).toFixed(2)),
          borderColor: colors[(i + 1) % colors.length], backgroundColor: colors[(i + 1) % colors.length], tension: 0.25,
        })),
      }, 'Time in Other Swimlanes (avg business hours)', commonScales);

      chartIfPresent(ids.turnaround, 'line', {
        labels,
        datasets: [{
          label: 'Avg Turnaround (hours)',
          data: entries.map(e => e.metrics.avgLifetimeTurnaroundMs != null ? +(e.metrics.avgLifetimeTurnaroundMs / 3600000).toFixed(2) : null),
          borderColor: colors[3], backgroundColor: colors[3], tension: 0.25,
        }],
      }, 'Avg Lifetime Turnaround (business hours)', commonScales);

      chartIfPresent(ids.cycles, 'line', {
        labels,
        datasets: [
          { label: 'Avg Dev Cycles', data: entries.map(e => +e.metrics.avgDevCycles.toFixed(2)), borderColor: colors[1], backgroundColor: colors[1], tension: 0.25 },
          { label: 'Avg QA Cycles', data: entries.map(e => +e.metrics.avgQaCycles.toFixed(2)), borderColor: colors[0], backgroundColor: colors[0], tension: 0.25 },
        ],
      }, 'Avg Dev / QA Cycles', commonScales);

      const el8 = document.getElementById(ids.defects);
      if (el8) new Chart(el8, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { type: 'bar', label: 'Defects', data: entries.map(e => e.metrics.totalDefects), backgroundColor: colors[0], yAxisID: 'y' },
            {
              type: 'line', label: 'Defects / Ticket',
              data: entries.map(e => e.metrics.totalTickets > 0 ? +(e.metrics.totalDefects / e.metrics.totalTickets).toFixed(2) : 0),
              borderColor: colors[3], backgroundColor: colors[3], yAxisID: 'y1', tension: 0.25,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: { title: { display: true, text: 'Defects per Sprint', color: axisColor } },
          scales: {
            x: { ticks: { color: axisColor } },
            y: { position: 'left', beginAtZero: true, ticks: { color: axisColor } },
            y1: { position: 'right', beginAtZero: true, ticks: { color: axisColor }, grid: { drawOnChartArea: false } },
          },
        },
      });
    }

    function getTicketColumns(swimlaneLabels) {
      const columns = [
        { key: 'key', label: 'Key', type: 'text', get: t => t.key },
        { key: 'type', label: 'Type', type: 'text', get: t => t.issueType },
        { key: 'summary', label: 'Summary', type: 'text', get: t => t.summary, fmt: v => v.substring(0, 50) },
        { key: 'assignee', label: 'Assignee', type: 'text', get: t => t.assignee || '', fmt: v => v || '-' },
        { key: 'qa', label: 'QA', type: 'text', get: t => (t.qaAssignees || []).join(', '), fmt: v => v || '-' },
        {
          key: 'status', label: 'Status', type: 'text', get: t => t.currentStatus,
          cellClass: v => v === 'Done' ? 'text-green' : (v === 'QA Failed' || v === 'PO Review Failed') ? 'text-red' : 'text-yellow',
        },
        {
          key: 'turnaround', label: 'Turnaround', type: 'number',
          get: t => t.lifetimeTurnaroundMs ? t.lifetimeTurnaroundMs / 3600000 : null,
          fmt: v => v == null ? '-' : formatMs(v * 3600000),
        },
        {
          key: 'devCycles', label: 'Dev Cy', type: 'number', get: t => t.devCycles,
          cellClass: v => v === 0 ? 'text-dim' : v > 1 ? 'text-red' : 'text-yellow',
        },
        {
          key: 'qaCycles', label: 'QA Cy', type: 'number', get: t => t.qaCycles,
          cellClass: v => v === 0 ? 'text-dim' : v > 1 ? 'text-red' : 'text-yellow',
        },
        { key: 'defects', label: 'Defects', type: 'number', get: t => t.linkedDefects },
        { key: 'sp', label: 'SP', type: 'number', get: t => t.storyPoints ?? null, fmt: v => v == null ? '-' : v },
        {
          key: 'sprints', label: 'Sprints', type: 'number', get: t => t.sprintCount, raw: true,
          fmt: v => v > 1 ? '<strong class="text-yellow">' + v + '</strong>' : '1',
        },
      ];

      swimlaneLabels.forEach(s => {
        columns.push({
          key: 'sw_' + s, label: s, type: 'number',
          get: t => {
            const st = t.sprintSwimlaneTimes.find(entry => entry.swimlane === s);
            return st && st.totalMs ? st.totalMs / 3600000 : null;
          },
          fmt: v => v == null ? '-' : formatMs(v * 3600000),
        });
      });

      return columns;
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

    function renderTicketRows(tableId) {
      const state = ticketTables[tableId];
      if (!state) return;
      const { tickets, columns, sortKey, sortDir, filters } = state;

      let rows = tickets.filter(t => columns.every(c => {
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

      const body = document.getElementById(tableId + '-body');
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
        const arrow = document.getElementById(tableId + '-arrow-' + c.key);
        if (arrow) arrow.textContent = sortKey === c.key ? (sortDir === 1 ? ' ▲' : ' ▼') : '';
      });
    }

    function sortTicketTable(tableId, key) {
      const state = ticketTables[tableId];
      if (!state) return;
      if (state.sortKey === key) {
        state.sortDir = -state.sortDir;
      } else {
        state.sortKey = key;
        state.sortDir = 1;
      }
      renderTicketRows(tableId);
    }

    function filterTicketTable(tableId, key, value) {
      const state = ticketTables[tableId];
      if (!state) return;
      state.filters[key] = value;
      renderTicketRows(tableId);
    }

    function statCard(label, value) {
      return '<div class="stat-card"><div class="label">' + label + '</div><div class="value">' + value + '</div></div>';
    }

    function formatMs(ms) {
      const hours = ms / 3600000;
      if (hours < 1) return Math.round(ms / 60000) + 'm';
      if (hours < 24) return hours.toFixed(1) + 'h';
      return (hours / 24).toFixed(1) + 'd';
    }

    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  </script>
</body>
</html>`;
}
