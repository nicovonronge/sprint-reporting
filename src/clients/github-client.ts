import axios, { type AxiosInstance } from 'axios';
import type { GitHubSearchResponse, GitHubPRDetail, GitHubPR } from '../types/github.js';

export class GitHubClient {
  private client: AxiosInstance;
  private lastRequestTime = 0;
  private minIntervalMs = 2200;

  constructor(token: string) {
    this.client = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      await new Promise(resolve => setTimeout(resolve, this.minIntervalMs - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  async searchPRsForTicket(ticketKey: string, repos: string[]): Promise<GitHubPR[]> {
    const allPRs: GitHubPR[] = [];
    const seen = new Set<string>();

    for (const repo of repos) {
      await this.rateLimit();

      try {
        const response = await this.client.get<GitHubSearchResponse>(
          '/search/issues',
          { params: { q: `${ticketKey} type:pr repo:${repo}` } },
        );

        for (const item of response.data.items) {
          const uniqueKey = `${repo}#${item.number}`;
          if (seen.has(uniqueKey)) continue;
          seen.add(uniqueKey);

          const pr = await this.getPRDetail(repo, item.number);
          if (pr) allPRs.push(pr);
        }
      } catch {
        // Search may fail for rate limiting or permissions — skip gracefully
      }
    }

    return allPRs;
  }

  private async getPRDetail(repo: string, prNumber: number): Promise<GitHubPR | null> {
    await this.rateLimit();

    try {
      const response = await this.client.get<GitHubPRDetail>(
        `/repos/${repo}/pulls/${prNumber}`,
      );

      const d = response.data;
      return {
        number: d.number,
        title: d.title,
        body: d.body,
        state: d.state,
        createdAt: d.created_at,
        mergedAt: d.merged_at,
        closedAt: d.closed_at,
        headBranch: d.head.ref,
        baseBranch: d.base.ref,
        additions: d.additions,
        deletions: d.deletions,
        changedFiles: d.changed_files,
        repo,
        url: d.html_url,
      };
    } catch {
      return null;
    }
  }
}
