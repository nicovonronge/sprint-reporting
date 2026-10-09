import type { JiraChangelogItem, JiraIssue } from '../types/jira.js';

/**
 * Reconstructs what a ticket field held at a given moment by replaying the changelog
 * backwards from its current value. The first change *after* `at` records the value as it was
 * at `at` (its `from`), so a field that hasn't changed since `at` simply keeps its current value.
 * Fields are matched by `fieldId` (e.g. `assignee`, `customfield_10011`).
 */

interface FieldChange {
  created: number;
  item: JiraChangelogItem;
}

function changesFor(issue: JiraIssue, fieldId: string): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const history of issue.changelog?.histories ?? []) {
    for (const item of history.items) {
      if (item.fieldId === fieldId) changes.push({ created: Date.parse(history.created), item });
    }
  }
  return changes.sort((a, b) => a.created - b.created);
}

function firstChangeAfter(issue: JiraIssue, fieldId: string, at: string): JiraChangelogItem | undefined {
  const atMs = Date.parse(at);
  return changesFor(issue, fieldId).find(c => c.created > atMs)?.item;
}

export function statusAt(issue: JiraIssue, at: string): string {
  const item = firstChangeAfter(issue, 'status', at);
  return item ? (item.fromString ?? issue.fields.status.name) : issue.fields.status.name;
}

/** Single-user / single-select / text fields: `fromString` is the display value. */
export function textAt(issue: JiraIssue, fieldId: string, at: string, current: string | null): string | null {
  const item = firstChangeAfter(issue, fieldId, at);
  return item ? (item.fromString || null) : current;
}

export function numberAt(issue: JiraIssue, fieldId: string, at: string, current: number | null): number | null {
  const item = firstChangeAfter(issue, fieldId, at);
  if (!item) return current;
  const n = item.fromString ? parseFloat(item.fromString) : NaN;
  return Number.isNaN(n) ? null : n;
}

/** Labels are logged as one space-separated string holding the full set. */
export function labelsAt(issue: JiraIssue, at: string, current: string[]): string[] {
  const item = firstChangeAfter(issue, 'labels', at);
  return item ? (item.fromString ?? '').split(' ').filter(Boolean) : current;
}

/**
 * Components / fix versions / affects versions are logged one add or remove per item, so undo
 * every change after `at`, newest first.
 */
export function namesAt(issue: JiraIssue, fieldId: string, at: string, current: string[]): string[] {
  const atMs = Date.parse(at);
  const later = changesFor(issue, fieldId).filter(c => c.created > atMs).reverse();
  const names = new Set(current);
  for (const { item } of later) {
    if (item.toString) names.delete(item.toString);
    if (item.fromString) names.add(item.fromString);
  }
  return [...names];
}

/**
 * QA assignee is a multi-user field logged as `[accountId, ...]` in from/to, with usernames
 * (not display names) in fromString. Resolve ids to display names via the users currently on
 * the ticket, falling back to the logged username for anyone since removed.
 */
export function usersAt(
  issue: JiraIssue,
  fieldId: string,
  at: string,
  current: Array<{ accountId?: string; displayName: string }>,
): string[] {
  const item = firstChangeAfter(issue, fieldId, at);
  if (!item) return current.map(u => u.displayName);

  const strip = (s: string | null) => (s ?? '').replace(/^\[|\]$/g, '').split(',').map(p => p.trim()).filter(Boolean);
  const ids = strip(item.from);
  const names = strip(item.fromString);
  const byId = new Map(current.filter(u => u.accountId).map(u => [u.accountId!, u.displayName]));

  return ids.map((id, i) => byId.get(id) ?? names[i] ?? id);
}
