# Sprint Reporting — Business Rules

These rules govern how ticket time is measured in this tool. They exist because the raw Jira
changelog doesn't match how the team's process actually works — apply them when touching metrics
calculation, and don't "fix" the numbers back to raw wall-clock/status-transition math.

## Sprint-scoped report data (`sprintReport`)

- Each ticket's `sprintReport` object holds the data for the sprint period only. Cycle counts
  (`devCycles`/`qaCycles`), swimlane times and `turnaroundMs` only cover activity between the
  sprint start and end dates — rework or dwell time from earlier sprints is not re-reported.
- Turnaround runs from the later of ticket creation and sprint start to the last Done transition
  at or before sprint end (minus escalated time); null if it wasn't finished during the sprint.
- Point-in-time fields (status, assignee, QA assignees, story/dev/QA points, root cause, work
  category, priority, components, labels, versions) are the value **as of the sprint end date**,
  rebuilt from the Jira changelog (`src/services/point-in-time.ts`). A value set in an earlier
  sprint (e.g. story points in 3.2) still shows in a later one; later edits don't leak back.
- Lifetime data (`lifetimeSwimlaneTimes`, `lifetimeTurnaroundMs`, `transitions`) stays at the
  top level of the ticket and is untouched by sprint scoping. Tickets with no activity in the
  window stay in the report.
- Implemented in `buildSprintReport` in `src/services/metrics-calculator.ts`.

## Escalated lane

- A ticket whose **current** status is `Escalated` is excluded from the report entirely (not
  counted in `totalTickets`, not in any aggregate).
- A ticket that passed through `Escalated` in the past but has since moved on stays in the report,
  but:
  - time spent in the Escalated swimlane is subtracted from `lifetimeTurnaroundMs`
  - the `ESCALATED` swimlane never appears in `lifetimeSwimlaneTimes` / `sprintSwimlaneTimes` or
    any averaged breakdown
- Why: escalation is an out-of-band interruption, not normal workflow time. An unresolved
  escalation also means the ticket hasn't reached a state worth reporting on yet.
- Implemented in `src/services/metrics-calculator.ts` (`calculateTicketMetrics`), using
  `EXCLUDED_SWIMLANE` from `src/constants/workflow.ts` and the `extractSwimlaneMs`/`stripSwimlane`
  helpers in `src/services/changelog-parser.ts`.

## Todo-only tickets (refinement backlog)

- Tickets get refined into `To Do` before they're necessarily in an active sprint — a ticket can
  sit in the backlog, get tagged with a sprint, and that sprint might still be in the future.
- If a ticket has **only ever** been in a To-Do-swimlane status (never progressed further), its
  "time in Todo" is measured from the start date of the first sprint it was assigned to that
  actually went `active` or `closed` — not from ticket creation/refinement date.
- If none of the ticket's assigned sprints have ever gone active or closed, the ticket is excluded
  from the report entirely — there's no meaningful "time in Todo" to report yet.
- Implemented via `isTodoOnly` / `rebaseSwimlaneTime` in `src/services/changelog-parser.ts`, called
  from `calculateTicketMetrics` in `src/services/metrics-calculator.ts`.

## Business hours

- All duration metrics — time-in-swimlane and lifetime turnaround — count working time only:
  Monday–Friday, 08:00–17:00 UTC (9h per day). Weekends and out-of-hours time (overnight) do not
  count (`businessMsBetween` in `src/utils/date-utils.ts`; hours are `WORKDAY_*_HOUR_UTC`).
  A "day" of business time is 9h, not 24h. Fixed UTC window, no per-team timezone or holidays —
  small edge variances for transitions near the boundaries are accepted.
- This does **not** apply to GitHub PR timing (`totalPRTimeMs`) — that's a separate code-review
  metric, not status/lane dwell time, and stays wall-clock.

## Sprint comparison report

- The Sprint Comparison Report (web UI only — trend charts across several already-fetched
  sprints for one team) applies an additional filter on top of the standard metrics pipeline:
  tickets with no assignee, or whose assignee is on a fixed non-dev list (leads/PMs/QA leads who
  hold tickets but aren't doing dev work), are dropped from that report entirely.
- The match is on the primary `assignee` field only — never `qaAssignees`. A ticket QA'd by
  someone on the list still counts; only the *dev assignee* field is checked.
- This filter does **not** apply to the normal single-sprint report/analysis endpoints — only to
  the comparison report, since including leads/PMs there would skew swimlane and turnaround
  trends that are meant to reflect dev capacity.
- Why: these people's tickets (admin, refinement, escalation triage, etc.) don't represent normal
  dev throughput, so leaving them in would distort "is time-in-swimlane going up or down" trends.
- The exclude list lives in `COMPARISON_EXCLUDED_ASSIGNEES` in `src/constants/workflow.ts` — update
  it there if team leads/roles change. Implemented via `excludeNonDevAssignees` in
  `src/services/ticket-filter.ts`, called from `buildComparisonReport` in
  `src/services/comparison-report.ts`.

## People report

- Web UI only: a multi-sprint performance/KPI report for one person in one role (Dev or QA) on
  one project. The user picks the sprints (they align with KPI seasons); the tool checks which are
  fetched and offers to fetch the rest. Never mixes projects.
- Built from each sprint's `sprintReport` data, so cycles and lane time sum across sprints
  without double counting. A ticket is credited to a person **per sprint**, if they are the dev
  assignee **or** a QA assignee **as of that sprint's end**; `creditedAs` records which (the chosen
  role only decides which cycles/lanes count as theirs, not which tickets show). Tickets are rolled up once per key across sprints:
  points/status/completion come from the latest sprint, cycles and lane time are summed.
- Cycles are role-specific: Dev = `QA Failed` cycles, QA = `PO Review Failed` cycles. Lanes the
  role controls (Dev: To Do/In Development; QA: Ready for QA/In QA) are primary; the rest are
  shown greyed as context.
- The comparison report's non-dev assignee exclusion does **not** apply here. The team baseline
  is every ticket in the same sprints (QA: tickets that have a QA assignee).
- Linked defects are lifetime counts for the ticket, not sprint-scoped (also in date-range mode —
  the Jira link data has no dates to scope them by).
- **Two modes.** Whole sprints (above), or a **date range** (`period: { from, to }`, inclusive UTC
  calendar days). Date-range mode reuses `calculateTicketMetrics` with the range as the window, so
  every point-in-time field (status, assignee, QA assignees, points) is rebuilt as of the end of
  `to`, and cycles, lane time and turnaround only count activity inside the range. Tickets are
  pooled (once per key) from the selected sprints, so the user must select every sprint that
  overlaps the dates; credit is by the assignee / QA assignee as of `to`. There is no per-sprint breakdown (`bySprint` is empty) in this mode.
- **Date range, quiet tickets.** Still-open tickets with no activity in the range are kept and flagged
  `noActivityInRange` (committed work shouldn't vanish); tickets already Done before the range are dropped.
  An optional `previousPeriod` range adds a second summary (pool = every fetched sprint of the project
  overlapping it) for "versus last period" checks.
- **Extra per-ticket data** (all from the Fetch Data download): created/resolved/firstDone dates, status
  now vs at period end, dev/QA story points, priority/labels/components/root cause/fixVersions/parent,
  linked defect keys, lifetime sprint list (`allSprints`), rework and PO-Review-entry dates, full
  `transitions`, `nextPI` (every sprint the ticket is in starts after the period or is unplanned).
- **Reported bugs.** `reportedBugs` = Bugs whose Jira reporter is the person, created in the period, in a
  sprint or not. Fetch Data stores `reportedBugs` per sprint in the cache (bugs created from the sprint
  start to the next sprint's start, not already in the sprint — `fetchReportedBugs` in
  `src/services/sprint-fetcher.ts`, used by CLI and web fetch). Sprints fetched before this lack it:
  `reportedBugsComplete` is false until they're re-fetched (`parent` also needs a re-fetch).
- Not available from Jira data: Zephyr test-case status dates and Reflect run results (separate
  SmartBear systems, not part of the fetch).
- Implemented in `src/services/people-report.ts`, served by `/api/people/options` and
  `/api/people/report`; the page has print styles and a JSON export.

## Bulk downloads

- **People report, several people at once** (`POST /api/people/report/bulk`, `src/services/bulk-export.ts`):
  pick people in the role step, then a ZIP (`index.json` + `summary.csv` + `tickets.csv` + one JSON per
  person, no repeated data guide), a single summary CSV, or a combined print pack (one person per printed
  page, rendered client-side with `renderPeopleReport`). Each person goes through `buildPeopleReport`, so
  numbers match the single report; a missing fetched sprint fails the whole request.
- **Sprint report**: "All sprints (ZIP)" (`POST /api/export/sprint-report/bulk`: `index.json`,
  `sprints.csv`, one export per sprint). The sprint/comparison report pages also have Print / Save as
  PDF, one sprint per page (`.print-page`).
- CSV durations are **business hours** (ms / 3,600,000 of business time, 9h per day), not ms; UTF-8 BOM and
  CRLF for Excel; text starting `= + - @` is apostrophe-prefixed (formula injection). The ZIP writer is
  hand-rolled (`zipFiles`, no dependency). If you add or rename CSV columns, update the "Bulk downloads"
  section of the data guide.

## Team name

- Every report and export names the team next to the Jira project key (e.g. Mavericks / SQM). The
  list lives in `TEAMS` in `src/constants/workflow.ts` (`getTeamName`); a project not on the list has
  `teamName: null` and shows only its key. Add new teams there.
- Shown in: sprint/comparison/people report headings (web, print, CLI, HTML report), the AI prompt, the
  `teamName` field of `SprintMetrics`, `ComparisonEntry`, `PeopleReport` and every export's `generation`,
  and a `team` column in the bulk CSVs (`summary.csv`, `tickets.csv`, `sprints.csv`).
- Don't confuse it with `PeopleReport.team`, which is the comparison baseline (everyone in the same sprints).

## Data guide ("i" button)

`src/constants/data-guide.ts` holds the plain-language explanation of these rules. It is shown by
the "i" button in the web UI (`/api/data-guide/:kind`) and embedded as `dataGuide` in the People
Report JSON export, so a person or AI reading an export knows what each figure means.
The sprint report and comparison report have "Export JSON" buttons too (`src/services/export-builder.ts`,
`/api/export/sprint-report`, `/api/export/comparison`): each file is `{ info, generation, data }` —
`info` is the guide plus a field dictionary, `generation` records sprints, filters, fetch times and the
steps followed. Exports list ticket keys (not full tickets) under `byDeveloper`/`byQaAssignee`. **When you
change any rule above, update the guide too** (and the AI analysis note below).

## AI analysis

`buildAnalysisPrompt` in `src/services/claude-analyzer.ts` tells Claude these adjustments have
already been applied, so it doesn't flag a missing `ESCALATED` row or a short Todo time as an
anomaly. If you change the rules above, update that note too.
