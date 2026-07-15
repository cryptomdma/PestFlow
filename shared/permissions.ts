export type UserRole = "admin" | "manager" | "support" | "technician";

export const PERMISSIONS = {
  POST_SERVICE_TICKET: "post_service_ticket",
  FINALIZE_TICKET: "finalize_ticket",
  REOPEN_TICKET: "reopen_ticket",
  ADJUST_PRICE_NON_AGREEMENT: "adjust_price_non_agreement",
  ADJUST_PRICE_AGREEMENT: "adjust_price_agreement",
  ADD_FIELD_SURCHARGE: "add_field_surcharge",
  GENERATE_INVOICE: "generate_invoice",
  SEND_INVOICE: "send_invoice",
  VOID_INVOICE: "void_invoice",
  ISSUE_CREDIT_MEMO: "issue_credit_memo",
  TAKE_PAYMENT_FIELD: "take_payment_field",
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
    PERMISSIONS.ADJUST_PRICE_NON_AGREEMENT,
    PERMISSIONS.ADD_FIELD_SURCHARGE,
    PERMISSIONS.GENERATE_INVOICE,
    PERMISSIONS.SEND_INVOICE,
    PERMISSIONS.TAKE_PAYMENT_FIELD,
  ]),
  manager: new Set<Permission>([
    PERMISSIONS.POST_SERVICE_TICKET,
    PERMISSIONS.FINALIZE_TICKET,
    PERMISSIONS.REOPEN_TICKET,
    PERMISSIONS.ADJUST_PRICE_NON_AGREEMENT,
    PERMISSIONS.ADJUST_PRICE_AGREEMENT,
    PERMISSIONS.ADD_FIELD_SURCHARGE,
    PERMISSIONS.GENERATE_INVOICE,
    PERMISSIONS.SEND_INVOICE,
    PERMISSIONS.VOID_INVOICE,
    PERMISSIONS.ISSUE_CREDIT_MEMO,
    PERMISSIONS.TAKE_PAYMENT_FIELD,
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
