export interface JiraSearchResponse {
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
  nextPageToken?: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: JiraIssueFields;
  changelog?: JiraChangelog;
}

export interface JiraIssueFields {
  summary: string;
  status: JiraStatus;
  assignee: JiraUser | null;
  issuetype: JiraIssueType;
  issuelinks: JiraIssueLink[];
  created: string;
  updated: string;
  resolution: JiraResolution | null;
  resolutiondate: string | null;
  priority: JiraPriority;
  components?: Array<{ id: string; name: string }>;
  labels?: string[];
  fixVersions?: Array<{ id: string; name: string }>;
  versions?: Array<{ id: string; name: string }>;
  reporter?: JiraUser | null;
  creator?: JiraUser | null;
  subtasks?: Array<{ id: string; key: string }>;
  parent?: { id: string; key: string; fields?: { summary?: string; issuetype?: JiraIssueType } } | null;
  watches?: { watchCount: number };
  statuscategorychangedate?: string;
  [key: string]: unknown;
}

export interface JiraStatus {
  id: string;
  name: string;
  statusCategory: {
    id: number;
    key: string;
    name: string;
  };
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  active: boolean;
}

export interface JiraIssueType {
  id: string;
  name: string;
  subtask: boolean;
}

export interface JiraIssueLink {
  id: string;
  type: {
    id: string;
    name: string;
    inward: string;
    outward: string;
  };
  inwardIssue?: JiraLinkedIssue;
  outwardIssue?: JiraLinkedIssue;
}

export interface JiraLinkedIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: JiraStatus;
    issuetype: JiraIssueType;
    priority?: JiraPriority;
  };
}

export interface JiraResolution {
  id: string;
  name: string;
  description?: string;
}

export interface JiraPriority {
  id: string;
  name: string;
}

export interface JiraChangelog {
  startAt: number;
  maxResults: number;
  total: number;
  histories: JiraChangelogHistory[];
}

export interface JiraChangelogHistory {
  id: string;
  created: string;
  author: JiraUser;
  items: JiraChangelogItem[];
}

export interface JiraChangelogItem {
  field: string;
  fieldId?: string;
  fieldtype: string;
  from: string | null;
  fromString: string | null;
  to: string | null;
  toString: string | null;
}

export interface JiraSprint {
  id: number;
  name: string;
  state: 'active' | 'closed' | 'future';
  boardId: number;
  goal?: string;
  startDate?: string;
  endDate?: string;
  completeDate?: string;
}

export interface JiraField {
  id: string;
  name: string;
  custom: boolean;
  schema?: {
    type: string;
    custom?: string;
    customId?: number;
  };
}

export interface JiraSprintListResponse {
  maxResults: number;
  startAt: number;
  isLast: boolean;
  values: JiraSprint[];
}
