import { Command } from 'commander';

export const analyzeCommand = new Command('analyze')
  .description('Analyze sprint data using Claude AI')
  .requiredOption('-p, --project <key>', 'Jira project key (e.g. SQM)')
  .requiredOption('-s, --sprint <name...>', 'Sprint name(s)')
  .option('--model <model>', 'Override Claude model', 'claude-sonnet-5')
  .option('--dev <name>', 'Filter by developer')
  .option('--qa <name>', 'Filter by QA assignee')
  .option('--ticket <keys>', 'Comma-separated ticket keys')
  .option('--type <types>', 'Comma-separated issue types')
  .action(async (options) => {
    const { runAnalyze } = await import('../services/claude-analyzer.js');
    await runAnalyze(options);
  });
