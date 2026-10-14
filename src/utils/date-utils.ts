export function formatDuration(ms: number): string {
  if (ms < 0) return '0m';

  const totalMinutes = Math.floor(ms / 60_000);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);

  const minutes = totalMinutes % 60;
  const hours = totalHours % 24;

  const parts: string[] = [];
  if (totalDays > 0) parts.push(`${totalDays}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 && totalDays === 0) parts.push(`${minutes}m`);

  return parts.length > 0 ? parts.join(' ') : '< 1m';
}

export function formatDurationShort(ms: number): string {
  const totalHours = ms / 3_600_000;
  if (totalHours < 1) return `${Math.round(ms / 60_000)}m`;
  if (totalHours < 24) return `${totalHours.toFixed(1)}h`;
  const days = totalHours / 24;
  return `${days.toFixed(1)}d`;
}

export function clampTimestamp(timestamp: string, start: string, end: string): string {
  const t = new Date(timestamp).getTime();
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();

  if (t < s) return start;
  if (t > e) return end;
  return timestamp;
}

export function isWithinRange(timestamp: string, start: string, end: string): boolean {
  const t = new Date(timestamp).getTime();
  return t >= new Date(start).getTime() && t <= new Date(end).getTime();
}

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export const WORKDAY_START_HOUR_UTC = 8;
export const WORKDAY_END_HOUR_UTC = 17;

/**
 * Milliseconds between two timestamps that fall inside working time: Monday–Friday,
 * 08:00–17:00 UTC (9h per day). Weekends and out-of-hours time are not counted.
 */
export function businessMsBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (end <= start) return 0;

  let total = 0;
  const first = new Date(start);
  let dayStart = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate());

  while (dayStart < end) {
    const dayOfWeek = new Date(dayStart).getUTCDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const windowStart = Math.max(start, dayStart + WORKDAY_START_HOUR_UTC * MS_PER_HOUR);
      const windowEnd = Math.min(end, dayStart + WORKDAY_END_HOUR_UTC * MS_PER_HOUR);
      if (windowEnd > windowStart) total += windowEnd - windowStart;
    }
    dayStart += MS_PER_DAY;
  }

  return total;
}
