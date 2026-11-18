import type { JiraSprint } from '../types/jira.js';

// How far back the sprint pickers (web UI and CLI) list closed sprints.
export const SPRINT_LOOKBACK_MONTHS = 18;

const closedTime = (s: JiraSprint): number => new Date(s.completeDate ?? s.endDate ?? '').getTime();

// Closed sprints that finished within the last SPRINT_LOOKBACK_MONTHS, newest first.
// A closed sprint with no usable date is kept rather than silently hidden.
export function recentClosedSprints(sprints: JiraSprint[], now: Date = new Date()): JiraSprint[] {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - SPRINT_LOOKBACK_MONTHS);
  return sprints
    .filter(s => s.state === 'closed')
    .filter(s => {
      const t = closedTime(s);
      return Number.isNaN(t) || t >= cutoff.getTime();
    })
    .sort((a, b) => (Number.isNaN(closedTime(b)) ? 0 : closedTime(b)) - (Number.isNaN(closedTime(a)) ? 0 : closedTime(a)));
}
