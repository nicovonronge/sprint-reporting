#!/usr/bin/env node

import { Command } from 'commander';
import { fetchCommand } from './commands/fetch.js';
import { reportCommand } from './commands/report.js';
import { analyzeCommand } from './commands/analyze.js';
import { fieldsCommand } from './commands/fields.js';

const program = new Command();

program
  .name('sprint-report')
  .description('Measure sprint ticket turnaround times using Jira and GitHub data')
  .version('1.0.0');

program.addCommand(fetchCommand);
program.addCommand(reportCommand);
program.addCommand(analyzeCommand);
program.addCommand(fieldsCommand);

// If no command is given, launch web UI
const args = process.argv.slice(2);
const hasCommand = args.length > 0 && !args[0].startsWith('-');

if (!hasCommand || args.length === 0) {
  import('./web/server.js').then(({ startWebUI }) => startWebUI());
} else {
  program.parse();
}
