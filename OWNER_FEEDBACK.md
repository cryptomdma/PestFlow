# OWNER_FEEDBACK

Product owner feedback from hands-on testing — notes for the dev to review, qualify, push back on, and roadmap. Each item has an ID so it can be referenced in commits, PRs, and the roadmap.

## How to use this file

**At the start and end of every session:**

1. Review open items below.
2. For each item you touch, add a review line directly beneath it:
   - `> **Review (YYYY-MM-DD):** ACCEPTED | QUALIFIED | PUSHBACK | DONE — short rationale`
   - **ACCEPTED** — agree, no changes to scope.
   - **QUALIFIED** — agree with caveats, scope changes, or open questions (state them).
   - **PUSHBACK** — disagree or recommend against; explain why and propose an alternative.
   - **DONE** — implemented; reference the commit/PR.
3. If an item is accepted or qualified, add it to the roadmap where appropriate and note the roadmap location in the review line.
4. Add new notes at the bottom of the relevant section with the next available ID.

**Status legend:** `[ ]` open · `[~]` in progress · `[x]` done · `[-]` rejected

---

## Ticket Review

- [ ] **FB-001 — Finalize: move Apply Payment ahead of Generate Invoice prompt**
  - Prevents generating/sending invoices with unapplied payments.
- [ ] **FB-002 — Widen viewport**
  - Currently requires horizontal scroll.

## Agreement Templates

- [ ] **FB-003 — Surcharge is not a configured initial charge**
  - Surcharge should not be strictly configured in agreement or service templates.
  - Template holds a simple boolean only: surcharge allowed, or not.
  - Applied at the technician's discretion based on unexpected or discovered conditions in the field.

### Tech View Modal

- [ ] **FB-004 — Show time window next to scheduled time**
  - Derived from the actual scheduled time.
- [ ] **FB-005 — "Add Surcharge" button**
  - Button on the ticket expands/shows/edits the surcharge line, rather than showing it by default.

## Agreements Tab

- [ ] **FB-006 — "Schedule Now" button next to "Next due"**
  - **Goal:** align services with agreements directly and easily, rather than relying on a counter.
  - Behavior by state:
    - **Not yet generated:** creates a NEW service linked to the agreement and forfeits the next (future) generated service that has not been created.
    - **Generated, not scheduled:** schedules the existing generated service.
    - **Generated and scheduled:** either show a "Scheduled" pill on the same line, or change the button to "Reschedule".
  - Optional: hyperlink the Next Due date to perform the same action.
  - Intent: avoid increasing the size/span of the current agreement unnecessarily.
- [ ] **FB-007 — Cancel agreement still requires manual reason input**

## New Service

- [ ] **FB-008 — Auto-update duration and cost on each service selection**
  - Currently the first service selected dictates duration and cost.
  - Default duration and cost should be pulled with each selection.
- [ ] **FB-009 — Require service type: Service / Callback / Follow-up**
  - Optionally applied through service templates.
  - Callback (and possibly Follow-up) should require service and insect attribution for reporting.
    - e.g. Callback report — analyze by service, insect, technician, and other key categories.
- [ ] **FB-010 — Widen modal viewport**

## Aging Report

- [ ] **FB-011 — Avoid double-printing balances on rows**
  - Currently shows customer balance on one row and location balance on the row below it.
  - **Recommended:** default to minimized view showing customer balance (already indicates when multiple properties have open balances); dropdown icon expands to show locations.
  - **Alternative:** show only location balance, grouping customer balances as they are currently.
    - Open question: display bill-to info instead of location info?

## Location — Invoices Tab

- [ ] **FB-012 — Collapsible sections**
  - Add minimize/expand arrows to "Payments and Credits" and "Balance by Days Invoiced".
  - Default view: minimized.

## Cancel / Reschedule

- [ ] **FB-013 — Tag tech-canceled appointments**
  - Canceled-by-tech should carry a tag/pill on the `PENDING_SCHEDULING` line indicating it's a canceled appointment.
  - Increases visibility for support and prevents accidental reschedule.

## Appointment Details

- [ ] **FB-014 — Remove (or lock) technician and date/time range**
  - These changes should go through the reschedule function.
- [ ] **FB-015 — "Add Service" button**
  - Expands/shows the Add Service section (or opens a modal) rather than showing it by default.

## Target Pests

- [ ] **FB-016 — Target pests as a division of Material settings**
  - Each material/product has a specific list of selectable pests.
  - If NULL, allow any pest from the pest list.

## Service Report

- [ ] **FB-017 — Display warranty information**
  - Insects covered and warranty period.
  - Configured in the service template.
