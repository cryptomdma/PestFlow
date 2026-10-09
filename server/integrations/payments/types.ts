// PaymentProvider port - PLAN_BILLING_V1.md §0.4, reshaped by Pass 40
// (PLAN_ROADMAP_V2.md C6.1) for SetupIntent capture. Stripe is the first real
// implementation, under integrations/payments/providers/stripe.ts; nothing
// outside that providers/ directory may import a vendor SDK, and the domain
// layer (server/storage.ts) imports only this file and the factory
// (integrations/payments/index.ts). Credentials are modeled per-org from day
// one: an adapter is built from the org's payment_provider_accounts row
// (provider, mode, the decrypted keys, a nullable connected account for
// Stripe Connect), never from a process-wide key.
//
// Card data never crosses this port: the client mounts the provider's own
// form against a SetupIntent's client secret, and what comes back through
// `retrieveSetupIntent` is a token plus display fields (PaymentMethodRef).

import type { PaymentProviderErrorCode, PaymentProviderMode, PaymentProviderName, StoredPaymentMethodType } from "@shared/payment-methods";

export type { PaymentProviderMode, PaymentProviderName };

/** The decrypted row the factory builds an adapter from. */
export interface PaymentProviderCredentials {
  provider: PaymentProviderName;
  mode: PaymentProviderMode;
  secretKey: string;
  publishableKey: string | null;
  webhookSecret: string | null;
  /** Stripe Connect: act as this connected account (the Stripe-Account header); null = the org's own account. */
  connectedAccountId: string | null;
}

export interface PaymentCustomerRef {
  externalCustomerId: string;
}

/** The instrument a succeeded SetupIntent attached: the token and the display fields the payment_methods row stores. */
export interface PaymentMethodRef {
  externalPaymentMethodId: string;
  externalCustomerId: string | null;
  type: StoredPaymentMethodType;
  brand: string | null;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
  livemode: boolean;
}

export interface SetupIntentRef {
  setupIntentId: string;
  /** Handed to the client's card form; it is single-use and tied to this intent. */
  clientSecret: string;
  livemode: boolean;
}

/** Stripe's SetupIntent statuses plus `unknown` for anything a newer API adds. */
export type SetupIntentStatus = "requires_payment_method" | "requires_confirmation" | "requires_action" | "processing" | "canceled" | "succeeded" | "unknown";

export interface SetupIntentResult {
  setupIntentId: string;
  status: SetupIntentStatus;
  livemode: boolean;
  /** The provider customer the intent was created for - checked against the account's mapping before a card is stored. */
  externalCustomerId: string | null;
  /** Set once the intent succeeded. */
  paymentMethod: PaymentMethodRef | null;
}

export interface ChargeResult {
  externalChargeId: string;
  amountCents: number;
  status: "succeeded" | "pending" | "failed";
}

export interface RefundResult {
  externalRefundId: string;
  amountCents: number;
  status: "succeeded" | "pending" | "failed";
}

export interface WebhookEvent {
  eventId: string;
  eventType: string;
  livemode: boolean;
  data: unknown;
}

/** A provider-side refusal or a configuration gap, answered by the route as { code, message } under `status`. The message never carries a key. */
export class PaymentProviderError extends Error {
  constructor(
    readonly status: 400 | 409 | 501 | 502 | 503,
    readonly code: PaymentProviderErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  readonly mode: PaymentProviderMode;
  /** One provider customer per PestFlow account (storage keeps the mapping in payment_provider_customers). */
  createCustomer(input: { name: string; email: string | null; description?: string | null; metadata?: Record<string, string> }): Promise<PaymentCustomerRef>;
  /** A SetupIntent for off-session use (a saved card the office charges later - C6.2). C6.1 asks for `card` only. */
  createSetupIntent(customer: PaymentCustomerRef, input: { types: ReadonlyArray<StoredPaymentMethodType>; metadata?: Record<string, string> }): Promise<SetupIntentRef>;
  /** The intent as the provider holds it now, with the attached instrument expanded when it succeeded. */
  retrieveSetupIntent(setupIntentId: string): Promise<SetupIntentResult>;
  /** Detach a stored instrument from its customer - the provider side of "Remove"; the row stays, status `removed`. */
  detachPaymentMethod(externalPaymentMethodId: string): Promise<void>;
  // C6.2 (PLAN_ROADMAP_V2.md): charge from the invoice, refunds through the
  // provider, webhooks. Declared so the seam is whole; the Stripe adapter
  // answers 501 PAYMENT_PROVIDER_NOT_IMPLEMENTED until that pass fills them.
  charge(customer: PaymentCustomerRef, input: { amountCents: number; externalPaymentMethodId: string; description?: string | null; metadata?: Record<string, string> }): Promise<ChargeResult>;
  refund(externalChargeId: string, amountCents: number): Promise<RefundResult>;
  handleWebhook(rawBody: Buffer, signature: string): Promise<WebhookEvent>;
}
