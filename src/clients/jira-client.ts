import axios, { type AxiosInstance } from 'axios';
import type {
  JiraSearchResponse, JiraIssue, JiraField,
  JiraSprintListResponse, JiraSprint,
} from '../types/jira.js';
import { JIRA_FIELDS_TO_FETCH, BUG_ISSUE_TYPE } from '../constants/workflow.js';

export class JiraClient {
  private client: AxiosInstance;

  constructor(baseUrl: string, email: string, apiToken: string) {
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
  }

  async *searchIssues(jql: string, fields?: string[]): AsyncGenerator<JiraIssue> {
    const fieldsToFetch = fields ?? JIRA_FIELDS_TO_FETCH;
    let nextPageToken: string | undefined;

    while (true) {
      const params: Record<string, string> = {
        jql,
        fields: fieldsToFetch.join(','),
        expand: 'changelog',
        maxResults: '100',
      };
      if (nextPageToken) params.nextPageToken = nextPageToken;

      const response = await this.client.get<JiraSearchResponse>(
        '/rest/api/3/search/jql',
        { params },
      );

      const data = response.data;
      for (const issue of data.issues) {
        yield issue;
      }

      if (!data.nextPageToken) break;
      nextPageToken = data.nextPageToken;
    }
  }

  async searchAllIssues(jql: string, fields?: string[]): Promise<JiraIssue[]> {
    const issues: JiraIssue[] = [];
    for await (const issue of this.searchIssues(jql, fields)) {
      issues.push(issue);
    }
    return issues;
  }

  /**
   * Bugs created inside a window, whether or not they were ever put in a sprint. Used to find the
   * bugs a person reported. JQL dates are in the Jira site's timezone, so the query is padded by a
   * day each side and the exact window is applied here.
   */
  async searchBugsCreatedBetween(projectKey: string, startIso: string, endIso: string): Promise<JiraIssue[]> {
    const day = 24 * 60 * 60 * 1000;
    const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const startMs = Date.parse(startIso);
    const endMs = Date.parse(endIso);
    const jql = `project = ${projectKey} AND issuetype = "${BUG_ISSUE_TYPE}" AND created >= "${fmt(startMs - day)}" AND created <= "${fmt(endMs + 2 * day)}"`;
    const issues = await this.searchAllIssues(jql);
    return issues.filter(i => {
      const created = Date.parse(i.fields.created);
      return created >= startMs && created <= endMs;
    });
  }

  async getSprintsForBoard(boardId: number): Promise<JiraSprint[]> {
    const sprints: JiraSprint[] = [];
    let startAt = 0;
    const maxResults = 50;

    while (true) {
      const response = await this.client.get<JiraSprintListResponse>(
        `/rest/agile/1.0/board/${boardId}/sprint`,
        { params: { startAt, maxResults, state: 'active,closed,future' } },
      );

      sprints.push(...response.data.values);
      if (response.data.isLast) break;
      startAt += maxResults;
    }

    return sprints;
  }

  async getFields(): Promise<JiraField[]> {
    const response = await this.client.get<JiraField[]>('/rest/api/3/field');
    return response.data;
  }
}
