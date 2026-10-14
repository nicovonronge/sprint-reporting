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

    .sprint-list { display: flex; flex-direction: column; gap: 0.5rem; max-height: calc(100vh - 22rem); min-height: 8rem; overflow-y: auto; padding-right: 0.25rem; }
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
    .action-card.disabled { cursor: not-allowed; opacity: 0.45; }
    .action-card.disabled:hover { border-color: #334155; background: #1e293b; }

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
    .spinner.spinner-sm { width: 18px; height: 18px; border-width: 3px; margin: 0; flex-shrink: 0; }
    .loading-hint { display: flex; align-items: center; gap: 0.6rem; color: #94a3b8; padding: 0.5rem 0; }
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
    .table-scroll { overflow: auto; border-radius: 8px; }
    .table-scroll.limited thead tr:first-child th { position: sticky; top: 0; z-index: 2; }
    .table-scroll.limited thead tr.filter-row-inline th { position: sticky; top: var(--hdr1, 2rem); z-index: 2; }
    .ticket-toolbar { display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
    .ticket-toolbar .col-chooser { margin-bottom: 0; }
    .ticket-toolbar select { background: #334155; color: #e2e8f0; border: 1px solid #475569; border-radius: 6px; padding: 0.25rem 0.5rem; font-size: 0.8rem; }
    .ticket-toolbar label, .ticket-count { font-size: 0.8rem; color: #94a3b8; }
    .table-scroll table { width: max-content; min-width: 100%; overflow: visible; }
    .table-scroll td { white-space: nowrap; }
    .col-chooser { position: relative; display: inline-block; margin-bottom: 0.5rem; }
    .col-chooser summary { cursor: pointer; background: #334155; color: #e2e8f0; border-radius: 6px; padding: 0.3rem 0.7rem; font-size: 0.8rem; list-style: none; user-select: none; }
    .col-chooser summary::-webkit-details-marker { display: none; }
    .col-menu { position: absolute; z-index: 20; top: 2rem; left: 0; background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 0.6rem; width: 260px; max-height: 340px; overflow-y: auto; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
    .col-menu label { display: flex; gap: 0.5rem; align-items: center; padding: 0.15rem 0; font-size: 0.8rem; color: #e2e8f0; cursor: pointer; }
    .col-menu .col-actions { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
    .col-menu .col-actions button { background: #334155; color: #e2e8f0; border: none; border-radius: 4px; padding: 0.2rem 0.5rem; font-size: 0.75rem; cursor: pointer; }
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

    .people-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-top: 1rem; }
    .people-controls select {
      background: #1e293b; border: 1px solid #334155; border-radius: 6px; padding: 0.6rem 0.8rem;
      color: #e2e8f0; font-size: 0.9rem; width: 100%;
    }
    .people-controls label { display: block; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 0.3rem; }
    .report-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin: 0.5rem 0; }
    .people-note { color: #64748b; font-size: 0.8rem; margin: 0.5rem 0 1rem; line-height: 1.5; }
    tr.lane-context td { color: #64748b; }
    .delta-good { color: #4ade80; }
    .delta-bad { color: #f87171; }
    .print-only { display: none; }
    .bulk-box { margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid #334155; }
    .bulk-box h4 { font-size: 0.95rem; margin-bottom: 0.25rem; }
    .bulk-list { max-height: 14rem; overflow-y: auto; border: 1px solid #334155; border-radius: 6px; padding: 0.4rem 0.6rem; margin: 0.5rem 0; }
    .bulk-list label { display: flex; gap: 0.5rem; align-items: center; padding: 0.15rem 0; font-size: 0.88rem; cursor: pointer; }

    .info-btn {
      position: fixed; top: 1rem; right: 1rem; z-index: 50; height: 34px; padding: 0 0.9rem; border-radius: 17px;
      background: #334155; color: #e2e8f0; border: 2px solid #475569; font-weight: 600;
      font-size: 0.85rem; cursor: pointer;
    }
    .info-btn:hover, .info-btn.open { background: #3b82f6; border-color: #3b82f6; }
    .info-panel {
      display: none; position: fixed; top: 0; right: 0; bottom: 0; width: min(520px, 100vw); z-index: 40;
      background: #0f172a; border-left: 1px solid #334155; padding: 4rem 1.5rem 2rem; overflow-y: auto;
      box-shadow: -8px 0 24px rgba(0,0,0,0.5); line-height: 1.55;
    }
    .info-panel.open { display: block; }
    .info-panel h2 { margin-top: 0; }
    .info-panel h3 { font-size: 1rem; margin: 1.25rem 0 0.4rem; color: #e2e8f0; }
    .info-panel p.intro { color: #94a3b8; font-size: 0.9rem; }
    .info-panel ul { margin-left: 1.1rem; color: #cbd5e1; font-size: 0.88rem; }
    .info-panel li { margin-bottom: 0.35rem; }
    .info-panel .field-name { font-family: monospace; color: #93c5fd; }

    @media print {
      body { background: #fff; color: #111; }
      .container { max-width: none; padding: 0; }
      .header, .wizard, .progress, .back-link, .no-print, .col-chooser { display: none !important; }
      .print-only { display: block; }
      .info-btn { display: none; }
      .info-panel { position: static; width: auto; box-shadow: none; border: 1px solid #ccc; background: #fff; padding: 1rem; margin-top: 1.5rem; break-before: page; }
      .info-panel h3, .info-panel ul, .info-panel p.intro { color: #111; }
      .info-panel .field-name { color: #111; }
      h2, h3 { color: #111; border-color: #ccc; }
      .stat-card, table, .analysis-box { background: #fff; border: 1px solid #ccc; color: #111; }
      .stat-card .label, .people-note, .text-dim, tr.lane-context td { color: #555; }
      th { background: #eee; color: #111; }
      td { border-color: #ddd; }
      tr:hover td { background: transparent; }
      .table-scroll { overflow: visible; max-height: none !important; }
      .delta-good { color: #15803d; }
      .delta-bad { color: #b91c1c; }
      .people-section { break-inside: avoid; }
      .print-page + .print-page { break-before: page; }
    }

    @media (max-width: 768px) {
      .chart-grid, .action-grid, .filter-row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <button class="info-btn" id="info-btn" title="What does this data mean?" onclick="toggleInfo()">&#9432; Info</button>
  <div class="info-panel" id="info-panel"></div>
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
        <div class="compare-entry" style="margin-top:0.75rem;padding-top:0.75rem">
          <a id="people-entry-link" onclick="togglePeopleFlow()">&#128100; People Report — review how one person did across several sprints</a>
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

      <!-- People Report: choose the sprints (the KPI period) -->
      <div class="step" id="step-people-sprints">
        <div class="step-label">People Report — Select the Sprints to Review</div>
        <div class="sprint-list" id="people-sprint-list"></div>
        <div class="hint">Pick every sprint in the review period. Sprints that haven't been fetched yet can be fetched for you.</div>
        <div class="people-controls">
          <div><label for="people-mode">Report on</label>
            <select id="people-mode" onchange="togglePeopleMode()">
              <option value="sprints">All of each selected sprint</option>
              <option value="dateRange">A date range (from – to)</option>
            </select></div>
          <div id="people-dates" style="display:none">
            <label>From / to (inclusive, UTC)</label>
            <div style="display:flex;gap:0.5rem">
              <input type="date" id="people-from" onchange="updatePeopleNext()">
              <input type="date" id="people-to" onchange="updatePeopleNext()">
            </div>
            <label style="margin-top:0.6rem">Previous period, optional (for "versus last period")</label>
            <div style="display:flex;gap:0.5rem">
              <input type="date" id="people-prev-from">
              <input type="date" id="people-prev-to">
            </div></div>
        </div>
        <div class="hint" id="people-mode-hint" style="display:none">Tickets are taken from the selected sprints, so select every sprint that overlaps your dates. Status, assignee, points, cycles and lane time are all worked out as at the "to" date; only activity inside the dates counts.</div>
        <div class="btn-row">
          <button class="btn btn-secondary" onclick="backToTeamFromPeople()">Back</button>
          <button class="btn" id="btn-people-next" disabled onclick="peopleSprintsNext()">Next</button>
        </div>
      </div>

      <!-- People Report: choose the person and role -->
      <div class="step" id="step-people-person">
        <div class="step-label">People Report — Select Person and Role</div>
        <div class="people-controls">
          <div><label for="people-role">Role</label>
            <select id="people-role" onchange="renderPeopleOptions()">
              <option value="dev">Developer (assignee)</option>
              <option value="qa">QA (QA assignee)</option>
            </select></div>
          <div><label for="people-person">Person</label>
            <select id="people-person" onchange="document.getElementById('btn-people-generate').disabled = !this.value"></select></div>
        </div>
        <div class="hint" id="people-person-hint"></div>
        <div class="bulk-box">
          <h4>Or download for several people at once</h4>
          <div class="hint" style="margin:0">Uses the role, sprints and dates chosen above. Nothing is fetched from Jira.</div>
          <div class="bulk-list" id="people-bulk-list"></div>
          <div class="people-controls">
            <div><label for="people-bulk-format">Format</label>
              <select id="people-bulk-format">
                <option value="zip">ZIP: one JSON per person + summary.csv + tickets.csv</option>
                <option value="csv">One summary CSV (opens in Excel)</option>
                <option value="print">Combined print pack (one person per page, print / save as PDF)</option>
              </select></div>
          </div>
          <div class="btn-row">
            <button class="btn btn-secondary" id="btn-people-bulk" disabled onclick="downloadPeopleBulk()">Download selected</button>
          </div>
        </div>
        <div class="btn-row">
          <button class="btn btn-secondary" onclick="goStep('step-people-sprints')">Back</button>
          <button class="btn" id="btn-people-generate" disabled onclick="generatePeopleReport()">Generate Report</button>
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
          <div class="action-card" id="action-analyze" onclick="selectAction('analyze')">
            <div class="icon">&#129302;</div>
            <div class="title">AI Analysis</div>
            <div class="desc" id="action-analyze-desc">Claude insights & recommendations</div>
          </div>
          <div class="action-card" id="action-full" onclick="selectAction('full')">
            <div class="icon">&#9889;</div>
            <div class="title">Full Pipeline</div>
            <div class="desc" id="action-full-desc">Fetch + Report + Analysis</div>
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
    let state = { team: null, sprints: [], action: null, flow: 'wizard', compareSprints: [], peopleSprints: [], peopleOptions: null, peopleReport: null, infoKind: 'general', exportRequest: null, appConfig: { githubEnabled: true, claudeEnabled: true } };
    const guideCache = {};
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

    // Load optional-integration availability and disable features that aren't configured
    fetch('/api/config').then(r => r.json()).then(cfg => {
      state.appConfig = cfg;
      if (!cfg.claudeEnabled) {
        document.getElementById('action-analyze').classList.add('disabled');
        document.getElementById('action-analyze-desc').textContent = 'Unavailable — set CLAUDE_CODE_OAUTH_TOKEN';
        document.getElementById('action-full-desc').textContent = 'Fetch + Report only — set CLAUDE_CODE_OAUTH_TOKEN for AI analysis';
      }
    }).catch(() => {});

    // "i" panel: plain-language explanation of the data for whichever page is showing.
    // state.infoKind is 'general' in the wizard and is set to sprint/comparison/people on results.
    function setInfoKind(kind) {
      state.infoKind = kind;
      if (document.getElementById('info-panel').classList.contains('open')) renderInfo();
    }

    function toggleInfo() {
      const panel = document.getElementById('info-panel');
      const open = !panel.classList.contains('open');
      panel.classList.toggle('open', open);
      document.getElementById('info-btn').classList.toggle('open', open);
      if (open) renderInfo();
    }

    async function renderInfo() {
      const panel = document.getElementById('info-panel');
      const kind = state.infoKind || 'general';
      panel.innerHTML = '<div class="loading-hint"><div class="spinner spinner-sm"></div>Loading...</div>';
      try {
        if (!guideCache[kind]) {
          const res = await fetch('/api/data-guide/' + kind);
          if (!res.ok) throw new Error('Could not load the guide');
          guideCache[kind] = await res.json();
        }
        const g = guideCache[kind];
        let html = '<h2>' + escapeHtml(g.title) + '</h2><p class="intro">' + escapeHtml(g.intro) + '</p>';
        g.sections.forEach(sec => {
          html += '<h3>' + escapeHtml(sec.title) + '</h3><ul>'
            + sec.points.map(p => '<li>' + escapeHtml(p) + '</li>').join('') + '</ul>';
        });
        if (g.fields) {
          html += '<h3>Exported fields</h3><ul>'
            + Object.entries(g.fields).map(([k, v]) => '<li><span class="field-name">' + escapeHtml(k) + '</span> — ' + escapeHtml(v) + '</li>').join('')
            + '</ul>';
        }
        panel.innerHTML = html;
      } catch (err) {
        panel.innerHTML = '<div style="color:#f87171">' + escapeHtml(err.message) + '</div>';
      }
    }

    // JSON export of the report on screen. state.exportRequest says which endpoint and what to send;
    // the server builds the file (data plus an info block explaining it).
    function exportBar() {
      const req = state.exportRequest;
      const bulk = req && req.url === '/api/export/sprint-report' && req.body.sprintNames.length > 1;
      return '<div class="report-actions no-print"><button class="btn btn-secondary" onclick="downloadExport()">&#11015; Export JSON</button>'
        + (bulk ? '<button class="btn btn-secondary" onclick="downloadSprintBulk()" title="One JSON file per sprint plus a one-row-per-sprint CSV">&#11015; All sprints (ZIP)</button>' : '')
        + '<button class="btn" onclick="window.print()" title="Prints every report on the page, one sprint per page">&#128424; Print / Save as PDF</button></div>';
    }

    // Saves a fetch Response (zip/csv) using the file name the server chose.
    async function saveResponse(res, fallbackName) {
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const match = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') || '');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await res.blob());
      a.download = match ? match[1] : fallbackName;
      a.click();
      URL.revokeObjectURL(a.href);
    }

    async function downloadSprintBulk() {
      const req = state.exportRequest;
      if (!req) return;
      try {
        await saveResponse(await fetch('/api/export/sprint-report/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req.body),
        }), 'sprint-reports.zip');
      } catch (err) {
        alert('Download failed: ' + err.message);
      }
    }

    async function downloadExport() {
      const req = state.exportRequest;
      if (!req) return;
      try {
        const res = await fetch(req.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req.body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (req.name + '_' + new Date().toISOString().slice(0, 10)).replace(/[^a-zA-Z0-9_.-]+/g, '_') + '.json';
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (err) {
        alert('Export failed: ' + err.message);
      }
    }

    function goStep(id) {
      document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
      document.getElementById(id).classList.add('active');
    }

    function selectTeam(key, name) {
      state.team = key;
      if (state.flow === 'compare') {
        goStep('step-compare-sprints');
        loadComparisonSprints(key);
      } else if (state.flow === 'people') {
        goStep('step-people-sprints');
        loadPeopleSprints(key);
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

    function togglePeopleFlow() {
      state.flow = state.flow === 'people' ? 'wizard' : 'people';
      state.peopleSprints = [];
      updateCompareEntryUI();
    }

    function updateCompareEntryUI() {
      const label = document.getElementById('step-team-label');
      const link = document.getElementById('compare-entry-link');
      const peopleLink = document.getElementById('people-entry-link');
      link.parentElement.style.display = state.flow === 'people' ? 'none' : '';
      peopleLink.parentElement.style.display = state.flow === 'compare' ? 'none' : '';
      if (state.flow === 'compare') {
        label.textContent = 'Sprint Comparison Report — Select a Team';
        link.textContent = "✕ Cancel comparison mode (back to normal report)";
      } else if (state.flow === 'people') {
        label.textContent = 'People Report — Select a Team';
        peopleLink.textContent = "✕ Cancel people report (back to normal report)";
      } else {
        label.textContent = 'Step 1 of 4 — Select Team';
        link.textContent = "📈 Sprint Comparison Report — compare trends across sprints you've already downloaded";
        peopleLink.textContent = "👤 People Report — review how one person did across several sprints";
      }
    }

    function backToTeamFromPeople() {
      state.flow = 'wizard';
      state.peopleSprints = [];
      updateCompareEntryUI();
      goStep('step-team');
    }

    // People report step 1: pick the sprints. Shows Jira's sprint list with a Cached badge so
    // it's clear what still needs fetching.
    function loadPeopleSprints(projectKey) {
      const list = document.getElementById('people-sprint-list');
      state.peopleSprints = [];
      document.getElementById('btn-people-next').disabled = true;
      list.innerHTML = '<div class="loading-hint"><div class="spinner spinner-sm"></div>Loading sprints...</div>';

      fetch('/api/sprints/' + projectKey).then(r => r.json()).then(sprints => {
        if (!Array.isArray(sprints)) throw new Error(sprints.error || 'Could not load sprints');
        list.innerHTML = '';
        // Only sprints that have started can have anything to report on.
        sprints.filter(s => s.state !== 'future').forEach(s => {
          const item = document.createElement('div');
          item.className = 'sprint-item';
          const badgeClass = s.state === 'active' ? 'badge-active' : 'badge-closed';
          const dates = s.startDate ? new Date(s.startDate).toLocaleDateString() + ' - ' + (s.endDate ? new Date(s.endDate).toLocaleDateString() : '?') : '';
          const cachedBadge = s.cachedAt
            ? '<span class="badge badge-cached" title="Fetched ' + new Date(s.cachedAt).toLocaleString() + '">&#10003; Cached</span>'
            : '<span class="badge badge-future">Not fetched</span>';
          item.innerHTML = '<input type="checkbox" />'
            + '<div class="sprint-name">' + escapeHtml(s.name) + '</div>'
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
              state.peopleSprints.push(s.name);
            } else {
              item.classList.remove('selected');
              state.peopleSprints = state.peopleSprints.filter(n => n !== s.name);
            }
            updatePeopleNext();
          });
          list.appendChild(item);
        });
      }).catch(err => {
        list.innerHTML = '<div style="color:#f87171">Error: ' + escapeHtml(err.message) + '</div>';
      });
    }

    // The custom window, or undefined when reporting on whole sprints.
    function peoplePeriod() {
      if (document.getElementById('people-mode').value !== 'dateRange') return undefined;
      return { from: document.getElementById('people-from').value, to: document.getElementById('people-to').value };
    }

    // Optional earlier range to compare against; only used with a date range.
    function peoplePreviousPeriod() {
      if (!peoplePeriod()) return undefined;
      const from = document.getElementById('people-prev-from').value, to = document.getElementById('people-prev-to').value;
      return from && to ? { from, to } : undefined;
    }

    function peopleNextReady() {
      if (state.peopleSprints.length === 0) return false;
      const p = peoplePeriod();
      return !p || (!!p.from && !!p.to && p.from <= p.to);
    }

    function updatePeopleNext() {
      document.getElementById('btn-people-next').disabled = !peopleNextReady();
    }

    function togglePeopleMode() {
      const range = document.getElementById('people-mode').value === 'dateRange';
      document.getElementById('people-dates').style.display = range ? '' : 'none';
      document.getElementById('people-mode-hint').style.display = range ? '' : 'none';
      updatePeopleNext();
    }

    async function fetchPeopleOptions() {
      const res = await fetch('/api/people/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectKey: state.team, sprintNames: state.peopleSprints, period: peoplePeriod() }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    }

    // Checks what's been fetched; offers to fetch the rest before moving on.
    async function peopleSprintsNext() {
      const btn = document.getElementById('btn-people-next');
      btn.disabled = true;
      try {
        let options = await fetchPeopleOptions();
        if (options.missing.length > 0) {
          const ok = confirm(options.missing.length + ' of the selected sprint(s) have not been fetched yet:\\n\\n'
            + options.missing.join('\\n') + '\\n\\nFetch them now? This can take a few minutes.');
          if (!ok) { btn.disabled = false; return; }
          showProgress('Fetching ' + options.missing.length + ' sprint(s) from Jira...');
          const res = await fetch('/api/fetch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectKey: state.team, sprintNames: options.missing }),
          });
          if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
          options = await fetchPeopleOptions();
          hideProgress();
          document.getElementById('wizard').style.display = '';
        }
        state.peopleOptions = options;
        renderPeopleOptions();
        goStep('step-people-person');
      } catch (err) {
        hideProgress();
        document.getElementById('wizard').style.display = '';
        alert('Error: ' + err.message);
      }
      btn.disabled = !peopleNextReady();
    }

    function renderPeopleOptions() {
      const role = document.getElementById('people-role').value;
      const people = (state.peopleOptions && state.peopleOptions[role]) || [];
      const select = document.getElementById('people-person');
      select.innerHTML = '<option value="">Select a person...</option>'
        + people.map(p => '<option value="' + escapeHtml(p.name) + '">' + escapeHtml(p.name) + ' (' + p.tickets + ' tickets)</option>').join('');
      document.getElementById('btn-people-generate').disabled = true;
      renderBulkPeople(people);
      document.getElementById('people-person-hint').textContent = people.length === 0
        ? 'Nobody is recorded in this role for the selected sprints.'
        : (peoplePeriod() ? 'Ticket counts are for the chosen dates.' : 'Ticket counts are across the selected sprints.');
    }

    // Checklist for bulk download: a "select all" row, then one row per person in the chosen role.
    function renderBulkPeople(people) {
      const list = document.getElementById('people-bulk-list');
      if (people.length === 0) {
        list.innerHTML = '<span class="text-dim">Nobody in this role.</span>';
      } else {
        list.innerHTML = '<label><input type="checkbox" id="people-bulk-all" onchange="toggleBulkAll(this.checked)"> <strong>Select all (' + people.length + ')</strong></label>'
          + people.map(p => '<label><input type="checkbox" class="people-bulk-item" value="' + escapeHtml(p.name) + '" onchange="updateBulkButton()"> '
            + escapeHtml(p.name) + ' <span class="text-dim">(' + p.tickets + ' tickets)</span></label>').join('');
      }
      updateBulkButton();
    }

    function selectedBulkPeople() {
      return [...document.querySelectorAll('.people-bulk-item:checked')].map(cb => cb.value);
    }

    function toggleBulkAll(checked) {
      document.querySelectorAll('.people-bulk-item').forEach(cb => { cb.checked = checked; });
      updateBulkButton();
    }

    function updateBulkButton() {
      const n = selectedBulkPeople().length;
      const all = document.getElementById('people-bulk-all');
      if (all) all.checked = n > 0 && n === document.querySelectorAll('.people-bulk-item').length;
      const btn = document.getElementById('btn-people-bulk');
      btn.disabled = n === 0;
      btn.textContent = n === 0 ? 'Download selected' : 'Download ' + n + ' selected';
    }

    async function downloadPeopleBulk() {
      const people = selectedBulkPeople();
      const format = document.getElementById('people-bulk-format').value;
      if (people.length === 0) return;
      const body = {
        projectKey: state.team, sprintNames: state.peopleSprints, people,
        role: document.getElementById('people-role').value,
        period: peoplePeriod(), previousPeriod: peoplePreviousPeriod(),
        format: format === 'print' ? 'json' : format,
      };
      showProgress('Building reports for ' + people.length + ' people...');
      try {
        const res = await fetch('/api/people/report/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (format !== 'print') {
          await saveResponse(res, 'people-reports.' + format);
          hideProgress();
          if (format === 'zip' || format === 'csv') {
            alert('Downloaded ' + people.length + ' report(s). Times in the CSV files are business hours.');
          }
          return;
        }
        if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
        const data = await res.json();
        hideProgress();
        showPeoplePrintPack(data);
      } catch (err) {
        hideProgress();
        alert('Bulk download failed: ' + err.message);
      }
    }

    // All selected people on one page, one person per printed page.
    function showPeoplePrintPack(data) {
      setInfoKind('people');
      let html = '<div class="report-actions no-print">'
        + '<button class="btn btn-secondary" onclick="reset()">New report</button>'
        + '<button class="btn" onclick="window.print()">&#128424; Print / Save as PDF (' + data.reports.length + ' reports)</button></div>';
      if (data.skipped.length > 0) {
        html += '<p class="people-note no-print">Skipped: ' + data.skipped.map(s => escapeHtml(s.person + ' (' + s.reason + ')')).join('; ') + '</p>';
      }
      html += data.reports.map(r => '<div class="print-page">' + renderPeopleReport(r, { noActions: true }) + '</div>').join('');
      showResults(html);
    }

    async function generatePeopleReport() {
      const person = document.getElementById('people-person').value;
      const role = document.getElementById('people-role').value;
      showProgress('Building people report...');
      try {
        const res = await fetch('/api/people/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectKey: state.team, sprintNames: state.peopleSprints, person, role, period: peoplePeriod(), previousPeriod: peoplePreviousPeriod() }),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
        state.peopleReport = await res.json();
        hideProgress();
        setInfoKind('people');
        showResults(renderPeopleReport(state.peopleReport));
      } catch (err) {
        hideProgress();
        showResults('<div style="text-align:center;padding:3rem;color:#f87171"><h2>Error</h2><p>' + escapeHtml(err.message) + '</p><button class="btn btn-secondary" onclick="reset()" style="margin-top:1rem">Try Again</button></div>');
      }
    }

    function downloadPeopleReport() {
      const r = state.peopleReport;
      if (!r) return;
      const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = ('people-report_' + r.projectKey + '_' + r.person + '_' + r.role).replace(/[^a-zA-Z0-9_.-]+/g, '_') + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
    }

    // Relative difference vs the team, coloured by whether lower is better.
    function deltaVsTeam(person, team, lowerIsBetter) {
      if (person == null || team == null || team === 0) return '<span class="text-dim">-</span>';
      const pct = Math.round(((person - team) / team) * 100);
      if (pct === 0) return '<span class="text-dim">in line</span>';
      const good = lowerIsBetter ? pct < 0 : pct > 0;
      return '<span class="' + (good ? 'delta-good' : 'delta-bad') + '">' + (pct > 0 ? '+' : '') + pct + '%</span>';
    }

    function renderPeopleReport(r, opts) {
      opts = opts || {};
      const roleLabel = r.role === 'dev' ? 'Developer' : 'QA';
      const cycleLabel = r.role === 'dev' ? 'Dev cycles (QA Failed)' : 'QA cycles (PO Review Failed)';
      const s = r.summary, t = r.team;
      const fmt = ms => ms == null ? 'N/A' : formatMs(ms);
      const pct = v => v == null ? 'N/A' : Math.round(v * 100) + '%';
      const sprintNames = r.sprints.map(x => escapeHtml(x.sprintName));
      const first = r.sprints[0], last = r.sprints[r.sprints.length - 1];
      const byDate = r.mode === 'dateRange' && r.period;
      const range = byDate
        ? r.period.from + ' to ' + r.period.to
        : first
          ? new Date(first.sprintStartDate).toLocaleDateString() + ' – ' + new Date(last.sprintEndDate || last.sprintStartDate).toLocaleDateString()
          : '';

      let html = opts.noActions ? '' : '<div class="report-actions no-print">'
        + '<button class="btn btn-secondary" onclick="downloadPeopleReport()">&#11015; Export JSON</button>'
        + '<button class="btn" onclick="window.print()">&#128424; Print / Save as PDF</button></div>';

      html += '<h2 style="margin-top:0.5rem">' + escapeHtml(r.person) + ' — ' + roleLabel + ' performance review</h2>';
      html += '<p style="color:#94a3b8;margin-bottom:0.5rem">' + escapeHtml(r.projectKey) + ' &middot; '
        + (byDate
          ? range + ' (tickets from ' + r.sprints.length + ' sprint(s): ' + sprintNames.join(', ') + ')'
          : r.sprints.length + ' sprint(s): ' + sprintNames.join(', ') + (range ? ' (' + range + ')' : '')) + '</p>';
      html += '<p class="print-only" style="margin-bottom:0.5rem">Generated ' + new Date(r.generatedAt).toLocaleString() + '</p>';
      const who = r.role === 'dev' ? 'assignee' : 'QA assignee';
      html += '<p class="people-note">' + (byDate
        ? 'Everything is measured as at the end of ' + r.period.to + '. A ticket is credited to this person when they are the assignee or a QA assignee on that date (' + who + ' is the role being reviewed), and only tickets with activity between ' + r.period.from + ' and ' + r.period.to + ' are included. Status, points, cycles and time in lane are as at that date; '
        : 'Each ticket is credited to this person in a sprint when they are the assignee or a QA assignee at that sprint\\'s end (' + who + ' is the role being reviewed). Cycles and time in lane only count activity inside each selected sprint; ')
        + 'only Mon-Fri 08:00-17:00 UTC counts. '
        + 'Linked defects are lifetime counts for the ticket. Treat small ticket counts with caution.</p>';

      html += '<div class="people-section"><h3>Headline numbers</h3><div class="summary-grid">';
      html += statCard('Tickets', s.tickets + ' <span class="text-dim" style="font-size:0.8rem">(team ' + t.tickets + ')</span>');
      html += statCard('Completed', s.completed + ' / ' + s.tickets);
      html += statCard('Story points', s.storyPoints + ' <span class="text-dim" style="font-size:0.8rem">(' + s.completedStoryPoints + ' done)</span>');
      html += statCard('Avg turnaround', fmt(s.avgTurnaroundMs));
      html += statCard('Median turnaround', fmt(s.medianTurnaroundMs));
      html += statCard(cycleLabel, s.totalCycles + ' <span class="text-dim" style="font-size:0.8rem">(' + s.avgCyclesPerTicket.toFixed(2) + ' / ticket)</span>');
      html += statCard('No-rework tickets', pct(s.reworkFreeRate) + ' <span class="text-dim" style="font-size:0.8rem">(' + s.ticketsWithoutRework + ')</span>');
      html += statCard('Linked defects', s.linkedDefects);
      html += statCard('Dev SP / QA SP', s.devStoryPoints + ' / ' + s.qaStoryPoints + ' <span class="text-dim" style="font-size:0.8rem">(' + s.completedDevStoryPoints + ' / ' + s.completedQaStoryPoints + ' done)</span>');
      html += statCard('Credited as', s.ticketsAsAssignee + ' assignee, ' + s.ticketsAsQaAssignee + ' QA');
      html += statCard('No activity in period', s.ticketsWithNoActivity);
      html += '</div></div>';

      if (r.previousPeriod) {
        const p = r.previousPeriod, ps = p.summary;
        html += '<div class="people-section"><h3>Versus previous period (' + p.period.from + ' to ' + p.period.to + ')</h3>';
        if (!ps) {
          html += '<p class="people-note">No fetched sprint overlaps that period. Fetch the sprints it covers and generate again.</p>';
        } else {
          html += '<p class="people-note">Tickets came from: ' + p.sprintsUsed.map(escapeHtml).join(', ') + '. Make sure every sprint overlapping the previous dates is fetched.</p>'
            + '<table><thead><tr><th>Measure</th><th>Now</th><th>Previous</th><th>Change</th></tr></thead><tbody>';
          const cmpPrev = (label, a, b, text, lowerIsBetter) => {
            html += '<tr><td>' + label + '</td><td>' + text(a) + '</td><td>' + text(b) + '</td><td>' + deltaVsTeam(a, b, lowerIsBetter) + '</td></tr>';
          };
          cmpPrev('Tickets', s.tickets, ps.tickets, v => v, false);
          cmpPrev('Completed', s.completed, ps.completed, v => v, false);
          cmpPrev('Story points', s.storyPoints, ps.storyPoints, v => v, false);
          cmpPrev('Avg turnaround', s.avgTurnaroundMs, ps.avgTurnaroundMs, fmt, true);
          cmpPrev('Cycles per ticket', s.avgCyclesPerTicket, ps.avgCyclesPerTicket, v => v.toFixed(2), true);
          cmpPrev('No-rework tickets', s.reworkFreeRate, ps.reworkFreeRate, pct, false);
          html += '</tbody></table>';
        }
        html += '</div>';
      }

      html += '<div class="people-section"><h3>Compared with the team</h3><table><thead><tr><th>Measure</th><th>' + escapeHtml(r.person) + '</th><th>Team</th><th>Difference</th></tr></thead><tbody>';
      const cmp = (label, a, b, text, lowerIsBetter) => {
        html += '<tr><td>' + label + '</td><td>' + text(a) + '</td><td>' + text(b) + '</td><td>' + deltaVsTeam(a, b, lowerIsBetter) + '</td></tr>';
      };
      cmp('Avg turnaround', s.avgTurnaroundMs, t.avgTurnaroundMs, fmt, true);
      cmp('Median turnaround', s.medianTurnaroundMs, t.medianTurnaroundMs, fmt, true);
      cmp('Cycles per ticket', s.avgCyclesPerTicket, t.avgCyclesPerTicket, v => v.toFixed(2), true);
      cmp('No-rework tickets', s.reworkFreeRate, t.reworkFreeRate, pct, false);
      html += '</tbody></table></div>';

      html += '<div class="people-section"><h3>Time in lane</h3>'
        + '<p class="people-note">Lanes this role controls are shown first; greyed lanes are context only (' + (r.role === 'dev' ? 'e.g. waiting for QA is not in a developer\\'s control' : 'e.g. development time is not in QA\\'s control') + ').</p>'
        + '<table><thead><tr><th>Lane</th><th>Tickets</th><th>Avg</th><th>Median</th><th>Team avg</th><th>Difference</th></tr></thead><tbody>';
      const lanes = s.lanes.slice().sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
      lanes.forEach(l => {
        const tl = t.lanes.find(x => x.swimlane === l.swimlane);
        html += '<tr class="' + (l.primary ? '' : 'lane-context') + '"><td>' + l.swimlane + '</td><td>' + l.tickets + '</td><td>' + formatMs(l.avgMs)
          + '</td><td>' + formatMs(l.medianMs) + '</td><td>' + (tl ? formatMs(tl.avgMs) : '-') + '</td><td>'
          + (l.primary ? deltaVsTeam(l.avgMs, tl && tl.avgMs, true) : '') + '</td></tr>';
      });
      if (lanes.length === 0) html += '<tr><td colspan="6" class="text-dim">No lane time recorded in these sprints.</td></tr>';
      html += '</tbody></table></div>';

      if (r.bySprint.length > 0) {
        html += '<div class="people-section"><h3>By sprint</h3><table><thead><tr><th>Sprint</th><th>Tickets</th><th>Completed</th><th>SP</th><th>Avg turnaround</th><th>Cycles</th><th>No-rework</th></tr></thead><tbody>';
        r.bySprint.forEach(b => {
          const x = b.summary;
          html += '<tr><td>' + escapeHtml(b.sprintName) + '</td><td>' + x.tickets + '</td><td>' + x.completed + '</td><td>' + x.storyPoints
            + '</td><td>' + fmt(x.avgTurnaroundMs) + '</td><td>' + x.totalCycles + '</td><td>' + pct(x.reworkFreeRate) + '</td></tr>';
        });
        html += '</tbody></table></div>';
      }

      html += '<div class="people-section"><h3>By issue type</h3><table><thead><tr><th>Type</th><th>Tickets</th><th>SP</th><th>Avg turnaround</th><th>Avg cycles</th></tr></thead><tbody>';
      r.byIssueType.forEach(b => {
        html += '<tr><td>' + escapeHtml(b.issueType) + '</td><td>' + b.tickets + '</td><td>' + b.storyPoints + '</td><td>' + fmt(b.avgTurnaroundMs)
          + '</td><td>' + b.avgCycles.toFixed(2) + '</td></tr>';
      });
      html += '</tbody></table></div>';

      html += '<h3>Tickets (' + r.tickets.length + ')</h3><div class="table-scroll"><table><thead><tr><th>Key</th><th>Summary</th><th>Type</th><th>Credited</th><th>Sprints</th><th>Status</th><th>Now</th><th>Created</th><th>SP (dev/QA)</th><th>Turnaround</th><th>Cycles</th><th>Defects</th><th>Flags</th></tr></thead><tbody>';
      r.tickets.forEach(tk => {
        const cycles = r.role === 'dev' ? tk.devCycles : tk.qaCycles;
        html += '<tr><td>' + escapeHtml(tk.key) + '</td><td style="white-space:normal;min-width:16rem">' + escapeHtml(tk.summary) + '</td><td>' + escapeHtml(tk.issueType)
          + '</td><td>' + tk.creditedAs.map(c => c === 'assignee' ? 'Assignee' : 'QA').join(' + ')
          + '</td><td>' + tk.sprints.length + (tk.lifetimeSprintCount > tk.sprints.length ? ' (of ' + tk.lifetimeSprintCount + ')' : '')
          + '</td><td>' + escapeHtml(tk.status) + '</td><td>' + escapeHtml(tk.statusNow) + '</td><td>' + tk.created.slice(0, 10)
          + '</td><td>' + (tk.storyPoints == null ? '-' : tk.storyPoints)
          + ' <span class="text-dim">(' + (tk.devStoryPoints == null ? '-' : tk.devStoryPoints) + '/' + (tk.qaStoryPoints == null ? '-' : tk.qaStoryPoints) + ')</span>'
          + '</td><td>' + (tk.turnaroundMs == null ? '-' : formatMs(tk.turnaroundMs)) + '</td><td>' + cycles + '</td><td>' + tk.linkedDefects
          + '</td><td>' + [tk.nextPI ? 'Next PI' : '', tk.noActivityInRange ? 'No activity' : ''].filter(Boolean).join(', ') + '</td></tr>';
      });
      html += '</tbody></table></div>';

      html += '<div class="people-section"><h3>Bugs reported by ' + escapeHtml(r.person) + (r.reportedBugs ? ' (' + r.reportedBugs.length + ')' : '') + '</h3>';
      if (!r.reportedBugs) {
        html += '<p class="people-note">Not available: the selected sprints were fetched before reported bugs were collected. Fetch them again to include this.</p>';
      } else {
        if (!r.reportedBugsComplete) html += '<p class="people-note">Some selected sprints were fetched before reported bugs were collected, so this list may be incomplete. Fetch them again.</p>';
        html += '<div class="table-scroll"><table><thead><tr><th>Key</th><th>Summary</th><th>Created</th><th>Priority</th><th>Status at end</th><th>Status now</th><th>Resolved</th><th>Flags</th></tr></thead><tbody>';
        r.reportedBugs.forEach(b => {
          html += '<tr><td>' + escapeHtml(b.key) + '</td><td style="white-space:normal;min-width:16rem">' + escapeHtml(b.summary) + '</td><td>' + b.created.slice(0, 10)
            + '</td><td>' + escapeHtml(b.priority || '-') + '</td><td>' + escapeHtml(b.statusAtPeriodEnd) + '</td><td>' + escapeHtml(b.statusNow)
            + '</td><td>' + (b.resolved ? b.resolved.slice(0, 10) : '-') + '</td><td>' + (b.nextPI ? 'Next PI' : '') + '</td></tr>';
        });
        if (r.reportedBugs.length === 0) html += '<tr><td colspan="8" class="text-dim">No bugs reported in this period.</td></tr>';
        html += '</tbody></table></div>';
      }
      html += '</div>';

      return html;
    }

    function backToTeamFromCompare() {
      state.flow = 'wizard';
      state.compareSprints = [];
      updateCompareEntryUI();
      goStep('step-team');
    }

    function loadComparisonSprints(projectKey) {
      const list = document.getElementById('compare-sprint-list');
      list.innerHTML = '<div class="loading-hint"><div class="spinner spinner-sm"></div>Loading available sprints...</div>';
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
        setInfoKind('comparison');
        state.exportRequest = {
          url: '/api/export/comparison',
          body: { projectKey: state.team, sprintNames: state.compareSprints },
          name: 'sprint-comparison_' + state.team,
        };
        showResults(exportBar() + renderComparisonReport(data));
      } catch (err) {
        hideProgress();
        showResults('<div style="text-align:center;padding:3rem;color:#f87171"><h2>Error</h2><p>' + escapeHtml(err.message) + '</p><button class="btn btn-secondary" onclick="reset()" style="margin-top:1rem">Try Again</button></div>');
      }
    }

    function loadSprints(projectKey) {
      const list = document.getElementById('sprint-list');
      const nextBtn = document.getElementById('btn-sprint-next');
      state.sprints = [];
      nextBtn.disabled = true;
      list.innerHTML = '<div class="loading-hint"><div class="spinner spinner-sm"></div>Loading available sprints...</div>';

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
      if (action === 'analyze' && !state.appConfig.claudeEnabled) return;
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
            allHtml += '<div class="print-page">' + renderMetrics(metrics) + '</div>';
          }
          hideProgress();
          setInfoKind('sprint');
          state.exportRequest = {
            url: '/api/export/sprint-report',
            body: { projectKey: state.team, sprintNames: state.sprints.slice(), filters },
            name: 'sprint-report_' + state.team,
          };
          showResults(exportBar() + allHtml);
        }

        if ((action === 'analyze' || action === 'full') && !state.appConfig.claudeEnabled) {
          if (action === 'analyze') throw new Error('AI analysis is not configured. Set CLAUDE_CODE_OAUTH_TOKEN to enable it.');
        } else if (action === 'analyze' || action === 'full') {
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
      state = { team: null, sprints: [], action: null, flow: 'wizard', compareSprints: [], peopleSprints: [], peopleOptions: null, peopleReport: null, infoKind: 'general', exportRequest: null, appConfig: state.appConfig };
      updateCompareEntryUI();
      document.getElementById('info-panel').classList.remove('open');
      document.getElementById('info-btn').classList.remove('open');
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
      html += statCard('Avg Turnaround', m.avgTurnaroundMs ? formatMs(m.avgTurnaroundMs) : 'N/A');
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
      ticketTables[ticketTableId] = { tickets: m.ticketMetrics, columns: ticketColumns, sortKey: null, sortDir: 1, filters: {}, hidden: loadHiddenColumns(ticketColumns), visibleRows: 25 };

      html += '<h3>Ticket Details</h3>';
      html += '<div class="ticket-toolbar">' + columnChooserHtml(ticketTableId, ticketColumns)
        + '<label>Visible rows: <select onchange="setTicketVisibleRows(\\'' + ticketTableId + '\\', this.value)">'
        + [10, 25, 50, 100].map(n => '<option value="' + n + '"' + (n === 25 ? ' selected' : '') + '>' + n + '</option>').join('')
        + '<option value="all">All</option></select></label>'
        + '<span class="ticket-count" id="' + ticketTableId + '-count"></span></div>';
      html += '<style id="' + ticketTableId + '-colstyle"></style>';
      html += '<div class="table-scroll limited" id="' + ticketTableId + '-scroll"><table id="' + ticketTableId + '"><thead>';
      html += '<tr>' + ticketColumns.map(c =>
        '<th data-col="' + c.key + '" class="th-sort" onclick="sortTicketTable(\\'' + ticketTableId + '\\',\\'' + c.key + '\\')">'
        + escapeHtml(c.label)
        + '<span class="sort-arrow" id="' + ticketTableId + '-arrow-' + c.key + '"></span></th>'
      ).join('') + '</tr>';
      html += '<tr class="filter-row-inline">' + ticketColumns.map(c =>
        '<th data-col="' + c.key + '"><input class="filter-input" placeholder="' + (c.type === 'number' ? '>5 <10 =3' : 'filter...') + '" '
        + 'oninput="filterTicketTable(\\'' + ticketTableId + '\\',\\'' + c.key + '\\', this.value)" /></th>'
      ).join('') + '</tr>';
      html += '</thead><tbody id="' + ticketTableId + '-body"></tbody></table></div>';
      setTimeout(() => applyColumnVisibility(ticketTableId), 0);

      // Dev summary
      html += '<h3>Developer Summary</h3><table><thead><tr><th>Developer</th><th>Tickets</th><th>Completed</th><th>SP</th><th>Dev Cycles</th></tr></thead><tbody>';
      Object.entries(m.byDeveloper).forEach(([dev, tickets]) => {
        const completed = tickets.filter(t => t.sprintReport.status === 'Done').length;
        const sp = tickets.reduce((s, t) => s + (t.sprintReport.storyPoints || 0), 0);
        const avgCycles = (tickets.reduce((s, t) => s + t.sprintReport.devCycles, 0) / tickets.length).toFixed(1);
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
              { label: 'Dev Cycles', data: m.ticketMetrics.map(t => t.sprintReport.devCycles), backgroundColor: '#f59e0b' },
              { label: 'QA Cycles', data: m.ticketMetrics.map(t => t.sprintReport.qaCycles), backgroundColor: '#ef4444' }
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
          data: entries.map(e => e.metrics.ticketMetrics.filter(t => bucketOf(t.sprintReport.storyPoints) === b).length),
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
          data: entries.map(e => e.metrics.avgTurnaroundMs != null ? +(e.metrics.avgTurnaroundMs / 3600000).toFixed(2) : null),
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
        { key: 'assignee', label: 'Assignee', type: 'text', get: t => t.sprintReport.assignee || '', fmt: v => v || '-' },
        { key: 'qa', label: 'QA', type: 'text', get: t => (t.sprintReport.qaAssignees || []).join(', '), fmt: v => v || '-' },
        {
          key: 'status', label: 'Status', type: 'text', get: t => t.sprintReport.status,
          cellClass: v => v === 'Done' ? 'text-green' : (v === 'QA Failed' || v === 'PO Review Failed') ? 'text-red' : 'text-yellow',
        },
        {
          key: 'turnaround', label: 'Turnaround', type: 'number',
          get: t => t.sprintReport.turnaroundMs ? t.sprintReport.turnaroundMs / 3600000 : null,
          fmt: v => v == null ? '-' : formatMs(v * 3600000),
        },
        {
          key: 'devCycles', label: 'Dev Cy', type: 'number', get: t => t.sprintReport.devCycles,
          cellClass: v => v === 0 ? 'text-dim' : v > 1 ? 'text-red' : 'text-yellow',
        },
        {
          key: 'qaCycles', label: 'QA Cy', type: 'number', get: t => t.sprintReport.qaCycles,
          cellClass: v => v === 0 ? 'text-dim' : v > 1 ? 'text-red' : 'text-yellow',
        },
        { key: 'defects', label: 'Defects', type: 'number', get: t => t.linkedDefects },
        { key: 'sp', label: 'SP', type: 'number', get: t => t.sprintReport.storyPoints ?? null, fmt: v => v == null ? '-' : v },
        { key: 'devSp', hidden: true, label: 'Dev SP', type: 'number', get: t => t.sprintReport.devPoints ?? null, fmt: v => v == null ? '-' : v },
        { key: 'qaSp', hidden: true, label: 'QA SP', type: 'number', get: t => t.sprintReport.qaPoints ?? null, fmt: v => v == null ? '-' : v },
        { key: 'priority', label: 'Priority', type: 'text', get: t => t.sprintReport.priority || '', fmt: v => v || '-' },
        { key: 'components', label: 'Components', type: 'text', get: t => (t.sprintReport.components || []).join(', '), fmt: v => v || '-' },
        { key: 'labels', hidden: true, label: 'Labels', type: 'text', get: t => (t.sprintReport.labels || []).join(', '), fmt: v => v || '-' },
        { key: 'fixVersions', hidden: true, label: 'Fix Versions', type: 'text', get: t => (t.sprintReport.fixVersions || []).join(', '), fmt: v => v || '-' },
        { key: 'affectsVersions', hidden: true, label: 'Affects Versions', type: 'text', get: t => (t.sprintReport.affectsVersions || []).join(', '), fmt: v => v || '-' },
        { key: 'rootCause', label: 'Root Cause', type: 'text', get: t => t.sprintReport.rootCause || '', fmt: v => v || '-' },
        { key: 'workCategory', hidden: true, label: 'Work Category', type: 'text', get: t => t.sprintReport.workCategory || '', fmt: v => v || '-' },
        { key: 'reporter', label: 'Reporter', type: 'text', get: t => t.reporter || '', fmt: v => v || '-' },
        { key: 'creator', hidden: true, label: 'Creator', type: 'text', get: t => t.creator || '', fmt: v => v || '-' },
        { key: 'created', hidden: true, label: 'Created', type: 'text', get: t => (t.createdDate || '').substring(0, 10), fmt: v => v || '-' },
        { key: 'updated', hidden: true, label: 'Updated', type: 'text', get: t => (t.updatedDate || '').substring(0, 10), fmt: v => v || '-' },
        { key: 'statusChanged', hidden: true, label: 'Status Changed', type: 'text', get: t => (t.statusChangedDate || '').substring(0, 10), fmt: v => v || '-' },
        { key: 'subtasks', hidden: true, label: 'Subtasks', type: 'number', get: t => t.subtaskCount ?? 0 },
        { key: 'watchers', hidden: true, label: 'Watchers', type: 'number', get: t => t.watchers ?? 0 },
        {
          key: 'sprints', label: 'Sprints', type: 'number', get: t => t.sprintCount, raw: true,
          fmt: v => v > 1 ? '<strong class="text-yellow">' + v + '</strong>' : '1',
        },
      ];

      swimlaneLabels.forEach(s => {
        columns.push({
          key: 'sw_' + s, label: s, type: 'number',
          get: t => {
            const st = t.sprintReport.swimlaneTimes.find(entry => entry.swimlane === s);
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
        if (!f || state.hidden.has(c.key)) return true;
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
          return '<td data-col="' + c.key + '"' + (cls ? ' class="' + cls + '"' : '') + '>' + cellHtml + '</td>';
        }).join('') + '</tr>';
      }).join('');

      columns.forEach(c => {
        const arrow = document.getElementById(tableId + '-arrow-' + c.key);
        if (arrow) arrow.textContent = sortKey === c.key ? (sortDir === 1 ? ' ▲' : ' ▼') : '';
      });

      const count = document.getElementById(tableId + '-count');
      if (count) count.textContent = rows.length + (rows.length === tickets.length ? '' : ' of ' + tickets.length) + ' tickets';
      applyTicketTableHeight(tableId);
    }

    // Caps the scroll area at roughly N body rows; the sticky header stays visible while scrolling.
    function applyTicketTableHeight(tableId) {
      const state = ticketTables[tableId];
      const scroll = document.getElementById(tableId + '-scroll');
      if (!state || !scroll) return;
      const headRows = scroll.querySelectorAll('thead tr');
      const firstRow = scroll.querySelector('tbody tr');
      if (headRows.length) scroll.style.setProperty('--hdr1', headRows[0].offsetHeight + 'px');
      if (state.visibleRows === 'all' || !firstRow) {
        scroll.style.maxHeight = '';
        return;
      }
      const headH = [...headRows].reduce((sum, r) => sum + r.offsetHeight, 0);
      scroll.style.maxHeight = (headH + firstRow.offsetHeight * state.visibleRows + 2) + 'px';
    }

    function setTicketVisibleRows(tableId, value) {
      const state = ticketTables[tableId];
      if (!state) return;
      state.visibleRows = value === 'all' ? 'all' : parseInt(value, 10);
      applyTicketTableHeight(tableId);
    }

    const HIDDEN_COLS_STORAGE_KEY = 'ticketTableHiddenColumns';

    function loadHiddenColumns(columns) {
      try {
        const saved = JSON.parse(localStorage.getItem(HIDDEN_COLS_STORAGE_KEY));
        if (Array.isArray(saved)) return new Set(saved);
      } catch (e) { /* storage unavailable: use defaults */ }
      return new Set(columns.filter(c => c.hidden).map(c => c.key));
    }

    function saveHiddenColumns(hidden) {
      try { localStorage.setItem(HIDDEN_COLS_STORAGE_KEY, JSON.stringify([...hidden])); } catch (e) { /* ignore */ }
    }

    function applyColumnVisibility(tableId) {
      const state = ticketTables[tableId];
      const style = document.getElementById(tableId + '-colstyle');
      if (!state || !style) return;
      style.textContent = [...state.hidden]
        .map(k => '#' + tableId + ' [data-col="' + k + '"] { display: none; }').join('\\n');
      document.querySelectorAll('#' + tableId + '-cols input[type=checkbox]').forEach(cb => {
        cb.checked = !state.hidden.has(cb.dataset.col);
      });
    }

    function toggleTicketColumn(tableId, key, visible) {
      const state = ticketTables[tableId];
      if (!state) return;
      if (visible) state.hidden.delete(key); else state.hidden.add(key);
      saveHiddenColumns(state.hidden);
      applyColumnVisibility(tableId);
      renderTicketRows(tableId);
    }

    function setAllTicketColumns(tableId, mode) {
      const state = ticketTables[tableId];
      if (!state) return;
      state.hidden = mode === 'all' ? new Set()
        : new Set(state.columns.filter(c => c.hidden).map(c => c.key));
      saveHiddenColumns(state.hidden);
      applyColumnVisibility(tableId);
      renderTicketRows(tableId);
    }

    function columnChooserHtml(tableId, columns) {
      return '<details class="col-chooser" id="' + tableId + '-cols"><summary>Columns ▾</summary><div class="col-menu">'
        + '<div class="col-actions">'
        + '<button onclick="setAllTicketColumns(\\'' + tableId + '\\',\\'all\\')">Show all</button>'
        + '<button onclick="setAllTicketColumns(\\'' + tableId + '\\',\\'default\\')">Reset</button></div>'
        + columns.map(c => '<label><input type="checkbox" checked data-col="' + c.key + '" '
          + 'onchange="toggleTicketColumn(\\'' + tableId + '\\',\\'' + c.key + '\\', this.checked)"> ' + escapeHtml(c.label) + '</label>').join('')
        + '</div></details>';
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
