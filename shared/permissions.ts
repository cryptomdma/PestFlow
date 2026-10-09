// The permission vocabulary both sides share, and the one `can()` helper
// every gate reads (server/auth.ts requirePermission, the inline server and
// storage checks, the two shared gates, and the client's buttons).
//
// Pass 37 (PLAN_ROADMAP_V2.md C5.6; B16): a user's `role` is the KEY of one
// of the org's ROLE PROFILES (role_profiles + role_profile_permissions,
// Settings -> Roles), not one of four fixed names. The four built-in
// profiles are seeded per org from ROLE_PERMISSIONS below - the defaults -
// under the keys the users rows already held ("admin", "manager", "support",
// "technician"), so no user row moved; the office edits them, clones them
// and adds its own. `can(role, permission)` stays synchronous and keyed by
// the role string: it reads a process-level REGISTRY (setPermissionMatrix /
// getPermissionMatrix) that the server fills at boot and after every profile
// write (server/role-profile-bootstrap.ts loadPermissionRegistry) and that
// the client fills from the `roleProfiles` list GET /api/auth/me and the
// login answer carry (client/src/hooks/use-auth.ts) - so none of the ~125
// call sites changed. With an EMPTY registry (the client's first render, a
// server whose bootstrap failed) `can()` reads the built-in defaults, so
// nothing is blank and nothing is wider than the defaults.
//
// Known limit (decided, Pass 37): the registry is per PROCESS, not per org.
// With one organization it is exact; under multi-tenancy (Phase 9) it must
// be keyed by org and `can()` must learn the org (the server loads the first
// org's profiles and warns at boot when more exist).

/** The four built-in profile keys, seeded for every org. A user's role may be any profile key, so the runtime type is `string` (UserRole). */
export type BuiltInRole = "admin" | "manager" | "support" | "technician";
export const BUILT_IN_ROLES: readonly BuiltInRole[] = ["technician", "support", "manager", "admin"];

/** A role profile key - one of the org's profiles (the built-ins keep the four names above; the office's own are upper snake, OFFICE_LEAD). */
export type UserRole = string;

export const PERMISSIONS = {
  POST_SERVICE_TICKET: "post_service_ticket",
  FINALIZE_TICKET: "finalize_ticket",
  REOPEN_TICKET: "reopen_ticket",
  // PLAN_BILLING_V1_1.md D9 (Pass 16, C3.1): edit a posted ticket - the
  // office's PATCH on a service record, and a re-post over a ticket that is
  // already in office review. Support+. A technician's ticket is locked from
  // the moment it is posted until the office reopens it; a FINALIZED ticket
  // refuses everyone until reopened. Every accepted edit is logged as
  // `ticket_edited`.
  EDIT_TICKET: "edit_ticket",
  // PLAN_ROADMAP_V2.md C3.2 (Pass 17): reopen a ticket with "Other" - a typed
  // reason instead of one from the settings list (shared/ticket-reopen.ts).
  // Manager+, the ADJUST_PRICE_AGREEMENT pattern: the list is what the office
  // maintains for its reviewers, and stepping outside it is a manager's
  // call. REOPEN_TICKET (support+) still gates the reopen itself.
  REOPEN_TICKET_OTHER: "reopen_ticket_other",
  ADJUST_PRICE_NON_AGREEMENT: "adjust_price_non_agreement",
  ADJUST_PRICE_AGREEMENT: "adjust_price_agreement",
  // PLAN_ROADMAP_V2.md C3.6 (Pass 23): record, change or remove the field
  // surcharge line on a ticket (serviceRecords.surchargeCents) - the post and
  // the office edit alike. Every built-in profile holds it; for an agreement
  // service the agreement template's toggle must allow it too
  // (shared/field-surcharge.ts resolveFieldSurchargeGate).
  ADD_FIELD_SURCHARGE: "add_field_surcharge",
  GENERATE_INVOICE: "generate_invoice",
  // PLAN_BILLING_V1_1.md D3: issuing a DRAFT invoice while any ticket on its
  // visit is still unfinalized. Manager+ by default, and the tickets it
  // bypasses are flagged for review (serviceRecords.ticketStatus
  // FLAGGED_FOR_REVIEW).
  ISSUE_INVOICE_PREFINALIZATION: "issue_invoice_prefinalization",
  SEND_INVOICE: "send_invoice",
  VOID_INVOICE: "void_invoice",
  ISSUE_CREDIT_MEMO: "issue_credit_memo",
  // PLAN_ROADMAP_V2.md C2.1b (Pass 11b): put a location on an invoice that
  // has none - the repair for the rows created before a manual invoice
  // required one. Manager+. Never a transfer: the route refuses an invoice
  // that already has a location.
  ASSIGN_INVOICE_LOCATION: "assign_invoice_location",
  // PLAN_ROADMAP_V2.md C2.2 (Pass 12): give sale credit for an agreement
  // (agreements.soldByUserId) to someone other than the session user - at
  // creation or by a later change. Manager+. Comp basis: who sold it decides
  // who a commission component will pay (Phase 7), so a technician or
  // support user records only their own sale.
  ASSIGN_SALE_CREDIT: "assign_sale_credit",
  // PLAN_ROADMAP_V2.md C4.1 (Pass 25): assign, reassign or unassign an
  // opportunity (opportunities.assignedUserId) - the office's dispatch of
  // follow-up work to a sales rep, an office rep or a manager (B7). Support+.
  // A technician is not in B7's list of assignees' managers: they see the
  // queue like everyone (reads are open) and filter to "My opportunities",
  // but do not hand work to themselves or anyone else. Auto-assignment by
  // rules and zones (C4.1b, Pass 26) writes the same column at creation
  // under the system actor, never a person's permission; the rules and the
  // zones themselves are Settings, edited under MANAGE_SETTINGS.
  ASSIGN_OPPORTUNITY: "assign_opportunity",
  // PLAN_ROADMAP_V2.md C4.4 (Pass 30; B14): place, re-assign or crew a visit
  // with a technician the customer EXCLUDED (technician_preferences). Manager+,
  // the ISSUE_INVOICE_PREFINALIZATION pattern: a manager's override, with a
  // typed reason, recorded as placement_exclusion_overridden. Setting the
  // preferences themselves is customer data, open to every role.
  OVERRIDE_TECHNICIAN_EXCLUSION: "override_technician_exclusion",
  // PLAN_ROADMAP_V2.md C5.1b (Pass 33; D7, B21, Part E answer 8): revert a
  // History row - put the fields an earlier change moved back to what they
  // were, as a NEW forward change through the entity's own write path,
  // recorded as `reverted` naming the source row (POST
  // /api/history/:auditLogId/revert; shared/audit.ts decides which rows).
  // The built-in manager and admin profiles hold it; since Pass 37 any
  // profile the office gives it to does. Reading history stays open to every
  // role, as every read is.
  REVERT_HISTORY: "revert_history",
  // PLAN_BILLING_V1_1.md D5, the payments ledger. TAKE_PAYMENT_FIELD records
  // a payment (it posts PENDING); the rest are office actions on the ledger.
  TAKE_PAYMENT_FIELD: "take_payment_field",
  // Apply an unapplied payment / credit memo to an invoice, and release
  // (un-apply) one. Both directions are the same explicit, audit-logged act.
  APPLY_PAYMENT: "apply_payment",
  // A check or "other" payment confirms on clearance - office work.
  CONFIRM_PAYMENT: "confirm_payment",
  // Cash confirms only by a user with cash-handling authority (D5).
  CONFIRM_CASH_PAYMENT: "confirm_cash_payment",
  // Voiding a recorded payment is a correction on a money record.
  VOID_PAYMENT: "void_payment",
  REFUND_PAYMENT: "refund_payment",
  WAIVE_CANCELLATION_FEE: "waive_cancellation_fee",
  VIEW_COST_MARGIN_LTV: "view_cost_margin_ltv",
  VIEW_PRODUCTION_VALUE: "view_production_value",
  // Pass 37 (C5.6): change a service's instructions (services.notes) whoever
  // added the service. Without it a user changes only the instructions of a
  // service THEY added in the field (Pass 29's SERVICE_INSTRUCTIONS_LOCKED,
  // which was a direct `role === "technician"` check before this pass - a
  // custom field profile cloned from Technician inherits the lock through
  // the permission, not the name). Support, manager and admin hold it.
  EDIT_ANY_SERVICE_INSTRUCTIONS: "edit_any_service_instructions",
  // Pass 38 (C5.7): open ANOTHER technician's day on the Tech View (GET
  // /api/technicians/:id/work for an id that is not the session user's).
  // Without it a technician sees their own day only - the page defaults to
  // the session user and hides the picker; the office (support, manager,
  // admin by default) keeps the picker. The first permission added after
  // Pass 37's seed: the bootstrap grants it to the seeded built-in profiles
  // that should hold it (server/role-profile-bootstrap.ts), since
  // ROLE_PERMISSIONS below seeds only a NEW org.
  VIEW_OTHER_TECHNICIAN_WORK: "view_other_technician_work",
  // Pass 40 (C6.1): add a card on file for an account (the SetupIntent
  // session and its confirm), make one the default, or remove one. Support,
  // manager and admin by default - office work on the customer's record;
  // the technician's TAKE_PAYMENT_FIELD records money, it does not store an
  // instrument (field capture at the visit is the owner's call, open). The
  // last four stays visible to every role (B18): reads are open. Granted to
  // the seeded built-ins by SEEDED_PROFILE_GRANTS (the Pass 38 rule).
  MANAGE_PAYMENT_METHODS: "manage_payment_methods",
  MANAGE_SETTINGS: "manage_settings",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Every permission value, in declaration order - the checklist's and the seed's order. */
export const PERMISSION_VALUES: readonly Permission[] = Object.values(PERMISSIONS);

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (PERMISSION_VALUES as readonly string[]).includes(value);
}

// Pass 37: the human labels - the Roles card's checklist, the refusal copy
// ("a role with Manage Settings"), the History diff of a profile. Short
// verb phrases; the description says what the permission unlocks today.
export const PERMISSION_LABELS: Record<Permission, string> = {
  post_service_ticket: "Post service ticket",
  finalize_ticket: "Finalize ticket",
  reopen_ticket: "Reopen ticket",
  edit_ticket: "Edit posted ticket",
  reopen_ticket_other: "Reopen with a typed reason",
  adjust_price_non_agreement: "Set one-time service price",
  adjust_price_agreement: "Re-price agreement service",
  add_field_surcharge: "Add field surcharge",
  generate_invoice: "Generate invoice",
  issue_invoice_prefinalization: "Issue before finalization",
  send_invoice: "Send invoice",
  void_invoice: "Void invoice",
  issue_credit_memo: "Issue credit memo",
  assign_invoice_location: "Assign invoice location",
  assign_sale_credit: "Assign sale credit",
  assign_opportunity: "Assign opportunity",
  override_technician_exclusion: "Override excluded technician",
  revert_history: "Revert history",
  take_payment_field: "Record payment",
  apply_payment: "Apply payment",
  confirm_payment: "Confirm payment",
  confirm_cash_payment: "Confirm cash payment",
  void_payment: "Void payment",
  refund_payment: "Refund payment",
  waive_cancellation_fee: "Waive cancellation fee",
  view_cost_margin_ltv: "View cost, margin and LTV",
  view_production_value: "View production value",
  edit_any_service_instructions: "Edit any service instructions",
  view_other_technician_work: "View another technician's day",
  manage_payment_methods: "Manage cards on file",
  manage_settings: "Manage Settings",
};

export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  post_service_ticket: "Post a service ticket - the field post and the direct ticket create (every built-in profile holds it; checked since Pass 39).",
  finalize_ticket: "Finalize a posted ticket in office review - the authoritative completion.",
  reopen_ticket: "Reopen a finalized ticket with a reason from the Settings list.",
  edit_ticket: "Edit a ticket in office review, or re-post over one.",
  reopen_ticket_other: "Reopen with \"Other\" and a typed reason instead of one from the list.",
  adjust_price_non_agreement: "Change the price of a one-time (non-agreement) service.",
  adjust_price_agreement: "Change the price, type or kind of an agreement-generated service.",
  add_field_surcharge: "Record a surcharge line on a ticket (the agreement template must allow it).",
  generate_invoice: "Draft, issue and print invoices and statements.",
  issue_invoice_prefinalization: "Issue a draft invoice while a ticket on its visit is still unfinalized (flags the tickets).",
  send_invoice: "Send an issued invoice to the customer.",
  void_invoice: "Void an issued invoice.",
  issue_credit_memo: "Issue a credit memo.",
  assign_invoice_location: "Put a location on an invoice that has none.",
  assign_sale_credit: "Credit an agreement sale to someone other than yourself.",
  assign_opportunity: "Assign, reassign or unassign an opportunity.",
  override_technician_exclusion: "Place a technician the customer excluded, with a typed reason.",
  revert_history: "Put a History row's fields back as a new forward change.",
  take_payment_field: "Record a cash, check or other payment (it posts pending).",
  apply_payment: "Apply a payment or credit to an invoice, or release one.",
  confirm_payment: "Confirm a check or other payment on clearance.",
  confirm_cash_payment: "Confirm a cash payment - cash-handling authority.",
  void_payment: "Void a recorded payment.",
  refund_payment: "Record a refund against a payment.",
  waive_cancellation_fee: "Waive the fee an agreement's cancellation policy charges.",
  view_cost_margin_ltv: "Read cost, margin and lifetime value figures (not checked by any route or screen yet - the money reads are listed under PLAN_ROADMAP_V2.md C5.10).",
  view_production_value: "Read the production value ledger.",
  edit_any_service_instructions: "Change a service's instructions whoever added it; without it, only on a service you added in the field.",
  view_other_technician_work: "Open any technician's day on the Tech View; without it, only your own.",
  manage_payment_methods: "Add a card on file for an account, make one the default or remove one (the last four is visible to everyone).",
  manage_settings: "Every Settings card - reference lists, templates, zones, rules, role profiles, users and technicians, the payment provider.",
};

/** The checklist's grouping on the Roles card. Every permission appears in exactly one group. */
export const PERMISSION_GROUPS: ReadonlyArray<{ label: string; permissions: readonly Permission[] }> = [
  {
    label: "Tickets",
    permissions: [
      PERMISSIONS.POST_SERVICE_TICKET,
      PERMISSIONS.FINALIZE_TICKET,
      PERMISSIONS.REOPEN_TICKET,
      PERMISSIONS.REOPEN_TICKET_OTHER,
      PERMISSIONS.EDIT_TICKET,
      PERMISSIONS.ADD_FIELD_SURCHARGE,
      PERMISSIONS.EDIT_ANY_SERVICE_INSTRUCTIONS,
    ],
  },
  {
    label: "Pricing",
    permissions: [PERMISSIONS.ADJUST_PRICE_NON_AGREEMENT, PERMISSIONS.ADJUST_PRICE_AGREEMENT, PERMISSIONS.WAIVE_CANCELLATION_FEE],
  },
  {
    label: "Invoices",
    permissions: [
      PERMISSIONS.GENERATE_INVOICE,
      PERMISSIONS.ISSUE_INVOICE_PREFINALIZATION,
      PERMISSIONS.SEND_INVOICE,
      PERMISSIONS.VOID_INVOICE,
      PERMISSIONS.ISSUE_CREDIT_MEMO,
      PERMISSIONS.ASSIGN_INVOICE_LOCATION,
    ],
  },
  {
    label: "Payments",
    permissions: [
      PERMISSIONS.TAKE_PAYMENT_FIELD,
      PERMISSIONS.APPLY_PAYMENT,
      PERMISSIONS.CONFIRM_PAYMENT,
      PERMISSIONS.CONFIRM_CASH_PAYMENT,
      PERMISSIONS.VOID_PAYMENT,
      PERMISSIONS.REFUND_PAYMENT,
      PERMISSIONS.MANAGE_PAYMENT_METHODS,
    ],
  },
  {
    label: "Sales and scheduling",
    permissions: [PERMISSIONS.ASSIGN_SALE_CREDIT, PERMISSIONS.ASSIGN_OPPORTUNITY, PERMISSIONS.OVERRIDE_TECHNICIAN_EXCLUSION, PERMISSIONS.VIEW_OTHER_TECHNICIAN_WORK],
  },
  {
    label: "Reports",
    permissions: [PERMISSIONS.VIEW_PRODUCTION_VALUE, PERMISSIONS.VIEW_COST_MARGIN_LTV],
  },
  {
    label: "History and settings",
    permissions: [PERMISSIONS.REVERT_HISTORY, PERMISSIONS.MANAGE_SETTINGS],
  },
];

/** "Manage Settings" / "Revert history"; the value itself for one not on the list (a row from before a permission was renamed). */
export function describePermission(permission: string): string {
  return PERMISSION_LABELS[permission as Permission] ?? permission;
}

// The BUILT-IN DEFAULTS - what the four seeded profiles hold on the day an
// org is created, and what `can()` reads with an empty registry. Mirrors the
// RBAC matrix in PLAN_BILLING_V1.md §0.3. Rows marked "*" there
// (settings-gated per org) and the manager "partial" Manage Settings cell
// aren't representable as a plain boolean; both take the coarser, safer read
// here, and since Pass 37 the office refines them per profile in Settings.
// Exported since Pass 37: the seed (shared/role-profiles.ts) and the smoke
// test's parity check read it. Editing this record changes what a NEW org is
// seeded with, never an existing org's profiles (those are rows) - a
// permission added later is granted to the seeded built-ins by
// server/role-profile-bootstrap.ts SEEDED_PROFILE_GRANTS (Pass 38 was the
// first: technician 4 / support 14 / manager 29 / admin 30; Pass 40's
// MANAGE_PAYMENT_METHODS makes it 4 / 15 / 30 / 31).
export const ROLE_PERMISSIONS: Record<BuiltInRole, ReadonlySet<Permission>> = {
  technician: new Set<Permission>([
    PERMISSIONS.POST_SERVICE_TICKET,
    PERMISSIONS.ADJUST_PRICE_NON_AGREEMENT,
    PERMISSIONS.ADD_FIELD_SURCHARGE,
    PERMISSIONS.TAKE_PAYMENT_FIELD,
  ]),
  support: new Set<Permission>([
    PERMISSIONS.POST_SERVICE_TICKET,
    PERMISSIONS.FINALIZE_TICKET,
    PERMISSIONS.REOPEN_TICKET,
    PERMISSIONS.EDIT_TICKET,
    PERMISSIONS.ADJUST_PRICE_NON_AGREEMENT,
    PERMISSIONS.ADD_FIELD_SURCHARGE,
    PERMISSIONS.GENERATE_INVOICE,
    PERMISSIONS.SEND_INVOICE,
    PERMISSIONS.ASSIGN_OPPORTUNITY,
    PERMISSIONS.TAKE_PAYMENT_FIELD,
    PERMISSIONS.APPLY_PAYMENT,
    PERMISSIONS.CONFIRM_PAYMENT,
    PERMISSIONS.EDIT_ANY_SERVICE_INSTRUCTIONS,
    PERMISSIONS.VIEW_OTHER_TECHNICIAN_WORK,
    PERMISSIONS.MANAGE_PAYMENT_METHODS,
  ]),
  manager: new Set<Permission>([
    PERMISSIONS.POST_SERVICE_TICKET,
    PERMISSIONS.FINALIZE_TICKET,
    PERMISSIONS.REOPEN_TICKET,
    PERMISSIONS.REOPEN_TICKET_OTHER,
    PERMISSIONS.EDIT_TICKET,
    PERMISSIONS.ADJUST_PRICE_NON_AGREEMENT,
    PERMISSIONS.ADJUST_PRICE_AGREEMENT,
    PERMISSIONS.ADD_FIELD_SURCHARGE,
    PERMISSIONS.GENERATE_INVOICE,
    PERMISSIONS.ISSUE_INVOICE_PREFINALIZATION,
    PERMISSIONS.SEND_INVOICE,
    PERMISSIONS.VOID_INVOICE,
    PERMISSIONS.ISSUE_CREDIT_MEMO,
    PERMISSIONS.ASSIGN_INVOICE_LOCATION,
    PERMISSIONS.ASSIGN_SALE_CREDIT,
    PERMISSIONS.ASSIGN_OPPORTUNITY,
    PERMISSIONS.OVERRIDE_TECHNICIAN_EXCLUSION,
    PERMISSIONS.REVERT_HISTORY,
    PERMISSIONS.TAKE_PAYMENT_FIELD,
    PERMISSIONS.APPLY_PAYMENT,
    PERMISSIONS.CONFIRM_PAYMENT,
    PERMISSIONS.CONFIRM_CASH_PAYMENT,
    PERMISSIONS.VOID_PAYMENT,
    PERMISSIONS.REFUND_PAYMENT,
    PERMISSIONS.WAIVE_CANCELLATION_FEE,
    PERMISSIONS.VIEW_COST_MARGIN_LTV,
    PERMISSIONS.VIEW_PRODUCTION_VALUE,
    PERMISSIONS.EDIT_ANY_SERVICE_INSTRUCTIONS,
    PERMISSIONS.VIEW_OTHER_TECHNICIAN_WORK,
    PERMISSIONS.MANAGE_PAYMENT_METHODS,
  ]),
  admin: new Set<Permission>(Object.values(PERMISSIONS)),
};

// ---------------------------------------------------------------------------
// The registry (Pass 37)

/** One profile as the registry holds it - what GET /api/auth/me carries as `roleProfiles`. Active profiles only. */
export interface PermissionMatrixEntry {
  key: string;
  name: string;
  sortOrder: number;
  permissions: Permission[];
}

/** Permissions in declaration order - the snapshots' and the API's canonical order, so two sets compare as arrays. */
export function sortPermissions(list: Iterable<string>): Permission[] {
  const set = new Set<string>(list);
  return PERMISSION_VALUES.filter((permission) => set.has(permission));
}

/** The four built-in profiles as the seed writes them: name, description and order per key, the permissions from ROLE_PERMISSIONS. */
export const BUILT_IN_ROLE_PROFILES: ReadonlyArray<PermissionMatrixEntry & { key: BuiltInRole; description: string }> = [
  {
    key: "technician",
    name: "Technician",
    description: "Field work: posts tickets, prices one-time services, adds surcharges and records payments at the visit.",
    sortOrder: 10,
    permissions: sortPermissions(ROLE_PERMISSIONS.technician),
  },
  {
    key: "support",
    name: "Support",
    description: "Office review: finalizes, edits and reopens tickets, drafts and sends invoices, applies and confirms payments, assigns opportunities.",
    sortOrder: 20,
    permissions: sortPermissions(ROLE_PERMISSIONS.support),
  },
  {
    key: "manager",
    name: "Manager",
    description: "Everything Support does plus the overrides: agreement re-pricing, voids, refunds, cash confirmation, sale credit, exclusion overrides, reverts and the reports. No Settings.",
    sortOrder: 30,
    permissions: sortPermissions(ROLE_PERMISSIONS.manager),
  },
  {
    key: "admin",
    name: "Admin",
    description: "Every permission, Settings included - role profiles and user assignments.",
    sortOrder: 40,
    permissions: sortPermissions(ROLE_PERMISSIONS.admin),
  },
];

interface RegistryEntry {
  entry: PermissionMatrixEntry;
  set: ReadonlySet<Permission>;
}

let registry: Map<string, RegistryEntry> | null = null;

function toRegistry(entries: ReadonlyArray<PermissionMatrixEntry>): Map<string, RegistryEntry> {
  const map = new Map<string, RegistryEntry>();
  for (const raw of entries) {
    const permissions = sortPermissions(raw.permissions ?? []);
    const entry: PermissionMatrixEntry = { key: raw.key, name: raw.name, sortOrder: raw.sortOrder ?? 0, permissions };
    map.set(entry.key, { entry, set: new Set(permissions) });
  }
  return map;
}

const BUILT_IN_REGISTRY = toRegistry(BUILT_IN_ROLE_PROFILES);

/**
 * Fill (or, with null / an empty list, clear) the registry `can()` reads.
 * The server calls it at boot and after every profile write with the org's
 * ACTIVE profiles; the client calls it from the /api/auth/me payload before
 * that payload is committed to the query cache, so the first render that
 * knows the user already reads the org's matrix. Unknown permission values
 * are dropped (a row from before a permission was removed).
 */
export function setPermissionMatrix(entries: ReadonlyArray<PermissionMatrixEntry> | null | undefined): void {
  registry = entries && entries.length ? toRegistry(entries) : null;
}

/** True once the registry holds the org's profiles; false means `can()` is reading the built-in defaults. */
export function hasPermissionMatrix(): boolean {
  return registry !== null;
}

function activeRegistry(): Map<string, RegistryEntry> {
  return registry ?? BUILT_IN_REGISTRY;
}

/** The profiles the registry holds, least to most privileged (by permission count, then sort order, then name) - the built-in defaults when it is empty. */
export function getPermissionMatrix(): PermissionMatrixEntry[] {
  return Array.from(activeRegistry().values())
    .map((item) => item.entry)
    .sort((left, right) => left.permissions.length - right.permissions.length || left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
}

export function can(role: string, permission: Permission): boolean {
  return activeRegistry().get(role)?.set.has(permission) ?? false;
}

/** The NAMES of the profiles holding a permission, least to most privileged - for a refusal that says who may ("Manager or Admin"). */
export function rolesWithPermission(permission: Permission): string[] {
  return getPermissionMatrix()
    .filter((entry) => entry.permissions.includes(permission))
    .map((entry) => entry.name);
}

/** "Admin" / "Manager or Admin" / "Support, Manager or Admin"; "no role" when no profile holds it. */
export function describePermissionHolders(permission: Permission): string {
  const names = rolesWithPermission(permission);
  if (!names.length) return "no role";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/** A profile's name for its key - "Admin" for "admin", the office's name for its own keys, the key itself for one not in the registry (a user whose role names a retired profile). */
export function describeRoleName(role: string | null | undefined): string {
  if (!role) return "";
  return activeRegistry().get(role)?.entry.name ?? BUILT_IN_REGISTRY.get(role)?.entry.name ?? role;
}
