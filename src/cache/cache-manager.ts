import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { JiraIssue } from '../types/jira.js';
import type { GitHubPR } from '../types/github.js';
import type { FilterOptions } from '../types/metrics.js';

const DATA_DIR = join(process.cwd(), 'data');

export interface CachedAnalysis {
  key: string;
  model: string;
  filters: FilterOptions;
  text: string;
  generatedAt: string;
}

export interface CachedSprintData {
  fetchedAt: string;
  projectKey: string;
  sprintName: string;
  sprintId: number;
  sprintStartDate: string;
  sprintEndDate: string;
  issues: JiraIssue[];
  githubData: Record<string, GitHubPR[]>;
  analyses?: CachedAnalysis[];
}

function slugify(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
}

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function filePath(projectKey: string, sprintName: string): string {
  return join(DATA_DIR, `${projectKey.toLowerCase()}_${slugify(sprintName)}.json`);
}

export function save(data: CachedSprintData): void {
  ensureDir();
  const path = filePath(data.projectKey, data.sprintName);
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

export function load(projectKey: string, sprintName: string): CachedSprintData | null {
  const path = filePath(projectKey, sprintName);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw) as CachedSprintData;
}

export function listCached(): CachedSprintData[] {
  ensureDir();
  const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  return files.map(f => {
    const raw = readFileSync(join(DATA_DIR, f), 'utf-8');
    return JSON.parse(raw) as CachedSprintData;
  });
}

export function findAnalysis(cached: CachedSprintData, key: string): CachedAnalysis | undefined {
  return cached.analyses?.find(a => a.key === key);
}

export function saveAnalysis(projectKey: string, sprintName: string, analysis: CachedAnalysis): void {
  const cached = load(projectKey, sprintName);
  if (!cached) return;
  const analyses = (cached.analyses ?? []).filter(a => a.key !== analysis.key);
  analyses.push(analysis);
  save({ ...cached, analyses });
}
