/**
 * Quarterly report pages for the web UI. Three pieces are spliced into the single page built by
 * ui.ts: some CSS, the two wizard steps, and the client script.
 *
 * These are String.raw templates: write client code with plain string concatenation (no backticks and
 * no dollar-brace), and write backslash escapes as the browser should see them ('\n' is a newline).
 */

export const QUARTERLY_CSS = String.raw`
    .q-field input[type="text"], .q-field input[type="date"] {
      background: #1e293b; border: 1px solid #334155; border-radius: 6px; padding: 0.6rem 0.8rem;
      color: #e2e8f0; font-size: 0.9rem; width: 100%;
    }
    .q-field label { display: block; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 0.3rem; }
    .q-assign { background: #334155; color: #e2e8f0; border: 1px solid #475569; border-radius: 6px; padding: 0.25rem 0.4rem; font-size: 0.8rem; }
    .sprint-item.q-previous { border-color: #64748b; background: #243044; }
    .sprint-item.q-current { border-color: #3b82f6; background: #1e3a5f; }
    .q-tabs { display: flex; gap: 0.25rem; border-bottom: 1px solid #334155; margin: 1rem 0; flex-wrap: wrap; }
    .q-tab { background: none; border: none; border-bottom: 2px solid transparent; color: #94a3b8; padding: 0.6rem 1rem; cursor: pointer; font-size: 0.95rem; margin-bottom: -1px; }
    .q-tab.active { color: #e2e8f0; border-bottom-color: #3b82f6; font-weight: 600; }
    .q-panel { display: none; }
    .q-panel.active { display: block; }
    .q-verdict { font-size: 1.15rem; line-height: 1.5; max-width: 75ch; margin: 0.5rem 0 1rem; }
    .q-controls { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; margin: 0.75rem 0; }
    .q-controls select { background: #334155; color: #e2e8f0; border: 1px solid #475569; border-radius: 6px; padding: 0.35rem 0.6rem; font-size: 0.85rem; }
    .q-chip { display: inline-block; font-size: 0.72rem; border: 1px solid #334155; border-radius: 999px; padding: 0.05rem 0.5rem; margin-left: 0.35rem; font-weight: 500; }
    .q-chip.good { color: #4ade80; border-color: #166534; }
    .q-chip.bad { color: #fbbf24; border-color: #78350f; }
    .q-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 0.75rem; }
    .q-cards .stat-card h3 { margin: 0 0 0.4rem; font-size: 1rem; }
    .q-cards .stat-card p { line-height: 1.55; font-size: 0.9rem; color: #cbd5e1; }
    .q-warn { color: #fbbf24; font-size: 0.82rem; margin: 0.5rem 0; }
    .q-small { font-size: 0.75rem; color: #64748b; font-weight: 400; }
    th.q-num, td.q-num { text-align: right; white-space: nowrap; }
    td.q-better { color: #4ade80; }
    td.q-worse { color: #fbbf24; }
    .q-avg { font-weight: 600; background: #243044; }
    .q-board { color: #94a3b8; }
    .q-chartbox { background: #1e293b; border-radius: 8px; padding: 1rem; margin: 0.5rem 0 1rem; }
    @media print {
      .q-panel { display: block !important; break-before: page; }
      .q-panel:first-of-type { break-before: auto; }
      .q-tabs, .q-controls, .q-chartbox { display: none !important; }
      .q-cards .stat-card p { color: #111; }
      td.q-better { color: #15803d; }
      td.q-worse { color: #b45309; }
      .q-avg { background: #eee; }
    }
`;

export const QUARTERLY_STEPS_HTML = String.raw`
      <!-- Quarterly report: define the two periods -->
      <div class="step" id="step-quarterly-setup">
        <div class="step-label">Quarterly Report — Define the Two Periods</div>
        <div class="people-controls q-field">
          <div><label for="q-mode">Define the periods by</label>
            <select id="q-mode" onchange="qToggleMode()">
              <option value="sprints">Whole sprints</option>
              <option value="dateRange">Date ranges</option>
            </select></div>
          <div></div>
          <div><label for="q-prev-label">Previous period name</label>
            <input type="text" id="q-prev-label" value="Previous" maxlength="30" oninput="qUpdateNext()"></div>
          <div><label for="q-cur-label">Current period name</label>
            <input type="text" id="q-cur-label" value="Current" maxlength="30" oninput="qUpdateNext()"></div>
        </div>
        <div id="q-sprints-box">
          <div class="hint">Mark each sprint as belonging to the previous or the current period (for example Q2 and Q3). Sprints that have not been fetched yet can be fetched for you.</div>
          <div class="sprint-list" id="q-sprint-list" style="margin-top:0.75rem"></div>
        </div>
        <div id="q-dates-box" style="display:none">
          <div class="people-controls q-field">
            <div><label>Previous period: from</label><input type="date" id="q-prev-from" onchange="qUpdateNext()"></div>
            <div><label>Previous period: to (inclusive)</label><input type="date" id="q-prev-to" onchange="qUpdateNext()"></div>
            <div><label>Current period: from</label><input type="date" id="q-cur-from" onchange="qUpdateNext()"></div>
            <div><label>Current period: to (inclusive)</label><input type="date" id="q-cur-to" onchange="qUpdateNext()"></div>
          </div>
          <div class="hint">Dates are UTC calendar days. Tickets come from the sprints that overlap each range; sprints you have not fetched yet can be fetched for you. Status, assignee and points are worked out as at the end of each range, and only activity inside the range counts.</div>
          <div class="hint" id="q-dates-sprints"></div>
        </div>
        <div class="btn-row">
          <button class="btn btn-secondary" onclick="qBackToTeam()">Back</button>
          <button class="btn" id="btn-q-next" disabled onclick="qSetupNext()">Next</button>
        </div>
      </div>

      <!-- Quarterly report: choose the developers and QA testers -->
      <div class="step" id="step-quarterly-people">
        <div class="step-label">Quarterly Report — Choose Who to Report On</div>
        <div class="hint" style="margin-top:0">Ticks are pre-set to people with tickets in both periods. Tick anyone else you want included (for example someone who joined), and untick anyone who should not be (leads, product owners). A developer is credited as the ticket assignee; a QA tester as a QA assignee.</div>
        <div class="bulk-box">
          <h4>Developers</h4>
          <div class="bulk-list" id="q-dev-list"></div>
        </div>
        <div class="bulk-box">
          <h4>QA testers</h4>
          <div class="bulk-list" id="q-qa-list"></div>
        </div>
        <div class="btn-row">
          <button class="btn btn-secondary" onclick="goStep('step-quarterly-setup')">Back</button>
          <button class="btn" id="btn-q-generate" disabled onclick="qGenerate()">Generate Report</button>
        </div>
      </div>
`;

export const QUARTERLY_SCRIPT = String.raw`
    // ---------------------------------------------------------------- Quarterly report
    // Two periods (whole sprints or date ranges) of one team, the same people in each. All numbers come
    // from /api/quarterly/report; this code only lays them out.
    let qState = qFresh();
    let qCharts = {};

    function qFresh() {
      return { jiraSprints: [], assign: {}, options: null, request: null, report: null, notes: null, view: 'current', tab: 'cmp', measure: { dev: 'avg_turnaround', qa: 'ready_qa_median' }, personMetric: 'cycles' };
    }

    function qEsc(s) {
      return escapeHtml(String(s == null ? '' : s)).replace(/"/g, '&quot;');
    }

    function qFmt(v, unit) {
      if (v == null || Number.isNaN(v)) return '—';
      if (unit === 'pct') return Math.round(v * 100) + '%';
      if (unit === 'days') return v.toFixed(2) + ' d';
      if (unit === 'ratio') return v.toFixed(2);
      return Number.isInteger(v) ? String(v) : v.toFixed(1);
    }

    function qFmtChange(r) {
      if (r.change == null) return '—';
      const sign = r.change >= 0 ? '+' : '';
      return r.changeKind === 'pts' ? sign + (r.change * 100).toFixed(1) + ' pts' : sign + Math.round(r.change * 100) + '%';
    }

    function toggleQuarterlyFlow() {
      state.flow = state.flow === 'quarterly' ? 'wizard' : 'quarterly';
      qState = qFresh();
      updateCompareEntryUI();
    }

    function qBackToTeam() {
      state.flow = 'wizard';
      qState = qFresh();
      updateCompareEntryUI();
      goStep('step-team');
    }

    // ---- step 1: the two periods
    function loadQuarterlySprints(projectKey) {
      const list = document.getElementById('q-sprint-list');
      qState.assign = {};
      document.getElementById('btn-q-next').disabled = true;
      list.innerHTML = '<div class="loading-hint"><div class="spinner spinner-sm"></div>Loading sprints...</div>';
      fetch('/api/sprints/' + projectKey).then(r => r.json()).then(sprints => {
        if (!Array.isArray(sprints)) throw new Error(sprints.error || 'Could not load sprints');
        // Only sprints that have started can have anything to report on.
        qState.jiraSprints = sprints.filter(s => s.state !== 'future');
        qRenderSprintList();
        qUpdateDatesHint();
      }).catch(err => {
        list.innerHTML = '<div style="color:#f87171">Error: ' + qEsc(err.message) + '</div>';
      });
    }

    function qRenderSprintList() {
      const list = document.getElementById('q-sprint-list');
      list.innerHTML = '';
      qState.jiraSprints.forEach(s => {
        const item = document.createElement('div');
        item.className = 'sprint-item';
        item.style.cursor = 'default';
        const badgeClass = s.state === 'active' ? 'badge-active' : 'badge-closed';
        const dates = s.startDate ? new Date(s.startDate).toLocaleDateString() + ' - ' + (s.endDate ? new Date(s.endDate).toLocaleDateString() : '?') : '';
        const cachedBadge = s.cachedAt
          ? '<span class="badge badge-cached" title="Fetched ' + new Date(s.cachedAt).toLocaleString() + '">&#10003; Cached</span>'
          : '<span class="badge badge-future">Not fetched</span>';
        item.innerHTML = '<div class="sprint-name">' + qEsc(s.name) + '</div>'
          + '<span class="badge ' + badgeClass + '">' + qEsc(s.state) + '</span>' + cachedBadge
          + '<div class="sprint-dates">' + dates + '</div>'
          + '<select class="q-assign"><option value="">Not included</option>'
          + '<option value="previous">Previous</option><option value="current">Current</option></select>';
        item.querySelector('select').addEventListener('change', e => {
          if (e.target.value) qState.assign[s.name] = e.target.value; else delete qState.assign[s.name];
          item.classList.toggle('q-previous', e.target.value === 'previous');
          item.classList.toggle('q-current', e.target.value === 'current');
          qUpdateNext();
        });
        list.appendChild(item);
      });
    }

    function qMode() { return document.getElementById('q-mode').value; }

    function qToggleMode() {
      const dates = qMode() === 'dateRange';
      document.getElementById('q-sprints-box').style.display = dates ? 'none' : '';
      document.getElementById('q-dates-box').style.display = dates ? '' : 'none';
      qUpdateNext();
    }

    function qRange(which) {
      const from = document.getElementById('q-' + which + '-from').value, to = document.getElementById('q-' + which + '-to').value;
      return from && to ? { from, to } : null;
    }

    // Jira sprints (that have started) overlapping a date range, so the ones not fetched yet can be fetched.
    function qOverlapping(range) {
      if (!range) return [];
      const start = Date.parse(range.from + 'T00:00:00Z'), end = Date.parse(range.to + 'T23:59:59Z');
      return qState.jiraSprints.filter(s => s.startDate && Date.parse(s.startDate) <= end
        && (s.endDate ? Date.parse(s.endDate) : Date.now()) >= start).map(s => s.name);
    }

    function qUpdateDatesHint() {
      const el = document.getElementById('q-dates-sprints');
      if (!el) return;
      const parts = [];
      for (const [which, name] of [['prev', 'Previous'], ['cur', 'Current']]) {
        const names = qOverlapping(qRange(which));
        if (names.length > 0) parts.push(name + ': ' + names.join(', '));
      }
      el.textContent = parts.length > 0 ? 'Sprints overlapping the dates — ' + parts.join('. ') + '.' : '';
    }

    function qLabels() {
      return {
        previous: document.getElementById('q-prev-label').value.trim(),
        current: document.getElementById('q-cur-label').value.trim(),
      };
    }

    // Returns an error message, or '' when the setup is complete.
    function qSetupProblem() {
      const l = qLabels();
      if (!l.previous || !l.current) return 'Give both periods a name.';
      if (l.previous.toLowerCase() === l.current.toLowerCase()) return 'The two periods need different names.';
      if (qMode() === 'sprints') {
        const names = Object.values(qState.assign);
        if (!names.includes('previous') || !names.includes('current')) return 'Mark at least one sprint as Previous and one as Current.';
        return '';
      }
      const p = qRange('prev'), c = qRange('cur');
      if (!p || !c) return 'Enter both date ranges.';
      if (p.from > p.to || c.from > c.to) return 'A "from" date is after its "to" date.';
      if (p.from <= c.to && c.from <= p.to) return 'The two date ranges must not overlap.';
      return '';
    }

    function qUpdateNext() {
      qUpdateDatesHint();
      document.getElementById('btn-q-next').disabled = qSetupProblem() !== '';
    }

    function qPeriodSpec(which) {
      const l = qLabels();
      if (qMode() === 'sprints') {
        return { label: l[which], sprintNames: Object.keys(qState.assign).filter(n => qState.assign[n] === which) };
      }
      return { label: l[which], sprintNames: qOverlapping(qRange(which === 'previous' ? 'prev' : 'cur')), period: qRange(which === 'previous' ? 'prev' : 'cur') };
    }

    function qBaseRequest() {
      return { projectKey: state.team, mode: qMode(), previous: qPeriodSpec('previous'), current: qPeriodSpec('current') };
    }

    async function qFetchOptions() {
      const res = await fetch('/api/quarterly/options', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(qBaseRequest()),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    }

    // Checks what has been fetched; offers to fetch the rest before moving on.
    async function qSetupNext() {
      const btn = document.getElementById('btn-q-next');
      btn.disabled = true;
      try {
        let options = await qFetchOptions();
        const missing = options.missing.previous.concat(options.missing.current.filter(n => !options.missing.previous.includes(n)));
        if (missing.length > 0) {
          const ok = confirm(missing.length + ' sprint(s) have not been fetched yet:\n\n' + missing.join('\n') + '\n\nFetch them now? This can take a few minutes.');
          if (!ok) { btn.disabled = false; return; }
          showProgress('Fetching ' + missing.length + ' sprint(s) from Jira...');
          const res = await fetch('/api/fetch', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectKey: state.team, sprintNames: missing }),
          });
          if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
          options = await qFetchOptions();
          hideProgress();
        }
        qState.options = options;
        qRenderPeople();
        goStep('step-quarterly-people');
      } catch (err) {
        hideProgress();
        alert('Error: ' + err.message);
      }
      btn.disabled = qSetupProblem() !== '';
    }

    // ---- step 2: who to report on
    function qRenderPeople() {
      const l = qLabels();
      for (const [role, id] of [['dev', 'q-dev-list'], ['qa', 'q-qa-list']]) {
        const people = qState.options[role];
        const list = document.getElementById(id);
        if (people.length === 0) { list.innerHTML = '<span class="text-dim">Nobody with tickets in either period.</span>'; continue; }
        list.innerHTML = '<label><input type="checkbox" onchange="qToggleAll(\'' + role + '\', this.checked)"> <strong>Select all (' + people.length + ')</strong></label>'
          + people.map(p => '<label><input type="checkbox" class="q-' + role + '-item" value="' + qEsc(p.name) + '"'
            + (p.previousTickets > 0 && p.currentTickets > 0 ? ' checked' : '') + ' onchange="qUpdateGenerate()"> '
            + qEsc(p.name) + ' <span class="text-dim">(' + qEsc(l.previous) + ' ' + p.previousTickets + ', ' + qEsc(l.current) + ' ' + p.currentTickets + ' tickets)</span></label>').join('');
      }
      qUpdateGenerate();
    }

    function qChosen(role) {
      return [...document.querySelectorAll('.q-' + role + '-item:checked')].map(cb => cb.value);
    }

    function qToggleAll(role, checked) {
      document.querySelectorAll('.q-' + role + '-item').forEach(cb => { cb.checked = checked; });
      qUpdateGenerate();
    }

    function qUpdateGenerate() {
      document.getElementById('btn-q-generate').disabled = qChosen('dev').length + qChosen('qa').length === 0;
    }

    async function qGenerate() {
      const request = Object.assign(qBaseRequest(), { developers: qChosen('dev'), qaTesters: qChosen('qa') });
      showProgress('Building quarterly report...');
      try {
        const res = await fetch('/api/quarterly/report', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
        qState.report = await res.json();
        qState.request = request;
        qState.notes = null;
        qState.view = 'current';
        qState.tab = 'cmp';
        hideProgress();
        setInfoKind('quarterly');
        qShow();
      } catch (err) {
        hideProgress();
        alert('Error: ' + err.message);
      }
    }

    // ---- results
    function qShow() {
      showResults(qRender());
      setTimeout(qDrawCharts, 50);
    }

    function qSetTab(tab) {
      qState.tab = tab;
      document.querySelectorAll('.q-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      document.querySelectorAll('.q-panel').forEach(p => p.classList.toggle('active', p.id === 'q-panel-' + tab));
      qDrawCharts();
    }

    function qSetView(view) {
      qState.view = view;
      qShow();
    }

    function qSetMeasure(role, id) {
      qState.measure[role] = id;
      qDrawCharts();
    }

    function qSetPersonMetric(id) {
      qState.personMetric = id;
      qDrawCharts();
    }

    function qActions() {
      const writing = state.appConfig.claudeEnabled
        ? '<button class="btn btn-secondary" id="q-notes-btn" onclick="qWriteNotes()" title="Claude writes the verdict sentence and a short note per person. Figures are filled in from the data.">&#129302; ' + (qState.notes ? 'Rewrite' : 'Write') + ' notes with AI</button>'
        : '';
      return '<div class="report-actions no-print">' + writing
        + '<button class="btn btn-secondary" onclick="qDownload(\'json\')">&#11015; Export JSON</button>'
        + '<button class="btn btn-secondary" onclick="qDownload(\'zip\')" title="report.json, compare.csv and people.csv">&#11015; ZIP (JSON + CSV)</button>'
        + '<button class="btn btn-secondary" onclick="qDownload(\'csv\')" title="One row per measure and scope">&#11015; Comparison CSV</button>'
        + '<button class="btn btn-secondary" onclick="qDownloadPeople()" title="One JSON per selected person and role, previous and current side by side, plus kpi.csv and tickets.csv. No AI notes. For KPI / AI use.">&#11015; Per person (KPI ZIP)</button>'
        + '<button class="btn" onclick="window.print()">&#128424; Print / Save as PDF</button></div>';
    }

    function qRender() {
      const r = qState.report;
      const team = r.teamName ? r.teamName + ' (' + r.projectKey + ')' : r.projectKey;
      let html = qActions();
      html += '<h2 style="margin-top:0.5rem">Quarterly Report — ' + qEsc(team) + '</h2>';
      html += '<p style="color:#94a3b8">' + qEsc(r.previous.label) + ': ' + qEsc(r.previous.description) + '<br>'
        + qEsc(r.current.label) + ': ' + qEsc(r.current.description) + '</p>';
      html += '<p class="people-note">Times are business days: working time only (Mon-Fri 08:00-17:00 UTC), and a business day is 9 hours.'
        + ' A ticket is credited to whoever was its assignee (or QA assignee) at the end of each period. Generated ' + new Date(r.generatedAt).toLocaleString() + '.</p>';

      const tabs = [['cmp', qEsc(r.previous.label) + ' vs ' + qEsc(r.current.label)]];
      if (r.dev) tabs.push(['dev', 'Developers']);
      if (r.qa) tabs.push(['qa', 'QA']);
      if (!tabs.some(t => t[0] === qState.tab)) qState.tab = tabs[0][0];
      html += '<div class="q-tabs no-print">' + tabs.map(t => '<button class="q-tab' + (t[0] === qState.tab ? ' active' : '') + '" data-tab="' + t[0] + '" onclick="qSetTab(\'' + t[0] + '\')">' + t[1] + '</button>').join('') + '</div>';

      html += '<div class="q-panel' + (qState.tab === 'cmp' ? ' active' : '') + '" id="q-panel-cmp">' + qRenderCompare() + '</div>';
      if (r.dev) html += '<div class="q-panel' + (qState.tab === 'dev' ? ' active' : '') + '" id="q-panel-dev">' + qRenderRole('dev') + '</div>';
      if (r.qa) html += '<div class="q-panel' + (qState.tab === 'qa' ? ' active' : '') + '" id="q-panel-qa">' + qRenderRole('qa') + '</div>';
      return html;
    }

    function qWarnings() {
      const n = qState.notes;
      return n && n.warnings.length > 0
        ? '<div class="q-warn"><strong>Check the AI notes:</strong><ul style="margin-left:1.1rem">' + n.warnings.map(w => '<li>' + qEsc(w) + '</li>').join('') + '</ul></div>'
        : '';
    }

    function qChip(row) {
      if (!row || row.result === 'Volume' || row.result === 'No data') return '';
      const cls = row.result === 'Better' ? 'good' : row.result === 'Worse' ? 'bad' : '';
      return '<span class="q-chip ' + cls + '">' + row.result + ' (' + qFmtChange(row) + ')</span>';
    }

    // ---- previous vs current tab
    function qRenderCompare() {
      const r = qState.report, c = r.comparison, n = qState.notes;
      const verdictRows = c.rows.filter(x => x.scope === (r.dev ? 'board' : 'qaBoard'));
      let html = qWarnings();
      html += '<p class="q-verdict">' + (n
        ? '<strong>' + qEsc(n.verdict) + '</strong>'
        : '<strong>' + qEsc(c.verdict) + '.</strong>') + '</p>';
      html += '<p class="people-note">Of the ' + c.boardScored + ' scored ' + (r.dev ? 'whole-board' : 'QA board') + ' measures, ' + c.boardBetter + ' got better and ' + c.boardWorse
        + ' got worse. Verdict rule: Improved needs at least 3 more better than worse (and no worse rework); Not an overall improvement needs at least 3 more worse than better; otherwise Mixed. '
        + (n ? '' : 'Use "Write notes with AI" for a plain-language explanation of why.') + '</p>';

      const tileIds = r.dev
        ? ['completed_sp', 'sp_completion', 'median_turnaround', 'dev_median', 'rework_free', 'defects_per_ticket']
        : ['completed_sp', 'sp_completion', 'median_turnaround', 'in_qa_median', 'rework_free', 'defects_per_ticket'];
      html += '<div class="summary-grid">' + tileIds.map(id => {
        const row = verdictRows.find(x => x.measure === id);
        if (!row) return '';
        return statCard(qEsc(row.label) + ' · ' + (r.dev ? 'board' : 'QA board'),
          qFmt(row.current, row.unit) + '<div class="text-dim" style="font-size:0.78rem;font-weight:400;margin-top:0.2rem">' + qEsc(r.previous.label) + ' ' + qFmt(row.previous, row.unit) + qChip(row) + '</div>');
      }).join('') + '</div>';

      // Per person
      const metrics = [];
      c.people.forEach(p => { if (!metrics.some(m => m.id === p.metric)) metrics.push({ id: p.metric, label: p.label }); });
      if (metrics.length > 0) {
        if (!metrics.some(m => m.id === qState.personMetric)) qState.personMetric = metrics[0].id;
        html += '<h3>Each person, ' + qEsc(r.previous.label) + ' to ' + qEsc(r.current.label) + '</h3>'
          + '<div class="q-controls no-print"><label for="q-person-metric" class="text-dim">Measure</label>'
          + '<select id="q-person-metric" onchange="qSetPersonMetric(this.value)">'
          + metrics.map(m => '<option value="' + qEsc(m.id) + '"' + (m.id === qState.personMetric ? ' selected' : '') + '>' + qEsc(m.label) + '</option>').join('') + '</select>'
          + '<span class="text-dim" id="q-person-better"></span></div>'
          + '<div class="q-chartbox"><canvas id="q-chart-people" height="' + Math.max(120, 40 * c.people.filter(p => p.metric === metrics[0].id).length + 60) + '"></canvas></div>'
          + '<p class="people-note">Only people with a report in both periods. Developer cycles are QA Failed moves; QA cycles are PO Review Failed moves.</p>';
      }

      // Tables
      const scopes = [['board', 'Whole board', 'Every ticket in the same sprints or dates.'],
        ['devAverage', 'Developer average', 'Plain average of the chosen developers.'],
        ['qaBoard', 'QA board', 'Every ticket with a QA assignee.']];
      html += '<h3>All measures</h3><p class="people-note">Change is the percent change, or the difference in points for rates. "Same" means a change under 2%. Tickets, story points and linked defects are volume and are not scored.</p>';
      scopes.forEach(s => {
        const rows = c.rows.filter(x => x.scope === s[0]);
        if (rows.length === 0) return;
        html += '<h3 style="font-size:1rem">' + s[1] + ' <span class="q-small">' + s[2] + '</span></h3><div class="table-scroll"><table><thead><tr><th>Area</th><th>Measure</th><th class="q-num">'
          + qEsc(r.previous.label) + '</th><th class="q-num">' + qEsc(r.current.label) + '</th><th class="q-num">Change</th><th>Result</th></tr></thead><tbody>'
          + rows.map(x => '<tr><td>' + x.section + '</td><td>' + qEsc(x.label) + '</td><td class="q-num">' + qFmt(x.previous, x.unit) + '</td><td class="q-num">' + qFmt(x.current, x.unit)
            + '</td><td class="q-num">' + qFmtChange(x) + '</td><td class="' + (x.result === 'Better' ? 'q-better' : x.result === 'Worse' ? 'q-worse' : '') + '">' + x.result + '</td></tr>').join('')
          + '</tbody></table></div>';
      });

      // Reading notes
      html += '<h3>Reading this comparison</h3><ul style="margin-left:1.1rem;line-height:1.7;color:#cbd5e1;font-size:0.9rem">';
      const joined = c.onlyInCurrent.length > 0 ? c.onlyInCurrent.join(', ') + ' only in ' + r.current.label : '';
      const left = c.onlyInPrevious.length > 0 ? c.onlyInPrevious.join(', ') + ' only in ' + r.previous.label : '';
      html += '<li>' + (n && n.teamChange ? qEsc(n.teamChange) : (joined || left ? qEsc([joined, left].filter(Boolean).join('; ')) + '.' : 'The same people were reported on in both periods.')) + '</li>';
      if (c.sameDevelopers.length === 2) {
        const p = c.sameDevelopers[0], q = c.sameDevelopers[1];
        html += '<li>The ' + q.developers + ' developer(s) in both periods: tickets ' + p.tickets + ' to ' + q.tickets + ', completed ' + p.completed + ' to ' + q.completed
          + ', completed story points ' + p.completedStoryPoints + ' to ' + q.completedStoryPoints + ', dev cycles ' + p.devCycles + ' to ' + q.devCycles + '.</li>';
      }
      html += r.checks.map(x => '<li>' + qEsc(x) + '</li>').join('') + '</ul>';
      return html;
    }

    // ---- developers / QA tab
    function qRenderRole(role) {
      const r = qState.report, sec = role === 'dev' ? r.dev : r.qa;
      const side = sec[qState.view], period = r[qState.view];
      const other = qState.view === 'current' ? 'previous' : 'current';
      const avgLabel = role === 'dev' ? 'Dev avg' : 'QA avg';
      const boardLabel = role === 'dev' ? 'Board' : 'QA board';
      let html = '<div class="q-controls no-print"><label for="q-view-' + role + '" class="text-dim">Showing</label>'
        + '<select id="q-view-' + role + '" onchange="qSetView(this.value)">'
        + '<option value="current"' + (qState.view === 'current' ? ' selected' : '') + '>' + qEsc(r.current.label) + '</option>'
        + '<option value="previous"' + (qState.view === 'previous' ? ' selected' : '') + '>' + qEsc(r.previous.label) + '</option></select></div>';
      html += '<h3 style="margin-top:0.5rem">' + (role === 'dev' ? 'Developers' : 'QA testers') + ', ' + qEsc(period.label) + ' <span class="q-small">' + qEsc(period.description) + '</span></h3>';
      if (side.people.length === 0) return html + '<p class="people-note">Nobody chosen had tickets in this period.</p>';
      html += qWarnings();

      const tiles = role === 'dev'
        ? ['avg_turnaround', 'median_turnaround', 'rework_free', 'completion_rate', 'sp_completion']
        : ['avg_turnaround', 'ready_qa_median', 'in_qa_median', 'rework_free', 'sp_completion'];
      html += '<div class="summary-grid">' + tiles.map(id => {
        const def = sec.measures.find(m => m.id === id);
        if (!def) return '';
        const a = side.average[id], b = side.board[id];
        let chip = '';
        if (a != null && b != null && def.better !== 'neutral' && Math.abs(a - b) > 1e-9) {
          const good = def.better === 'lower' ? a < b : a > b;
          chip = '<span class="q-chip ' + (good ? 'good' : 'bad') + '">' + (good ? 'Better than ' : 'Behind ') + boardLabel.toLowerCase() + '</span>';
        }
        return statCard(qEsc(def.label) + ' · ' + avgLabel,
          qFmt(a, def.unit) + '<div class="text-dim" style="font-size:0.78rem;font-weight:400;margin-top:0.2rem">' + boardLabel + ' ' + qFmt(b, def.unit) + chip + '</div>');
      }).join('') + '</div>';

      html += '<h3>Compare ' + (role === 'dev' ? 'developers' : 'QA testers') + ' on one measure</h3>'
        + '<div class="q-controls no-print"><label for="q-measure-' + role + '" class="text-dim">Measure</label>'
        + '<select id="q-measure-' + role + '" onchange="qSetMeasure(\'' + role + '\', this.value)">'
        + ['Throughput', 'Speed', 'Quality'].map(section => '<optgroup label="' + section + '">'
          + sec.measures.filter(m => m.section === section).map(m => '<option value="' + m.id + '"' + (m.id === qState.measure[role] ? ' selected' : '') + '>' + qEsc(m.label) + '</option>').join('') + '</optgroup>').join('')
        + '</select><span class="text-dim" id="q-better-' + role + '"></span></div>'
        + '<div class="q-chartbox"><canvas id="q-chart-' + role + '" height="' + (60 + 34 * (side.people.length + 2)) + '"></canvas></div>';

      html += '<h3>All measures</h3><p class="people-note">"' + avgLabel + '" is the plain average of the ' + side.people.length + ' people\'s figures. "' + boardLabel + '" covers '
        + (role === 'dev' ? 'every ticket in the same sprints or dates' : 'every ticket with a QA assignee in the same sprints or dates') + ' (' + side.boardTickets + ' tickets), for context. '
        + (role === 'dev' ? 'To Do and In Development are the lanes a developer controls; dev cycles count moves to QA Failed.' : 'Ready for QA and In QA are the lanes QA controls; QA cycles count moves to PO Review Failed.') + '</p>';
      ['Throughput', 'Speed', 'Quality'].forEach(section => {
        const defs = sec.measures.filter(m => m.section === section);
        html += '<h3 style="font-size:1rem">' + section + (section === 'Speed' ? ' <span class="q-small">business days</span>' : '') + '</h3><div class="table-scroll"><table><thead><tr><th>Measure</th>'
          + side.people.map(p => '<th class="q-num">' + qEsc(p.person) + '</th>').join('') + '<th class="q-num">' + avgLabel + '</th><th class="q-num">' + boardLabel + '</th></tr></thead><tbody>'
          + defs.map(d => '<tr><td>' + qEsc(d.label) + '</td>' + side.people.map(p => '<td class="q-num">' + qFmt(p.values[d.id], d.unit) + '</td>').join('')
            + '<td class="q-num q-avg">' + qFmt(side.average[d.id], d.unit) + '</td><td class="q-num q-board">' + qFmt(side.board[d.id], d.unit) + '</td></tr>').join('')
          + '</tbody></table></div>';
      });

      const n = qState.notes;
      if (n && qState.view === 'current') {
        const cards = side.people.map(p => n.people[role + ':' + p.person]
          ? '<div class="stat-card"><h3>' + qEsc(p.person) + '</h3><p>' + qEsc(n.people[role + ':' + p.person]) + '</p></div>' : '').join('');
        if (cards) html += '<h3>What stands out <span class="q-small">written by AI from the data above</span></h3><div class="q-cards">' + cards + '</div>';
      } else if (qState.view === 'current' && state.appConfig.claudeEnabled) {
        html += '<p class="people-note no-print">Use "Write notes with AI" at the top for a short note on each person.</p>';
      }
      return html;
    }

    // ---- charts
    function qDestroyCharts() {
      Object.values(qCharts).forEach(c => c && c.destroy());
      qCharts = {};
    }

    function qDrawCharts() {
      qDestroyCharts();
      if (!qState.report) return;
      if (qState.tab === 'cmp') qDrawPeopleChart();
      else qDrawRoleChart(qState.tab);
    }

    function qDrawRoleChart(role) {
      const r = qState.report, sec = role === 'dev' ? r.dev : r.qa;
      const canvas = document.getElementById('q-chart-' + role);
      if (!sec || !canvas) return;
      const side = sec[qState.view];
      const def = sec.measures.find(m => m.id === qState.measure[role]) || sec.measures[0];
      const better = document.getElementById('q-better-' + role);
      if (better) better.textContent = def.better === 'lower' ? 'Lower is better' : def.better === 'higher' ? 'Higher is better' : 'Shows how much work there was; not scored';
      const labels = side.people.map(p => p.person).concat([role === 'dev' ? 'Dev average' : 'QA average', role === 'dev' ? 'Board' : 'QA board']);
      const data = side.people.map(p => p.values[def.id]).concat([side.average[def.id], side.board[def.id]]);
      const colors = side.people.map(() => '#3b82f6').concat(['#f59e0b', '#6b7280']);
      qCharts.role = new Chart(canvas, {
        type: 'bar',
        data: { labels, datasets: [{ label: def.label, data, backgroundColor: colors }] },
        options: {
          indexAxis: 'y', responsive: true,
          plugins: { legend: { display: false }, title: { display: true, text: def.label + (def.unit === 'days' ? ' (business days)' : ''), color: '#94a3b8' },
            tooltip: { callbacks: { label: ctx => qFmt(ctx.parsed.x, def.unit) } } },
          scales: { x: { beginAtZero: true, ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } },
        },
      });
    }

    function qDrawPeopleChart() {
      const r = qState.report;
      const canvas = document.getElementById('q-chart-people');
      if (!canvas) return;
      const rows = r.comparison.people.filter(p => p.metric === qState.personMetric);
      if (rows.length === 0) return;
      const unit = rows[0].unit;
      const better = document.getElementById('q-person-better');
      if (better) better.textContent = rows[0].better === 'lower' ? 'Lower is better' : 'Higher is better';
      const labels = rows.map(p => p.role === 'qa' ? p.person + ' (QA)' : p.person);
      qCharts.people = new Chart(canvas, {
        type: 'bar',
        data: { labels, datasets: [
          { label: r.previous.label, data: rows.map(p => p.previous), backgroundColor: '#6b7280' },
          { label: r.current.label, data: rows.map(p => p.current), backgroundColor: '#3b82f6' },
        ] },
        options: {
          indexAxis: 'y', responsive: true,
          plugins: { legend: { labels: { color: '#94a3b8' } }, title: { display: true, text: rows[0].label + (unit === 'days' ? ' (business days)' : ''), color: '#94a3b8' },
            tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + qFmt(ctx.parsed.x, unit) } } },
          scales: { x: { beginAtZero: true, ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } },
        },
      });
    }

    // ---- AI notes and downloads
    async function qWriteNotes() {
      const btn = document.getElementById('q-notes-btn');
      btn.disabled = true;
      btn.textContent = 'Writing notes... this can take a minute';
      try {
        const res = await fetch('/api/quarterly/notes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(qState.request),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
        qState.notes = await res.json();
        qState.view = 'current';
        qShow();
      } catch (err) {
        alert('Could not write the notes: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Write notes with AI';
      }
    }

    async function qDownloadPeople() {
      try {
        const res = await fetch('/api/quarterly/export/people', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(qState.request),
        });
        await saveResponse(res, 'quarterly-people.zip');
      } catch (err) {
        alert('Download failed: ' + err.message);
      }
    }

    async function qDownload(format) {
      try {
        const res = await fetch('/api/quarterly/export', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({}, qState.request, { format, notes: qState.notes })),
        });
        if (format === 'json') {
          if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
          const blob = new Blob([JSON.stringify(await res.json(), null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = ('quarterly-report_' + qState.request.projectKey + '_' + new Date().toISOString().slice(0, 10)).replace(/[^a-zA-Z0-9_.-]+/g, '_') + '.json';
          a.click();
          URL.revokeObjectURL(a.href);
        } else {
          await saveResponse(res, 'quarterly-report.' + format);
        }
      } catch (err) {
        alert('Download failed: ' + err.message);
      }
    }
`;
