import express from 'express';
import { createServer } from 'node:http';
import open from 'open';
import { getConfig, hasGitHubToken, hasClaudeToken } from '../config.js';
import { JiraClient } from '../clients/jira-client.js';
import { PROJECT_BOARDS, PROJECT_REPOS } from '../constants/workflow.js';
import { save, load, listCached, findAnalysis, saveAnalysis, type CachedSprintData } from '../cache/cache-manager.js';
import { GitHubClient } from '../clients/github-client.js';
import { calculateSprintMetrics, aggregateSprintMetrics } from '../services/metrics-calculator.js';
import { applyFilters } from '../services/ticket-filter.js';
import { buildComparisonReport } from '../services/comparison-report.js';
import { buildSprintReportExport, buildComparisonExport } from '../services/export-builder.js';
import { buildPeopleReport, listPeopleOptions } from '../services/people-report.js';
import { getDataGuide, isGuideKind } from '../constants/data-guide.js';
import type { PersonRole } from '../types/people-report.js';
import { SWIMLANE_ORDER, EXCLUDED_SWIMLANE } from '../constants/workflow.js';
import type { JiraSprint, JiraIssue } from '../types/jira.js';
import type { GitHubPR } from '../types/github.js';
import type { FilterOptions } from '../types/metrics.js';
import * as log from '../utils/logger.js';
import { getUiHtml } from './ui.js';

const TEAMS = [
  { key: 'SQM', name: 'Mavericks' },
  { key: 'IFRS', name: 'Black Knights' },
  { key: 'AUD', name: 'A-Team' },
  { key: 'TAN', name: 'Titans' },
  { key: 'GM', name: 'Green Mambas' },
];

// Filters arrive from the UI as comma-separated strings.
function toFilterOptions(filters: any): FilterOptions {
  return {
    developer: filters?.dev || undefined,
    qa: filters?.qa || undefined,
    tickets: filters?.tickets ? filters.tickets.split(',').map((k: string) => k.trim()) : undefined,
    issueTypes: filters?.types ? filters.types.split(',').map((t: string) => t.trim()) : undefined,
  };
}

export async function startWebUI(): Promise<void> {
  const config = getConfig();
  const jira = new JiraClient(config.JIRA_BASE_URL, config.JIRA_EMAIL, config.JIRA_API_TOKEN);
  const app = express();
  app.use(express.json());

  // Serve the UI
  app.get('/', (_req, res) => {
    res.type('html').send(getUiHtml());
  });

  // API: List teams
  app.get('/api/teams', (_req, res) => {
    res.json(TEAMS);
  });

  // API: Which optional integrations are configured
  app.get('/api/config', (_req, res) => {
    res.json({
      githubEnabled: hasGitHubToken(config),
      claudeEnabled: hasClaudeToken(config),
    });
  });

  // API: List sprints for a team
  app.get('/api/sprints/:projectKey', async (req, res) => {
    const projectKey = req.params.projectKey.toUpperCase();
    const boardId = PROJECT_BOARDS[projectKey];
    if (!boardId) {
      res.status(400).json({ error: `No board configured for ${projectKey}` });
      return;
    }
    try {
      const sprints = await jira.getSprintsForBoard(boardId);
      const active = sprints.filter(s => s.state === 'active');
      const closed = sprints.filter(s => s.state === 'closed')
        .sort((a, b) => new Date(b.completeDate ?? b.endDate ?? '').getTime() - new Date(a.completeDate ?? a.endDate ?? '').getTime())
        .slice(0, 10);
      const future = sprints.filter(s => s.state === 'future');

      const cachedByName = new Map(
        listCached()
          .filter(c => c.projectKey.toUpperCase() === projectKey)
          .map(c => [c.sprintName, c.fetchedAt])
      );
      const withCache = (s: JiraSprint) => ({ ...s, cachedAt: cachedByName.get(s.name) ?? null });

      res.json([...active, ...future, ...closed].map(withCache));
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? String(err) });
    }
  });

  // API: Fetch sprint data
  app.post('/api/fetch', async (req, res) => {
    const { projectKey, sprintNames, skipGitHub } = req.body;
    try {
      const allSprints = PROJECT_BOARDS[projectKey]
        ? await jira.getSprintsForBoard(PROJECT_BOARDS[projectKey])
        : [];

      for (const sprintName of sprintNames) {
        const sprintInfo = allSprints.find((s: JiraSprint) => s.name === sprintName);
        const jql = `project = ${projectKey} AND sprint = "${sprintName}"`;
        const issues: JiraIssue[] = await jira.searchAllIssues(jql);

        let githubData: Record<string, GitHubPR[]> = {};
        if (!skipGitHub && hasGitHubToken(config)) {
          const repos = PROJECT_REPOS[projectKey];
          if (repos && repos.length > 0) {
            const ghClient = new GitHubClient(config.GITHUB_TOKEN!);
            for (const issue of issues) {
              const prs = await ghClient.searchPRsForTicket(issue.key, repos);
              if (prs.length > 0) githubData[issue.key] = prs;
            }
          }
        }

        const cached: CachedSprintData = {
          fetchedAt: new Date().toISOString(),
          projectKey,
          sprintName,
          sprintId: sprintInfo?.id ?? 0,
          sprintStartDate: sprintInfo?.startDate ?? '',
          sprintEndDate: sprintInfo?.endDate ?? sprintInfo?.completeDate ?? '',
          issues,
          githubData,
        };
        save(cached);
      }

      res.json({ success: true, message: `Fetched ${sprintNames.length} sprint(s)` });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? String(err) });
    }
  });

  // API: Generate report data
  app.post('/api/report', async (req, res) => {
    const { projectKey, sprintName, filters } = req.body;
    const cached = load(projectKey, sprintName);
    if (!cached) {
      res.status(404).json({ error: `No cached data for ${projectKey} / "${sprintName}". Fetch first.` });
      return;
    }

    try {
      const fullMetrics = calculateSprintMetrics(cached);
      const filterOpts = toFilterOptions(filters);
      const filtered = applyFilters(fullMetrics.ticketMetrics, filterOpts);
      const metrics = filtered.length !== fullMetrics.ticketMetrics.length
        ? aggregateSprintMetrics(filtered, cached)
        : fullMetrics;

      res.json(metrics);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? String(err) });
    }
  });

  // API: List cached sprints for a team (Sprint Comparison Report — reads downloaded data only)
  app.get('/api/cached-sprints/:projectKey', (req, res) => {
    const projectKey = req.params.projectKey.toUpperCase();
    const sprints = listCached()
      .filter(c => c.projectKey.toUpperCase() === projectKey)
      .map(c => ({
        sprintName: c.sprintName,
        sprintStartDate: c.sprintStartDate,
        sprintEndDate: c.sprintEndDate,
        fetchedAt: c.fetchedAt,
        issueCount: c.issues.length,
      }))
      .sort((a, b) => new Date(a.sprintStartDate).getTime() - new Date(b.sprintStartDate).getTime());

    res.json(sprints);
  });

  // API: Sprint comparison report (trend charts across previously-fetched sprints)
  app.post('/api/comparison-report', (req, res) => {
    const { projectKey, sprintNames } = req.body;
    if (!projectKey || !Array.isArray(sprintNames) || sprintNames.length === 0) {
      res.status(400).json({ error: 'projectKey and a non-empty sprintNames array are required' });
      return;
    }

    try {
      const entries = buildComparisonReport(
        sprintNames.map((sprintName: string) => ({ projectKey, sprintName })),
      );
      const swimlaneOrder = SWIMLANE_ORDER.filter(s => s !== EXCLUDED_SWIMLANE);
      res.json({ swimlaneOrder, entries });
    } catch (err: any) {
      res.status(404).json({ error: err.message ?? String(err) });
    }
  });

  // API: JSON export of the sprint report(s) as shown, with an info block explaining the data
  app.post('/api/export/sprint-report', (req, res) => {
    const { projectKey, sprintNames, filters } = req.body;
    if (!projectKey || !Array.isArray(sprintNames) || sprintNames.length === 0) {
      res.status(400).json({ error: 'projectKey and a non-empty sprintNames array are required' });
      return;
    }

    try {
      res.json(buildSprintReportExport(projectKey, sprintNames, toFilterOptions(filters)));
    } catch (err: any) {
      res.status(404).json({ error: err.message ?? String(err) });
    }
  });

  // API: JSON export of the sprint comparison report
  app.post('/api/export/comparison', (req, res) => {
    const { projectKey, sprintNames } = req.body;
    if (!projectKey || !Array.isArray(sprintNames) || sprintNames.length === 0) {
      res.status(400).json({ error: 'projectKey and a non-empty sprintNames array are required' });
      return;
    }

    try {
      res.json(buildComparisonExport(projectKey, sprintNames));
    } catch (err: any) {
      res.status(404).json({ error: err.message ?? String(err) });
    }
  });

  // API: Plain-language explanation of the data, shown by the UI's "i" button
  app.get('/api/data-guide/:kind', (req, res) => {
    const { kind } = req.params;
    if (!isGuideKind(kind)) {
      res.status(404).json({ error: 'Unknown guide: ' + kind });
      return;
    }
    res.json(getDataGuide(kind));
  });

  // API: People report step 1 — who can be reported on, and which chosen sprints aren't fetched yet
  app.post('/api/people/options', (req, res) => {
    const { projectKey, sprintNames } = req.body;
    if (!projectKey || !Array.isArray(sprintNames) || sprintNames.length === 0) {
      res.status(400).json({ error: 'projectKey and a non-empty sprintNames array are required' });
      return;
    }

    try {
      res.json(listPeopleOptions(projectKey, sprintNames));
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? String(err) });
    }
  });

  // API: People report — one person, one role, combined across the chosen (fetched) sprints
  app.post('/api/people/report', (req, res) => {
    const { projectKey, sprintNames, person, role } = req.body;
    if (!projectKey || !Array.isArray(sprintNames) || sprintNames.length === 0 || !person || (role !== 'dev' && role !== 'qa')) {
      res.status(400).json({ error: 'projectKey, sprintNames, person and role (dev|qa) are required' });
      return;
    }

    try {
      res.json(buildPeopleReport(projectKey, sprintNames, person, role as PersonRole));
    } catch (err: any) {
      res.status(404).json({ error: err.message ?? String(err) });
    }
  });

  // API: Claude analysis
  app.post('/api/analyze', async (req, res) => {
    if (!hasClaudeToken(config)) {
      res.status(400).json({ error: 'AI analysis is not configured. Set CLAUDE_CODE_OAUTH_TOKEN to enable it.' });
      return;
    }

    const { projectKey, sprintName, filters, model, forceRefresh } = req.body;
    const cached = load(projectKey, sprintName);
    if (!cached) {
      res.status(404).json({ error: `No cached data. Fetch first.` });
      return;
    }

    try {
      const resolvedModel = model ?? 'claude-sonnet-5';
      const filterOpts = toFilterOptions(filters);
      const analysisKey = JSON.stringify({ model: resolvedModel, filterOpts });

      const existing = !forceRefresh ? findAnalysis(cached, analysisKey) : undefined;
      if (existing) {
        res.json({ analysis: existing.text, cached: true, generatedAt: existing.generatedAt });
        return;
      }

      const fullMetrics = calculateSprintMetrics(cached);
      const filtered = applyFilters(fullMetrics.ticketMetrics, filterOpts);
      const metrics = filtered.length !== fullMetrics.ticketMetrics.length
        ? aggregateSprintMetrics(filtered, cached)
        : fullMetrics;

      const { buildAnalysisPrompt, runClaudeCli } = await import('../services/claude-analyzer.js');
      const prompt = buildAnalysisPrompt(metrics);

      const text = await runClaudeCli(prompt, resolvedModel);
      const generatedAt = new Date().toISOString();
      saveAnalysis(projectKey, sprintName, { key: analysisKey, model: resolvedModel, filters: filterOpts, text, generatedAt });

      res.json({ analysis: text, cached: false, generatedAt });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? String(err) });
    }
  });

  const PORT = 3847;
  const server = createServer(app);
  server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    log.success(`Sprint Report UI running at ${url}`);
    open(url);
  });
}
