// Pass 17 (PLAN_ROADMAP_V2.md C3.2; PLAN_BILLING_V1_1.md D9): the reopen
// reason's vocabulary, shared by the reopen route, the review modal's
// pop-up, the Settings card and the Services tab.
//
// A reopen names a reason from the org's settings list (app_settings
// `ticket_reopen_reasons`, one JSON array of strings - the shape of
// `appointment_cancel_reschedule_reasons`) or the fixed code OTHER with the
// reason typed out. "Other" is never a list entry: the pop-up offers it
// last, its text is required, and it is gated by REOPEN_TICKET_OTHER
// (manager+), so a support reviewer picks from the list the office
// maintains. The ticket stores the code (`reopenReasonCode` - the list
// entry as written, or OTHER) and the free text (`reopenReason` - required
// for OTHER, optional detail beside a listed reason). Rows reopened before
// this pass carry their free text with a null code, never a guessed one.

export const TICKET_REOPEN_REASONS_SETTING_KEY = "ticket_reopen_reasons";

/** The fixed code for a typed reason. Never stored on the settings list. */
export const REOPEN_REASON_OTHER = "OTHER";
export const REOPEN_REASON_OTHER_LABEL = "Other";

/** The list an org starts with, until Settings saves its own. */
export const DEFAULT_TICKET_REOPEN_REASONS: readonly string[] = [
  "Wrong price",
  "Wrong service date",
  "Wrong technician",
  "Materials missing or incorrect",
  "Notes incomplete",
  "Customer dispute",
  "Posted on the wrong service",
  "Finalized in error",
];

// Error codes the reopen route answers with, beside the message.
/** 400: the code is neither on the settings list nor OTHER. */
export const REOPEN_REASON_NOT_ON_LIST = "REOPEN_REASON_NOT_ON_LIST";
/** 400: OTHER without the reason typed. */
export const REOPEN_REASON_TEXT_REQUIRED = "REOPEN_REASON_TEXT_REQUIRED";
/** 403: OTHER by a user without REOPEN_TICKET_OTHER. */
export const REOPEN_OTHER_FORBIDDEN = "REOPEN_OTHER_FORBIDDEN";

/** The request body of POST /api/service-records/:id/reopen. */
export interface ReopenTicketRequest {
  /** A reason on the settings list, as written there, or OTHER. */
  reasonCode: string;
  /** Required for OTHER; optional detail beside a listed reason. */
  reason?: string | null;
}

export function isOtherReopenReason(code: string | null | undefined): boolean {
  return (code ?? "").trim().toUpperCase() === REOPEN_REASON_OTHER;
}

/** True for a list entry that would read as Other - kept off the stored list. */
function readsAsOther(reason: string): boolean {
  const upper = reason.trim().toUpperCase();
  return upper === REOPEN_REASON_OTHER || upper === REOPEN_REASON_OTHER_LABEL.toUpperCase();
}

/**
 * The list as Settings may store it: trimmed, nameless entries dropped,
 * duplicates dropped (the first wins), and any "Other" dropped - the pop-up
 * offers Other itself, last, under its own rules.
 */
export function sanitizeTicketReopenReasons(reasons: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of reasons) {
    const reason = String(raw ?? "").trim();
    if (!reason || readsAsOther(reason) || seen.has(reason)) continue;
    seen.add(reason);
    out.push(reason);
  }
  return out;
}

/**
 * The stored app_settings value as a list: a JSON array of strings, or
 * (defensively, as the cancel list reads) newline / comma separated text.
 * No row, or nothing usable in it, reads as the defaults.
 */
export function normalizeTicketReopenReasons(value: string | null | undefined): string[] {
  if (!value) return DEFAULT_TICKET_REOPEN_REASONS.slice();
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = value.split(/\r?\n|,/);
  }
  const reasons = Array.isArray(parsed) ? sanitizeTicketReopenReasons(parsed) : [];
  return reasons.length ? reasons : DEFAULT_TICKET_REOPEN_REASONS.slice();
}

/**
 * What a ticket's reopen reads as: the code's label (Other for OTHER, the
 * list entry as written, or nothing on a row reopened before the code
 * existed) and the free text beside it.
 */
export function describeReopenReason(record: { reopenReasonCode?: string | null; reopenReason?: string | null }): { label: string | null; text: string | null } {
  const code = record.reopenReasonCode?.trim() || null;
  const text = record.reopenReason?.trim() || null;
  const label = code ? (isOtherReopenReason(code) ? REOPEN_REASON_OTHER_LABEL : code) : null;
  return { label, text };
}

/** One line for a list or a card: "Wrong price", "Other - typed text", or the legacy text alone. */
export function formatReopenReason(record: { reopenReasonCode?: string | null; reopenReason?: string | null }): string | null {
  const { label, text } = describeReopenReason(record);
  if (label && text) return label + " - " + text;
  return label ?? text;
}
