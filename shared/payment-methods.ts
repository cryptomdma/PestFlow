// PLAN_ROADMAP_V2.md C6.1 (Pass 40): the card on file and the payment
// provider account - the vocabulary both sides share. PLAN_BILLING_V1.md
// §0.4 (the provider port, org-level credentials) and §1.2 (`payment_methods`
// - the tokenized instrument), B18 ("the last four digits must be visible").
//
// PCI (V1 §1.2, a hard rule): PestFlow never sees, transmits or stores a card
// number, CVV or full bank credentials. The client mounts the provider's own
// card form (Stripe's Payment Element, loaded from js.stripe.com), the
// provider returns a token, and the row here carries DISPLAY fields only -
// brand, last four, expiry, the test flag. The provider ids
// (`providerCustomerId`, `providerPaymentMethodId`) stay in storage: no API
// read, no projection and no audit snapshot carries them, which is why the
// summaries below are typed separately from the row.
//
// Naming: shared/payments.ts already exports `PaymentMethod` for the ledger's
// CASH | CHECK | OTHER | CARD | ACH instrument enum, so the row here is a
// "stored payment method" everywhere (StoredPaymentMethod in schema.ts).

/** The providers a provider-account row may name. `stripe` is the one real adapter; `fake` is the smoke test's in-process double, refused by the route unless PAYMENT_PROVIDER_FAKE_ALLOWED=1 (never in production). */
export const PAYMENT_PROVIDERS = ["stripe"] as const;
export const FAKE_PAYMENT_PROVIDER = "fake";
export type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[number] | typeof FAKE_PAYMENT_PROVIDER;

/** The org's explicit mode. A test-mode account holds test keys and stores test cards; the dev DB is test only. */
export const PAYMENT_PROVIDER_MODES = ["test", "live"] as const;
export type PaymentProviderMode = (typeof PAYMENT_PROVIDER_MODES)[number];

/** payment_provider_accounts.status: `inactive` once disconnected (the secrets are cleared, the row kept for its history). */
export const PAYMENT_PROVIDER_ACCOUNT_STATUSES = ["active", "inactive"] as const;
export type PaymentProviderAccountStatus = (typeof PAYMENT_PROVIDER_ACCOUNT_STATUSES)[number];

/** payment_methods.type. C6.1 captures `card` only; `ach` is named so the column vocabulary is complete (a bank account needs a mandate and verification - a later pass). */
export const STORED_PAYMENT_METHOD_TYPES = ["card", "ach"] as const;
export type StoredPaymentMethodType = (typeof STORED_PAYMENT_METHOD_TYPES)[number];

/** payment_methods.status. A card is `removed` (detached at the provider, the row kept), never deleted. */
export const STORED_PAYMENT_METHOD_STATUSES = ["active", "removed"] as const;
export type StoredPaymentMethodStatus = (typeof STORED_PAYMENT_METHOD_STATUSES)[number];

/** The provider-account refusals (server/integrations/payments/types.ts PaymentProviderError). */
export const PAYMENT_PROVIDER_ERROR_CODES = {
  /** 409: no active provider account with a secret key - Settings -> Payments. */
  NOT_CONFIGURED: "PAYMENT_PROVIDER_NOT_CONFIGURED",
  /** 400: a provider name the server has no adapter for (or `fake` outside a dev boot that allows it). */
  UNSUPPORTED: "PAYMENT_PROVIDER_UNSUPPORTED",
  /** 400: a key that is not the shape the provider issues (Stripe: sk_ / rk_ for the secret, pk_ for the publishable). */
  KEY_INVALID: "PAYMENT_PROVIDER_KEY_INVALID",
  /** 400: a live key saved under test mode or the reverse, or the two keys disagreeing. */
  MODE_MISMATCH: "PAYMENT_PROVIDER_MODE_MISMATCH",
  /** 400: a first save, a save after a disconnect, or a mode change without that mode's secret key. */
  SECRET_REQUIRED: "PAYMENT_PROVIDER_SECRET_REQUIRED",
  /** 503: the server has no PAYMENT_CREDENTIALS_KEY (or a malformed one), so nothing can be encrypted at rest. */
  ENCRYPTION_KEY_MISSING: "PAYMENT_CREDENTIALS_KEY_MISSING",
  /** 502: the provider refused or failed the request; the message carries the provider's own text, never a key. */
  REQUEST_FAILED: "PAYMENT_PROVIDER_REQUEST_FAILED",
  /** 501: a port operation a later pass fills (charge, refund, webhooks - C6.2). */
  NOT_IMPLEMENTED: "PAYMENT_PROVIDER_NOT_IMPLEMENTED",
} as const;
export type PaymentProviderErrorCode = (typeof PAYMENT_PROVIDER_ERROR_CODES)[keyof typeof PAYMENT_PROVIDER_ERROR_CODES];

/** The card-on-file refusals (server/storage.ts PaymentMethodError). */
export const PAYMENT_METHOD_ERROR_CODES = {
  /** 404: the account is not the org's. */
  ACCOUNT_NOT_FOUND: "PAYMENT_METHOD_ACCOUNT_NOT_FOUND",
  /** 404: the card row is not the org's. */
  NOT_FOUND: "PAYMENT_METHOD_NOT_FOUND",
  /** 400: the SetupIntent has not succeeded (the client never confirmed it, the bank refused, it was cancelled) - `details.status` says which. */
  SETUP_INCOMPLETE: "PAYMENT_METHOD_SETUP_INCOMPLETE",
  /** 400: the SetupIntent belongs to another account's provider customer, or the account has no provider customer yet. */
  INTENT_MISMATCH: "PAYMENT_METHOD_INTENT_MISMATCH",
  /** 400: the instrument the intent captured is not a card (ACH is a later pass). */
  TYPE_UNSUPPORTED: "PAYMENT_METHOD_TYPE_UNSUPPORTED",
  /** 400: the `locationId` given is not one of the account's locations. */
  LOCATION_MISMATCH: "PAYMENT_METHOD_LOCATION_MISMATCH",
  /** 409: a removed card cannot be made the default. */
  REMOVED: "PAYMENT_METHOD_REMOVED",
} as const;
export type PaymentMethodErrorCode = (typeof PAYMENT_METHOD_ERROR_CODES)[keyof typeof PAYMENT_METHOD_ERROR_CODES];

export function isPaymentProviderMode(value: unknown): value is PaymentProviderMode {
  return typeof value === "string" && (PAYMENT_PROVIDER_MODES as readonly string[]).includes(value);
}

export function isStoredPaymentMethodType(value: unknown): value is StoredPaymentMethodType {
  return typeof value === "string" && (STORED_PAYMENT_METHOD_TYPES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// The provider account as the Settings card reads it - never the secret.

export interface PaymentProviderAccountSummary {
  /** An active row with a secret key: cards can be captured. */
  configured: boolean;
  provider: string | null;
  mode: PaymentProviderMode | null;
  /** Public by design (it is embedded in every checkout page); the card form needs it. */
  publishableKey: string | null;
  /** Stripe Connect: the connected account the requests act as; null = the org's own account. */
  connectedAccountId: string | null;
  hasWebhookSecret: boolean;
  status: PaymentProviderAccountStatus | null;
  /** The server has a usable PAYMENT_CREDENTIALS_KEY; false means no key can be saved. */
  encryptionReady: boolean;
  updatedAt: string | Date | null;
}

/** The PUT /api/payment-provider body. `secretKey` is write-only: absent keeps the stored one (a rotation sends a new one); `webhookSecret` null clears it. */
export interface PaymentProviderAccountInput {
  provider: string;
  mode: PaymentProviderMode;
  publishableKey?: string | null;
  secretKey?: string;
  webhookSecret?: string | null;
  connectedAccountId?: string | null;
}

/** "Stripe" / "Fake provider (test double)" / the name itself. */
export function describePaymentProvider(provider: string | null | undefined): string {
  switch (provider) {
    case "stripe":
      return "Stripe";
    case FAKE_PAYMENT_PROVIDER:
      return "Fake provider (test double)";
    default:
      return provider ?? "No provider";
  }
}

/** "Test mode" / "Live". */
export function describePaymentProviderMode(mode: string | null | undefined): string {
  return mode === "live" ? "Live" : "Test mode";
}

/** The mode a Stripe secret (sk_) or restricted (rk_) key was issued for; null for anything else. */
export function stripeSecretKeyMode(key: string): PaymentProviderMode | null {
  const match = /^(?:sk|rk)_(test|live)_[A-Za-z0-9]+$/.exec(key.trim());
  return match ? (match[1] as PaymentProviderMode) : null;
}

/** The mode a Stripe publishable (pk_) key was issued for; null for anything else. */
export function stripePublishableKeyMode(key: string): PaymentProviderMode | null {
  const match = /^pk_(test|live)_[A-Za-z0-9]+$/.exec(key.trim());
  return match ? (match[1] as PaymentProviderMode) : null;
}

// ---------------------------------------------------------------------------
// The card on file as every read answers it - display fields, no provider id.

/** What a projection carries about a card: brand, last four, expiry, the test flag. */
export interface PaymentMethodDisplay {
  id: string;
  type: StoredPaymentMethodType;
  brand: string | null;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
  status: StoredPaymentMethodStatus;
  livemode: boolean;
}

/** One row of GET /api/accounts/:accountId/payment-methods. */
export interface StoredPaymentMethodSummary extends PaymentMethodDisplay {
  accountId: string;
  locationId: string | null;
  addedByLabel: string | null;
  createdAt: string | Date;
  removedAt: string | Date | null;
}

/** What POST /api/accounts/:accountId/setup-intents answers: the client mounts the provider's card form with it. */
export interface SetupIntentSession {
  setupIntentId: string;
  clientSecret: string;
  provider: string;
  mode: PaymentProviderMode;
  publishableKey: string | null;
  livemode: boolean;
}

/** The POST /api/accounts/:accountId/payment-methods body - the confirmed SetupIntent and what to do with the card. */
export interface ConfirmPaymentMethodInput {
  setupIntentId: string;
  /** Make this the account's default card (the first active card is the default regardless). */
  makeDefault?: boolean;
  /** Point this billing profile's `defaultPaymentMethodId` at the new card. */
  billingProfileId?: string | null;
  /** A location of the account the card is noted against (display only; the card belongs to the account). */
  locationId?: string | null;
}

const CARD_BRAND_LABELS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  diners: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
  eftpos_au: "eftpos",
};

/** "Visa", "Mastercard", "American Express"; "Card" when the brand is unknown; a bank's name for an ACH row. */
export function describeCardBrand(brand: string | null | undefined, type: StoredPaymentMethodType = "card"): string {
  if (!brand) return type === "ach" ? "Bank account" : "Card";
  return CARD_BRAND_LABELS[brand.toLowerCase()] ?? brand.charAt(0).toUpperCase() + brand.slice(1);
}

/** "04/28"; null when either part is missing. */
export function formatCardExpiry(expMonth: number | null | undefined, expYear: number | null | undefined): string | null {
  if (!expMonth || !expYear) return null;
  return `${String(expMonth).padStart(2, "0")}/${String(expYear % 100).padStart(2, "0")}`;
}

/** A card is expired from the first day after its expiry month (a card good through 04/28 works on 2028-04-30). */
export function isPaymentMethodExpired(method: { expMonth: number | null; expYear: number | null }, now: Date = new Date()): boolean {
  if (!method.expMonth || !method.expYear) return false;
  const firstDayAfter = new Date(method.expYear, method.expMonth, 1);
  return now.getTime() >= firstDayAfter.getTime();
}

/** "Visa •••• 4242 · exp 04/28" - the chip, the dialog rows, the ticket header one day. */
export function describeStoredPaymentMethod(method: PaymentMethodDisplay | null | undefined): string {
  if (!method) return "No card on file";
  const expiry = formatCardExpiry(method.expMonth, method.expYear);
  return `${describeCardBrand(method.brand, method.type)} •••• ${method.last4}${expiry ? ` · exp ${expiry}` : ""}`;
}

/** The account's default card: the active row flagged default, else the first active row (the oldest), else null. */
export function pickDefaultPaymentMethod<T extends PaymentMethodDisplay>(methods: ReadonlyArray<T> | null | undefined): T | null {
  const active = (methods ?? []).filter((method) => method.status === "active");
  return active.find((method) => method.isDefault) ?? active[0] ?? null;
}

/**
 * The card a billing profile charges (C6.2) and shows (this pass): its own
 * pointer when that card is still active, else the account's default card,
 * else none. Cards belong to the ACCOUNT; a profile only picks one.
 */
export function resolveProfilePaymentMethod<T extends PaymentMethodDisplay>(
  profile: { defaultPaymentMethodId: string | null } | null | undefined,
  methods: ReadonlyArray<T> | null | undefined,
): T | null {
  if (!profile) return null;
  if (profile.defaultPaymentMethodId) {
    const chosen = (methods ?? []).find((method) => method.id === profile.defaultPaymentMethodId && method.status === "active");
    if (chosen) return chosen;
  }
  return pickDefaultPaymentMethod(methods);
}
