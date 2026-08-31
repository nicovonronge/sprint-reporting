# Sprint Reporting — Business Rules

These rules govern how ticket time is measured in this tool. They exist because the raw Jira
changelog doesn't match how the team's process actually works — apply them when touching metrics
calculation, and don't "fix" the numbers back to raw wall-clock/status-transition math.

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

## AI analysis

`buildAnalysisPrompt` in `src/services/claude-analyzer.ts` tells Claude these adjustments have
already been applied, so it doesn't flag a missing `ESCALATED` row or a short Todo time as an
anomaly. If you change the rules above, update that note too.
