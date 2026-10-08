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
  > **Review (2026-10-07):** QUALIFIED — agreed in principle; not built in Pass 36, which touched this page for C5.4's links (the owner's word: build only FB-010). What exists today: the page is full width (`p-4 sm:p-6`, no max-width), the queue row is a five-column grid from `md` up (a `div[role=button]` since Pass 36), and the review modal is `sm:max-w-3xl` with vertical scroll only. Which element scrolls sideways has not been rendered by any session - the modal's billing table and the materials rows are the candidates - so the pass needs the surface named and your screen width. Roadmap: `PLAN_ROADMAP_V2.md` Phase 3 table, new row **C3.8**, unscheduled - you sequence it.

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
  > **Review (2026-10-07):** ACCEPTED — not built in Pass 36, which touched the queue row for C5.4's links and humanized only the scheduling-mode badge beside the name (the owner's word: build only FB-010). The data exists: `services.lastAppointmentId` points at the placement the service came off, whose `rescheduleRequested` / `cancelRequestedByLabel` say whether it was a field reschedule or cancel, and the Services tab already reads "Rescheduling" from it; the queue still prints the raw `PENDING_SCHEDULING` badge. Roadmap: `PLAN_ROADMAP_V2.md` Phase 4 table, new row **C4.7** (with FB-014 and FB-015), unscheduled - you sequence it.

## Appointment Details

- [ ] **FB-014 — Remove (or lock) technician and date/time range**
  - These changes should go through the reschedule function.
  > **Review (2026-10-07):** ACCEPTED — not built in Pass 36, which touched the sheet's header for C5.4's links and left the technician select, Scheduled Start / End and the Lock switches as they were. Locking them behind Reschedule (the one disposition path since Pass 27) is roadmap **C4.7**; FB-019's note stands - the preferred-technician reminder moves with the technician change.
- [ ] **FB-015 — "Add Service" button**
  - Expands/shows the Add Service section (or opens a modal) rather than showing it by default.
  > **Review (2026-10-07):** ACCEPTED — not built in Pass 36 (same sheet, not the C5.4 row). The add block (`sheet-add-service`) is always open today; collapsing it behind an "Add Service" button is roadmap **C4.7** with FB-013 and FB-014.

## Target Pests

- [ ] **FB-016 — Target pests as a division of Material settings**
  - Each material/product has a specific list of selectable pests.
  - If NULL, allow any pest from the pest list.

## Service Report

- [ ] **FB-017 — Display warranty information**
  - Insects covered and warranty period.
  - Configured in the service template.

## Schedule Board

- [ ] **FB-020 — Adjust time block to match visit duration**
  - The service/visit duration should be accurately reflected on the schedule board.
  - Adjust if duration is modified and apply conflict resolution prompt to this use case if a conflict exists.
  > **Review (2026-10-03):** QUALIFIED — agreed; not built in Pass 31. Today a card sits in its start slot and prints "N min"; spanning the slots the visit covers needs the minute-based slots Pass 31 (roadmap C4.5) just built, so it is its own rendering pass. Two qualifications: the span should be the planned window Pass 30b defined (the stored end, else the representative service's duration, else 60 minutes - `plannedWindow`), and the conflict prompt on a duration change is the lead-visit clash check Pass 30b noted as not built (today only a support add is checked). Roadmap: `PLAN_ROADMAP_V2.md` Phase 4 table, new row **C4.6**, unscheduled - the owner sequences it against Phase 5 (the next pass in phase order is Pass 32, C5.1a).

## Archive

- [x] **FB-010 — Widen modal viewport** (New Service)
  > **Review (2026-10-07):** DONE — Pass 36, `feature/phase-5-ui-hygiene` (roadmap C5.4, its last item). The New Service dialog is `max-w-2xl` - the width of the customer screen's Service Details dialog - instead of the component's default `max-w-lg`; the same dialog serves Edit Service, so both widened. Not rendered in a browser - please check the form on your screen after `npm run dev:full` restarts.
- [x] **FB-021 - Schedule board view changes** (owner, 2026-10-04, while PR #103 was open)
  - User shouldbe able to view a full day without scrolling, even in smallest interview view. The view port is currently very narrow, and could easily been widened for functionality.
  - Move non-static reporting modals to the bottom, or completely remove them. The prev/next, today, jump to date, window, etc buttons should not move. This makes the scheduler difficult to use. Do the same for the CLEAR SELECTION box, it should reside below the dispatch board, not on top.
  > **Review (2026-10-04):** DONE — Pass 31b, on Pass 31's branch and PR (#103, `feature/phase-4-dispatch-board-settings`; roadmap C4.5b). (1) The page uses the full browser width and, on the 1-day view, the slot columns share it with no minimum - a day fits without horizontal scrolling at every view interval, the 30-minute view included (its cards are narrow: compact padding, and the hover card still carries the full detail); a 3-day or week view keeps a 96 px floor per column and scrolls instead. (2) Nothing variable sits above the navigation row any more (prev / next, Today, Jump to Date, the viewport label and Window are directly under the title); the in-view figures (Jobs In View, Scheduled Revenue, Board Window and the per-technician cards) moved to the bottom of the page under "In view" - moved, not removed, so the numbers stay available; the selection box ("Scheduling selected service" / "Move / reassign selected appointment" with Clear Selection) sits directly below the board, above the pending queue. Not rendered in a browser - please check the 30-minute day on your screen.
- [x] **FB-018 — Support technician: duplicate the job on their schedule; prompt on a conflict** (owner, in session, 2026-10-03)
  > **Review (2026-10-03):** DONE — Pass 30b, `feature/phase-4-crew-schedule-review` (roadmap C4.4b). Qualified in one respect: the copy is a second card on the same visit (dashed, "Support", on the support technician's row of the board), not a duplicate appointment - a second appointment would duplicate the services and the invoice. Adding a support technician with an overlapping visit (lead or support) is a 409 prompt listing the visits; "Add anyway" confirms and is logged. Not covered: moving a visit later does not re-check its support technicians, and a lead placement is still not checked for a clash.
- [x] **FB-019 — Preferred technician: prompt when scheduling a different technician** (owner, in session, 2026-10-03)
  > **Review (2026-10-03):** DONE — Pass 30b (roadmap C4.4b). Any role confirms ("The customer prefers X" / "Schedule Y"); the confirmation is logged on the visit (`placement_preference_bypassed`). A manager's exclusion override counts as the approval, so an excluded-and-not-preferred technician prompts once. Support technicians are not asked. Related open item FB-014 (lock the technician / time on Appointment Details behind Reschedule) is untouched; if it lands, the sheet's reminder moves with the technician change.
