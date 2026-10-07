// PLAN_ROADMAP_V2.md C5.4 (Pass 36): the one rule about a location's primary
// contact, shared by the server (the refusal) and the contact dialog (the
// disabled checkbox and its note).
//
// Contacts are location-scoped (canon §3) and a location with contacts keeps
// EXACTLY ONE primary: the first contact is primary (createContact), promoting
// another demotes the current one in the same transaction (updateContact /
// setPrimaryContact, each demotion its own audit row since Pass 32). Before
// this pass nothing stopped the other direction - unchecking "Make primary
// contact" on the current primary wrote isPrimary false and touched no
// sibling, so the location had none (the Pass 36 inventory found it; a
// History revert of a promotion row did the same). The server now refuses
// the demotion, or a move of the primary to another location, unless another
// contact of the location is primary - which the writers never leave true, so
// in practice: promote the other contact instead, and this one follows.
// The revert goes through the same write path and is refused the same way,
// which is right: the row to revert is the other contact's promotion.

export const CONTACT_ERROR_CODES = {
  /** 400: the location's only primary contact cannot be made non-primary or moved; make another contact primary instead. */
  PRIMARY_REQUIRED: "CONTACT_PRIMARY_REQUIRED",
} as const;
export type ContactErrorCode = (typeof CONTACT_ERROR_CODES)[keyof typeof CONTACT_ERROR_CODES];

/** The refusal's message - the server's and, through getApiErrorMessage, the toast's. */
export const CONTACT_PRIMARY_REQUIRED_MESSAGE =
  "A location with contacts keeps one primary contact. Make another contact primary first; this one is demoted with it.";

/** Under the disabled checkbox when the dialog edits the current primary. */
export const CONTACT_PRIMARY_LOCKED_NOTE =
  "This is the location's primary contact. To change it, open the contact who should be primary and check the box there.";
