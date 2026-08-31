import ora from 'ora';
import { getConfig } from '../config.js';
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

  if (fetchGitHub) {
    const repos = PROJECT_REPOS[projectKey];
    if (repos && repos.length > 0) {
      const ghClient = new GitHubClient(config.GITHUB_TOKEN);
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
  log.success(`Cached to data/${projectKey.toLowerCase()}_*.json`);
}
