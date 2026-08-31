import { Command } from 'commander';

export const fieldsCommand = new Command('fields')
  .description('List all Jira custom fields (for discovering field IDs)')
  .option('--search <term>', 'Filter fields by name (case-insensitive)')
  .action(async (options) => {
    const { runFields } = await import('../services/field-discovery.js');
    await runFields(options);
  });
