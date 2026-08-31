# PestFlow Agent Working Agreement

Applies to any coding agent working on this repo — Claude Code, Codex, or otherwise. Tool-specific
entry points (`CLAUDE.md`, etc.) point here rather than duplicating these rules.

## Working agreement (do not deviate)

- Execute ONE pass per session. A pass = one branch from the current plan doc
  (see CURRENT_FOCUS.md). Complete its verification steps, push the branch,
  then STOP. Never begin the next pass in the same session.
- Never run parallel write-agents on the same branch. Read-only Explore
  subagents may run freely.
- Every pass ends with: npm run check, double-boot (bootstrap idempotency),
  and the pass's smoke test, BEFORE the branch is pushed.
- The human merges PRs. Never merge, never push to main.

## Keeping docs current

`CURRENT_FOCUS.md` is updated at the end of every pass — mark the finished branch's status, state
what's next. A plan doc that isn't updated after the pass it described just shipped is worse than no
plan doc: the next session will trust it and be wrong. If a pass changes the domain model in a way
`CANONICAL_DOMAIN_RULES_V1.md` no longer reflects, or changes the stack/layout in a way `PROJECT_MAP.md`
no longer reflects, update those too, in the same PR as the code change — not as a follow-up.

## Canonical architecture rules

1. Location is the canonical customer record.
2. Account is a lightweight grouping context, not a competing rich CRM object.
3. Primary location is the customer identity in the UI.
4. Operational work happens at the location level.
5. Account-level data must survive primary-location changes.
6. Contacts are location-scoped.
7. Flags and Holds are separate concepts.
8. Billing defaults flow from account/primary-location context with location override support.
9. Creating a customer should feel like adding a location.
10. The model must support carefully transferring a location to another account/group later.

(Full detail, including the Service/Appointment/ServiceRecord/Invoice/Payment entity model, lives in
`CANONICAL_DOMAIN_RULES_V1.md` — this is the short version, restated here so it's visible without a
second file open.)

## Development behavior rules

1. Do not freestyle the domain model.
2. Do not introduce parallel abstractions that compete with canonical Location ownership.
3. Prefer additive, migration-safe refactors over destructive rewrites.
4. Keep transitional compatibility code clearly marked.
5. Remove or disable fake UI instead of leaving demo controls in place.
6. Never add a visible button, tab, modal, card, or widget that is dead or misleading. If a control
   isn't functional yet: remove it, disable it clearly, or label it truthfully as coming later.
7. Do not broaden scope within a task.
8. Do not silently redesign the product.
9. If architecture and UI conflict, fix the architecture first unless explicitly told otherwise.
10. Reuse existing helpers before writing new ones (e.g. `getLinkedServicesForAppointmentTx()` for any
    appointment↔services rollup — do not build a parallel join).

## Required task summary format

For any non-trivial task, state:
1. what changed
2. files changed
3. migration/backfill logic, if any
4. assumptions / edge cases
5. known follow-up work

## Definition of done

A task is not done unless:
- code compiles (`npm run check`)
- affected flows are functional (boot the server twice, exercise the change live — not just typecheck)
- dead/demo UI introduced by the task is not left behind
- changed files are listed
- known follow-up work is stated honestly
