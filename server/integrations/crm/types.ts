// CrmProvider port. GoHighLevel is the first real implementation, added
// under integrations/crm/providers/ - nothing outside that providers/
// directory may import a vendor SDK. Normalized lead/contact shape only -
// no GHL-shaped fields belong in core tables. Once a lead becomes a
// Location, PestFlow is system of record and pushes status back to the CRM,
// not the other way around.

export interface NormalizedLead {
  externalLeadId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  source: string | null;
}

export interface CrmProvider {
  upsertContact(orgId: string, input: { externalContactId?: string; firstName: string; lastName: string; email: string | null; phone: string | null }): Promise<{ externalContactId: string }>;
  pushLifecycleStatus(orgId: string, externalContactId: string, status: string): Promise<void>;
  ingestLead(orgId: string, rawPayload: unknown): Promise<NormalizedLead>;
}
