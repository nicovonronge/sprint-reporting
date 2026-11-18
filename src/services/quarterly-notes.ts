import { formatMeasureValue } from './quarterly-report.js';
import { runClaudeCli } from './claude-analyzer.js';
import type { PersonRole } from '../types/people-report.js';
import type { QuarterlyNotes, QuarterlyReport, RoleSection } from '../types/quarterly-report.js';

/**
 * AI-written notes for the quarterly report. The model never types a figure: it writes tokens such as
 * [[cur:dev:Alex Example:median_turnaround]] and the numbers are filled in here from the report data,
 * so every number in the notes is the same number the tables show.
 */

const TOKEN_RE = /\[\[(prev|cur):(dev|qa):([^:\]]+):([a-z_]+)\]\]/g;
const ANY_TOKEN_RE = /\[\[[^\]]*\]\]/g;
const TICKET_KEY_RE = /\b[A-Z][A-Z0-9]+-\d+\b/g;
const SPRINT_NAME_RE = /\bSprints?\s+\d+(\.\d+)?\b/gi;

/** Figures the AI is allowed to cite for a person, and the plain wording the prompt shows for them. */
const PROMPT_MEASURES = ['tickets', 'completed', 'completed_sp', 'story_points', 'median_turnaround', 'cycles', 'rework_free', 'defects_per_ticket'];

function section(report: QuarterlyReport, role: PersonRole): RoleSection | null {
  return role === 'dev' ? report.dev : report.qa;
}

function resolveToken(report: QuarterlyReport, period: 'prev' | 'cur', role: PersonRole, subject: string, measure: string): string | null {
  const sec = section(report, role);
  if (!sec) return null;
  const side = period === 'prev' ? sec.previous : sec.current;
  const def = sec.measures.find(m => m.id === measure);
  if (!def) return null;
  let values: Record<string, number | null> | undefined;
  if (subject === 'board') values = side.board;
  else if (subject === 'average') values = side.average;
  else values = side.people.find(p => p.person === subject)?.values;
  if (!values) return null;
  return formatMeasureValue(values[measure], def.unit);
}

/** Replaces every token; returns the text and the tokens that did not match anything. */
function fillTokens(text: string, report: QuarterlyReport): { text: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const filled = text.replace(TOKEN_RE, (whole, period, role, subject, measure) => {
    const value = resolveToken(report, period, role, subject.trim(), measure);
    if (value === null) { unresolved.push(whole); return 'n/a'; }
    return value;
  });
  // Anything still shaped like a token is malformed.
  const malformed = filled.match(ANY_TOKEN_RE) ?? [];
  unresolved.push(...malformed);
  return { text: filled.replace(ANY_TOKEN_RE, 'n/a'), unresolved };
}

/** Every number written in a piece of text, as numbers. */
function numbersIn(text: string): number[] {
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

/**
 * A figure the model typed that is not backed by the data it was shown. Numbers the prompt itself gave
 * (ticket lane days, defect counts, story points, measure counts) may be quoted, rounded to a whole number;
 * tokens, ticket keys, sprint names and the period names are ignored.
 */
function typedNumbers(rawText: string, report: QuarterlyReport, allowedFrom: string): string | null {
  let rest = rawText.replace(ANY_TOKEN_RE, ' ').replace(TICKET_KEY_RE, ' ').replace(SPRINT_NAME_RE, ' ');
  for (const label of [report.previous.label, report.current.label]) rest = rest.split(label).join(' ');
  const allowed = numbersIn(allowedFrom.replace(TICKET_KEY_RE, ' ').replace(SPRINT_NAME_RE, ' '));
  const backed = (n: number) => allowed.some(a => a === n || Math.round(a) === n || Math.floor(a) === n);
  const re = /\d+(?:\.\d+)?/g;
  for (let m = re.exec(rest); m; m = re.exec(rest)) {
    if (!backed(Number(m[0]))) return rest.slice(Math.max(0, m.index - 25), m.index + m[0].length + 25).trim();
  }
  return null;
}

function peopleKey(role: PersonRole, name: string): string {
  return `${role}:${name}`;
}

/** Prompt text shown for each person (by key), so a note can be checked against what the model saw. */
const lastBlocks = new WeakMap<QuarterlyReport, Map<string, string>>();

export function buildQuarterlyNotesPrompt(report: QuarterlyReport): string {
  const blocks = new Map<string, string>();
  lastBlocks.set(report, blocks);
  const prev = report.previous, cur = report.current;
  const c = report.comparison;
  const team = report.teamName ? `${report.teamName}, ${report.projectKey}` : report.projectKey;
  const exampleRole: PersonRole = report.dev ? 'dev' : 'qa';
  const examplePerson = section(report, exampleRole)?.current.people[0]?.person ?? 'Name';

  const personBlocks = (['dev', 'qa'] as const).flatMap(role => {
    const sec = section(report, role);
    if (!sec) return [];
    return sec.current.people.map(p => {
      const before = sec.previous.people.find(x => x.person === p.person);
      const defs = sec.measures.filter(m => PROMPT_MEASURES.includes(m.id));
      const fmt = (values: Record<string, number | null> | undefined) =>
        defs.map(m => `${m.label}: ${formatMeasureValue(values?.[m.id], m.unit)}`).join(', ');
      const hints = report.hints.find(h => h.role === role && h.person === p.person);
      const list = (title: string, items: string[] | undefined) => items && items.length > 0 ? `\n  ${title}:\n${items.map(i => `    - ${i}`).join('\n')}` : '';
      const block = `### ${role === 'dev' ? 'Developer' : 'QA tester'}: ${p.person} (key "${peopleKey(role, p.person)}")
  ${cur.label}: ${fmt(p.values)}
  ${prev.label}: ${before ? fmt(before.values) : 'no report in this period (joined or changed role)'}
  ${cur.label} team average: ${fmt(sec.current.average)}
  ${cur.label} board: ${fmt(sec.current.board)}${list('Tickets carrying their rework cycles', hints?.cyclesByTicket)}${list('Open tickets with story points at the end of the period', hints?.openWithPoints)}${list('Tickets with the most linked defects', hints?.mostLinkedDefects)}${list('Longest time in their own lane', hints?.longestOwnLane)}${list('Longest waits in Ready for QA + PO Review', hints?.longestWaits)}`;
      blocks.set(peopleKey(role, p.person), block);
      return block;
    });
  });

  return `You are writing the short written notes for a quarterly cycling-time report for a software team. Be factual and fair; plain language, no jargon, use they/them for people.

Context: all durations are business time only (Mon-Fri 08:00-17:00 UTC, so a day is 9 hours; weekends and out-of-hours time are excluded). Escalated-lane tickets/time are already excluded. Developer cycles are moves to QA Failed; QA cycles are moves to PO Review Failed. A ticket is credited to whoever was its assignee (or QA assignee) at the end of the period. Linked defects are lifetime counts. A QA tester's turnaround includes waiting in PO Review, which QA does not control.

## Team: ${team}
- ${prev.label}: ${prev.description}
- ${cur.label}: ${cur.description}
- Verdict (already worked out, do not change it): ${c.verdict}. Of ${c.boardScored} scored whole-board measures, ${c.boardBetter} got better and ${c.boardWorse} got worse.
- Joined in ${cur.label}: ${c.onlyInCurrent.join(', ') || 'nobody'}. Not in ${cur.label}: ${c.onlyInPrevious.join(', ') || 'nobody'}.

## People (${cur.label} figures; use these to decide what stands out)
${personBlocks.join('\n\n')}

## What to write
Respond with ONE JSON object and nothing else:
{
  "verdict": "<one plain sentence saying why the verdict is ${c.verdict}; do not repeat the label>",
  "teamChange": "<one sentence on who joined or left, or 'The team had the same people in both periods.'>",
  "people": { "<the person's key exactly as shown above>": "<2-4 sentences>", ... }
}
Write one entry in "people" for every person above. In each person's note cover what is relevant of: what stands out against the team average and the board, good or bad; which tickets carry their cycles (especially repeated bug tickets raised from one story); which open tickets hold back story-point completion and their status; whether a long turnaround comes from waiting in Ready for QA or PO Review rather than their own lane; several tickets with near-identical lane times (possibly one piece of work split up); linked defects concentrated on one or two tickets.

## Rules for figures (important)
- Headline figures (turnaround, cycles, tickets, rates, story points completed) must be tokens: [[PERIOD:ROLE:SUBJECT:MEASURE]] where PERIOD is "prev" or "cur", ROLE is "dev" or "qa", SUBJECT is the person's exact name, or "average" (team average) or "board", and MEASURE is one of: ${PROMPT_MEASURES.join(', ')}.
- Example: "median turnaround of [[cur:${exampleRole}:${examplePerson}:median_turnaround]], against [[cur:${exampleRole}:board:median_turnaround]] for the board".
- Ticket-level figures shown in the lists above (cycles "x3", days in a lane, linked defect counts, story points) you MAY quote exactly as shown, always together with the ticket key. Never invent, add up or estimate a number that is not shown above.
- Be specific and informative: name the ticket keys, say what the work was (from the summary), and give the number that makes the point. Avoid vague wording like "a few tickets".
- Refer to the periods as "${prev.label}" and "${cur.label}".`;
}

/** Turns the model's reply into notes with every figure filled in from the report. Never throws on content problems; they become warnings. */
export function parseQuarterlyNotes(reply: string, report: QuarterlyReport, model: string): QuarterlyNotes {
  const start = reply.indexOf('{'), end = reply.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The AI reply did not contain the notes (no JSON found). Try again.');
  let raw: { verdict?: unknown; teamChange?: unknown; people?: unknown };
  try {
    raw = JSON.parse(reply.slice(start, end + 1));
  } catch {
    throw new Error('The AI reply could not be read as JSON. Try again.');
  }

  const warnings: string[] = [];
  if (!lastBlocks.has(report)) buildQuarterlyNotesPrompt(report);
  const blocks = lastBlocks.get(report)!;
  const c = report.comparison;
  const wholePrompt = [...blocks.values()].join('\n') + ` ${c.boardScored} ${c.boardBetter} ${c.boardWorse}`;
  const fill = (value: unknown, where: string, allowedFrom: string): string => {
    if (typeof value !== 'string' || !value.trim()) { warnings.push(`${where}: no text was written.`); return ''; }
    const typed = typedNumbers(value, report, allowedFrom);
    if (typed) warnings.push(`${where}: a figure was typed instead of taken from the data ("${typed}"). Check it against the tables.`);
    const { text, unresolved } = fillTokens(value.trim(), report);
    if (unresolved.length > 0) warnings.push(`${where}: could not fill ${unresolved.join(', ')}.`);
    return text;
  };

  let verdict = fill(raw.verdict, 'Verdict', wholePrompt);
  const label = report.comparison.verdict;
  if (!verdict.toLowerCase().startsWith(label.toLowerCase())) verdict = `${label}. ${verdict}`;

  const people: Record<string, string> = {};
  const given = (raw.people && typeof raw.people === 'object' ? raw.people : {}) as Record<string, unknown>;
  for (const role of ['dev', 'qa'] as const) {
    for (const p of section(report, role)?.current.people ?? []) {
      const key = peopleKey(role, p.person);
      if (!(key in given)) { warnings.push(`${p.person}: no note was written.`); continue; }
      const text = fill(given[key], p.person, `${blocks.get(key) ?? ''} ${c.boardScored}`);
      if (text) people[key] = text;
    }
  }

  return {
    verdict,
    teamChange: fill(raw.teamChange, 'Team change', wholePrompt),
    people,
    warnings,
    generatedAt: new Date().toISOString(),
    model,
  };
}

export async function generateQuarterlyNotes(report: QuarterlyReport, model: string): Promise<QuarterlyNotes> {
  const reply = await runClaudeCli(buildQuarterlyNotesPrompt(report), model);
  return parseQuarterlyNotes(reply, report, model);
}
