// The factory the domain layer calls - Pass 40 (PLAN_ROADMAP_V2.md C6.1).
// server/storage.ts hands it the org's decrypted provider-account row and gets
// the adapter back; this file is the one place that knows which provider
// names have an implementation (PLAN_BILLING_V1.md §0.4: the domain imports
// types.ts, never a vendor SDK). `stripe` is real; `fake` is the smoke
// test's double, allowed only on a dev boot that says so.

import { FAKE_PAYMENT_PROVIDER, PAYMENT_PROVIDER_ERROR_CODES } from "@shared/payment-methods";
import { createFakePaymentProvider } from "./providers/fake";
import { createStripeProvider } from "./providers/stripe";
import { PaymentProviderError, type PaymentProvider, type PaymentProviderCredentials } from "./types";

export const PAYMENT_PROVIDER_FAKE_ALLOWED_ENV = "PAYMENT_PROVIDER_FAKE_ALLOWED";

/** The `fake` provider may be connected: a non-production boot started with PAYMENT_PROVIDER_FAKE_ALLOWED=1. */
export function fakePaymentProviderAllowed(): boolean {
  return process.env.NODE_ENV !== "production" && process.env[PAYMENT_PROVIDER_FAKE_ALLOWED_ENV] === "1";
}

/** True for a provider name this server can build an adapter for right now. */
export function isSupportedPaymentProvider(provider: string): boolean {
  if (provider === "stripe") return true;
  if (provider === FAKE_PAYMENT_PROVIDER) return fakePaymentProviderAllowed();
  return false;
}

export function createPaymentProvider(credentials: PaymentProviderCredentials): PaymentProvider {
  switch (credentials.provider) {
    case "stripe":
      return createStripeProvider(credentials);
    case FAKE_PAYMENT_PROVIDER:
      if (!fakePaymentProviderAllowed()) {
        throw new PaymentProviderError(400, PAYMENT_PROVIDER_ERROR_CODES.UNSUPPORTED, "The fake payment provider is only available on a dev boot started with PAYMENT_PROVIDER_FAKE_ALLOWED=1");
      }
      return createFakePaymentProvider(credentials);
    default:
      throw new PaymentProviderError(400, PAYMENT_PROVIDER_ERROR_CODES.UNSUPPORTED, `No payment provider adapter exists for "${credentials.provider}"`);
  }
}
