import { describe, it, expect } from 'vitest';
import { assembleQuarterlyReport, verdictFor, measureValues, BUSINESS_DAY_MS, type AssembleInput } from './quarterly-report.js';
import { parseQuarterlyNotes, buildQuarterlyNotesPrompt } from './quarterly-notes.js';
import { quarterlyCompareCsv, quarterlyPeopleCsv, buildQuarterlyExport, personZipFrom } from './quarterly-export.js';
import { inflateRawSync } from 'node:zlib';
import type { PeopleReport, PeopleSummary, PersonRole } from '../types/people-report.js';
import type { ComparisonRow, QuarterlyPeriodInfo } from '../types/quarterly-report.js';

// All names, ticket keys and figures below are made up.

const DAY = BUSINESS_DAY_MS;

/** Reads the central directory of a ZIP back into name -> text. */
function readZip(buf: Buffer): Record<string, string> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    out[name] = inflateRawSync(buf.subarray(dataStart, dataStart + size)).toString('utf8');
    p += 46 + nameLen;
  }
  return out;
}

function summary(o: Partial<PeopleSummary> & { tickets: number }): PeopleSummary {
  const completed = o.completed ?? o.tickets;
  const cycles = o.totalCycles ?? 0;
  return {
    tickets: o.tickets,
    completed,
    storyPoints: o.storyPoints ?? o.tickets * 3,
    completedStoryPoints: o.completedStoryPoints ?? completed * 3,
    avgTurnaroundMs: o.avgTurnaroundMs ?? 4 * DAY,
    medianTurnaroundMs: o.medianTurnaroundMs ?? 3 * DAY,
    totalCycles: cycles,
    avgCyclesPerTicket: o.tickets ? cycles / o.tickets : 0,
    ticketsWithoutRework: o.ticketsWithoutRework ?? o.tickets - cycles,
    reworkFreeRate: o.reworkFreeRate ?? (o.tickets ? (o.tickets - cycles) / o.tickets : null),
    linkedDefects: o.linkedDefects ?? 0,
    devStoryPoints: 0, qaStoryPoints: 0, completedDevStoryPoints: 0, completedQaStoryPoints: 0,
    ticketsWithNoActivity: 0, ticketsAsAssignee: o.tickets, ticketsAsQaAssignee: 0,
    lanes: o.lanes ?? [
      { swimlane: 'IN DEVELOPMENT', primary: true, tickets: o.tickets, totalMs: o.tickets * 2 * DAY, avgMs: 2 * DAY, medianMs: 1.5 * DAY },
      { swimlane: 'IN QA', primary: true, tickets: o.tickets, totalMs: o.tickets * DAY, avgMs: DAY, medianMs: 0.5 * DAY },
    ],
  };
}

function report(person: string, role: PersonRole, own: Parameters<typeof summary>[0], board: Parameters<typeof summary>[0] = { tickets: 60 }): PeopleReport {
  return {
    person, role, projectKey: 'ABC', teamName: null, sprints: [], summary: summary(own), team: summary(board),
    tickets: [
      { key: 'ABC-11', summary: 'Fake story', completed: false, storyPoints: 5, status: 'In Development', devCycles: 2, qaCycles: 0, linkedDefects: 3, laneTimesMs: { 'IN DEVELOPMENT': 4 * DAY } },
    ],
  } as unknown as PeopleReport;
}

const info = (label: string, days = 90): QuarterlyPeriodInfo => ({ label, description: `${label} sprints`, period: null, sprints: [], days });

function input(over: Partial<{ prevDev: PeopleReport[]; curDev: PeopleReport[]; prevQa: PeopleReport[]; curQa: PeopleReport[]; prevDays: number; curDays: number }> = {}): AssembleInput {
  return {
    projectKey: 'ABC',
    mode: 'sprints',
    previous: { label: 'Q2', info: info('Q2', over.prevDays), dev: over.prevDev ?? [], qa: over.prevQa ?? [] },
    current: { label: 'Q3', info: info('Q3', over.curDays), dev: over.curDev ?? [], qa: over.curQa ?? [] },
  };
}

const row = (measure: string, result: ComparisonRow['result']): ComparisonRow => ({
  scope: 'board', measure, section: 'Quality', label: measure, unit: 'count', better: 'lower', previous: 1, current: 1, change: 0, changeKind: 'pct', result,
});

describe('measureValues', () => {
  it('shows times as business days (9 hours), rates as fractions, and leaves undefined ratios null', () => {
    const v = measureValues(summary({ tickets: 10, completed: 5, storyPoints: 0, completedStoryPoints: 0, avgTurnaroundMs: 4.5 * 3_600_000 * 2 }), 'dev');
    expect(v.avg_turnaround).toBeCloseTo(1);
    expect(v.completion_rate).toBe(0.5);
    expect(v.sp_completion).toBeNull();
    expect(v.dev_median).toBeCloseTo(1.5);
  });
});

describe('personZipFrom', () => {
  const fullReport = (person: string, role: PersonRole, tickets: number): PeopleReport => ({
    ...report(person, role, { tickets }),
    tickets: tickets === 0 ? [] : [{
      key: 'ABC-11', summary: 'Fake story', issueType: 'Story', creditedAs: ['assignee'], sprints: ['S1'], status: 'Done', statusNow: 'Done',
      created: '2026-01-01T00:00:00Z', resolved: null, completed: true, storyPoints: 5, devStoryPoints: null, qaStoryPoints: null, priority: 'Medium',
      turnaroundMs: 2 * DAY, devCycles: 1, qaCycles: 0, linkedDefects: 0, noActivityInRange: false, nextPI: false, laneTimesMs: { 'IN DEVELOPMENT': DAY },
    }],
    dataGuide: { kind: 'people' },
  } as unknown as PeopleReport);

  it('writes one file per person and role with both periods, and leaves out AI notes and verdict', () => {
    const data = {
      previous: { label: 'Q2', info: info('Q2'), dev: [fullReport('Ann Fake', 'dev', 10), fullReport('Idle Fake', 'dev', 0)], qa: [fullReport('Ann Fake', 'qa', 4)] },
      current: { label: 'Q3', info: info('Q3'), dev: [fullReport('Ann Fake', 'dev', 12), fullReport('Idle Fake', 'dev', 0)], qa: [fullReport('Ann Fake', 'qa', 5)] },
    };
    const files = readZip(personZipFrom(data, 'ABC', 'sprints'));
    expect(Object.keys(files).sort()).toEqual(['index.json', 'kpi.csv', 'people/Ann_Fake_dev.json', 'people/Ann_Fake_qa.json', 'tickets.csv']);

    const dev = JSON.parse(files['people/Ann_Fake_dev.json']);
    expect(dev.kpi.previous.tickets).toBe(10);
    expect(dev.kpi.current.tickets).toBe(12);
    expect(dev.kpi.change.person.find((r: { measure: string }) => r.measure === 'tickets').result).toBe('Volume');
    expect(dev.previous.dataGuide).toBeUndefined();
    expect(files['people/Ann_Fake_dev.json']).not.toMatch(/notes|verdict/i);

    const index = JSON.parse(files['index.json']);
    expect(index.generation.notExported).toEqual(['Idle Fake (dev) has no tickets in either period and is not exported.']);
    expect(files['kpi.csv'].split('\r\n').filter(Boolean)).toHaveLength(1 + 2 * 2 * 2);
    expect(files['tickets.csv'].split('\r\n').filter(Boolean)).toHaveLength(1 + 4);
  });
});

describe('verdictFor', () => {
  it('is Improved with 3+ more Better than Worse and no rework regression', () => {
    const rows = [...Array(4)].map((_, i) => row(`m${i}`, 'Better')).concat(row('x', 'Worse'));
    expect(verdictFor(rows).verdict).toBe('Improved');
  });
  it('is not Improved if cycles per ticket got worse, even with many Better', () => {
    const rows = [...Array(6)].map((_, i) => row(`m${i}`, 'Better')).concat(row('cycles_per_ticket', 'Worse'));
    expect(verdictFor(rows).verdict).toBe('Mixed');
  });
  it('is Not an overall improvement with 3+ more Worse than Better, ignoring Volume', () => {
    const rows = [...Array(4)].map((_, i) => row(`m${i}`, 'Worse')).concat(row('v', 'Volume'), row('b', 'Better'));
    expect(verdictFor(rows)).toMatchObject({ verdict: 'Not an overall improvement', better: 1, worse: 4, scored: 5 });
  });
});

describe('assembleQuarterlyReport', () => {
  const prevDev = [report('Alex Example', 'dev', { tickets: 20, totalCycles: 6, avgTurnaroundMs: 5 * DAY }), report('Blake Sample', 'dev', { tickets: 24, totalCycles: 8, avgTurnaroundMs: 7 * DAY })];
  const curDev = [report('Alex Example', 'dev', { tickets: 22, totalCycles: 2, avgTurnaroundMs: 3 * DAY }), report('Casey Demo', 'dev', { tickets: 18, totalCycles: 3, avgTurnaroundMs: 4 * DAY })];

  it('averages people plainly and scores previous against current', () => {
    const r = assembleQuarterlyReport(input({ prevDev, curDev }));
    expect(r.dev!.previous.average.avg_turnaround).toBeCloseTo(6);
    expect(r.dev!.current.average.avg_turnaround).toBeCloseTo(3.5);
    const turnaround = r.comparison.rows.find(x => x.scope === 'devAverage' && x.measure === 'avg_turnaround')!;
    expect(turnaround.result).toBe('Better');
    expect(turnaround.change).toBeCloseTo((3.5 - 6) / 6);
    const tickets = r.comparison.rows.find(x => x.scope === 'devAverage' && x.measure === 'tickets')!;
    expect(tickets.result).toBe('Volume');
  });

  it('reports rate changes in points and calls a change under 2% Same', () => {
    const r = assembleQuarterlyReport(input({
      prevDev: [report('Alex Example', 'dev', { tickets: 100, completed: 80 })],
      curDev: [report('Alex Example', 'dev', { tickets: 100, completed: 81 })],
    }));
    const rate = r.comparison.rows.find(x => x.scope === 'devAverage' && x.measure === 'completion_rate')!;
    expect(rate.changeKind).toBe('pts');
    expect(rate.change).toBeCloseTo(0.01);
    expect(rate.result).toBe('Same');
  });

  it('treats a rise from zero rework as Worse rather than Same', () => {
    const r = assembleQuarterlyReport(input({
      prevDev: [report('Alex Example', 'dev', { tickets: 10, totalCycles: 0 })],
      curDev: [report('Alex Example', 'dev', { tickets: 10, totalCycles: 4 })],
    }));
    expect(r.comparison.rows.find(x => x.scope === 'devAverage' && x.measure === 'cycles')!.result).toBe('Worse');
  });

  it('lists who joined and left, and totals only the developers present in both periods', () => {
    const r = assembleQuarterlyReport(input({ prevDev, curDev }));
    expect(r.comparison.onlyInCurrent).toEqual(['Casey Demo']);
    expect(r.comparison.onlyInPrevious).toEqual(['Blake Sample']);
    const [prev, cur] = r.comparison.sameDevelopers;
    expect(prev).toMatchObject({ developers: 1, tickets: 20, devCycles: 6 });
    expect(cur).toMatchObject({ developers: 1, tickets: 22, devCycles: 2 });
    expect(r.comparison.people.every(p => p.person === 'Alex Example')).toBe(true);
  });

  it('leaves out people without tickets in a period and says so', () => {
    const r = assembleQuarterlyReport(input({
      prevDev: [report('Alex Example', 'dev', { tickets: 20 }), report('Dana Placeholder', 'dev', { tickets: 0, avgTurnaroundMs: 0 })],
      curDev: [report('Alex Example', 'dev', { tickets: 20 }), report('Dana Placeholder', 'dev', { tickets: 5 })],
    }));
    expect(r.dev!.previous.people.map(p => p.person)).toEqual(['Alex Example']);
    expect(r.checks.some(c => c.includes('Dana Placeholder has no tickets as a developer in Q2'))).toBe(true);
    expect(r.checks.some(c => c.includes('Q3 developer Dana Placeholder: small sample (5 tickets)'))).toBe(true);
  });

  it('warns when the periods are very different lengths and when rework is zero in both', () => {
    const r = assembleQuarterlyReport(input({
      prevDev: [report('Alex Example', 'dev', { tickets: 30 })], curDev: [report('Alex Example', 'dev', { tickets: 30 })],
      prevDays: 90, curDays: 45,
    }));
    expect(r.checks.some(c => c.includes('different lengths (90 days in Q2, 45 days in Q3)'))).toBe(true);
    expect(r.checks.some(c => c.includes('Dev cycles (QA Failed) is zero in both periods'))).toBe(true);
  });

  it('handles QA only, using the QA board for the verdict', () => {
    const r = assembleQuarterlyReport(input({
      prevQa: [report('Eli Tester', 'qa', { tickets: 25, totalCycles: 5 })],
      curQa: [report('Eli Tester', 'qa', { tickets: 25, totalCycles: 1 })],
    }));
    expect(r.dev).toBeNull();
    expect(r.qa!.measures.some(m => m.id === 'in_qa_median')).toBe(true);
    expect(r.comparison.rows.every(x => x.scope === 'qaBoard')).toBe(true);
  });

  it('builds ticket hints for the current period', () => {
    const r = assembleQuarterlyReport(input({ prevDev, curDev }));
    const hints = r.hints.find(h => h.person === 'Alex Example')!;
    expect(hints.cyclesByTicket[0]).toContain('ABC-11 x2');
    expect(hints.longestOwnLane[0]).toContain('(4.00 d)');
    expect(hints.openWithPoints[0]).toContain('5 SP, In Development');
  });
});

describe('quarterly notes', () => {
  const r = assembleQuarterlyReport(input({
    prevDev: [report('Alex Example', 'dev', { tickets: 20, totalCycles: 6 })],
    curDev: [report('Alex Example', 'dev', { tickets: 22, totalCycles: 2 })],
  }));
  const reply = (obj: unknown) => 'Here you go:\n```json\n' + JSON.stringify(obj) + '\n```';

  it('fills figure tokens from the data and prefixes the verdict label', () => {
    const notes = parseQuarterlyNotes(reply({
      verdict: 'Rework fell.',
      teamChange: 'The team had the same people in both periods.',
      people: { 'dev:Alex Example': 'Cycles went from [[prev:dev:Alex Example:cycles]] to [[cur:dev:Alex Example:cycles]], a median of [[cur:dev:board:median_turnaround]] on ABC-11 in Sprint 3.4.' },
    }), r, 'test-model');
    expect(notes.warnings).toEqual([]);
    expect(notes.verdict.startsWith(r.comparison.verdict)).toBe(true);
    expect(notes.people['dev:Alex Example']).toBe('Cycles went from 6 to 2, a median of 3.00 days on ABC-11 in Sprint 3.4.');
  });

  it('warns about typed figures, unknown tokens and missing people', () => {
    const notes = parseQuarterlyNotes(reply({
      verdict: 'Better by 12% overall.',
      teamChange: 'Same people.',
      people: { 'dev:Someone Else': 'x', 'dev:Alex Example': 'Had [[cur:dev:Nobody:cycles]] cycles.' },
    }), r, 'test-model');
    expect(notes.warnings.some(w => w.startsWith('Verdict: a figure was typed'))).toBe(true);
    expect(notes.warnings.some(w => w.includes('could not fill [[cur:dev:Nobody:cycles]]'))).toBe(true);
    expect(notes.people['dev:Alex Example']).toBe('Had n/a cycles.');
    expect(Object.keys(notes.people)).toEqual(['dev:Alex Example']);
  });

  it('allows quoting a number that was in the prompt data but flags an invented one', () => {
    const note = (text: string) => parseQuarterlyNotes(reply({ verdict: 'Fine.', teamChange: 'Same.', people: { 'dev:Alex Example': text } }), r, 'm');
    expect(note('Handled 22 tickets.').warnings).toEqual([]);
    expect(note('Handled 9999 tickets.').warnings.some(w => w.startsWith('Alex Example: a figure was typed'))).toBe(true);
  });

  it('rejects a reply with no JSON', () => {
    expect(() => parseQuarterlyNotes('I cannot do that', r, 'm')).toThrow(/no JSON/);
  });

  it('puts the data and the figure rules in the prompt', () => {
    const p = buildQuarterlyNotesPrompt(r);
    expect(p).toContain('key "dev:Alex Example"');
    expect(p).toContain('Never invent, add up or estimate a number');
    expect(p).toContain('a day is 9 hours');
  });
});

describe('quarterly exports', () => {
  const r = assembleQuarterlyReport(input({
    prevDev: [report('Alex Example', 'dev', { tickets: 20, avgTurnaroundMs: 2 * DAY })],
    curDev: [report('Alex Example', 'dev', { tickets: 20, avgTurnaroundMs: DAY })],
    prevQa: [report('Eli Tester', 'qa', { tickets: 20 })],
    curQa: [report('Eli Tester', 'qa', { tickets: 20 })],
  }));

  it('writes times in business hours in the comparison CSV', () => {
    const lines = quarterlyCompareCsv(r).split('\r\n');
    const avg = lines.find(l => l.includes('devAverage') && l.includes('Avg turnaround'))!;
    expect(avg).toContain('business hours,18,9,-50,percent,Better');
    expect(lines[0]).toContain('Q2,Q3');
  });

  it('has one aligned people row per person, average and board for each period and role', () => {
    const lines = quarterlyPeopleCsv(r).trim().split('\r\n');
    expect(lines).toHaveLength(1 + 2 * 3 * 2);
    const header = lines[0].split(',');
    expect(header).toContain('dev_median_business_hours');
    expect(header).toContain('in_qa_median_business_hours');
    const devRow = lines.find(l => l.includes(',dev,person,Alex Example'))!;
    expect(devRow.split(',')).toHaveLength(header.length);
  });

  it('wraps the report with the guide and a record of how it was made', () => {
    const e = buildQuarterlyExport(r, null);
    expect(e.info.kind).toBe('quarterly');
    expect(e.generation.developers).toEqual(['Alex Example']);
    expect(e.generation.notesWrittenByAi).toBe(false);
    expect(e.data).toBe(r);
  });
});
