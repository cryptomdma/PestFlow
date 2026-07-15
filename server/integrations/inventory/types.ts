// InventoryProvider port. First real implementation (working name:
// pcoInventory) is added under integrations/inventory/providers/ - nothing
// outside that providers/ directory may import a vendor SDK. Material
// Products cache the provider's catalog locally with an externalProductId;
// a tech must always be able to post a ticket when inventory is
// unreachable, so consumption is emitted async (via the outbox) on
// finalization, never synchronously in the posting path.

export interface ExternalProduct {
  externalProductId: string;
  name: string;
  epaRegNumber: string | null;
}

export interface InventoryProvider {
  listProducts(orgId: string): Promise<ExternalProduct[]>;
  emitConsumption(orgId: string, input: { externalProductId: string; amountApplied: string; unit: string; serviceRecordId: string }): Promise<void>;
}
