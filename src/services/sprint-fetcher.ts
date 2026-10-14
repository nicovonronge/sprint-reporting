import ora from 'ora';
import { getConfig, hasGitHubToken } from '../config.js';
import { JiraClient } from '../clients/jira-client.js';
import { GitHubClient } from '../clients/github-client.js';
import { save, type CachedSprintData } from '../cache/cache-manager.js';
import { PROJECT_REPOS, PROJECT_BOARDS } from '../constants/workflow.js';
import type { JiraIssue, JiraSprint } from '../types/jira.js';
import type { GitHubPR } from '../types/github.js';
import { CUSTOM_FIELDS } from '../constants/workflow.js';
import * as log from '../utils/logger.js';

interface FetchOptions {
  project: string;
  sprint?: string[];
  active?: boolean;
  github?: boolean;
  board?: string;
}

/**
 * Bugs created while the sprint ran that are not in the sprint itself, so the people report can
 * list the bugs a person reported even when the bug was never sprinted. A sprint with no start
 * date (future) has nothing to look at. The window runs from the sprint start to the start of the
 * next sprint, so bugs raised in the gap between two sprints are not lost.
 */
export async function fetchReportedBugs(
  jira: JiraClient,
  projectKey: string,
  sprintStartDate: string,
  sprintEndDate: string,
  allSprints: JiraSprint[],
  sprintIssues: JiraIssue[],
): Promise<JiraIssue[]> {
  if (!sprintStartDate) return [];
  const startMs = Date.parse(sprintStartDate);
  const nextStart = allSprints
    .map(s => (s.startDate ? Date.parse(s.startDate) : NaN))
    .filter(ms => ms > startMs)
    .sort((a, b) => a - b)[0];
  const windowEndMs = Math.min(
    Date.now(),
    nextStart ?? (sprintEndDate ? Date.parse(sprintEndDate) : Date.now()),
  );
  const end = new Date(Math.max(windowEndMs, startMs)).toISOString();
  const inSprint = new Set(sprintIssues.map(i => i.key));
  const bugs = await jira.searchBugsCreatedBetween(projectKey, sprintStartDate, end);
  return bugs.filter(b => !inSprint.has(b.key));
}

export async function runFetch(options: FetchOptions): Promise<void> {
  const config = getConfig();
  const jira = new JiraClient(config.JIRA_BASE_URL, config.JIRA_EMAIL, config.JIRA_API_TOKEN);

  const projectKey = options.project.toUpperCase();
  const boardId = options.board ? parseInt(options.board, 10) : PROJECT_BOARDS[projectKey];

  let sprintNames: string[] = [];

  if (options.active) {
    if (!boardId) {
      log.error(`No board ID configured for project ${projectKey}. Use --board <id>.`);
      process.exit(1);
    }
    const spinner = ora('Finding active sprint...').start();
    const sprints = await jira.getSprintsForBoard(boardId);
    const active = sprints.filter(s => s.state === 'active');
    spinner.stop();

    if (active.length === 0) {
      log.error('No active sprint found.');
      process.exit(1);
    }
    sprintNames = active.map(s => s.name);
    log.info(`Active sprint(s): ${sprintNames.join(', ')}`);
  } else if (options.sprint) {
    sprintNames = options.sprint;
  } else {
    log.error('Specify --sprint <name> or --active');
    process.exit(1);
  }

  const allSprints = boardId ? await jira.getSprintsForBoard(boardId) : [];

  for (const sprintName of sprintNames) {
    await fetchSprint(jira, config, projectKey, sprintName, allSprints, options.github !== false);
  }
}

async function fetchSprint(
  jira: JiraClient,
  config: ReturnType<typeof getConfig>,
  projectKey: string,
  sprintName: string,
  allSprints: JiraSprint[],
  fetchGitHub: boolean,
): Promise<void> {
  log.heading(`Fetching: ${projectKey} / ${sprintName}`);

  const sprintInfo = allSprints.find(s => s.name === sprintName);

  const jql = `project = ${projectKey} AND sprint = "${sprintName}"`;
  const spinner = ora('Fetching Jira issues...').start();

  const issues: JiraIssue[] = await jira.searchAllIssues(jql);
  spinner.succeed(`Fetched ${issues.length} issues from Jira`);

  let githubData: Record<string, GitHubPR[]> = {};

  if (fetchGitHub && !hasGitHubToken(config)) {
    log.warn('GITHUB_TOKEN not set — skipping GitHub PR fetch');
  } else if (fetchGitHub) {
    const repos = PROJECT_REPOS[projectKey];
    if (repos && repos.length > 0) {
      const ghClient = new GitHubClient(config.GITHUB_TOKEN!);
      const ghSpinner = ora(`Fetching GitHub PRs (0/${issues.length})...`).start();

      for (let i = 0; i < issues.length; i++) {
        const issue = issues[i];
        ghSpinner.text = `Fetching GitHub PRs (${i + 1}/${issues.length}): ${issue.key}`;
        const prs = await ghClient.searchPRsForTicket(issue.key, repos);
        if (prs.length > 0) {
          githubData[issue.key] = prs;
        }
      }

      const ticketsWithPRs = Object.keys(githubData).length;
      ghSpinner.succeed(`GitHub: found PRs for ${ticketsWithPRs}/${issues.length} tickets`);
    } else {
      log.warn(`No GitHub repos configured for project ${projectKey}`);
    }
  }

  const sprintStartDate = sprintInfo?.startDate ?? '';
  const sprintEndDate = sprintInfo?.endDate ?? sprintInfo?.completeDate ?? '';
  const bugSpinner = ora('Fetching bugs reported during the sprint...').start();
  const reportedBugs = await fetchReportedBugs(jira, projectKey, sprintStartDate, sprintEndDate, allSprints, issues);
  bugSpinner.succeed(`Fetched ${reportedBugs.length} more bug(s) created during the sprint (not in it)`);

  const cached: CachedSprintData = {
    fetchedAt: new Date().toISOString(),
    projectKey,
    sprintName,
    sprintId: sprintInfo?.id ?? 0,
    sprintStartDate,
    sprintEndDate,
    issues,
    githubData,
    reportedBugs,
  };

  save(cached);
  log.success(`Cached to data/${projectKey.toLowerCase()}_*.json`);
}
