// The smoke test's provider - Pass 40 (PLAN_ROADMAP_V2.md C6.1). An
// in-process double of the port with NO network: the verification boot on
// PORT=5001 cannot reach Stripe (no key is ever committed), so the smoke test
// connects this provider and exercises every server path behind the port -
// the customer mapping, the SetupIntent session, the confirm with its
// refusals, make-default, remove, the audit rows - exactly as the Stripe
// adapter would drive them. The route accepts `provider: "fake"` only when
// the server was started with PAYMENT_PROVIDER_FAKE_ALLOWED=1 and NODE_ENV is
// not production (integrations/payments/index.ts); the client offers Stripe
// alone and the Add card dialog says it has no form for this provider.
//
// Behaviour: `createCustomer` mints cus_fake_<n>; `createSetupIntent` mints
// seti_fake_<n> for that customer, succeeded at once with a Visa / Mastercard
// whose last four and expiry derive from n; `retrieveSetupIntent` answers
// the minted intent, or for an id that starts with seti_fake_pending /
// seti_fake_canceled a status of that name (the non-succeeded refusal), and
// throws the Stripe-shaped 502 for an unknown id; `detachPaymentMethod`
// throws for an unknown or already-detached method, as Stripe does. State is
// per process; a restart forgets it, which is what a test double should do.

import { PAYMENT_PROVIDER_ERROR_CODES } from "@shared/payment-methods";
import { PaymentProviderError, type PaymentMethodRef, type PaymentProvider, type PaymentProviderCredentials, type SetupIntentResult } from "../types";

interface FakeIntent {
  customerId: string;
  method: PaymentMethodRef;
}

let counter = 0;
const intents = new Map<string, FakeIntent>();
const attachedMethods = new Set<string>();

function requestFailed(message: string): PaymentProviderError {
  return new PaymentProviderError(502, PAYMENT_PROVIDER_ERROR_CODES.REQUEST_FAILED, `Fake provider: ${message}`, { providerCode: "resource_missing" });
}

export function createFakePaymentProvider(credentials: PaymentProviderCredentials): PaymentProvider {
  const livemode = credentials.mode === "live";
  return {
    name: "fake",
    mode: credentials.mode,

    async createCustomer() {
      counter += 1;
      return { externalCustomerId: `cus_fake_${counter}` };
    },

    async createSetupIntent(customer, input) {
      counter += 1;
      const n = counter;
      const type = input.types[0] ?? "card";
      const method: PaymentMethodRef = {
        externalPaymentMethodId: `pm_fake_${n}`,
        externalCustomerId: customer.externalCustomerId,
        type,
        brand: type === "card" ? (n % 2 ? "visa" : "mastercard") : "Fake Bank",
        last4: String(4000 + (n % 1000)).padStart(4, "0"),
        expMonth: type === "card" ? (n % 12) + 1 : null,
        expYear: type === "card" ? 2030 + (n % 5) : null,
        livemode,
      };
      const id = `seti_fake_${n}`;
      intents.set(id, { customerId: customer.externalCustomerId, method });
      attachedMethods.add(method.externalPaymentMethodId);
      return { setupIntentId: id, clientSecret: `${id}_secret_fake`, livemode };
    },

    async retrieveSetupIntent(setupIntentId): Promise<SetupIntentResult> {
      // The non-succeeded doubles name their customer after the prefix
      // (seti_fake_pending_cus_fake_3), as a real pending intent still
      // belongs to its customer - the ownership check runs before the
      // status check and must pass for the status refusal to be reached.
      if (setupIntentId.startsWith("seti_fake_pending_")) {
        return { setupIntentId, status: "requires_payment_method", livemode, externalCustomerId: setupIntentId.slice("seti_fake_pending_".length) || null, paymentMethod: null };
      }
      if (setupIntentId.startsWith("seti_fake_canceled_")) {
        return { setupIntentId, status: "canceled", livemode, externalCustomerId: setupIntentId.slice("seti_fake_canceled_".length) || null, paymentMethod: null };
      }
      const intent = intents.get(setupIntentId);
      if (!intent) {
        throw requestFailed(`No such setupintent: '${setupIntentId}'`);
      }
      return { setupIntentId, status: "succeeded", livemode, externalCustomerId: intent.customerId, paymentMethod: intent.method };
    },

    async detachPaymentMethod(externalPaymentMethodId) {
      if (!attachedMethods.has(externalPaymentMethodId)) {
        throw requestFailed(`The payment method '${externalPaymentMethodId}' is not attached to a customer`);
      }
      attachedMethods.delete(externalPaymentMethodId);
    },

    async charge() {
      throw new PaymentProviderError(501, PAYMENT_PROVIDER_ERROR_CODES.NOT_IMPLEMENTED, "Charging is PLAN_ROADMAP_V2.md C6.2's work");
    },

    async refund() {
      throw new PaymentProviderError(501, PAYMENT_PROVIDER_ERROR_CODES.NOT_IMPLEMENTED, "Refunding is PLAN_ROADMAP_V2.md C6.2's work");
    },

    async handleWebhook() {
      throw new PaymentProviderError(501, PAYMENT_PROVIDER_ERROR_CODES.NOT_IMPLEMENTED, "Webhooks are PLAN_ROADMAP_V2.md C6.2's work");
    },
  };
}
