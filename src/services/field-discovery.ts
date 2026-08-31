import Table from 'cli-table3';
import chalk from 'chalk';
import { getConfig } from '../config.js';
import { JiraClient } from '../clients/jira-client.js';
import * as log from '../utils/logger.js';

interface FieldsOptions {
  search?: string;
}

export async function runFields(options: FieldsOptions): Promise<void> {
  const config = getConfig();
  const client = new JiraClient(config.JIRA_BASE_URL, config.JIRA_EMAIL, config.JIRA_API_TOKEN);

  log.info('Fetching Jira fields...');
  const fields = await client.getFields();

  let filtered = fields;
  if (options.search) {
    const term = options.search.toLowerCase();
    filtered = fields.filter(f => f.name.toLowerCase().includes(term) || f.id.toLowerCase().includes(term));
  }

  filtered.sort((a, b) => a.name.localeCompare(b.name));

  const table = new Table({
    head: [
      chalk.cyan('ID'),
      chalk.cyan('Name'),
      chalk.cyan('Type'),
      chalk.cyan('Custom'),
    ],
    colWidths: [30, 40, 20, 10],
    wordWrap: true,
  });

  for (const field of filtered) {
    table.push([
      field.id,
      field.name,
      field.schema?.type ?? '-',
      field.custom ? chalk.green('Yes') : chalk.dim('No'),
    ]);
  }

  console.log(table.toString());
  log.success(`Found ${filtered.length} fields${options.search ? ` matching "${options.search}"` : ''}`);
}
