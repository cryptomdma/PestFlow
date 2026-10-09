// PLAN_ROADMAP_V2.md C5.2 (Pass 34): the billing profile on the customer
// screen - the vocabulary both sides share. The org default template
// (`default_billing_profile_template_id`, one app_settings row on Pass 31's
// one-key pattern; no seed row, so the reader answers null = no default), the
// shape of a location's resolved billing ("account default", "this location"
// or none) that the customer screen's chip and badges read, and the lists the
// forms and the route schemas validate against (billing type, invoice terms,
// profile status).
//
// Three pointers existed before Pass 34 and only one was read:
// `billing_profiles.location_id` (the forward pointer - canon §4's shape, the
// resolver's, Pass 11c's invoice parties) is the truth. The other two,
// `locations.billing_profile_id` (the legacy reverse pointer the write path
// mirrored) and `customers.default_billing_profile_id` (read by nothing), were
// DROPPED in Pass 39 (C5.8) - the bootstrap carried any surviving reverse
// pointer onto location_id once before the drop.

/** billing_profiles.billing_type / billing_profile_templates.billing_type. */
export const BILLING_TYPES = ["card", "ach", "invoice_terms", "cash", "check"] as const;
export type BillingType = (typeof BILLING_TYPES)[number];

/** billing_profiles.invoice_terms - the terms computeDueDateFromInvoiceTerms knows. */
export const INVOICE_TERMS = ["DUE_ON_RECEIPT", "NET_15", "NET_30", "NET_60"] as const;
export type InvoiceTerms = (typeof INVOICE_TERMS)[number];

/** billing_profiles.status. A retired override is `inactive`, never deleted: invoices carry its id in their snapshot. */
export const BILLING_PROFILE_STATUSES = ["active", "inactive"] as const;
export type BillingProfileStatus = (typeof BILLING_PROFILE_STATUSES)[number];

/** The 400 codes a billing profile write answers when the rules refuse it (server/storage.ts BillingProfileError). */
export const BILLING_PROFILE_ERROR_CODES = {
  ACCOUNT_NOT_FOUND: "BILLING_PROFILE_ACCOUNT_NOT_FOUND",
  LOCATION_MISMATCH: "BILLING_PROFILE_LOCATION_MISMATCH",
  OVERRIDE_EXISTS: "BILLING_PROFILE_OVERRIDE_EXISTS",
  DEFAULT_EXISTS: "BILLING_PROFILE_DEFAULT_EXISTS",
  /** Pass 39 (C5.8): `templateId` names no billing profile template of the org - refused 400 before the insert, since the foreign key would make it a 500. */
  TEMPLATE_UNKNOWN: "BILLING_PROFILE_TEMPLATE_UNKNOWN",
} as const;
export type BillingProfileErrorCode = (typeof BILLING_PROFILE_ERROR_CODES)[keyof typeof BILLING_PROFILE_ERROR_CODES];

export function isBillingType(value: unknown): value is BillingType {
  return (BILLING_TYPES as readonly string[]).includes(value as string);
}

export function isInvoiceTerms(value: unknown): value is InvoiceTerms {
  return (INVOICE_TERMS as readonly string[]).includes(value as string);
}

/** "Card", "ACH", "Invoice terms", "Cash", "Check" - the selects and the chips. */
export function describeBillingType(billingType: string | null | undefined): string | null {
  switch (billingType) {
    case "card":
      return "Card";
    case "ach":
      return "ACH";
    case "invoice_terms":
      return "Invoice terms";
    case "cash":
      return "Cash";
    case "check":
      return "Check";
    default:
      return billingType ? billingType.replace(/_/g, " ") : null;
  }
}

// ---------------------------------------------------------------------------
// The org default template (Settings -> Billing defaults).

/** The one app_settings key this module owns. */
export const DEFAULT_BILLING_PROFILE_TEMPLATE_SETTING_KEY = "default_billing_profile_template_id";

export interface BillingDefaults {
  /** The active template a new customer's account-default profile is created from; null = none (new customers start with no profile). */
  defaultBillingProfileTemplateId: string | null;
}

/** No row: no default. */
export const DEFAULT_BILLING_DEFAULTS: BillingDefaults = { defaultBillingProfileTemplateId: null };

/** The PATCH's 400 code when the template is unknown or inactive. */
export const BILLING_DEFAULTS_INVALID = "BILLING_DEFAULTS_INVALID";

/** Stored text -> settings: a blank or missing value reads as null. */
export function normalizeBillingDefaults(values: { defaultBillingProfileTemplateId?: string | null | undefined }): BillingDefaults {
  const raw = values.defaultBillingProfileTemplateId;
  const id = typeof raw === "string" ? raw.trim() : "";
  return { defaultBillingProfileTemplateId: id || null };
}

// ---------------------------------------------------------------------------
// A location's resolved billing, as the customer screen reads it.

/** Where the resolver's answer came from. */
export const BILLING_PROFILE_SOURCES = ["ACCOUNT_DEFAULT", "LOCATION_OVERRIDE", "NONE"] as const;
export type BillingProfileSource = (typeof BILLING_PROFILE_SOURCES)[number];

/** The fields the chip, the badges and the ticket header print - never the tokens. */
export interface BillingProfileSummary {
  profileId: string;
  label: string;
  billingType: string;
  invoiceTerms: string | null;
}

export interface LocationBillingProjection {
  source: BillingProfileSource;
  profileId: string | null;
  label: string | null;
  billingType: string | null;
  invoiceTerms: string | null;
}

export const NO_BILLING_PROFILE: LocationBillingProjection = { source: "NONE", profileId: null, label: null, billingType: null, invoiceTerms: null };

/**
 * The resolver's answer for one location as a projection: the profile's
 * locationId equal to the location's means an override, any other row is
 * the account default, nothing is NONE.
 */
export function projectLocationBilling(
  locationId: string,
  profile: { id: string; locationId: string | null; label: string; billingType: string; invoiceTerms: string | null } | null | undefined,
): LocationBillingProjection {
  if (!profile) return NO_BILLING_PROFILE;
  return {
    source: profile.locationId === locationId ? "LOCATION_OVERRIDE" : "ACCOUNT_DEFAULT",
    profileId: profile.id,
    label: profile.label,
    billingType: profile.billingType,
    invoiceTerms: profile.invoiceTerms,
  };
}

/** The parenthetical after the label: "(account default)" / "(this location)". */
export function describeBillingProfileSource(source: BillingProfileSource): string {
  switch (source) {
    case "ACCOUNT_DEFAULT":
      return "account default";
    case "LOCATION_OVERRIDE":
      return "this location";
    case "NONE":
      return "none";
  }
}

/** The header chip: "Corporate Card (account default)", "Westside Invoice (this location)", "No billing profile". */
export function describeLocationBilling(billing: LocationBillingProjection | null | undefined): string {
  if (!billing || billing.source === "NONE" || !billing.label) return "No billing profile";
  return `${billing.label} (${describeBillingProfileSource(billing.source)})`;
}

/** "Card", "Invoice terms · Net 30" - the type with the terms when the type carries them. */
export function describeBillingProfileTerms(
  billing: { billingType: string | null; invoiceTerms: string | null } | null | undefined,
  describeTerms: (invoiceTerms: string | null | undefined) => string | null,
): string | null {
  if (!billing) return null;
  const type = describeBillingType(billing.billingType);
  const terms = billing.billingType === "invoice_terms" ? describeTerms(billing.invoiceTerms) : null;
  if (!type) return null;
  return terms ? `${type} · ${terms}` : type;
}
