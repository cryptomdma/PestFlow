# PestFlow Handoff Prompt for Next Agent

You are taking over work on PestFlow.

Before changing anything, read these repository documents and treat them as canonical:

* `docs/PRODUCT_ROADMAP.md`
* `docs/CODEX_RULES.md`
* the canonical domain rules document if present in the repo

## Current project context

PestFlow began as a Replit-exported prototype and later received hybrid UI work from another AI-generated build. The current strategy is **not** to chase mockup polish first. The strategy is to preserve working functionality, align the architecture to the canonical domain model, and then standardize UI around real workflows.

## Canonical product truth

* Every customer is a **Location**.
* **Account** is a lightweight grouping context for one or more locations.
* The **primary location** acts as the customer identity in the UI.
* Operational records should generally be location-scoped.
* Account-level data must survive primary-location changes.

## Current status

Already completed:

* accounts/grouping layer introduced
* compatibility read projection added for customer detail
* primary location normalization added
* customer create flow updated so a new customer creates a primary location transactionally
* dashboard demo shell reduced toward a truthful baseline
* schedule status labels normalized

Still transitional:

* legacy `customers` remains as compatibility anchor
* contacts still need full normalization
* notes still need canonical account-vs-location split
* flags/holds not implemented yet
* service agreements not implemented yet
* payments/users/audit logging not implemented yet

## Immediate next priority

### Phase 2A — Contacts normalization

Your first target should be making contacts fully canonical and location-scoped.

### Requirements

* move toward `locationId`-required contact ownership
* do not introduce a permanent dual-scope contact model
* preserve migration safety
* update any affected create/edit/detail flows
* return a concise implementation summary with files changed, edge cases, and known follow-up work

## Constraints

* Do not broaden scope into notes/service agreements unless explicitly asked.
* Do not redesign the whole UI.
* Do not add fake widgets or dead controls.
* Keep the app functional at every step.

## Delivery format

When you finish your task, return:

1. what changed
2. files changed
3. migration/backfill logic if any
4. assumptions / edge cases
5. known follow-up work
6. whether the app remains on the canonical roadmap
