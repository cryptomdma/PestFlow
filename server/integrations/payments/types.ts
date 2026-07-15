// PaymentProvider port. Stripe is the first real implementation, added under
// integrations/payments/providers/ - nothing outside that providers/
// directory may import a vendor SDK. Credentials are modeled per-org from
// day one (SaaS -> Stripe Connect, each tenant its own connected account),
// not a single global API key.

export interface PaymentCustomerRef {
  orgId: string;
  externalCustomerId: string;
}

export interface PaymentMethodRef {
  orgId: string;
  externalPaymentMethodId: string;
  label: string;
  lastFour: string | null;
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

export interface PaymentProvider {
  createCustomer(orgId: string, input: { name: string; email: string | null }): Promise<PaymentCustomerRef>;
  attachPaymentMethod(customer: PaymentCustomerRef, externalPaymentMethodId: string): Promise<PaymentMethodRef>;
  charge(customer: PaymentCustomerRef, input: { amountCents: number; paymentMethod: PaymentMethodRef }): Promise<ChargeResult>;
  refund(orgId: string, externalChargeId: string, amountCents: number): Promise<RefundResult>;
  handleWebhook(orgId: string, rawBody: unknown, signature: string): Promise<void>;
}
