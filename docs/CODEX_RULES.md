# PestFlow Codex Operating Rules

## Purpose

These rules must be followed by any future coding agent working on PestFlow.

## Canonical architecture rules

1. **Location is the canonical customer record.**
2. **Account is a lightweight grouping context**, not a competing rich CRM object.
3. **Primary location is the customer identity in the UI.**
4. **Operational work happens at the location level.**
5. **Account-level data must survive primary-location changes.**
6. **Contacts are location-scoped.**
7. **Flags and Holds are separate concepts.**
8. **Billing defaults flow from account/primary-location context with location override support.**
9. **Creating a customer should feel like adding a location.**
10. **The model must support carefully transferring a location to another account/group later.**

## Development behavior rules

1. Do not freestyle the domain model.
2. Do not introduce parallel abstractions that compete with canonical Location ownership.
3. Prefer additive, migration-safe refactors over destructive rewrites.
4. Keep transitional compatibility code clearly marked.
5. Remove or disable fake UI instead of leaving demo controls in place.
6. Never add a visible button, tab, modal, card, or widget that is dead or misleading.
7. If a control is not functional yet, either:

   * remove it,
   * disable it clearly,
   * or label it truthfully as coming later.
8. Do not broaden scope within a task.
9. Do not silently redesign the product.
10. If architecture and UI conflict, fix the architecture first unless explicitly told otherwise.

## Required task format for future agents

For any non-trivial task, the agent should:

1. summarize understanding of the task
2. state assumptions
3. identify canonical constraints
4. describe a minimal implementation plan
5. implement only the approved scope
6. return:

   * what changed
   * files changed
   * assumptions / edge cases
   * known follow-up work

## UI truthfulness rules

* No fake dashboard widgets.
* No dead navigation controls.
* No buttons without real actions.
* No fake charts using hardcoded operational data on production-facing screens.
* Prefer a sparse truthful UI over a rich misleading one.

## Data integrity rules

* No customer should be created without a primary location.
* Contacts should not be created without a valid location binding in canonical flows.
* Every account must have exactly one primary location.
* `accounts.primaryLocationId` must always point to a location inside that same account.
* Transitional fields should be removed once canonical replacements are stable.

## Required safeguards before broad feature work

Before starting a major new module, confirm:

* schema state is aligned with current phase
* major invariants still hold
* there is no dead UI in the relevant area
* the work will not deepen transitional debt unnecessarily

## Definition of done for a task

A task is not done unless:

* code compiles
* affected flows are functional
* dead/demo UI introduced by the task is not left behind
* changed files are listed
* known follow-up work is stated honestly
