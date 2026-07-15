// AccountingSync port. QuickBooks Online is the first real implementation,
// added under integrations/accounting/providers/ - nothing outside that
// providers/ directory may import a vendor SDK. One-way push to QBO only:
// PestFlow does not model a chart of accounts, journal entries, or AP.

export interface AccountingPushResult {
  externalId: string;
  syncedAt: Date;
}

export interface AccountingSync {
  pushCustomer(orgId: string, customerId: string): Promise<AccountingPushResult>;
  pushInvoice(orgId: string, invoiceId: string): Promise<AccountingPushResult>;
  pushPayment(orgId: string, paymentId: string): Promise<AccountingPushResult>;
  pushCreditMemo(orgId: string, creditMemoId: string): Promise<AccountingPushResult>;
}
