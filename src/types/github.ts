export interface GitHubPR {
  number: number;
  title: string;
  body: string | null;
  state: string;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  headBranch: string;
  baseBranch: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  repo: string;
  url: string;
}

export interface GitHubSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubSearchItem[];
}

export interface GitHubSearchItem {
  number: number;
  title: string;
  body: string | null;
  state: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  pull_request?: {
    merged_at: string | null;
    url: string;
  };
  html_url: string;
}

export interface GitHubPRDetail {
  number: number;
  title: string;
  body: string | null;
  state: string;
  created_at: string;
  merged_at: string | null;
  closed_at: string | null;
  head: { ref: string };
  base: { ref: string };
  additions: number;
  deletions: number;
  changed_files: number;
  html_url: string;
}

export interface TicketGitHubData {
  prs: GitHubPR[];
  firstPRCreated: string | null;
  lastPRMerged: string | null;
  totalPRTimeMs: number | null;
}
