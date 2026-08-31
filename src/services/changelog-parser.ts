import type { JiraIssue } from '../types/jira.js';
import type { StatusTransition, SwimlaneTime, SwimlaneTimeEntry } from '../types/metrics.js';
import { STATUS_TO_SWIMLANE, SWIMLANE_ORDER } from '../constants/workflow.js';
import { businessMsBetween } from '../utils/date-utils.js';

export function parseTransitions(issue: JiraIssue): StatusTransition[] {
  const changelog = issue.changelog;
  if (!changelog || !changelog.histories) return [];

  const transitions: StatusTransition[] = [];

  for (const history of changelog.histories) {
    for (const item of history.items) {
      if (item.field !== 'status') continue;

      transitions.push({
        fromStatus: item.fromString,
        toStatus: item.toString ?? '',
        fromSwimlane: item.fromString ? (STATUS_TO_SWIMLANE[item.fromString] ?? 'UNKNOWN') : null,
        toSwimlane: STATUS_TO_SWIMLANE[item.toString ?? ''] ?? 'UNKNOWN',
        timestamp: history.created,
      });
    }
  }

  transitions.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return transitions;
}

export function computeSwimlaneTimes(
  issue: JiraIssue,
  transitions: StatusTransition[],
  clampStart?: string,
  clampEnd?: string,
): SwimlaneTime[] {
  const swimlaneEntries: Record<string, SwimlaneTimeEntry[]> = {};
  for (const s of SWIMLANE_ORDER) swimlaneEntries[s] = [];

  if (transitions.length === 0) {
    const currentStatus = issue.fields.status.name;
    const swimlane = STATUS_TO_SWIMLANE[currentStatus] ?? 'UNKNOWN';
    const entered = issue.fields.created;
    const now = new Date().toISOString();
    const isDone = swimlane === 'DONE';

    const effectiveEntered = clampStart ? maxDate(entered, clampStart) : entered;
    const effectiveExited = isDone ? entered : (clampEnd ? minDate(now, clampEnd) : now);

    if (new Date(effectiveEntered).getTime() < new Date(effectiveExited).getTime()) {
      if (!swimlaneEntries[swimlane]) swimlaneEntries[swimlane] = [];
      swimlaneEntries[swimlane].push({
        entered: effectiveEntered,
        exited: effectiveExited,
        durationMs: businessMsBetween(effectiveEntered, effectiveExited),
      });
    }

    return buildResult(swimlaneEntries);
  }

  // Infer initial status from the first transition's fromStatus
  const firstTransition = transitions[0];
  const initialStatus = firstTransition.fromStatus;
  const initialSwimlane = initialStatus ? (STATUS_TO_SWIMLANE[initialStatus] ?? 'UNKNOWN') : null;

  interface Segment {
    swimlane: string;
    entered: string;
    exited: string;
  }

  const segments: Segment[] = [];

  // Initial segment: created → first transition
  if (initialSwimlane) {
    segments.push({
      swimlane: initialSwimlane,
      entered: issue.fields.created,
      exited: firstTransition.timestamp,
    });
  }

  // Segments between transitions
  for (let i = 0; i < transitions.length; i++) {
    const t = transitions[i];
    const nextTimestamp = i + 1 < transitions.length
      ? transitions[i + 1].timestamp
      : null;

    const swimlane = t.toSwimlane;
    const entered = t.timestamp;
    const exited = nextTimestamp ?? (swimlane === 'DONE' ? t.timestamp : new Date().toISOString());

    segments.push({ swimlane, entered, exited });
  }

  // Clamp and accumulate
  for (const seg of segments) {
    let effectiveEntered = seg.entered;
    let effectiveExited = seg.exited;

    if (clampStart) effectiveEntered = maxDate(effectiveEntered, clampStart);
    if (clampEnd) effectiveExited = minDate(effectiveExited, clampEnd);

    const enteredMs = new Date(effectiveEntered).getTime();
    const exitedMs = new Date(effectiveExited).getTime();

    if (exitedMs <= enteredMs) continue;

    if (!swimlaneEntries[seg.swimlane]) swimlaneEntries[seg.swimlane] = [];
    swimlaneEntries[seg.swimlane].push({
      entered: effectiveEntered,
      exited: effectiveExited,
      durationMs: businessMsBetween(effectiveEntered, effectiveExited),
    });
  }

  return buildResult(swimlaneEntries);
}

function buildResult(swimlaneEntries: Record<string, SwimlaneTimeEntry[]>): SwimlaneTime[] {
  return SWIMLANE_ORDER
    .filter(s => swimlaneEntries[s] && swimlaneEntries[s].length > 0)
    .map(swimlane => ({
      swimlane,
      totalMs: swimlaneEntries[swimlane].reduce((sum, e) => sum + e.durationMs, 0),
      entries: swimlaneEntries[swimlane],
    }));
}

function maxDate(a: string, b: string): string {
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function minDate(a: string, b: string): string {
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

/**
 * True when a ticket has only ever been in a To-Do-swimlane status — refined into Todo and
 * never progressed further. Used to detect backlog tickets whose Todo time should be measured
 * from sprint start rather than creation date.
 */
export function isTodoOnly(times: SwimlaneTime[]): boolean {
  return times.length === 1 && times[0].swimlane === 'TO DO';
}

export function extractSwimlaneMs(times: SwimlaneTime[], swimlane: string): number {
  return times.find(t => t.swimlane === swimlane)?.totalMs ?? 0;
}

export function stripSwimlane(times: SwimlaneTime[], swimlane: string): SwimlaneTime[] {
  return times.filter(t => t.swimlane !== swimlane);
}

/**
 * Clamps a swimlane's entries to start no earlier than `notBefore`, recomputing durations.
 * Entries that collapse entirely (e.g. `notBefore` falls after the entry's exit) are dropped.
 */
export function rebaseSwimlaneTime(times: SwimlaneTime[], swimlane: string, notBefore: string): SwimlaneTime[] {
  return times
    .map(t => {
      if (t.swimlane !== swimlane) return t;

      const entries = t.entries
        .map((e): SwimlaneTimeEntry | null => {
          const entered = maxDate(e.entered, notBefore);
          const exited = e.exited ?? entered;
          const durationMs = businessMsBetween(entered, exited);
          return durationMs > 0 ? { entered, exited, durationMs } : null;
        })
        .filter((e): e is SwimlaneTimeEntry => e !== null);

      return { swimlane: t.swimlane, totalMs: entries.reduce((sum, e) => sum + e.durationMs, 0), entries };
    })
    .filter(t => t.entries.length > 0);
}
