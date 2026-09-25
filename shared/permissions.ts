export type UserRole = "admin" | "manager" | "support" | "technician";

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
  ADJUST_PRICE_NON_AGREEMENT: "adjust_price_non_agreement",
  ADJUST_PRICE_AGREEMENT: "adjust_price_agreement",
  ADD_FIELD_SURCHARGE: "add_field_surcharge",
  GENERATE_INVOICE: "generate_invoice",
  // PLAN_BILLING_V1_1.md D3: issuing a DRAFT invoice while any ticket on its
  // visit is still unfinalized. Manager+ only, and the tickets it bypasses are
  // flagged for review (serviceRecords.ticketStatus FLAGGED_FOR_REVIEW).
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
  // rules and zones (C4.1b) will write the same column under the system
  // actor, not a person's permission.
  ASSIGN_OPPORTUNITY: "assign_opportunity",
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
  MANAGE_SETTINGS: "manage_settings",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// Mirrors the RBAC matrix in PLAN_BILLING_V1.md §0.3. Rows marked "*" there
// (settings-gated per org) and the manager "partial" Manage Settings cell
// aren't representable as a plain boolean yet - both default to the
// coarser, safer read here and get split into finer-grained permissions
// if/when a route actually needs that nuance.
const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
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
  ]),
  manager: new Set<Permission>([
    PERMISSIONS.POST_SERVICE_TICKET,
    PERMISSIONS.FINALIZE_TICKET,
    PERMISSIONS.REOPEN_TICKET,
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
    PERMISSIONS.TAKE_PAYMENT_FIELD,
    PERMISSIONS.APPLY_PAYMENT,
    PERMISSIONS.CONFIRM_PAYMENT,
    PERMISSIONS.CONFIRM_CASH_PAYMENT,
    PERMISSIONS.VOID_PAYMENT,
    PERMISSIONS.REFUND_PAYMENT,
    PERMISSIONS.WAIVE_CANCELLATION_FEE,
    PERMISSIONS.VIEW_COST_MARGIN_LTV,
    PERMISSIONS.VIEW_PRODUCTION_VALUE,
  ]),
  admin: new Set<Permission>(Object.values(PERMISSIONS)),
};

export function can(role: string, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role as UserRole]?.has(permission) ?? false;
}
