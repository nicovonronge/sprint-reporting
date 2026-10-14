import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SWIMLANE_STATUSES: Record<string, string[]> = {
  'ESCALATED': ['Escalated'],
  'TO DO': ['To Do', 'QA Failed', 'Open', 'Ready for refinement'],
  'IN DEVELOPMENT': ['In development'],
  'READY FOR QA': ['QA Ready', 'PO Review Failed'],
  'IN QA': ['In QA'],
  'PO REVIEW': ['PO Review'],
  'DONE': ['Done', 'Not Reviewed', 'Scrapped'],
};

export const STATUS_TO_SWIMLANE: Record<string, string> = Object.entries(SWIMLANE_STATUSES)
  .reduce((acc, [swimlane, statuses]) => {
    for (const status of statuses) {
      acc[status] = swimlane;
    }
    return acc;
  }, {} as Record<string, string>);

export const SWIMLANE_ORDER = [
  'ESCALATED',
  'TO DO',
  'IN DEVELOPMENT',
  'READY FOR QA',
  'IN QA',
  'PO REVIEW',
  'DONE',
];

export const CUSTOM_FIELDS = {
  SPRINT: 'customfield_10007',
  STORY_POINTS: 'customfield_10011',
  QA_ASSIGNEE: 'customfield_11325',
  DEV_POINTS: 'customfield_11397',
  QA_POINTS: 'customfield_11398',
  ROOT_CAUSE: 'customfield_11330',
  WORK_CATEGORY: 'customfield_11408',
} as const;

interface WorkflowConfig {
  projectRepos: Record<string, string[]>;
  projectBoards: Record<string, number>;
  comparisonExcludedAssignees: string[];
}

// Team/org-specific values (repo mappings, board IDs, names) live in workflow.config.json,
// which is gitignored so this stays safe to publish. See workflow.config.example.json for
// the expected shape. Falls back to empty config if the file isn't present.
function loadWorkflowConfig(): WorkflowConfig {
  const defaults: WorkflowConfig = { projectRepos: {}, projectBoards: {}, comparisonExcludedAssignees: [] };
  try {
    const raw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../workflow.config.json'), 'utf-8');
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

const workflowConfig = loadWorkflowConfig();

export const PROJECT_REPOS: Record<string, string[]> = workflowConfig.projectRepos;

export const PROJECT_BOARDS: Record<string, number> = workflowConfig.projectBoards;

// Teams, keyed by Jira project key. Used by the team picker and shown on every report/export.
export const TEAMS: { key: string; name: string }[] = [
  { key: 'SQM', name: 'Mavericks' },
  { key: 'IFRS', name: 'Black Knights' },
  { key: 'AUD', name: 'A-Team' },
  { key: 'TAN', name: 'Titans' },
  { key: 'GM', name: 'Green Mambas' },
];

/** Team name for a Jira project key, or null for a project that isn't in TEAMS. */
export function getTeamName(projectKey: string): string | null {
  return TEAMS.find(t => t.key === projectKey.toUpperCase())?.name ?? null;
}

// Sprint Comparison Report only: these people hold tickets (leads/PMs/QA leads) but aren't
// doing dev work, so their tickets would skew swimlane/turnaround trends. Matched against the
// primary assignee only, never the QA assignee. See CLAUDE.md for the full rule.
export const COMPARISON_EXCLUDED_ASSIGNEES: string[] = workflowConfig.comparisonExcludedAssignees;

// Issue type of the bugs counted as "reported by" a person in the people report.
export const BUG_ISSUE_TYPE = 'Bug';

export const DEV_CYCLE_STATUS = 'QA Failed';
export const QA_CYCLE_STATUS = 'PO Review Failed';

// Escalated is an out-of-band interruption, not normal workflow time: currently-escalated
// tickets are dropped from reports entirely, and escalated time is excluded from durations
// for tickets that later moved on. See CLAUDE.md for the full rule.
export const EXCLUDED_SWIMLANE = 'ESCALATED';

export const JIRA_FIELDS_TO_FETCH = [
  'summary', 'status', 'assignee', 'issuetype', 'issuelinks',
  'created', 'updated', 'resolution', 'resolutiondate', 'priority',
  'components', 'labels', 'fixVersions', 'versions', 'reporter', 'creator',
  'subtasks', 'parent', 'watches', 'statuscategorychangedate',
  CUSTOM_FIELDS.SPRINT,
  CUSTOM_FIELDS.STORY_POINTS,
  CUSTOM_FIELDS.QA_ASSIGNEE,
  CUSTOM_FIELDS.DEV_POINTS,
  CUSTOM_FIELDS.QA_POINTS,
  CUSTOM_FIELDS.ROOT_CAUSE,
  CUSTOM_FIELDS.WORK_CATEGORY,
];
