import { select, checkbox, confirm, input } from '@inquirer/prompts';
import ora from 'ora';
import chalk from 'chalk';
import { getConfig, hasGitHubToken, hasClaudeToken } from './config.js';
import { JiraClient } from './clients/jira-client.js';
import { PROJECT_BOARDS, PROJECT_REPOS, TEAMS } from './constants/workflow.js';
import type { JiraSprint } from './types/jira.js';
import * as log from './utils/logger.js';

export async function runInteractive(): Promise<void> {
  console.log(chalk.bold('\n  Sprint Report Tool\n'));

  const config = getConfig();
  const jira = new JiraClient(config.JIRA_BASE_URL, config.JIRA_EMAIL, config.JIRA_API_TOKEN);

  // Step 1: Pick a team
  const projectKey = await select({
    message: 'Which team?',
    choices: TEAMS.map(t => ({
      name: `${t.name} (${t.key})`,
      value: t.key,
    })),
  });

  // Step 2: Load sprints for that team
  const boardId = PROJECT_BOARDS[projectKey];
  if (!boardId) {
    const boardInput = await input({
      message: `No board ID configured for ${projectKey}. Enter the Jira board ID:`,
    });
    PROJECT_BOARDS[projectKey] = parseInt(boardInput, 10);
  }

  const spinner = ora('Loading sprints...').start();
  let sprints: JiraSprint[];
  try {
    sprints = await jira.getSprintsForBoard(PROJECT_BOARDS[projectKey]);
  } catch (err: any) {
    spinner.fail('Failed to load sprints');
    log.error(err.message ?? String(err));
    process.exit(1);
  }
  spinner.stop();

  // Show recent sprints (active + last few closed + future), most recent first
  const activeSprints = sprints.filter(s => s.state === 'active');
  const closedSprints = sprints.filter(s => s.state === 'closed')
    .sort((a, b) => new Date(b.completeDate ?? b.endDate ?? '').getTime() - new Date(a.completeDate ?? a.endDate ?? '').getTime())
    .slice(0, 10);
  const futureSprints = sprints.filter(s => s.state === 'future');

  const sprintChoices = [
    ...activeSprints.map(s => ({ name: `${chalk.green('●')} ${s.name} (active)`, value: s.name })),
    ...futureSprints.map(s => ({ name: `${chalk.blue('○')} ${s.name} (future)`, value: s.name })),
    ...closedSprints.map(s => ({ name: `${chalk.dim('●')} ${s.name} (closed)`, value: s.name })),
  ];

  if (sprintChoices.length === 0) {
    log.error('No sprints found for this board.');
    process.exit(1);
  }

  const selectedSprints = await checkbox({
    message: 'Select sprint(s):',
    choices: sprintChoices,
    required: true,
  });

  // Step 3: Pick an action
  const githubEnabled = hasGitHubToken(config);
  const claudeEnabled = hasClaudeToken(config);
  const action = await select({
    message: 'What would you like to do?',
    choices: [
      ...(githubEnabled ? [{ name: 'Fetch data from Jira & GitHub', value: 'fetch' }] : []),
      { name: githubEnabled ? 'Fetch data (skip GitHub)' : 'Fetch data (GITHUB_TOKEN not set)', value: 'fetch-no-gh' },
      { name: 'Generate report (terminal)', value: 'report' },
      { name: 'Generate report (terminal + HTML)', value: 'report-html' },
      ...(claudeEnabled ? [
        { name: 'Claude AI analysis', value: 'analyze' },
        { name: 'Fetch → Report → Analyze (full pipeline)', value: 'full' },
      ] : [
        { name: 'Fetch → Report (CLAUDE_CODE_OAUTH_TOKEN not set — no analysis)', value: 'full' },
      ]),
    ],
  });

  // Step 4: Filtering (for report/analyze actions)
  let filters: { dev?: string; qa?: string; ticket?: string; type?: string } = {};
  if (['report', 'report-html', 'analyze', 'full'].includes(action)) {
    const wantFilter = await confirm({
      message: 'Apply filters (developer, QA, ticket, type)?',
      default: false,
    });

    if (wantFilter) {
      const devFilter = await input({ message: 'Developer name (leave empty to skip):' });
      const qaFilter = await input({ message: 'QA assignee name (leave empty to skip):' });
      const ticketFilter = await input({ message: 'Ticket keys, comma-separated (leave empty to skip):' });
      const typeFilter = await input({ message: 'Issue types, comma-separated (leave empty to skip):' });

      if (devFilter) filters.dev = devFilter;
      if (qaFilter) filters.qa = qaFilter;
      if (ticketFilter) filters.ticket = ticketFilter;
      if (typeFilter) filters.type = typeFilter;
    }
  }

  // Step 5: Execute
  console.log('');

  if (action === 'fetch' || action === 'fetch-no-gh' || action === 'full') {
    const { runFetch } = await import('./services/sprint-fetcher.js');
    await runFetch({
      project: projectKey,
      sprint: selectedSprints,
      github: action !== 'fetch-no-gh',
    });
  }

  if (action === 'report' || action === 'report-html' || action === 'full') {
    const { runReport } = await import('./reporters/report-runner.js');
    await runReport({
      project: projectKey,
      sprint: selectedSprints,
      html: action === 'report-html' || action === 'full',
      open: action === 'report-html' || action === 'full',
      ...filters,
    });
  }

  if ((action === 'analyze' || action === 'full') && claudeEnabled) {
    const { runAnalyze } = await import('./services/claude-analyzer.js');
    await runAnalyze({
      project: projectKey,
      sprint: selectedSprints,
      ...filters,
    });
  }

  console.log('');
  log.success('Done!');
}
