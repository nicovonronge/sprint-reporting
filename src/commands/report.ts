import { Command } from 'commander';

export const reportCommand = new Command('report')
  .description('Generate terminal and HTML reports from cached sprint data')
  .requiredOption('-p, --project <key>', 'Jira project key (e.g. SQM)')
  .requiredOption('-s, --sprint <name...>', 'Sprint name(s)')
  .option('--html', 'Generate HTML report')
  .option('--open', 'Auto-open HTML report in browser')
  .option('-o, --output <path>', 'Custom output path for HTML report')
  .option('--dev <name>', 'Filter by developer (assignee display name)')
  .option('--qa <name>', 'Filter by QA assignee')
  .option('--ticket <keys>', 'Comma-separated ticket keys (e.g. SQM-123,SQM-456)')
  .option('--type <types>', 'Comma-separated issue types (e.g. Story,Bug)')
  .action(async (options) => {
    const { runReport } = await import('../reporters/report-runner.js');
    await runReport(options);
  });
