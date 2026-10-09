// The Stripe adapter - Pass 40 (PLAN_ROADMAP_V2.md C6.1). The ONLY file that
// imports the stripe SDK (PLAN_BILLING_V1.md §0.4: no vendor SDK outside
// providers/). One instance per request, built from the org's decrypted
// credentials by integrations/payments/index.ts; a connected account id (Stripe
// Connect) becomes the Stripe-Account header, so the platform model later is a
// data change on the provider-account row, not a refactor here.
//
// C6.1 implements the capture half of the port: a Customer per PestFlow
// account, a SetupIntent (usage off_session, card only) whose client secret
// the browser's Payment Element consumes, the intent read back with its
// PaymentMethod expanded, and detach. charge / refund / handleWebhook are
// C6.2's and answer 501 until then. Every Stripe failure is re-thrown as a
// 502 PAYMENT_PROVIDER_REQUEST_FAILED carrying Stripe's own message - never a
// key.

import Stripe from "stripe";
import { PAYMENT_PROVIDER_ERROR_CODES } from "@shared/payment-methods";
import {
  PaymentProviderError,
  type PaymentCustomerRef,
  type PaymentMethodRef,
  type PaymentProvider,
  type PaymentProviderCredentials,
  type SetupIntentResult,
  type SetupIntentStatus,
} from "../types";

const SETUP_INTENT_STATUSES: ReadonlyArray<SetupIntentStatus> = ["requires_payment_method", "requires_confirmation", "requires_action", "processing", "canceled", "succeeded"];

function toSetupIntentStatus(status: string): SetupIntentStatus {
  return (SETUP_INTENT_STATUSES as readonly string[]).includes(status) ? (status as SetupIntentStatus) : "unknown";
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function toPaymentMethodRef(method: Stripe.PaymentMethod, livemode: boolean): PaymentMethodRef | null {
  if (method.type === "card" && method.card) {
    return {
      externalPaymentMethodId: method.id,
      externalCustomerId: idOf(method.customer),
      type: "card",
      brand: method.card.brand ?? null,
      last4: method.card.last4 ?? "",
      expMonth: method.card.exp_month ?? null,
      expYear: method.card.exp_year ?? null,
      livemode,
    };
  }
  if (method.type === "us_bank_account" && method.us_bank_account) {
    return {
      externalPaymentMethodId: method.id,
      externalCustomerId: idOf(method.customer),
      type: "ach",
      brand: method.us_bank_account.bank_name ?? null,
      last4: method.us_bank_account.last4 ?? "",
      expMonth: null,
      expYear: null,
      livemode,
    };
  }
  return null;
}

function toProviderError(error: unknown): PaymentProviderError {
  if (error instanceof PaymentProviderError) return error;
  const stripeError = error as { message?: string; code?: string; type?: string; statusCode?: number } | null;
  const message = stripeError?.message ?? "the request failed";
  return new PaymentProviderError(502, PAYMENT_PROVIDER_ERROR_CODES.REQUEST_FAILED, `Stripe: ${message}`, {
    providerCode: stripeError?.code ?? null,
    providerType: stripeError?.type ?? null,
    providerStatus: stripeError?.statusCode ?? null,
  });
}

function notImplemented(operation: string): PaymentProviderError {
  return new PaymentProviderError(501, PAYMENT_PROVIDER_ERROR_CODES.NOT_IMPLEMENTED, `${operation} through the provider is PLAN_ROADMAP_V2.md C6.2's work and is not built yet`);
}

export function createStripeProvider(credentials: PaymentProviderCredentials): PaymentProvider {
  const stripe = new Stripe(credentials.secretKey, credentials.connectedAccountId ? { stripeAccount: credentials.connectedAccountId } : {});

  return {
    name: "stripe",
    mode: credentials.mode,

    async createCustomer(input): Promise<PaymentCustomerRef> {
      try {
        const customer = await stripe.customers.create({
          name: input.name,
          ...(input.email ? { email: input.email } : {}),
          ...(input.description ? { description: input.description } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
        });
        return { externalCustomerId: customer.id };
      } catch (error) {
        throw toProviderError(error);
      }
    },

    async createSetupIntent(customer, input) {
      try {
        const intent = await stripe.setupIntents.create({
          customer: customer.externalCustomerId,
          usage: "off_session",
          payment_method_types: input.types.map((type) => (type === "ach" ? "us_bank_account" : "card")),
          ...(input.metadata ? { metadata: input.metadata } : {}),
        });
        if (!intent.client_secret) {
          throw new PaymentProviderError(502, PAYMENT_PROVIDER_ERROR_CODES.REQUEST_FAILED, "Stripe: the SetupIntent came back without a client secret");
        }
        return { setupIntentId: intent.id, clientSecret: intent.client_secret, livemode: intent.livemode };
      } catch (error) {
        throw toProviderError(error);
      }
    },

    async retrieveSetupIntent(setupIntentId): Promise<SetupIntentResult> {
      try {
        const intent = await stripe.setupIntents.retrieve(setupIntentId, { expand: ["payment_method"] });
        const method = intent.payment_method && typeof intent.payment_method !== "string" ? intent.payment_method : null;
        return {
          setupIntentId: intent.id,
          status: toSetupIntentStatus(intent.status),
          livemode: intent.livemode,
          externalCustomerId: idOf(intent.customer),
          paymentMethod: method ? toPaymentMethodRef(method, intent.livemode) : null,
        };
      } catch (error) {
        throw toProviderError(error);
      }
    },

    async detachPaymentMethod(externalPaymentMethodId) {
      try {
        await stripe.paymentMethods.detach(externalPaymentMethodId);
      } catch (error) {
        throw toProviderError(error);
      }
    },

    async charge() {
      throw notImplemented("Charging a card");
    },

    async refund() {
      throw notImplemented("Refunding");
    },

    async handleWebhook() {
      throw notImplemented("Handling a webhook");
    },
  };
}
