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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Milliseconds between two timestamps, excluding Saturdays and Sundays (UTC day boundaries).
 */
export function businessMsBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (end <= start) return 0;

  let cursor = start;
  let total = 0;

  while (cursor < end) {
    const cursorDate = new Date(cursor);
    const dayStart = Date.UTC(cursorDate.getUTCFullYear(), cursorDate.getUTCMonth(), cursorDate.getUTCDate());
    const dayEnd = dayStart + MS_PER_DAY;
    const segmentEnd = Math.min(end, dayEnd);
    const dayOfWeek = cursorDate.getUTCDay();

    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      total += segmentEnd - cursor;
    }

    cursor = dayEnd;
  }

  return total;
}
