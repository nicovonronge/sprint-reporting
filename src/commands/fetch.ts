import { Command } from 'commander';

export const fetchCommand = new Command('fetch')
  .description('Fetch sprint data from Jira and GitHub, cache locally')
  .requiredOption('-p, --project <key>', 'Jira project key (e.g. SQM)')
  .option('-s, --sprint <name...>', 'Sprint name(s) to fetch')
  .option('-a, --active', 'Fetch the currently active sprint')
  .option('--no-github', 'Skip GitHub data fetching')
  .option('--board <id>', 'Override board ID')
  .action(async (options) => {
    const { runFetch } = await import('../services/sprint-fetcher.js');
    await runFetch(options);
  });
