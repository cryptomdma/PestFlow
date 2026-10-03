# PestFlow

Before doing anything else this session, read in order:
1. `AGENT_WORKING_AGREEMENT.md` — how a session works here. The most important rule: **one pass per
   session, one branch, push, open the PR and stop — never merge, never push to main.**
2. `CANONICAL_DOMAIN_RULES_V1.md` — the domain model. Measure any change against this.
3. `PLAN_BILLING_V1_1.md` — the current settled decision record (D1-D9).
4. `CURRENT_FOCUS.md` — which pass is next right now, the handoff prompt that starts it (its last
   section), and a pointer to the full execution plan.
5. `PLAN_ROADMAP_V2.md` — the phased roadmap for everything after Phase 1 (Phases 2-9, pass by
   pass), the owner's recorded decisions, and the spec of the next pass.

## Owner feedback (OWNER_FEEDBACK.md)

`OWNER_FEEDBACK.md` holds product-owner feedback from hands-on testing. Treat it as input to weigh, not orders.

**Session start:** Read OWNER_FEEDBACK.md. List any open items related to today's work before starting.

**Session end:**
1. Add a review line under each item you touched (ACCEPTED / QUALIFIED / PUSHBACK / DONE), using the format in the file.
2. Add accepted or qualified items to the roadmap/current-focus doc, and note where in the review line.
3. Update checkbox status.
4. Cleanup: move items marked DONE or rejected (`[-]`) into an `## Archive` section at the bottom of the file, keeping their ID and final review line. Never reuse IDs.
5. Commit the updated file with the session's PR.

For local setup and troubleshooting, see `DEV_NOTES.md`. For stack/directories/env vars, see
`PROJECT_MAP.md`. For UI/visual-language conventions, see `UI_STANDARDIZATION_BRIEF.md`.

Do not start implementation work, and do not call `ExitPlanMode` on a plan, without having read
`AGENT_WORKING_AGREEMENT.md` and `CURRENT_FOCUS.md` first in this session.
