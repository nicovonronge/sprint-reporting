import type { JiraIssue } from '../types/jira.js';

export interface DefectInfo {
  count: number;
  keys: string[];
}

export function detectLinkedDefects(issue: JiraIssue): DefectInfo {
  const links = issue.fields.issuelinks ?? [];
  const bugKeys: string[] = [];

  for (const link of links) {
    const linked = link.inwardIssue ?? link.outwardIssue;
    if (!linked) continue;
    if (linked.fields.issuetype.name === 'Bug') {
      bugKeys.push(linked.key);
    }
  }

  return { count: bugKeys.length, keys: bugKeys };
}
