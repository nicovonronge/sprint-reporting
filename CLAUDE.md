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

## Weekends

- All duration metrics — time-in-swimlane and lifetime turnaround — are computed in business days.
  Saturday/Sunday do not count toward elapsed time (`businessMsBetween` in
  `src/utils/date-utils.ts`, using UTC day boundaries).
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
  without double counting. A ticket is credited to a person **per sprint**, by the dev assignee /
  QA assignees **as of that sprint's end**. Tickets are rolled up once per key across sprints:
  points/status/completion come from the latest sprint, cycles and lane time are summed.
- Cycles are role-specific: Dev = `QA Failed` cycles, QA = `PO Review Failed` cycles. Lanes the
  role controls (Dev: To Do/In Development; QA: Ready for QA/In QA) are primary; the rest are
  shown greyed as context.
- The comparison report's non-dev assignee exclusion does **not** apply here. The team baseline
  is every ticket in the same sprints (QA: tickets that have a QA assignee).
- Linked defects are lifetime counts for the ticket, not sprint-scoped.
- Implemented in `src/services/people-report.ts`, served by `/api/people/options` and
  `/api/people/report`; the page has print styles and a JSON export.

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
