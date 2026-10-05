import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, getApiErrorMessage, queryClient } from "@/lib/queryClient";
import { dollarsToCents, centsToDollars, centsToDollarString, formatCents } from "@shared/money";
import { describeBillingPlanBehavior } from "@shared/billing-plan";
import { describeInitialCharge, initialChargeFromTemplate, initialChargeToTemplate } from "@shared/initial-charge";
import { InitialChargeFormFields, initialChargeFieldsFrom, initialChargeFormStateFrom, validateInitialChargeFormState } from "@/components/initial-charge-fields";
import { can, PERMISSIONS } from "@shared/permissions";
import { describeUserRole, selectableUsers, userDisplayName } from "@shared/users";
import { OPPORTUNITY_SOURCES, OPPORTUNITY_WORK_TYPES, describeOpportunitySource, describeOpportunityWorkType } from "@shared/opportunities";
import { describeZipCodes, normalizeZipCodes, splitZipCodeText } from "@shared/zones";
import { ANY_MATCHER_LABEL, describeRuleMatchers, describeRuleProblems, sortAssignmentRules } from "@shared/opportunity-assignment";
import { INVOICE_ON_FINALIZE_MODES, describeInvoiceOnFinalizeMode, normalizeInvoiceOnFinalizeMode, type InvoiceOnFinalizeMode } from "@shared/invoice-on-finalize";
import {
  DEFAULT_DISPATCH_BOARD_SETTINGS,
  DISPATCH_SNAP_INTERVALS,
  DISPATCH_VIEW_INTERVALS,
  boardEndHourOptions,
  boardStartHourOptions,
  describeSnapInterval,
  describeViewInterval,
  formatHourOfDay,
  visibleEndHourFor,
  type DispatchBoardSettings,
  type DispatchSnapInterval,
  type DispatchViewInterval,
} from "@shared/dispatch-board";
import { isOnList, matchListEntry } from "@shared/material-lists";
import { ListMultiSelect } from "@/components/list-multi-select";
import { Switch } from "@/components/ui/switch";
import { ServiceWorkKindBadge } from "@/components/service-work-kind-badge";
import { SERVICE_WORK_KINDS, describeServiceWorkKind, formatServiceWorkKind, normalizeServiceWorkKind, type ServiceWorkKind } from "@shared/service-kind";
import { Plus, Settings as SettingsIcon, Wrench, FileText, Users, ShieldCheck, FlaskConical, Bug, CreditCard, CalendarClock, Percent, Scale, Building2, Receipt, MapPin, UserCheck, ArrowUp, ArrowDown, AlertTriangle, LayoutGrid } from "lucide-react";
import type { AgreementCancellationPolicy, AgreementTemplate, BillingPlan, BillingProfileTemplate, MaterialProduct, OpportunityAssignmentRule, OpportunityCategory, OpportunityDisposition, Organization, ServiceType, TargetPest, TaxRate, TaxRule, Technician, UserSummary, Zone } from "@shared/schema";

function formatTemplateRecurrence(template: AgreementTemplate) {
  const interval = template.defaultRecurrenceInterval || 1;
  const unitMap: Record<string, string> = {
    MONTH: "Month",
    QUARTER: "Quarter",
    YEAR: "Year",
    CUSTOM: "Day",
  };
  if (template.defaultRecurrenceUnit === "QUARTER" && interval === 1) {
    return "Quarterly";
  }
  const unitLabel = unitMap[template.defaultRecurrenceUnit] || template.defaultRecurrenceUnit;
  return `Every ${interval} ${interval === 1 ? unitLabel : `${unitLabel}s`}`;
}

function formatTemplateTerm(template: AgreementTemplate) {
  const interval = template.defaultTermInterval || 1;
  const unitMap: Record<string, string> = {
    MONTH: "month",
    QUARTER: "quarter",
    YEAR: "year",
    CUSTOM: "day",
  };
  const unitLabel = unitMap[template.defaultTermUnit] || template.defaultTermUnit.toLowerCase();
  return `Renews every ${interval} ${interval === 1 ? unitLabel : `${unitLabel}s`}`;
}

function formatCancellationFee(policy: AgreementCancellationPolicy) {
  if (policy.cancellationFeeType === "NONE") return "No fee";
  if (policy.cancellationFeeType === "FLAT") return `${formatCents(policy.cancellationFeeAmountCents)} flat`;
  if (policy.cancellationFeeType === "PERCENT_CONTRACT") return `${centsToDollars(policy.cancellationFeeAmountCents).toFixed(2)}% of contract`;
  if (policy.cancellationFeeType === "PERCENT_REMAINING") return `${centsToDollars(policy.cancellationFeeAmountCents).toFixed(2)}% of remaining balance`;
  return "Manual fee review";
}

function OrganizationBrandingCard() {
  const { toast } = useToast();
  const { data: org } = useQuery<Organization>({ queryKey: ["/api/organization"] });
  const [form, setForm] = useState({
    logoUrl: "",
    primaryColorHex: "",
    remitToName: "",
    remitToAddress: "",
    remitToEmail: "",
    remitToPhone: "",
  });

  useEffect(() => {
    if (org) {
      setForm({
        logoUrl: org.logoUrl ?? "",
        primaryColorHex: org.primaryColorHex ?? "",
        remitToName: org.remitToName ?? "",
        remitToAddress: org.remitToAddress ?? "",
        remitToEmail: org.remitToEmail ?? "",
        remitToPhone: org.remitToPhone ?? "",
      });
    }
  }, [org]);

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        logoUrl: data.logoUrl.trim() || null,
        primaryColorHex: data.primaryColorHex.trim() || null,
        remitToName: data.remitToName.trim() || null,
        remitToAddress: data.remitToAddress.trim() || null,
        remitToEmail: data.remitToEmail.trim() || null,
        remitToPhone: data.remitToPhone.trim() || null,
      };
      const response = await apiRequest("PATCH", "/api/organization/branding", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organization"] });
      toast({ title: "Branding updated" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2"><Building2 className="h-4 w-4" /> Organization Branding</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
          <p className="text-xs text-muted-foreground">Used on generated invoice PDFs and statements.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Logo URL</Label><Input value={form.logoUrl} onChange={(e) => setForm((p) => ({ ...p, logoUrl: e.target.value }))} placeholder="https://..." /></div>
            <div className="space-y-1.5"><Label>Primary Color</Label><Input type="text" value={form.primaryColorHex} onChange={(e) => setForm((p) => ({ ...p, primaryColorHex: e.target.value }))} placeholder="#2563eb" /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Remit To Name</Label><Input value={form.remitToName} onChange={(e) => setForm((p) => ({ ...p, remitToName: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Remit To Email</Label><Input type="email" value={form.remitToEmail} onChange={(e) => setForm((p) => ({ ...p, remitToEmail: e.target.value }))} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Remit To Address</Label><Textarea value={form.remitToAddress} onChange={(e) => setForm((p) => ({ ...p, remitToAddress: e.target.value }))} className="resize-none" /></div>
            <div className="space-y-1.5"><Label>Remit To Phone</Label><Input value={form.remitToPhone} onChange={(e) => setForm((p) => ({ ...p, remitToPhone: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end"><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving..." : "Save Branding"}</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

function ServiceTypeForm({ serviceType, onClose }: { serviceType?: ServiceType | null; onClose: () => void }) {
  const { toast } = useToast();
  const isEditMode = !!serviceType;
  const [form, setForm] = useState({
    name: serviceType?.name ?? "",
    description: serviceType?.description ?? "",
    defaultPrice: serviceType?.defaultPriceCents != null ? centsToDollarString(serviceType.defaultPriceCents) : "",
    estimatedDuration: serviceType?.estimatedDuration ? String(serviceType.estimatedDuration) : "",
    category: serviceType?.category ?? "",
    // Pass 24 (C3.7): the type's default work kind (shared/service-kind.ts).
    workKind: normalizeServiceWorkKind(serviceType?.workKind) as ServiceWorkKind,
    opportunityLeadDays: serviceType?.opportunityLeadDays ? String(serviceType.opportunityLeadDays) : "",
    opportunityLabel: serviceType?.opportunityLabel ?? "",
  });

  const mutation = useMutation({
    mutationFn: (data: typeof form) => {
      const { defaultPrice, ...rest } = data;
      const payload = {
        ...rest,
        defaultPriceCents: dollarsToCents(defaultPrice),
        estimatedDuration: data.estimatedDuration ? parseInt(data.estimatedDuration) : null,
        category: data.category || null,
        description: data.description || null,
        opportunityLeadDays: data.opportunityLeadDays ? parseInt(data.opportunityLeadDays) : null,
        opportunityLabel: data.opportunityLabel || null,
      };
      return isEditMode
        ? apiRequest("PATCH", `/api/service-types/${serviceType.id}`, payload)
        : apiRequest("POST", "/api/service-types", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-types"] });
      toast({ title: isEditMode ? "Service type updated" : "Service type created" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
      <div className="space-y-1.5"><Label>Name *</Label><Input data-testid="input-st-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
      <div className="space-y-1.5"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Default Price ($)</Label><Input type="number" step="0.01" value={form.defaultPrice} onChange={(e) => setForm((p) => ({ ...p, defaultPrice: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Duration (min)</Label><Input type="number" value={form.estimatedDuration} onChange={(e) => setForm((p) => ({ ...p, estimatedDuration: e.target.value }))} /></div>
      </div>
      <div className="space-y-1.5"><Label>Category</Label><Input placeholder="e.g., General, Termite, Wildlife" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} /></div>
      {/* Pass 24 (C3.7): the work kind every service created from this type starts with. Category above stays the
          free-text display grouping; this decides what the visit credits and bills (a Callback is $0 unless priced). */}
      <div className="space-y-1.5">
        <Label>Work Kind</Label>
        <Select value={form.workKind} onValueChange={(value) => setForm((p) => ({ ...p, workKind: normalizeServiceWorkKind(value) }))}>
          <SelectTrigger data-testid="select-st-work-kind"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SERVICE_WORK_KINDS.map((kind) => <SelectItem key={kind} value={kind}>{formatServiceWorkKind(kind)}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground" data-testid="text-st-work-kind-help">{describeServiceWorkKind(form.workKind)} Each service starts with this kind and may be re-designated per service.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Opportunity Lead Days</Label><Input type="number" min="0" value={form.opportunityLeadDays} onChange={(e) => setForm((p) => ({ ...p, opportunityLeadDays: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Opportunity Label</Label><Input placeholder="e.g., Annual Renewal" value={form.opportunityLabel} onChange={(e) => setForm((p) => ({ ...p, opportunityLabel: e.target.value }))} /></div>
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={mutation.isPending || !form.name} data-testid="button-save-service-type">{mutation.isPending ? "Saving..." : isEditMode ? "Save Type" : "Create"}</Button></div>
    </form>
  );
}

function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseDilutions(value: string) {
  return value
    .split("\n")
    .map((line) => {
      const [label, ratio, activeIngredientConcentration] = line.split("|").map((part) => part?.trim());
      return label ? { label, ratio: ratio || "", activeIngredientConcentration: activeIngredientConcentration || null } : null;
    })
    .filter(Boolean);
}

function stringifyDilutions(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .map((option: any) => [option.label, option.ratio, option.activeIngredientConcentration].filter((part) => part !== undefined && part !== null && part !== "").join(" | "))
    .join("\n");
}

// Pass 20 (C3.4a): Default Unit picks from the org's unit list and Allowed
// Areas from the org's area list (the Settings cards above the product card);
// Default Area picks from the product's allowed areas (the org's list when it
// has none). A value already on the product that a list does not name is
// kept and shown marked; the server writes list matches in the list's
// spelling (shared/material-lists.ts).
function MaterialProductForm({ product, onClose, units, areas }: { product?: MaterialProduct | null; onClose: () => void; units: string[]; areas: string[] }) {
  const { toast } = useToast();
  const isEditMode = !!product;
  const [form, setForm] = useState({
    name: product?.name ?? "",
    epaRegNumber: product?.epaRegNumber ?? "",
    manufacturer: product?.manufacturer ?? "",
    formulationType: product?.formulationType ?? "",
    activeIngredientPercent: product?.activeIngredientPercent ?? "",
    restrictedUse: product?.restrictedUse ?? false,
    dilutionOptions: stringifyDilutions(product?.dilutionOptions),
    allowedApplicationMethods: (product?.allowedApplicationMethods ?? []).join(", "),
    allowedEquipment: (product?.allowedEquipment ?? []).join(", "),
    allowedApplicationAreas: (product?.allowedApplicationAreas ?? []).filter((area) => area && area.trim()),
    defaultDilutionLabel: product?.defaultDilutionLabel ?? "",
    defaultApplicationMethod: product?.defaultApplicationMethod ?? "",
    defaultEquipment: product?.defaultEquipment ?? "",
    defaultUnit: product?.defaultUnit ?? "",
    defaultApplicationArea: product?.defaultApplicationArea ?? "",
    allowTechnicianOverride: product?.allowTechnicianOverride ?? false,
    isActive: product?.isActive ?? true,
    notes: product?.notes ?? "",
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        ...data,
        epaRegNumber: data.epaRegNumber || null,
        manufacturer: data.manufacturer || null,
        formulationType: data.formulationType || null,
        activeIngredientPercent: data.activeIngredientPercent || null,
        dilutionOptions: parseDilutions(data.dilutionOptions),
        allowedApplicationMethods: splitList(data.allowedApplicationMethods),
        allowedEquipment: splitList(data.allowedEquipment),
        allowedApplicationAreas: data.allowedApplicationAreas,
        defaultDilutionLabel: data.defaultDilutionLabel || null,
        defaultApplicationMethod: data.defaultApplicationMethod || null,
        defaultEquipment: data.defaultEquipment || null,
        defaultUnit: data.defaultUnit || null,
        defaultApplicationArea: data.defaultApplicationArea || null,
        notes: data.notes || null,
      };
      const response = isEditMode
        ? await apiRequest("PATCH", `/api/material-products/${product.id}`, payload)
        : await apiRequest("POST", "/api/material-products", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/material-products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/material-products?includeInactive=true"] });
      toast({ title: isEditMode ? "Material product updated" : "Material product created" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Default Area picks from what this product allows; the org's list when it allows none yet.
  const defaultAreaOptions = form.allowedApplicationAreas.length ? form.allowedApplicationAreas : areas;

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>EPA Number</Label><Input value={form.epaRegNumber} onChange={(e) => setForm((p) => ({ ...p, epaRegNumber: e.target.value }))} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5"><Label>Manufacturer</Label><Input value={form.manufacturer} onChange={(e) => setForm((p) => ({ ...p, manufacturer: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Formulation</Label><Input value={form.formulationType} onChange={(e) => setForm((p) => ({ ...p, formulationType: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Active Ingredient %</Label><Input type="number" step="0.0001" value={form.activeIngredientPercent} onChange={(e) => setForm((p) => ({ ...p, activeIngredientPercent: e.target.value }))} /></div>
      </div>
      <div className="space-y-1.5">
        <Label>Dilution Options</Label>
        <Textarea value={form.dilutionOptions} onChange={(e) => setForm((p) => ({ ...p, dilutionOptions: e.target.value }))} placeholder={"Label | Ratio | AI%\n0.06% finished dilution | 1 oz/gal | 0.06"} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5"><Label>Allowed Methods</Label><Input value={form.allowedApplicationMethods} onChange={(e) => setForm((p) => ({ ...p, allowedApplicationMethods: e.target.value }))} placeholder="Crack & Crevice, Spot Treatment" /></div>
        <div className="space-y-1.5"><Label>Allowed Equipment</Label><Input value={form.allowedEquipment} onChange={(e) => setForm((p) => ({ ...p, allowedEquipment: e.target.value }))} placeholder="B&G, FlowZone" /></div>
        <div className="space-y-1.5">
          <Label>Allowed Areas</Label>
          <ListMultiSelect options={areas} value={form.allowedApplicationAreas} onChange={(next) => setForm((p) => ({ ...p, allowedApplicationAreas: next }))} placeholder="Select areas" searchPlaceholder="Search areas" offListCaption="not on the area list" testId="multiselect-product-allowed-areas" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1.5"><Label>Default Dilution</Label><Input value={form.defaultDilutionLabel} onChange={(e) => setForm((p) => ({ ...p, defaultDilutionLabel: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Default Method</Label><Input value={form.defaultApplicationMethod} onChange={(e) => setForm((p) => ({ ...p, defaultApplicationMethod: e.target.value }))} /></div>
        <div className="space-y-1.5">
          <Label>Default Unit</Label>
          <Select value={matchListEntry(units, form.defaultUnit) ?? (form.defaultUnit.trim() ? form.defaultUnit : "NONE")} onValueChange={(value) => setForm((p) => ({ ...p, defaultUnit: value === "NONE" ? "" : value }))}>
            <SelectTrigger data-testid="select-product-default-unit"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">No default</SelectItem>
              {units.map((unit) => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}
              {form.defaultUnit.trim() && !isOnList(units, form.defaultUnit) ? <SelectItem value={form.defaultUnit}>{form.defaultUnit} (not on the unit list)</SelectItem> : null}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Default Area</Label>
          <Select value={matchListEntry(defaultAreaOptions, form.defaultApplicationArea) ?? (form.defaultApplicationArea.trim() ? form.defaultApplicationArea : "NONE")} onValueChange={(value) => setForm((p) => ({ ...p, defaultApplicationArea: value === "NONE" ? "" : value }))}>
            <SelectTrigger data-testid="select-product-default-area"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">No default</SelectItem>
              {defaultAreaOptions.map((area) => <SelectItem key={area} value={area}>{area}</SelectItem>)}
              {form.defaultApplicationArea.trim() && !isOnList(defaultAreaOptions, form.defaultApplicationArea) ? <SelectItem value={form.defaultApplicationArea}>{form.defaultApplicationArea} (not among the allowed areas)</SelectItem> : null}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.restrictedUse} onChange={(e) => setForm((p) => ({ ...p, restrictedUse: e.target.checked }))} /> Restricted use</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.allowTechnicianOverride} onChange={(e) => setForm((p) => ({ ...p, allowTechnicianOverride: e.target.checked }))} /> Allow tech overrides</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} /> Active</label>
      </div>
      <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={mutation.isPending || !form.name.trim()}>{mutation.isPending ? "Saving..." : isEditMode ? "Save Product" : "Create Product"}</Button></div>
    </form>
  );
}

function TargetPestForm({ pest, onClose }: { pest?: TargetPest | null; onClose: () => void }) {
  const { toast } = useToast();
  const isEditMode = !!pest;
  const [form, setForm] = useState({
    label: pest?.label ?? "",
    isActive: pest?.isActive ?? true,
    isFavorite: pest?.isFavorite ?? false,
    sortOrder: pest?.sortOrder !== undefined ? String(pest.sortOrder) : "0",
    notes: pest?.notes ?? "",
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        label: data.label.trim(),
        isActive: data.isActive,
        isFavorite: data.isFavorite,
        sortOrder: data.sortOrder.trim() ? parseInt(data.sortOrder, 10) : 0,
        notes: data.notes.trim() || null,
      };
      const response = isEditMode
        ? await apiRequest("PATCH", `/api/target-pests/${pest.id}`, payload)
        : await apiRequest("POST", "/api/target-pests", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/target-pests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/target-pests?includeInactive=true"] });
      toast({ title: isEditMode ? "Target pest updated" : "Target pest created" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Label *</Label><Input value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Sort Order</Label><Input type="number" value={form.sortOrder} onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} /> Active</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isFavorite} onChange={(e) => setForm((p) => ({ ...p, isFavorite: e.target.checked }))} /> Favorite</label>
      </div>
      <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={mutation.isPending || !form.label.trim()}>{mutation.isPending ? "Saving..." : isEditMode ? "Save Pest" : "Create Pest"}</Button></div>
    </form>
  );
}

function BillingProfileTemplateForm({ template, onClose }: { template?: BillingProfileTemplate | null; onClose: () => void }) {
  const { toast } = useToast();
  const isEditMode = !!template;
  const [form, setForm] = useState({
    name: template?.name ?? "",
    description: template?.description ?? "",
    billingType: template?.billingType ?? "invoice_terms",
    defaultInvoiceTerms: template?.defaultInvoiceTerms ?? "",
    isActive: template?.isActive ?? true,
    sortOrder: template?.sortOrder !== null && template?.sortOrder !== undefined ? String(template.sortOrder) : "0",
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        name: data.name.trim(),
        description: data.description.trim() || null,
        billingType: data.billingType,
        defaultInvoiceTerms: data.billingType === "invoice_terms" ? (data.defaultInvoiceTerms || null) : null,
        isActive: data.isActive,
        sortOrder: data.sortOrder.trim() ? parseInt(data.sortOrder, 10) : 0,
      };
      const response = isEditMode
        ? await apiRequest("PATCH", `/api/billing-profile-templates/${template.id}`, payload)
        : await apiRequest("POST", "/api/billing-profile-templates", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing-profile-templates?includeInactive=true"] });
      toast({ title: isEditMode ? "Billing profile template updated" : "Billing profile template created" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
      <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
      <div className="space-y-1.5"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Billing Type</Label>
          <Select value={form.billingType} onValueChange={(value) => setForm((p) => ({ ...p, billingType: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="ach">ACH</SelectItem>
              <SelectItem value="invoice_terms">Invoice Terms</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="check">Check</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Sort Order</Label><Input type="number" value={form.sortOrder} onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))} /></div>
      </div>
      {form.billingType === "invoice_terms" && (
        <div className="space-y-1.5">
          <Label>Default Invoice Terms</Label>
          <Select value={form.defaultInvoiceTerms || "NONE"} onValueChange={(value) => setForm((p) => ({ ...p, defaultInvoiceTerms: value === "NONE" ? "" : value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">Unset</SelectItem>
              <SelectItem value="DUE_ON_RECEIPT">Due on Receipt</SelectItem>
              <SelectItem value="NET_15">Net 15</SelectItem>
              <SelectItem value="NET_30">Net 30</SelectItem>
              <SelectItem value="NET_60">Net 60</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} /> Active</label>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={mutation.isPending || !form.name.trim()}>{mutation.isPending ? "Saving..." : isEditMode ? "Save Template" : "Create Template"}</Button></div>
    </form>
  );
}

function BillingPlanForm({ plan, onClose }: { plan?: BillingPlan | null; onClose: () => void }) {
  const { toast } = useToast();
  const isEditMode = !!plan;
  const [form, setForm] = useState({
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    chargeTrigger: plan?.chargeTrigger ?? "ON_SCHEDULE",
    billingMode: plan?.billingMode ?? "RECURRING_INTERVAL",
    intervalUnit: plan?.intervalUnit ?? "MONTH",
    intervalCount: plan?.intervalCount != null ? String(plan.intervalCount) : "1",
    installmentCount: plan?.installmentCount != null ? String(plan.installmentCount) : "",
    anchorMode: plan?.anchorMode ?? "SIGNUP_DATE",
    anchorDay: plan?.anchorDay != null ? String(plan.anchorDay) : "",
    prorationRule: plan?.prorationRule ?? "NONE",
    initialChargeCoversFirstPeriod: plan?.initialChargeCoversFirstPeriod ?? false,
    isActive: plan?.isActive ?? true,
    sortOrder: plan?.sortOrder !== null && plan?.sortOrder !== undefined ? String(plan.sortOrder) : "0",
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        name: data.name.trim(),
        description: data.description.trim() || null,
        chargeTrigger: data.chargeTrigger,
        billingMode: data.billingMode,
        intervalUnit: data.billingMode === "RECURRING_INTERVAL" ? data.intervalUnit : null,
        intervalCount: data.billingMode === "RECURRING_INTERVAL" ? (data.intervalCount.trim() ? parseInt(data.intervalCount, 10) : 1) : null,
        installmentCount: data.billingMode === "INSTALLMENT" ? (data.installmentCount.trim() ? parseInt(data.installmentCount, 10) : null) : null,
        anchorMode: data.anchorMode,
        anchorDay: data.anchorMode === "CALENDAR_DAY" ? (data.anchorDay.trim() ? parseInt(data.anchorDay, 10) : null) : null,
        prorationRule: data.prorationRule,
        initialChargeCoversFirstPeriod: data.initialChargeCoversFirstPeriod,
        isActive: data.isActive,
        sortOrder: data.sortOrder.trim() ? parseInt(data.sortOrder, 10) : 0,
      };
      const response = isEditMode
        ? await apiRequest("PATCH", `/api/billing-plans/${plan.id}`, payload)
        : await apiRequest("POST", "/api/billing-plans", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing-plans?includeInactive=true"] });
      toast({ title: isEditMode ? "Billing plan updated" : "Billing plan created" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
      <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
      <div className="space-y-1.5"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Charge Trigger</Label>
          <Select value={form.chargeTrigger} onValueChange={(value) => setForm((p) => ({ ...p, chargeTrigger: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ON_SCHEDULE">On Schedule</SelectItem>
              <SelectItem value="ON_SERVICE_COMPLETION">On Service Completion</SelectItem>
              <SelectItem value="ON_AGREEMENT_START">On Agreement Start</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Billing Mode</Label>
          <Select value={form.billingMode} onValueChange={(value) => setForm((p) => ({ ...p, billingMode: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PER_SERVICE">Per Service</SelectItem>
              <SelectItem value="RECURRING_INTERVAL">Recurring Interval</SelectItem>
              <SelectItem value="PREPAID_TERM">Prepaid Term</SelectItem>
              <SelectItem value="INSTALLMENT">Installment</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {form.billingMode === "RECURRING_INTERVAL" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Interval Unit</Label>
            <Select value={form.intervalUnit} onValueChange={(value) => setForm((p) => ({ ...p, intervalUnit: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DAY">Day</SelectItem>
                <SelectItem value="WEEK">Week</SelectItem>
                <SelectItem value="MONTH">Month</SelectItem>
                <SelectItem value="QUARTER">Quarter</SelectItem>
                <SelectItem value="YEAR">Year</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Interval Count</Label><Input type="number" min="1" value={form.intervalCount} onChange={(e) => setForm((p) => ({ ...p, intervalCount: e.target.value }))} /></div>
        </div>
      )}
      {form.billingMode === "INSTALLMENT" && (
        <div className="space-y-1.5"><Label>Installment Count</Label><Input type="number" min="1" value={form.installmentCount} onChange={(e) => setForm((p) => ({ ...p, installmentCount: e.target.value }))} /></div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Anchor Mode</Label>
          <Select value={form.anchorMode} onValueChange={(value) => setForm((p) => ({ ...p, anchorMode: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="SIGNUP_DATE">Signup Date</SelectItem>
              <SelectItem value="CALENDAR_DAY">Calendar Day</SelectItem>
              <SelectItem value="CUSTOM">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.anchorMode === "CALENDAR_DAY" ? (
          <div className="space-y-1.5"><Label>Anchor Day</Label><Input type="number" min="1" max="31" value={form.anchorDay} onChange={(e) => setForm((p) => ({ ...p, anchorDay: e.target.value }))} /></div>
        ) : (
          <div className="space-y-1.5">
            <Label>Proration Rule</Label>
            <Select value={form.prorationRule} onValueChange={(value) => setForm((p) => ({ ...p, prorationRule: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">None</SelectItem>
                <SelectItem value="DAILY">Daily</SelectItem>
                <SelectItem value="FIRST_PERIOD_FULL">First Period Full</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.initialChargeCoversFirstPeriod} onChange={(e) => setForm((p) => ({ ...p, initialChargeCoversFirstPeriod: e.target.checked }))} /> An agreement's initial charge covers its first period (no double-bill)</label>
        <p className="text-xs text-muted-foreground">The initial charge itself (a down payment, its amount, who may collect) is set per sale on the agreement and agreement template next to Price, not here, and whether the technician may add a surcharge in the field is the agreement template's toggle. This only decides whether that money buys period 1 of this plan's schedule.</p>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} /> Active</label>
      <div className="space-y-1.5"><Label>Sort Order</Label><Input type="number" value={form.sortOrder} onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))} /></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={mutation.isPending || !form.name.trim()}>{mutation.isPending ? "Saving..." : isEditMode ? "Save Plan" : "Create Plan"}</Button></div>
    </form>
  );
}

function TaxRateForm({ rate, onClose }: { rate?: TaxRate | null; onClose: () => void }) {
  const { toast } = useToast();
  const isEditMode = !!rate;
  const [form, setForm] = useState({
    name: rate?.name ?? "",
    jurisdiction: rate?.jurisdiction ?? "",
    ratePercent: rate?.rateBasisPoints != null ? (rate.rateBasisPoints / 100).toString() : "",
    effectiveFrom: rate?.effectiveFrom ?? new Date().toISOString().slice(0, 10),
    effectiveTo: rate?.effectiveTo ?? "",
    isDefault: rate?.isDefault ?? false,
    isActive: rate?.isActive ?? true,
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        name: data.name.trim(),
        jurisdiction: data.jurisdiction.trim() || null,
        rateBasisPoints: Math.round(parseFloat(data.ratePercent || "0") * 100),
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo || null,
        isDefault: data.isDefault,
        isActive: data.isActive,
      };
      const response = isEditMode
        ? await apiRequest("PATCH", `/api/tax-rates/${rate.id}`, payload)
        : await apiRequest("POST", "/api/tax-rates", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax-rates?includeInactive=true"] });
      toast({ title: isEditMode ? "Tax rate updated" : "Tax rate created" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Jurisdiction</Label><Input placeholder="e.g., Texas, DFW" value={form.jurisdiction} onChange={(e) => setForm((p) => ({ ...p, jurisdiction: e.target.value }))} /></div>
      </div>
      <div className="space-y-1.5"><Label>Rate (%) *</Label><Input type="number" step="0.01" min="0" value={form.ratePercent} onChange={(e) => setForm((p) => ({ ...p, ratePercent: e.target.value }))} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Effective From *</Label><Input type="date" value={form.effectiveFrom} onChange={(e) => setForm((p) => ({ ...p, effectiveFrom: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Effective To</Label><Input type="date" value={form.effectiveTo} onChange={(e) => setForm((p) => ({ ...p, effectiveTo: e.target.value }))} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))} /> Default rate</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} /> Active</label>
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={mutation.isPending || !form.name.trim() || !form.ratePercent}>{mutation.isPending ? "Saving..." : isEditMode ? "Save Rate" : "Create Rate"}</Button></div>
    </form>
  );
}

function TaxRuleForm({ rule, onClose }: { rule?: TaxRule | null; onClose: () => void }) {
  const { toast } = useToast();
  const isEditMode = !!rule;
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });
  const [form, setForm] = useState({
    serviceTypeId: rule?.serviceTypeId ?? "",
    locationType: rule?.locationType ?? "",
    taxable: rule?.taxable ?? true,
    isActive: rule?.isActive ?? true,
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        serviceTypeId: data.serviceTypeId || null,
        locationType: data.locationType || null,
        taxable: data.taxable,
        isActive: data.isActive,
      };
      const response = isEditMode
        ? await apiRequest("PATCH", `/api/tax-rules/${rule.id}`, payload)
        : await apiRequest("POST", "/api/tax-rules", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax-rules?includeInactive=true"] });
      toast({ title: isEditMode ? "Tax rule updated" : "Tax rule created" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Service Type</Label>
        <Select value={form.serviceTypeId || "ANY"} onValueChange={(value) => setForm((p) => ({ ...p, serviceTypeId: value === "ANY" ? "" : value }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ANY">Any service type</SelectItem>
            {(serviceTypes ?? []).map((st) => <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Location Type</Label>
        <Select value={form.locationType || "ANY"} onValueChange={(value) => setForm((p) => ({ ...p, locationType: value === "ANY" ? "" : value }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ANY">Any location type</SelectItem>
            <SelectItem value="residential">Residential</SelectItem>
            <SelectItem value="commercial">Commercial</SelectItem>
            <SelectItem value="multi-family">Multi-family</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.taxable} onChange={(e) => setForm((p) => ({ ...p, taxable: e.target.checked }))} /> Taxable</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} /> Active</label>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving..." : isEditMode ? "Save Rule" : "Create Rule"}</Button></div>
    </form>
  );
}

// Pass 25 (PLAN_ROADMAP_V2.md C4.1): the reason list behind an opportunity's
// category. Label, order and the active flag only - the five keys are fixed
// (owner, second review of 2026-09-19), so there is no key field, no Add and
// no Delete; the server answers 405 to both.
function OpportunityCategoryForm({ category, onClose }: { category: OpportunityCategory; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    label: category.label,
    isActive: category.isActive,
    sortOrder: String(category.sortOrder),
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        label: data.label.trim(),
        isActive: data.isActive,
        sortOrder: data.sortOrder.trim() ? parseInt(data.sortOrder, 10) : 0,
      };
      const response = await apiRequest("PATCH", `/api/opportunity-categories/${category.id}`, payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/opportunity-categories") });
      toast({ title: "Category updated" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Label</Label><Input value={form.label} onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))} data-testid="input-opportunity-category-label" /></div>
        <div className="space-y-1.5"><Label>Key</Label><Input value={category.key} disabled title="Keys are fixed" /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Active</Label>
          <Select value={form.isActive ? "ACTIVE" : "INACTIVE"} onValueChange={(value) => setForm((prev) => ({ ...prev, isActive: value === "ACTIVE" }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Sort Order</Label><Input type="number" value={form.sortOrder} onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: e.target.value }))} /></div>
      </div>
      <p className="text-xs text-muted-foreground">An inactive category stays on the opportunities that already carry it and can still be filtered on; it just cannot be chosen for another.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending || !form.label.trim()}>
          {mutation.isPending ? "Saving..." : "Save Category"}
        </Button>
      </div>
    </form>
  );
}

function OpportunityDispositionForm({ disposition, onClose }: { disposition?: OpportunityDisposition | null; onClose: () => void }) {
  const { toast } = useToast();
  const isEditMode = !!disposition;
  const [form, setForm] = useState({
    key: disposition?.key ?? "",
    label: disposition?.label ?? "",
    isActive: disposition?.isActive ?? true,
    defaultCallbackDays: disposition?.defaultCallbackDays !== null && disposition?.defaultCallbackDays !== undefined ? String(disposition.defaultCallbackDays) : "",
    resultingStatus: disposition?.resultingStatus ?? "OPEN",
    isTerminal: disposition?.isTerminal ?? false,
    isDoNotContact: disposition?.isDoNotContact ?? false,
    sortOrder: disposition?.sortOrder ? String(disposition.sortOrder) : "0",
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        key: data.key.trim().toUpperCase().replace(/\s+/g, "_"),
        label: data.label.trim(),
        isActive: data.isActive,
        defaultCallbackDays: data.defaultCallbackDays.trim() ? parseInt(data.defaultCallbackDays, 10) : null,
        resultingStatus: data.resultingStatus,
        isTerminal: data.isTerminal,
        isDoNotContact: data.isDoNotContact,
        sortOrder: data.sortOrder.trim() ? parseInt(data.sortOrder, 10) : 0,
      };
      const response = isEditMode
        ? await apiRequest("PATCH", `/api/opportunity-dispositions/${disposition.id}`, payload)
        : await apiRequest("POST", "/api/opportunity-dispositions", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunity-dispositions"] });
      toast({ title: isEditMode ? "Disposition updated" : "Disposition created" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Label</Label><Input value={form.label} onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Key</Label><Input value={form.key} onChange={(e) => setForm((prev) => ({ ...prev, key: e.target.value }))} disabled={isEditMode} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Default Callback Days</Label><Input type="number" min="0" value={form.defaultCallbackDays} onChange={(e) => setForm((prev) => ({ ...prev, defaultCallbackDays: e.target.value }))} /></div>
        <div className="space-y-1.5">
          <Label>Resulting Status</Label>
          <Select value={form.resultingStatus} onValueChange={(value) => setForm((prev) => ({ ...prev, resultingStatus: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="OPEN">OPEN</SelectItem>
              <SelectItem value="CONTACTED">CONTACTED</SelectItem>
              <SelectItem value="CONVERTED">CONVERTED</SelectItem>
              <SelectItem value="DISMISSED">DISMISSED</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Active</Label>
          <Select value={form.isActive ? "ACTIVE" : "INACTIVE"} onValueChange={(value) => setForm((prev) => ({ ...prev, isActive: value === "ACTIVE" }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Sort Order</Label><Input type="number" value={form.sortOrder} onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: e.target.value }))} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Terminal Behavior</Label>
          <Select value={form.isTerminal ? "YES" : "NO"} onValueChange={(value) => setForm((prev) => ({ ...prev, isTerminal: value === "YES" }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NO">No</SelectItem>
              <SelectItem value="YES">Yes</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Do Not Contact</Label>
          <Select value={form.isDoNotContact ? "YES" : "NO"} onValueChange={(value) => setForm((prev) => ({ ...prev, isDoNotContact: value === "YES" }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NO">No</SelectItem>
              <SelectItem value="YES">Yes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending || !form.label.trim() || !form.key.trim()}>
          {mutation.isPending ? "Saving..." : isEditMode ? "Save Disposition" : "Create Disposition"}
        </Button>
      </div>
    </form>
  );
}

function TechnicianForm({ technician, onClose }: { technician?: Technician | null; onClose: () => void }) {
  const { toast } = useToast();
  const isEditMode = !!technician;
  // Pass 12: the technician -> user bridge (technicians.userId). Active users
  // plus the one already linked, so an inactive login still names itself.
  const { data: users } = useQuery<UserSummary[]>({ queryKey: ["/api/users"] });
  const linkableUsers = useMemo(() => selectableUsers(users ?? [], technician?.userId), [users, technician?.userId]);
  const [form, setForm] = useState({
    displayName: technician?.displayName ?? "",
    licenseId: technician?.licenseId ?? "",
    status: technician?.status ?? "ACTIVE",
    email: technician?.email ?? "",
    phone: technician?.phone ?? "",
    color: technician?.color ?? "",
    notes: technician?.notes ?? "",
    userId: technician?.userId ?? "",
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        displayName: data.displayName.trim(),
        licenseId: data.licenseId.trim(),
        status: data.status,
        email: data.email.trim() || null,
        phone: data.phone.trim() || null,
        color: data.color.trim() || null,
        notes: data.notes.trim() || null,
        userId: data.userId || null,
      };
      const response = isEditMode
        ? await apiRequest("PATCH", `/api/technicians/${technician.id}`, payload)
        : await apiRequest("POST", "/api/technicians", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/technicians"] });
      toast({ title: isEditMode ? "Technician updated" : "Technician created" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Name</Label><Input value={form.displayName} onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>License ID</Label><Input value={form.licenseId} onChange={(e) => setForm((prev) => ({ ...prev, licenseId: e.target.value }))} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
              <SelectItem value="TERMINATED">Terminated</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Color</Label><Input placeholder="#2563eb" value={form.color} onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value }))} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} /></div>
      </div>
      <div className="space-y-1.5">
        <Label>Linked user</Label>
        <Select value={form.userId || "NONE"} onValueChange={(value) => setForm((prev) => ({ ...prev, userId: value === "NONE" ? "" : value }))}>
          <SelectTrigger data-testid="select-technician-user"><SelectValue placeholder="No linked user" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">No linked user</SelectItem>
            {linkableUsers.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {userDisplayName(user)} ({describeUserRole(user.role)}){user.status === "active" ? "" : " (inactive)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          The login this technician signs in with. Sale credit is recorded per user and production credit per technician; this link is how the two meet on one person. One user per technician.
        </p>
      </div>
      <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} className="resize-none" /></div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending || !form.displayName.trim() || !form.licenseId.trim()}>
          {mutation.isPending ? "Saving..." : isEditMode ? "Save Technician" : "Create Technician"}
        </Button>
      </div>
    </form>
  );
}

function AgreementCancellationPolicyForm({ policy, onClose }: { policy?: AgreementCancellationPolicy | null; onClose: () => void }) {
  const { toast } = useToast();
  const isEditMode = !!policy;
  const [form, setForm] = useState({
    name: policy?.name ?? "",
    description: policy?.description ?? "",
    isActive: policy?.isActive ?? true,
    cancellationFeeType: policy?.cancellationFeeType ?? "NONE",
    cancellationFeeAmount: policy?.cancellationFeeAmountCents != null ? centsToDollarString(policy.cancellationFeeAmountCents) : "",
    noticeDays: policy?.noticeDays !== undefined ? String(policy.noticeDays) : "0",
    effectiveDateMode: policy?.effectiveDateMode ?? "IMMEDIATE",
    cancelPendingServicesDefault: policy?.cancelPendingServicesDefault ?? true,
    cancelScheduledAppointmentsDefault: policy?.cancelScheduledAppointmentsDefault ?? false,
    closeOpenOpportunitiesDefault: policy?.closeOpenOpportunitiesDefault ?? false,
    createRetentionOpportunityDefault: policy?.createRetentionOpportunityDefault ?? false,
    defaultRetentionFollowUpDays: policy?.defaultRetentionFollowUpDays !== null && policy?.defaultRetentionFollowUpDays !== undefined ? String(policy.defaultRetentionFollowUpDays) : "",
    allowManagerOverride: policy?.allowManagerOverride ?? false,
    requiresOverrideReason: policy?.requiresOverrideReason ?? false,
    termsSummary: policy?.termsSummary ?? "",
  });

  const mutation = useMutation({
    mutationFn: (data: typeof form) => {
      const { cancellationFeeAmount, ...rest } = data;
      const payload = {
        ...rest,
        description: data.description || null,
        cancellationFeeAmountCents: dollarsToCents(cancellationFeeAmount),
        noticeDays: data.noticeDays ? parseInt(data.noticeDays) : 0,
        defaultRetentionFollowUpDays: data.defaultRetentionFollowUpDays ? parseInt(data.defaultRetentionFollowUpDays) : null,
        termsSummary: data.termsSummary || null,
      };
      return isEditMode
        ? apiRequest("PATCH", `/api/agreement-cancellation-policies/${policy.id}`, payload)
        : apiRequest("POST", "/api/agreement-cancellation-policies", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agreement-cancellation-policies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agreement-cancellation-policies?includeInactive=true"] });
      toast({ title: isEditMode ? "Cancellation policy updated" : "Cancellation policy created" });
      onClose();
    },
  });

  const updateFlag = (key: keyof typeof form, checked: boolean) => setForm((prev) => ({ ...prev, [key]: checked }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required /></div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.isActive ? "active" : "inactive"} onValueChange={(value) => setForm((p) => ({ ...p, isActive: value === "active" }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} className="resize-none" /></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Fee Type</Label>
          <Select value={form.cancellationFeeType} onValueChange={(value) => setForm((p) => ({ ...p, cancellationFeeType: value, cancellationFeeAmount: value === "NONE" ? "" : p.cancellationFeeAmount }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">None</SelectItem>
              <SelectItem value="FLAT">Flat</SelectItem>
              <SelectItem value="PERCENT_CONTRACT">Percent of Contract Price</SelectItem>
              <SelectItem value="PERCENT_REMAINING">Percent of Remaining Balance</SelectItem>
              <SelectItem value="MANUAL">Manual Review</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>{form.cancellationFeeType.startsWith("PERCENT") ? "Fee Percent" : "Fee Amount"}</Label><Input type="number" step="0.01" value={form.cancellationFeeAmount} onChange={(e) => setForm((p) => ({ ...p, cancellationFeeAmount: e.target.value }))} disabled={form.cancellationFeeType === "NONE"} /></div>
        <div className="space-y-1.5"><Label>Notice Days</Label><Input type="number" value={form.noticeDays} onChange={(e) => setForm((p) => ({ ...p, noticeDays: e.target.value }))} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Effective Date</Label>
          <Select value={form.effectiveDateMode} onValueChange={(value) => setForm((p) => ({ ...p, effectiveDateMode: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="IMMEDIATE">Immediate</SelectItem><SelectItem value="END_OF_TERM">End of Term</SelectItem><SelectItem value="CUSTOM">Custom</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Retention Follow-up Days</Label><Input type="number" value={form.defaultRetentionFollowUpDays} onChange={(e) => setForm((p) => ({ ...p, defaultRetentionFollowUpDays: e.target.value }))} /></div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.cancelPendingServicesDefault} onChange={(e) => updateFlag("cancelPendingServicesDefault", e.target.checked)} /> Cancel pending generated services</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.cancelScheduledAppointmentsDefault} onChange={(e) => updateFlag("cancelScheduledAppointmentsDefault", e.target.checked)} /> Cancel scheduled appointments</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.closeOpenOpportunitiesDefault} onChange={(e) => updateFlag("closeOpenOpportunitiesDefault", e.target.checked)} /> Close open opportunities</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.createRetentionOpportunityDefault} onChange={(e) => updateFlag("createRetentionOpportunityDefault", e.target.checked)} /> Create retention opportunity</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.allowManagerOverride} onChange={(e) => updateFlag("allowManagerOverride", e.target.checked)} /> Allow manager override</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.requiresOverrideReason} onChange={(e) => updateFlag("requiresOverrideReason", e.target.checked)} /> Require override reason</label>
      </div>
      <div className="space-y-1.5"><Label>Terms Summary</Label><Textarea value={form.termsSummary} onChange={(e) => setForm((p) => ({ ...p, termsSummary: e.target.value }))} className="resize-none" rows={4} /></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving..." : isEditMode ? "Save Policy" : "Create Policy"}</Button></div>
    </form>
  );
}

function AgreementTemplateForm({
  serviceTypes,
  cancellationPolicies,
  billingPlans,
  template,
  onClose,
}: {
  serviceTypes?: ServiceType[];
  cancellationPolicies?: AgreementCancellationPolicy[];
  billingPlans?: BillingPlan[];
  template?: AgreementTemplate | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const isEditMode = !!template;
  const [form, setForm] = useState({
    name: template?.name ?? "",
    description: template?.description ?? "",
    isActive: template?.isActive ?? true,
    cancellationPolicyId: template?.cancellationPolicyId ?? "",
    billingPlanId: template?.billingPlanId ?? "",
    defaultAgreementType: template?.defaultAgreementType ?? "",
    defaultTermUnit: template?.defaultTermUnit ?? "YEAR",
    defaultTermInterval: template?.defaultTermInterval ? String(template.defaultTermInterval) : "1",
    defaultRecurrenceUnit: template?.defaultRecurrenceUnit ?? "MONTH",
    defaultRecurrenceInterval: template?.defaultRecurrenceInterval ? String(template.defaultRecurrenceInterval) : "1",
    defaultGenerationLeadDays: template?.defaultGenerationLeadDays ? String(template.defaultGenerationLeadDays) : "14",
    defaultServiceWindowDays: template?.defaultServiceWindowDays ? String(template.defaultServiceWindowDays) : "",
    defaultSchedulingMode: template?.defaultSchedulingMode ?? "MANUAL",
    defaultServiceTypeId: template?.defaultServiceTypeId ?? "",
    defaultServiceTemplateName: template?.defaultServiceTemplateName ?? "",
    defaultDurationMinutes: template?.defaultDurationMinutes ? String(template.defaultDurationMinutes) : "",
    defaultPrice: template?.defaultPriceCents != null ? centsToDollarString(template.defaultPriceCents) : "",
    initialCharge: initialChargeFormStateFrom(initialChargeFromTemplate(template)),
    fieldSurchargeAllowed: template?.fieldSurchargeAllowed ?? false,
    defaultInstructions: template?.defaultInstructions ?? "",
    sortOrder: template?.sortOrder ? String(template.sortOrder) : "",
    internalCode: template?.internalCode ?? "",
  });

  // A retired plan still shows on the template already carrying it, so editing
  // an unrelated field can't silently drop that template to plan-less.
  const selectableBillingPlans = useMemo(
    () => (billingPlans ?? []).filter((plan) => plan.isActive || plan.id === template?.billingPlanId),
    [billingPlans, template?.billingPlanId],
  );
  const selectedBillingPlan = useMemo(
    () => (billingPlans ?? []).find((plan) => plan.id === form.billingPlanId) ?? null,
    [billingPlans, form.billingPlanId],
  );

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        name: data.name.trim(),
        description: data.description.trim() || null,
        isActive: data.isActive,
        cancellationPolicyId: data.cancellationPolicyId || null,
        billingPlanId: data.billingPlanId || null,
        defaultAgreementType: data.defaultAgreementType.trim() || null,
        defaultTermUnit: data.defaultTermUnit,
        defaultTermInterval: parseInt(data.defaultTermInterval, 10),
        defaultRecurrenceUnit: data.defaultRecurrenceUnit,
        defaultRecurrenceInterval: parseInt(data.defaultRecurrenceInterval, 10),
        defaultGenerationLeadDays: parseInt(data.defaultGenerationLeadDays, 10),
        defaultServiceWindowDays: data.defaultServiceWindowDays.trim() ? parseInt(data.defaultServiceWindowDays, 10) : null,
        defaultSchedulingMode: data.defaultSchedulingMode,
        defaultServiceTypeId: data.defaultServiceTypeId || null,
        defaultServiceTemplateName: data.defaultServiceTemplateName.trim() || null,
        defaultDurationMinutes: data.defaultDurationMinutes.trim() ? parseInt(data.defaultDurationMinutes, 10) : null,
        defaultPriceCents: dollarsToCents(data.defaultPrice),
        ...initialChargeToTemplate(initialChargeFieldsFrom(data.initialCharge)),
        fieldSurchargeAllowed: data.fieldSurchargeAllowed,
        defaultInstructions: data.defaultInstructions.trim() || null,
        sortOrder: data.sortOrder.trim() ? parseInt(data.sortOrder, 10) : null,
        internalCode: data.internalCode.trim() || null,
      };

      const response = isEditMode
        ? await apiRequest("PATCH", `/api/agreement-templates/${template.id}`, payload)
        : await apiRequest("POST", "/api/agreement-templates", payload);

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agreement-templates"] });
      toast({ title: isEditMode ? "Agreement template updated" : "Agreement template created" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: isEditMode ? "Error updating template" : "Error creating template", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const initialChargeError = validateInitialChargeFormState(form.initialCharge);
    if (initialChargeError) {
      toast({ title: initialChargeError, variant: "destructive" });
      return;
    }
    mutation.mutate(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Template Details</h3>
        <p className="text-sm text-muted-foreground">Define the company-standard recurring agreement configuration your office can reuse.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} data-testid="input-template-name" /></div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.isActive ? "ACTIVE" : "INACTIVE"} onValueChange={(value) => setForm((prev) => ({ ...prev, isActive: value === "ACTIVE" }))}>
            <SelectTrigger data-testid="select-template-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} className="resize-none" /></div>
      <div className="space-y-1.5">
        <Label>Cancellation Policy</Label>
        <Select value={form.cancellationPolicyId || "NONE"} onValueChange={(value) => setForm((prev) => ({ ...prev, cancellationPolicyId: value === "NONE" ? "" : value }))}>
          <SelectTrigger><SelectValue placeholder="Select cancellation policy" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">No policy assigned</SelectItem>
            {cancellationPolicies?.map((policy) => (
              <SelectItem key={policy.id} value={policy.id}>{policy.name} - {formatCancellationFee(policy)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">New location agreements snapshot the selected policy at creation.</p>
      </div>
      <div className="space-y-1.5">
        <Label>Billing Plan</Label>
        <Select value={form.billingPlanId || "NONE"} onValueChange={(value) => setForm((prev) => ({ ...prev, billingPlanId: value === "NONE" ? "" : value }))}>
          <SelectTrigger data-testid="select-template-billing-plan"><SelectValue placeholder="Select a billing plan" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">No default - the office picks a plan on each agreement</SelectItem>
            {selectableBillingPlans.map((plan) => (
              <SelectItem key={plan.id} value={plan.id}>{plan.name}{plan.isActive ? "" : " (inactive)"}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{describeBillingPlanBehavior(selectedBillingPlan)}</p>
        <p className="text-xs text-muted-foreground">New location agreements start from this plan and snapshot it at creation.</p>
      </div>
      <div className="space-y-1.5"><Label>Agreement Type</Label><Input value={form.defaultAgreementType} onChange={(e) => setForm((prev) => ({ ...prev, defaultAgreementType: e.target.value }))} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Agreement Term Unit</Label>
          <Select value={form.defaultTermUnit} onValueChange={(value) => setForm((prev) => ({ ...prev, defaultTermUnit: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="MONTH">Month</SelectItem>
              <SelectItem value="QUARTER">Quarter</SelectItem>
              <SelectItem value="YEAR">Year</SelectItem>
              <SelectItem value="CUSTOM">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Agreement Term Interval</Label><Input type="number" min="1" value={form.defaultTermInterval} onChange={(e) => setForm((prev) => ({ ...prev, defaultTermInterval: e.target.value }))} /></div>
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Recurrence / Scheduling Defaults</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Recurrence Unit</Label>
          <Select value={form.defaultRecurrenceUnit} onValueChange={(value) => setForm((prev) => ({ ...prev, defaultRecurrenceUnit: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="MONTH">Month</SelectItem>
              <SelectItem value="QUARTER">Quarter</SelectItem>
              <SelectItem value="YEAR">Year</SelectItem>
              <SelectItem value="CUSTOM">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Recurrence Interval</Label><Input type="number" min="1" value={form.defaultRecurrenceInterval} onChange={(e) => setForm((prev) => ({ ...prev, defaultRecurrenceInterval: e.target.value }))} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Generation Lead Days</Label><Input type="number" min="0" value={form.defaultGenerationLeadDays} onChange={(e) => setForm((prev) => ({ ...prev, defaultGenerationLeadDays: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Service Window Days</Label><Input type="number" min="0" value={form.defaultServiceWindowDays} onChange={(e) => setForm((prev) => ({ ...prev, defaultServiceWindowDays: e.target.value }))} /></div>
      </div>
      <div className="space-y-1.5">
        <Label>Scheduling Mode</Label>
        <Select value={form.defaultSchedulingMode} onValueChange={(value) => setForm((prev) => ({ ...prev, defaultSchedulingMode: value }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="AUTO_ELIGIBLE">Auto Eligible</SelectItem>
            <SelectItem value="CONTACT_REQUIRED">Contact Required</SelectItem>
            <SelectItem value="MANUAL">Manual</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Service Defaults</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Default Service Type</Label>
          <Select value={form.defaultServiceTypeId} onValueChange={(value) => setForm((prev) => ({ ...prev, defaultServiceTypeId: value }))}>
            <SelectTrigger><SelectValue placeholder="Select service type" /></SelectTrigger>
            <SelectContent>
              {serviceTypes?.map((serviceType) => (
                <SelectItem key={serviceType.id} value={serviceType.id}>{serviceType.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Default Service Template Name</Label><Input value={form.defaultServiceTemplateName} onChange={(e) => setForm((prev) => ({ ...prev, defaultServiceTemplateName: e.target.value }))} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Default Duration Minutes</Label><Input type="number" min="0" value={form.defaultDurationMinutes} onChange={(e) => setForm((prev) => ({ ...prev, defaultDurationMinutes: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Default Price</Label><Input type="number" min="0" step="0.01" value={form.defaultPrice} onChange={(e) => setForm((prev) => ({ ...prev, defaultPrice: e.target.value }))} /></div>
      </div>
      <InitialChargeFormFields
        value={form.initialCharge}
        onChange={(next) => setForm((prev) => ({ ...prev, initialCharge: next }))}
        contractPriceCents={dollarsToCents(form.defaultPrice)}
        labelPrefix="Default "
        testIdPrefix="template"
      />
      {/* Pass 23 (C3.6): the allow / reject toggle for the field surcharge line - the template holds only whether the technician may. */}
      <div className="rounded-md border px-3 py-2" data-testid="block-template-field-surcharge">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={form.fieldSurchargeAllowed} onChange={(e) => setForm((prev) => ({ ...prev, fieldSurchargeAllowed: e.target.checked }))} data-testid="checkbox-template-field-surcharge" />
          <span>
            Technician may add a surcharge in the field
            <span className="block text-xs font-normal text-muted-foreground">A cleanout surcharge is not a term of the sale: the technician records it on the ticket at the visit for what scheduling could not see, and it bills as its own line on the visit invoice in addition to the contract price. This only says whether the technician may; it applies to every agreement made from this template, existing ones included.</span>
          </span>
        </label>
      </div>
      <div className="space-y-1.5"><Label>Default Instructions</Label><Textarea value={form.defaultInstructions} onChange={(e) => setForm((prev) => ({ ...prev, defaultInstructions: e.target.value }))} className="resize-none" /></div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Template Metadata</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Sort Order</Label><Input type="number" value={form.sortOrder} onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Internal Code</Label><Input value={form.internalCode} onChange={(e) => setForm((prev) => ({ ...prev, internalCode: e.target.value }))} /></div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending || !form.name.trim() || !form.defaultServiceTypeId}>
          {mutation.isPending ? "Saving..." : isEditMode ? "Save Template" : "Create Template"}
        </Button>
      </div>
    </form>
  );
}

// Pass 26 (PLAN_ROADMAP_V2.md C4.1b): a zone - a named ZIP-code list
// (shared/zones.ts). The list is typed one per line (commas work too); the
// form previews what will be kept and what will be refused, by the same
// normalization the server applies, so the save never surprises.
function ZoneForm({ zone, onClose }: { zone?: Zone | null; onClose: () => void }) {
  const { toast } = useToast();
  const isEditMode = !!zone;
  const [form, setForm] = useState({
    name: zone?.name ?? "",
    zipCodesText: (zone?.zipCodes ?? []).join("\n"),
    isActive: zone?.isActive ?? true,
    sortOrder: zone?.sortOrder !== undefined ? String(zone.sortOrder) : "0",
    notes: zone?.notes ?? "",
  });
  const preview = useMemo(() => normalizeZipCodes(splitZipCodeText(form.zipCodesText)), [form.zipCodesText]);
  const invalidateZones = () => {
    queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/zones") });
    queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/opportunity-assignment-rules") });
  };

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        name: data.name.trim(),
        zipCodes: splitZipCodeText(data.zipCodesText),
        isActive: data.isActive,
        sortOrder: data.sortOrder.trim() ? parseInt(data.sortOrder, 10) : 0,
        notes: data.notes.trim() || null,
      };
      const response = isEditMode
        ? await apiRequest("PATCH", `/api/zones/${zone.id}`, payload)
        : await apiRequest("POST", "/api/zones", payload);
      return response.json();
    },
    onSuccess: () => {
      invalidateZones();
      toast({ title: isEditMode ? "Zone updated" : "Zone created" });
      onClose();
    },
    onError: (err: unknown) => toast({ title: "Zone not saved", description: getApiErrorMessage(err), variant: "destructive" }),
  });
  // A zone named by a rule cannot be deleted (409 ZONE_IN_USE) - the server
  // says which; deactivating is always allowed.
  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/zones/${zone!.id}`);
    },
    onSuccess: () => {
      invalidateZones();
      toast({ title: "Zone deleted" });
      onClose();
    },
    onError: (err: unknown) => toast({ title: "Zone not deleted", description: getApiErrorMessage(err), variant: "destructive" }),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} data-testid="input-zone-name" /></div>
        <div className="space-y-1.5"><Label>Sort Order</Label><Input type="number" value={form.sortOrder} onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))} /></div>
      </div>
      <div className="space-y-1.5">
        <Label>ZIP Codes *</Label>
        <Textarea
          value={form.zipCodesText}
          onChange={(e) => setForm((p) => ({ ...p, zipCodesText: e.target.value }))}
          rows={6}
          placeholder={"76053\n76102\n76969"}
          data-testid="textarea-zone-zip-codes"
        />
        <p className="text-xs text-muted-foreground">
          One five-digit ZIP per line (commas work too). A ZIP+4 is kept as its first five digits.
          {preview.zipCodes.length ? ` ${preview.zipCodes.length} will be kept: ${describeZipCodes(preview.zipCodes)}.` : ""}
        </p>
        {preview.invalid.length ? (
          <p className="text-xs text-amber-600" data-testid="text-zone-zip-invalid">Not a ZIP code and will be refused: {preview.invalid.join(", ")}</p>
        ) : null}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} /> Active (an inactive zone matches nothing, and every rule on it is skipped)</label>
      <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></div>
      <div className="flex justify-between gap-2">
        <div>
          {isEditMode ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => { if (window.confirm(`Delete zone "${zone.name}"? A zone named by an assignment rule is refused - deactivate it instead.`)) deleteMutation.mutate(); }}
              data-testid="button-delete-zone"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Zone"}
            </Button>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending || !form.name.trim() || !preview.zipCodes.length || preview.invalid.length > 0} data-testid="button-save-zone">
            {mutation.isPending ? "Saving..." : isEditMode ? "Save Zone" : "Create Zone"}
          </Button>
        </div>
      </div>
    </form>
  );
}

const RULE_ANY = "ANY";

// Pass 26 (C4.1b): an opportunity assignment rule - four matchers (Any
// matches everything) and one active user (shared/opportunity-assignment.ts).
// Categories and zones are offered inactive ones included and labeled: a
// rule may be edited while its zone is off, and the card says it is skipped.
function OpportunityAssignmentRuleForm({
  rule,
  categories,
  zones,
  users,
  onClose,
}: {
  rule?: OpportunityAssignmentRule | null;
  categories: OpportunityCategory[];
  zones: Zone[];
  users: UserSummary[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const isEditMode = !!rule;
  const [form, setForm] = useState({
    categoryKey: rule?.categoryKey ?? RULE_ANY,
    workType: rule?.workType ?? RULE_ANY,
    zoneId: rule?.zoneId ?? RULE_ANY,
    source: rule?.source ?? RULE_ANY,
    assignedUserId: rule?.assignedUserId ?? "",
    isActive: rule?.isActive ?? true,
  });
  // Active users, plus the rule's current user even when inactive so the
  // form still names them (the card says the rule is skipped until changed).
  const assignees = selectableUsers(users, rule?.assignedUserId);
  const invalidateRules = () => queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/opportunity-assignment-rules") });

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        categoryKey: data.categoryKey === RULE_ANY ? null : data.categoryKey,
        workType: data.workType === RULE_ANY ? null : data.workType,
        zoneId: data.zoneId === RULE_ANY ? null : data.zoneId,
        source: data.source === RULE_ANY ? null : data.source,
        assignedUserId: data.assignedUserId,
        isActive: data.isActive,
      };
      const response = isEditMode
        ? await apiRequest("PATCH", `/api/opportunity-assignment-rules/${rule.id}`, payload)
        : await apiRequest("POST", "/api/opportunity-assignment-rules", payload);
      return response.json();
    },
    onSuccess: () => {
      invalidateRules();
      toast({ title: isEditMode ? "Assignment rule updated" : "Assignment rule created" });
      onClose();
    },
    onError: (err: unknown) => toast({ title: "Rule not saved", description: getApiErrorMessage(err), variant: "destructive" }),
  });
  // A rule that has assigned opportunities cannot be deleted (409
  // RULE_IN_USE): those rows carry it as their history. Deactivate instead.
  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/opportunity-assignment-rules/${rule!.id}`);
    },
    onSuccess: () => {
      invalidateRules();
      toast({ title: "Assignment rule deleted" });
      onClose();
    },
    onError: (err: unknown) => toast({ title: "Rule not deleted", description: getApiErrorMessage(err), variant: "destructive" }),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
      <p className="text-xs text-muted-foreground">
        A rule applies to a new opportunity when every matcher fits; {ANY_MATCHER_LABEL} fits everything. Rules are tried in the order listed on the card and the first match assigns its user.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={form.categoryKey} onValueChange={(value) => setForm((p) => ({ ...p, categoryKey: value }))}>
            <SelectTrigger data-testid="select-rule-category"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={RULE_ANY}>{ANY_MATCHER_LABEL} category</SelectItem>
              {categories.map((category) => <SelectItem key={category.key} value={category.key}>{category.label}{category.isActive ? "" : " (inactive)"}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Work Type</Label>
          <Select value={form.workType} onValueChange={(value) => setForm((p) => ({ ...p, workType: value }))}>
            <SelectTrigger data-testid="select-rule-work-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={RULE_ANY}>{ANY_MATCHER_LABEL} work type</SelectItem>
              {OPPORTUNITY_WORK_TYPES.map((workType) => <SelectItem key={workType} value={workType}>{describeOpportunityWorkType(workType)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Zone</Label>
          <Select value={form.zoneId} onValueChange={(value) => setForm((p) => ({ ...p, zoneId: value }))}>
            <SelectTrigger data-testid="select-rule-zone"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={RULE_ANY}>{ANY_MATCHER_LABEL} zone</SelectItem>
              {zones.map((zone) => <SelectItem key={zone.id} value={zone.id}>{zone.name}{zone.isActive ? "" : " (inactive)"}</SelectItem>)}
            </SelectContent>
          </Select>
          {!zones.length ? <p className="text-xs text-muted-foreground">No zones yet - add one on the Zones card to match by ZIP code.</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label>Source</Label>
          <Select value={form.source} onValueChange={(value) => setForm((p) => ({ ...p, source: value }))}>
            <SelectTrigger data-testid="select-rule-source"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={RULE_ANY}>{ANY_MATCHER_LABEL} source</SelectItem>
              {OPPORTUNITY_SOURCES.map((source) => <SelectItem key={source} value={source}>{describeOpportunitySource(source)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Assign to *</Label>
        <Select value={form.assignedUserId || undefined} onValueChange={(value) => setForm((p) => ({ ...p, assignedUserId: value }))}>
          <SelectTrigger data-testid="select-rule-assignee"><SelectValue placeholder="Choose a user" /></SelectTrigger>
          <SelectContent>
            {assignees.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {userDisplayName(candidate)} ({describeUserRole(candidate.role)}){candidate.status === "active" ? "" : " (inactive)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Sales reps, office reps and managers take follow-up work. A rule naming a user who later goes inactive is skipped, never re-pointed.</p>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} /> Active</label>
      <div className="flex justify-between gap-2">
        <div>
          {isEditMode ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => { if (window.confirm("Delete this assignment rule? A rule that has already assigned opportunities is refused - deactivate it instead.")) deleteMutation.mutate(); }}
              data-testid="button-delete-rule"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Rule"}
            </Button>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending || !form.assignedUserId} data-testid="button-save-rule">
            {mutation.isPending ? "Saving..." : isEditMode ? "Save Rule" : "Create Rule"}
          </Button>
        </div>
      </div>
    </form>
  );
}

export default function Settings() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingServiceType, setEditingServiceType] = useState<ServiceType | null>(null);
  const [technicianDialogOpen, setTechnicianDialogOpen] = useState(false);
  const [editingTechnician, setEditingTechnician] = useState<Technician | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AgreementTemplate | null>(null);
  const [policyDialogOpen, setPolicyDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<AgreementCancellationPolicy | null>(null);
  const [dispositionDialogOpen, setDispositionDialogOpen] = useState(false);
  const [editingDisposition, setEditingDisposition] = useState<OpportunityDisposition | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<OpportunityCategory | null>(null);
  // Pass 26 (C4.1b): zones and assignment rules.
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<OpportunityAssignmentRule | null>(null);
  const [materialDialogOpen, setMaterialDialogOpen] = useState(false);
  const [editingMaterialProduct, setEditingMaterialProduct] = useState<MaterialProduct | null>(null);
  const [targetPestDialogOpen, setTargetPestDialogOpen] = useState(false);
  const [editingTargetPest, setEditingTargetPest] = useState<TargetPest | null>(null);
  const [billingProfileTemplateDialogOpen, setBillingProfileTemplateDialogOpen] = useState(false);
  const [editingBillingProfileTemplate, setEditingBillingProfileTemplate] = useState<BillingProfileTemplate | null>(null);
  const [billingPlanDialogOpen, setBillingPlanDialogOpen] = useState(false);
  const [editingBillingPlan, setEditingBillingPlan] = useState<BillingPlan | null>(null);
  const [taxRateDialogOpen, setTaxRateDialogOpen] = useState(false);
  const [editingTaxRate, setEditingTaxRate] = useState<TaxRate | null>(null);
  const [taxRuleDialogOpen, setTaxRuleDialogOpen] = useState(false);
  const [editingTaxRule, setEditingTaxRule] = useState<TaxRule | null>(null);
  const [appointmentCancelReasonsText, setAppointmentCancelReasonsText] = useState("");
  const [ticketReopenReasonsText, setTicketReopenReasonsText] = useState("");
  // Pass 20 (C3.4a): the material unit list and the application-area list.
  const [materialUnitsText, setMaterialUnitsText] = useState("");
  const [applicationAreasText, setApplicationAreasText] = useState("");
  const { data: serviceTypes, isLoading } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });
  const { data: technicians, isLoading: techniciansLoading } = useQuery<Technician[]>({ queryKey: ["/api/technicians?includeInactive=true"] });
  // Pass 12: the technician rows name their linked user.
  const { data: orgUsers } = useQuery<UserSummary[]>({ queryKey: ["/api/users"] });
  const orgUserById = useMemo(() => new Map((orgUsers ?? []).map((user) => [user.id, user])), [orgUsers]);
  const { data: materialProducts, isLoading: materialProductsLoading } = useQuery<MaterialProduct[]>({ queryKey: ["/api/material-products?includeInactive=true"] });
  const { data: targetPests, isLoading: targetPestsLoading } = useQuery<TargetPest[]>({ queryKey: ["/api/target-pests?includeInactive=true"] });
  const { data: agreementTemplates, isLoading: templatesLoading } = useQuery<AgreementTemplate[]>({ queryKey: ["/api/agreement-templates"] });
  const { data: cancellationPolicies, isLoading: policiesLoading } = useQuery<AgreementCancellationPolicy[]>({ queryKey: ["/api/agreement-cancellation-policies?includeInactive=true"] });
  const { data: opportunityDispositions, isLoading: dispositionsLoading } = useQuery<OpportunityDisposition[]>({ queryKey: ["/api/opportunity-dispositions?includeInactive=true"] });
  const { data: opportunityCategories, isLoading: categoriesLoading } = useQuery<OpportunityCategory[]>({ queryKey: ["/api/opportunity-categories?includeInactive=true"] });
  // Pass 26 (C4.1b): every zone and every rule, inactive ones included, so
  // the cards show what is off and why a rule is skipped
  // (shared/opportunity-assignment.ts describeRuleProblems - the same
  // function the server's resolver reads).
  const { data: zones, isLoading: zonesLoading } = useQuery<Zone[]>({ queryKey: ["/api/zones?includeInactive=true"] });
  const { data: assignmentRules, isLoading: assignmentRulesLoading } = useQuery<OpportunityAssignmentRule[]>({ queryKey: ["/api/opportunity-assignment-rules?includeInactive=true"] });
  const orderedRules = useMemo(() => sortAssignmentRules(assignmentRules ?? []), [assignmentRules]);
  const reorderRulesMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await apiRequest("POST", "/api/opportunity-assignment-rules/reorder", { ids });
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/opportunity-assignment-rules") }),
    onError: (err: unknown) => toast({ title: "Rules not reordered", description: getApiErrorMessage(err), variant: "destructive" }),
  });
  // Move up / Move down: the whole order is sent, so the server can refuse a
  // list that names a rule twice or misses one.
  const moveRule = (index: number, delta: number) => {
    const ids = orderedRules.map((rule) => rule.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    const moved = ids[index];
    ids[index] = ids[target];
    ids[target] = moved;
    reorderRulesMutation.mutate(ids);
  };
  const { data: billingProfileTemplates, isLoading: billingProfileTemplatesLoading } = useQuery<BillingProfileTemplate[]>({ queryKey: ["/api/billing-profile-templates?includeInactive=true"] });
  const { data: billingPlans, isLoading: billingPlansLoading } = useQuery<BillingPlan[]>({ queryKey: ["/api/billing-plans?includeInactive=true"] });
  const { data: taxRates, isLoading: taxRatesLoading } = useQuery<TaxRate[]>({ queryKey: ["/api/tax-rates?includeInactive=true"] });
  const { data: taxRules, isLoading: taxRulesLoading } = useQuery<TaxRule[]>({ queryKey: ["/api/tax-rules?includeInactive=true"] });
  const { data: serviceTimeTracking } = useQuery<{ mode: string }>({ queryKey: ["/api/settings/service-time-tracking"] });
  const { data: appointmentCancelReasons } = useQuery<{ reasons: string[] }>({ queryKey: ["/api/settings/appointment-cancel-reasons"] });
  // D2: PROMPT | AUTO_DRAFT | OFF. The PATCH is MANAGE_SETTINGS (admin), so the
  // select is disabled - not hidden - for everyone else (dev behavior rule 6).
  const { user } = useAuth();
  const canManageSettings = can(user?.role ?? "", PERMISSIONS.MANAGE_SETTINGS);
  const { data: invoiceOnFinalize } = useQuery<{ mode: string }>({ queryKey: ["/api/settings/invoice-on-finalize"] });
  const invoiceOnFinalizeMode = normalizeInvoiceOnFinalizeMode(invoiceOnFinalize?.mode);
  useEffect(() => {
    if (appointmentCancelReasons?.reasons) {
      setAppointmentCancelReasonsText(appointmentCancelReasons.reasons.join("\n"));
    }
  }, [appointmentCancelReasons]);
  // Pass 17 (C3.2): the review modal's reopen pop-up fills its dropdown from
  // this list. Read by anyone; the PATCH is MANAGE_SETTINGS.
  const { data: ticketReopenReasons } = useQuery<{ reasons: string[] }>({ queryKey: ["/api/settings/ticket-reopen-reasons"] });
  useEffect(() => {
    if (ticketReopenReasons?.reasons) {
      setTicketReopenReasonsText(ticketReopenReasons.reasons.join("\n"));
    }
  }, [ticketReopenReasons]);
  // Pass 20 (C3.4a): the unit list (the ticket's Unit dropdown, the product
  // form's Default Unit) and the area list (products' Allowed Areas, and a
  // material line's areas when its product names none). Read by anyone; the
  // PATCH is MANAGE_SETTINGS.
  const { data: materialUnits } = useQuery<{ units: string[] }>({ queryKey: ["/api/settings/material-units"] });
  const { data: applicationAreas } = useQuery<{ areas: string[] }>({ queryKey: ["/api/settings/application-areas"] });
  useEffect(() => {
    if (materialUnits?.units) setMaterialUnitsText(materialUnits.units.join("\n"));
  }, [materialUnits]);
  useEffect(() => {
    if (applicationAreas?.areas) setApplicationAreasText(applicationAreas.areas.join("\n"));
  }, [applicationAreas]);
  const updateServiceTimeTrackingMutation = useMutation({
    mutationFn: async (mode: string) => {
      const response = await apiRequest("PATCH", "/api/settings/service-time-tracking", { mode });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/service-time-tracking"] });
      toast({ title: "Service time tracking updated" });
    },
    onError: (error: Error) => toast({ title: "Unable to update time tracking", description: error.message, variant: "destructive" }),
  });
  const updateInvoiceOnFinalizeMutation = useMutation({
    mutationFn: async (mode: InvoiceOnFinalizeMode) => {
      const response = await apiRequest("PATCH", "/api/settings/invoice-on-finalize", { mode });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/invoice-on-finalize"] });
      toast({ title: "Invoicing on finalization updated" });
    },
    onError: (error: Error) => toast({ title: "Unable to update invoicing on finalization", description: error.message, variant: "destructive" }),
  });
  // Pass 22 (C3.5; B11): "Attach service report to visit invoices". Read by
  // anyone; the PATCH is MANAGE_SETTINGS, so the switch is disabled - not
  // hidden - for everyone else (dev behavior rule 6).
  const { data: attachServiceReport } = useQuery<{ enabled: boolean }>({ queryKey: ["/api/settings/attach-service-report"] });
  const attachServiceReportEnabled = attachServiceReport?.enabled ?? false;
  const updateAttachServiceReportMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await apiRequest("PATCH", "/api/settings/attach-service-report", { enabled });
      return (await response.json()) as { enabled: boolean };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/attach-service-report"] });
      toast({
        title: data.enabled ? "Service reports will be attached to visit invoices" : "Service reports will no longer be attached to visit invoices",
        description: "Applies to invoice PDFs rendered from now on. A PDF already rendered keeps what it rendered.",
      });
    },
    onError: (error: Error) => toast({ title: "Unable to update the service report setting", description: error.message, variant: "destructive" }),
  });
  // Pass 31 (C4.5): Settings -> Dispatch Board - the view interval, the snap
  // interval and the default visible hours (shared/dispatch-board.ts). Read
  // by anyone (the board seeds its window from it); the PATCH is
  // MANAGE_SETTINGS, so the selects are disabled - not hidden - for everyone
  // else (dev behavior rule 6). Each select saves at once; a change that
  // would break a cross-field rule carries the other value along (a start at
  // or past the end moves the end to the next hour; a view finer than the
  // snap brings the snap down to it), and the server refuses anything else
  // with a 400 that the toast shows.
  const { data: dispatchBoardData } = useQuery<DispatchBoardSettings>({ queryKey: ["/api/settings/dispatch-board"] });
  const dispatchBoard = dispatchBoardData ?? DEFAULT_DISPATCH_BOARD_SETTINGS;
  const updateDispatchBoardMutation = useMutation({
    mutationFn: async (patch: Partial<DispatchBoardSettings>) => {
      const response = await apiRequest("PATCH", "/api/settings/dispatch-board", patch);
      return (await response.json()) as DispatchBoardSettings;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/dispatch-board"] });
      toast({
        title: "Dispatch board settings updated",
        description: `${describeViewInterval(data.viewIntervalMinutes).summary}, ${describeSnapInterval(data.snapMinutes)} snap, ${formatHourOfDay(data.defaultStartHour)} - ${formatHourOfDay(data.defaultEndHour)}. The board reads these on its next load.`,
      });
    },
    onError: (error: Error) => toast({ title: "Unable to update the dispatch board settings", description: getApiErrorMessage(error), variant: "destructive" }),
  });
  const updateAppointmentCancelReasonsMutation = useMutation({
    mutationFn: async () => {
      const reasons = appointmentCancelReasonsText
        .split(/\r?\n/)
        .map((reason) => reason.trim())
        .filter(Boolean);
      const response = await apiRequest("PATCH", "/api/settings/appointment-cancel-reasons", { reasons });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/appointment-cancel-reasons"] });
      toast({ title: "Appointment reasons updated" });
    },
    onError: (error: Error) => toast({ title: "Unable to update appointment reasons", description: error.message, variant: "destructive" }),
  });
  const updateTicketReopenReasonsMutation = useMutation({
    mutationFn: async () => {
      const reasons = ticketReopenReasonsText
        .split(/\r?\n/)
        .map((reason) => reason.trim())
        .filter(Boolean);
      const response = await apiRequest("PATCH", "/api/settings/ticket-reopen-reasons", { reasons });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ticket-reopen-reasons"] });
      toast({ title: "Ticket reopen reasons updated" });
    },
    onError: (error: Error) => toast({ title: "Unable to update ticket reopen reasons", description: error.message, variant: "destructive" }),
  });
  const updateMaterialUnitsMutation = useMutation({
    mutationFn: async () => {
      const units = materialUnitsText.split(/\r?\n/).map((unit) => unit.trim()).filter(Boolean);
      const response = await apiRequest("PATCH", "/api/settings/material-units", { units });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/material-units"] });
      toast({ title: "Material units updated" });
    },
    onError: (error: Error) => toast({ title: "Unable to update material units", description: error.message, variant: "destructive" }),
  });
  const updateApplicationAreasMutation = useMutation({
    mutationFn: async () => {
      const areas = applicationAreasText.split(/\r?\n/).map((area) => area.trim()).filter(Boolean);
      const response = await apiRequest("PATCH", "/api/settings/application-areas", { areas });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/application-areas"] });
      toast({ title: "Application areas updated" });
    },
    onError: (error: Error) => toast({ title: "Unable to update application areas", description: error.message, variant: "destructive" }),
  });

  const openCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateDialogOpen(true);
  };

  const openEditTemplate = (template: AgreementTemplate) => {
    setEditingTemplate(template);
    setTemplateDialogOpen(true);
  };

  const closeTechnicianDialog = (open: boolean) => {
    setTechnicianDialogOpen(open);
    if (!open) setEditingTechnician(null);
  };

  const closeTemplateDialog = (open: boolean) => {
    setTemplateDialogOpen(open);
    if (!open) {
      setEditingTemplate(null);
    }
  };

  const closePolicyDialog = (open: boolean) => {
    setPolicyDialogOpen(open);
    if (!open) {
      setEditingPolicy(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Settings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Configure your PestFlow CRM</p>
      </div>

      <OrganizationBrandingCard />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><Wrench className="h-4 w-4" /> Service Types</CardTitle>
          {/* Pass 24 (C3.7): the type routes' writes are MANAGE_SETTINGS (admin) since this pass - a type's work
              kind decides what every service made from it credits and bills. Everyone else reads the list. */}
          {canManageSettings ? (
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingServiceType(null); }}>
              <DialogTrigger asChild><Button size="sm" data-testid="button-add-service-type" onClick={() => setEditingServiceType(null)}><Plus className="h-3 w-3 mr-1" /> Add Type</Button></DialogTrigger>
              <DialogContent><DialogHeader><DialogTitle>{editingServiceType ? "Edit Service Type" : "New Service Type"}</DialogTitle></DialogHeader><ServiceTypeForm serviceType={editingServiceType} onClose={() => { setDialogOpen(false); setEditingServiceType(null); }} /></DialogContent>
            </Dialog>
          ) : (
            <p className="text-xs text-muted-foreground" data-testid="text-service-types-admin-only">Admins manage service types.</p>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : !serviceTypes || serviceTypes.length === 0 ? (
            <div className="text-center py-8">
              <Wrench className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No service types configured</p>
              {canManageSettings ? <Button variant="outline" size="sm" className="mt-3" onClick={() => setDialogOpen(true)}>Add Service Type</Button> : null}
            </div>
          ) : (
            <div className="space-y-2">
              {serviceTypes.map((st) => (
                <div key={st.id} className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/50" data-testid={`card-service-type-${st.id}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{st.name}</span>
                      {st.category && <Badge variant="outline" className="text-xs">{st.category}</Badge>}
                      <ServiceWorkKindBadge workKind={st.workKind} className="text-xs" />
                      {st.opportunityLeadDays ? <Badge variant="secondary" className="text-xs">{st.opportunityLeadDays}d opportunity</Badge> : null}
                    </div>
                    {st.description && <p className="text-xs text-muted-foreground mt-0.5">{st.description}</p>}
                    {st.opportunityLabel && <p className="text-xs text-muted-foreground mt-0.5">Opportunity: {st.opportunityLabel}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-sm">
                    {st.defaultPriceCents != null && <span className="font-semibold">{formatCents(st.defaultPriceCents)}</span>}
                    {st.estimatedDuration && <span className="text-xs text-muted-foreground">{st.estimatedDuration} min</span>}
                    <Button variant="outline" size="sm" onClick={() => { setEditingServiceType(st); setDialogOpen(true); }} disabled={!canManageSettings} title={canManageSettings ? undefined : "Admins manage service types"}>
                      Edit
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><Bug className="h-4 w-4" /> Target Pests</CardTitle>
          <Dialog open={targetPestDialogOpen} onOpenChange={(open) => { setTargetPestDialogOpen(open); if (!open) setEditingTargetPest(null); }}>
            <DialogTrigger asChild><Button size="sm" onClick={() => setEditingTargetPest(null)}><Plus className="h-3 w-3 mr-1" /> Add Pest</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingTargetPest ? "Edit Target Pest" : "New Target Pest"}</DialogTitle></DialogHeader>
              <TargetPestForm pest={editingTargetPest} onClose={() => { setTargetPestDialogOpen(false); setEditingTargetPest(null); }} />
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {targetPestsLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : !targetPests?.length ? (
            <div className="text-center py-8">
              <Bug className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No target pests configured</p>
            </div>
          ) : (
            <div className="space-y-2">
              {targetPests.map((pest) => (
                <div key={pest.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{pest.label}</span>
                      <Badge variant={pest.isActive ? "secondary" : "outline"}>{pest.isActive ? "Active" : "Inactive"}</Badge>
                      {pest.isFavorite ? <Badge variant="outline">Favorite</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">Sort: {pest.sortOrder}{pest.notes ? ` | ${pest.notes}` : ""}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { setEditingTargetPest(pest); setTargetPestDialogOpen(true); }}>Edit</Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><CreditCard className="h-4 w-4" /> Billing Profile Templates</CardTitle>
          <Dialog open={billingProfileTemplateDialogOpen} onOpenChange={(open) => { setBillingProfileTemplateDialogOpen(open); if (!open) setEditingBillingProfileTemplate(null); }}>
            <DialogTrigger asChild><Button size="sm" onClick={() => setEditingBillingProfileTemplate(null)}><Plus className="h-3 w-3 mr-1" /> Add Template</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingBillingProfileTemplate ? "Edit Billing Profile Template" : "New Billing Profile Template"}</DialogTitle></DialogHeader>
              <BillingProfileTemplateForm template={editingBillingProfileTemplate} onClose={() => { setBillingProfileTemplateDialogOpen(false); setEditingBillingProfileTemplate(null); }} />
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {billingProfileTemplatesLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : !billingProfileTemplates?.length ? (
            <div className="text-center py-8">
              <CreditCard className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No billing profile templates configured</p>
            </div>
          ) : (
            <div className="space-y-2">
              {billingProfileTemplates.map((template) => (
                <div key={template.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{template.name}</span>
                      <Badge variant="outline">{template.billingType.replace(/_/g, " ")}</Badge>
                      <Badge variant={template.isActive ? "secondary" : "outline"}>{template.isActive ? "Active" : "Inactive"}</Badge>
                    </div>
                    {template.description && <p className="mt-0.5 text-xs text-muted-foreground">{template.description}</p>}
                    {template.defaultInvoiceTerms && <p className="mt-0.5 text-xs text-muted-foreground">Terms: {template.defaultInvoiceTerms.replace(/_/g, " ")}</p>}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { setEditingBillingProfileTemplate(template); setBillingProfileTemplateDialogOpen(true); }}>Edit</Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Billing Plans</CardTitle>
          <Dialog open={billingPlanDialogOpen} onOpenChange={(open) => { setBillingPlanDialogOpen(open); if (!open) setEditingBillingPlan(null); }}>
            <DialogTrigger asChild><Button size="sm" onClick={() => setEditingBillingPlan(null)}><Plus className="h-3 w-3 mr-1" /> Add Plan</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingBillingPlan ? "Edit Billing Plan" : "New Billing Plan"}</DialogTitle></DialogHeader>
              <BillingPlanForm plan={editingBillingPlan} onClose={() => { setBillingPlanDialogOpen(false); setEditingBillingPlan(null); }} />
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {billingPlansLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : !billingPlans?.length ? (
            <div className="text-center py-8">
              <CalendarClock className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No billing plans configured</p>
            </div>
          ) : (
            <div className="space-y-2">
              {billingPlans.map((plan) => (
                <div key={plan.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{plan.name}</span>
                      <Badge variant="outline">{plan.billingMode.replace(/_/g, " ")}</Badge>
                      {plan.billingMode === "RECURRING_INTERVAL" && plan.intervalUnit && (
                        <Badge variant="outline">Every {plan.intervalCount ?? 1} {plan.intervalUnit.toLowerCase()}{(plan.intervalCount ?? 1) === 1 ? "" : "s"}</Badge>
                      )}
                      <Badge variant={plan.isActive ? "secondary" : "outline"}>{plan.isActive ? "Active" : "Inactive"}</Badge>
                    </div>
                    {plan.description && <p className="mt-0.5 text-xs text-muted-foreground">{plan.description}</p>}
                    {plan.initialChargeCoversFirstPeriod && (
                      <p className="mt-0.5 text-xs text-muted-foreground">An agreement's initial charge covers its first period</p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { setEditingBillingPlan(plan); setBillingPlanDialogOpen(true); }}>Edit</Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><Percent className="h-4 w-4" /> Tax Rates</CardTitle>
          <Dialog open={taxRateDialogOpen} onOpenChange={(open) => { setTaxRateDialogOpen(open); if (!open) setEditingTaxRate(null); }}>
            <DialogTrigger asChild><Button size="sm" onClick={() => setEditingTaxRate(null)}><Plus className="h-3 w-3 mr-1" /> Add Rate</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingTaxRate ? "Edit Tax Rate" : "New Tax Rate"}</DialogTitle></DialogHeader>
              <TaxRateForm rate={editingTaxRate} onClose={() => { setTaxRateDialogOpen(false); setEditingTaxRate(null); }} />
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {taxRatesLoading ? (
            <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : !taxRates?.length ? (
            <div className="text-center py-8">
              <Percent className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No tax rates configured</p>
            </div>
          ) : (
            <div className="space-y-2">
              {taxRates.map((rate) => (
                <div key={rate.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{rate.name}</span>
                      <Badge variant="outline">{(rate.rateBasisPoints / 100).toFixed(2)}%</Badge>
                      {rate.isDefault && <Badge variant="secondary">Default</Badge>}
                      <Badge variant={rate.isActive ? "secondary" : "outline"}>{rate.isActive ? "Active" : "Inactive"}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {rate.jurisdiction ? `${rate.jurisdiction} • ` : ""}Effective {rate.effectiveFrom}{rate.effectiveTo ? ` – ${rate.effectiveTo}` : ""}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { setEditingTaxRate(rate); setTaxRateDialogOpen(true); }}>Edit</Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><Scale className="h-4 w-4" /> Tax Rules</CardTitle>
          <Dialog open={taxRuleDialogOpen} onOpenChange={(open) => { setTaxRuleDialogOpen(open); if (!open) setEditingTaxRule(null); }}>
            <DialogTrigger asChild><Button size="sm" onClick={() => setEditingTaxRule(null)}><Plus className="h-3 w-3 mr-1" /> Add Rule</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingTaxRule ? "Edit Tax Rule" : "New Tax Rule"}</DialogTitle></DialogHeader>
              <TaxRuleForm rule={editingTaxRule} onClose={() => { setTaxRuleDialogOpen(false); setEditingTaxRule(null); }} />
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {taxRulesLoading ? (
            <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : !taxRules?.length ? (
            <div className="text-center py-8">
              <Scale className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No tax rules configured - defaults to taxable</p>
            </div>
          ) : (
            <div className="space-y-2">
              {taxRules.map((rule) => (
                <div key={rule.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        {serviceTypes?.find((st) => st.id === rule.serviceTypeId)?.name ?? "Any service type"}
                        {rule.locationType ? ` • ${rule.locationType}` : " • Any location type"}
                      </span>
                      <Badge variant={rule.taxable ? "secondary" : "outline"}>{rule.taxable ? "Taxable" : "Exempt"}</Badge>
                      <Badge variant={rule.isActive ? "secondary" : "outline"}>{rule.isActive ? "Active" : "Inactive"}</Badge>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { setEditingTaxRule(rule); setTaxRuleDialogOpen(true); }}>Edit</Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2"><Receipt className="h-4 w-4" /> Invoicing on Finalization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-md space-y-2">
            <Label>When the last ticket on a visit is finalized</Label>
            <Select
              value={invoiceOnFinalizeMode}
              onValueChange={(mode) => updateInvoiceOnFinalizeMutation.mutate(mode as InvoiceOnFinalizeMode)}
              disabled={!canManageSettings || updateInvoiceOnFinalizeMutation.isPending}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INVOICE_ON_FINALIZE_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>{describeInvoiceOnFinalizeMode(mode).label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">{describeInvoiceOnFinalizeMode(invoiceOnFinalizeMode).description}</p>
          <p className="text-xs text-muted-foreground">
            Visit invoices only. Agreements billed on a schedule are invoiced by the nightly billing run regardless, and their services appear on the visit invoice at $0. "Send" marks the invoice sent - there is no email delivery yet.
          </p>
          {!canManageSettings ? <p className="text-xs text-muted-foreground">Only an admin can change this setting.</p> : null}
        </CardContent>
      </Card>

      {/* Pass 22 (C3.5; B11): the service report and its one setting. The
          invoice and the report stay separate documents; this switch appends
          the report(s) to a visit-anchored invoice's PDF. The PATCH is
          MANAGE_SETTINGS, so the switch is disabled - not hidden - for
          everyone else (dev behavior rule 6). */}
      <Card data-testid="card-service-report">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> Service Report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Switch
              id="attach-service-report"
              checked={attachServiceReportEnabled}
              onCheckedChange={(enabled) => updateAttachServiceReportMutation.mutate(enabled)}
              disabled={!canManageSettings || updateAttachServiceReportMutation.isPending}
              data-testid="switch-attach-service-report"
            />
            <Label htmlFor="attach-service-report">Attach service report to visit invoices</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            The service report is the customer-facing summary of a posted ticket - technician and license, service date, target pests, materials, notes, recommendations and a signature line - opened from Service Ticket Review and the location's Services tab. When this is on, a visit invoice's PDF ends with the report of each ticket on the visit. An invoice with no visit (an agreement billed on a schedule, a fee or adjustment) appends nothing. Both documents stay separately openable.
          </p>
          <p className="text-xs text-muted-foreground">
            An invoice PDF is rendered once, on its first Open, Download or Mark Sent, and keeps what it rendered: changing this affects invoice PDFs rendered from now on, not those already produced.
          </p>
          {!canManageSettings ? <p className="text-xs text-muted-foreground">Only an admin can change this setting.</p> : null}
        </CardContent>
      </Card>

      {/* Pass 20 (C3.4a): the two vocabularies behind a material row. The
          unit list fills the ticket's Unit dropdown and the product form's
          Default Unit; the area list fills products' Allowed Areas and a
          material line's areas when its product names none. A value already
          on a product or a ticket that a list does not name is kept and shown
          marked, never dropped. The PATCH is MANAGE_SETTINGS, so the editors
          are disabled - not hidden - for everyone else (dev behavior rule 6). */}
      <Card data-testid="card-material-units">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2"><Scale className="h-4 w-4" /> Material Units</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-xl space-y-2">
            <Label>Units</Label>
            <Textarea
              value={materialUnitsText}
              onChange={(event) => setMaterialUnitsText(event.target.value)}
              rows={6}
              placeholder={"oz\nfl oz\ngal\nlb\neach"}
              disabled={!canManageSettings}
              data-testid="textarea-material-units"
            />
            <p className="text-xs text-muted-foreground">
              One unit per line. Technicians pick a material's unit from this list on the ticket, and a product's default unit comes from it. A unit already recorded on a ticket or a product that is not on this list stays as written and is shown marked; a spelling that differs only in case is saved as it is written here.
            </p>
            {!canManageSettings ? <p className="text-xs text-muted-foreground">Only an admin can change this list.</p> : null}
          </div>
          <Button
            type="button"
            onClick={() => updateMaterialUnitsMutation.mutate()}
            disabled={!canManageSettings || updateMaterialUnitsMutation.isPending || !materialUnitsText.trim()}
            data-testid="button-save-material-units"
          >
            {updateMaterialUnitsMutation.isPending ? "Saving..." : "Save Units"}
          </Button>
        </CardContent>
      </Card>

      <Card data-testid="card-application-areas">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2"><SettingsIcon className="h-4 w-4" /> Application Areas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-xl space-y-2">
            <Label>Areas</Label>
            <Textarea
              value={applicationAreasText}
              onChange={(event) => setApplicationAreasText(event.target.value)}
              rows={8}
              placeholder={"Exterior Perimeter\nInterior Baseboards\nGarage\nAttic"}
              disabled={!canManageSettings}
              data-testid="textarea-application-areas"
            />
            <p className="text-xs text-muted-foreground">
              One area per line. A material product's allowed areas are picked from this list, and a technician picks a material's areas from the product's allowed areas (this whole list when the product has none). Areas serviced on a ticket are derived from what was picked. An area already recorded that is not on this list stays as written and is shown marked.
            </p>
            {!canManageSettings ? <p className="text-xs text-muted-foreground">Only an admin can change this list.</p> : null}
          </div>
          <Button
            type="button"
            onClick={() => updateApplicationAreasMutation.mutate()}
            disabled={!canManageSettings || updateApplicationAreasMutation.isPending || !applicationAreasText.trim()}
            data-testid="button-save-application-areas"
          >
            {updateApplicationAreasMutation.isPending ? "Saving..." : "Save Areas"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Material Products</CardTitle>
          <Dialog open={materialDialogOpen} onOpenChange={(open) => { setMaterialDialogOpen(open); if (!open) setEditingMaterialProduct(null); }}>
            <DialogTrigger asChild><Button size="sm" onClick={() => setEditingMaterialProduct(null)}><Plus className="h-3 w-3 mr-1" /> Add Product</Button></DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader><DialogTitle>{editingMaterialProduct ? "Edit Material Product" : "New Material Product"}</DialogTitle></DialogHeader>
              <MaterialProductForm product={editingMaterialProduct} onClose={() => { setMaterialDialogOpen(false); setEditingMaterialProduct(null); }} units={materialUnits?.units ?? []} areas={applicationAreas?.areas ?? []} />
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {materialProductsLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : !materialProducts?.length ? (
            <div className="text-center py-8">
              <FlaskConical className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No material products configured</p>
            </div>
          ) : (
            <div className="space-y-2">
              {materialProducts.map((product) => (
                <div key={product.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{product.name}</span>
                      <Badge variant={product.isActive ? "secondary" : "outline"}>{product.isActive ? "Active" : "Inactive"}</Badge>
                      {product.restrictedUse ? <Badge variant="outline">Restricted</Badge> : null}
                      {product.epaRegNumber ? <Badge variant="outline">EPA {product.epaRegNumber}</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {product.manufacturer || "No manufacturer"} | AI {product.activeIngredientPercent ?? "not set"}% | Default unit: {product.defaultUnit || "not set"} | Default area: {product.defaultApplicationArea || "not set"}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { setEditingMaterialProduct(product); setMaterialDialogOpen(true); }}>Edit</Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-opportunity-categories">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><SettingsIcon className="h-4 w-4" /> Opportunity Categories</CardTitle>
          <Dialog open={categoryDialogOpen} onOpenChange={(open) => { setCategoryDialogOpen(open); if (!open) setEditingCategory(null); }}>
            <DialogContent>
              <DialogHeader><DialogTitle>Edit Opportunity Category</DialogTitle></DialogHeader>
              {editingCategory ? <OpportunityCategoryForm category={editingCategory} onClose={() => { setCategoryDialogOpen(false); setEditingCategory(null); }} /> : null}
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            The reason an opportunity exists, stamped from its source and changeable by hand on the Opportunities screen. Five fixed categories: edit the label, order and active flag; keys cannot be added or deleted.
          </p>
          {categoriesLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : !opportunityCategories?.length ? (
            <div className="text-center py-8">
              <SettingsIcon className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No opportunity categories seeded - restart the server to run the bootstrap</p>
            </div>
          ) : (
            <div className="space-y-2">
              {opportunityCategories.map((category) => (
                <div key={category.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-3" data-testid={`row-opportunity-category-${category.key}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{category.label}</span>
                      <Badge variant={category.isActive ? "secondary" : "outline"} className="text-xs">{category.isActive ? "Active" : "Inactive"}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">Key: {category.key} | Sort: {category.sortOrder}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { setEditingCategory(category); setCategoryDialogOpen(true); }}>
                    Edit
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pass 26 (C4.1b): zones - named ZIP-code lists the assignment rules
          match on. Writes are MANAGE_SETTINGS (admin); everyone else reads. */}
      <Card data-testid="card-zones">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><MapPin className="h-4 w-4" /> Zones</CardTitle>
          {canManageSettings ? (
            <Dialog open={zoneDialogOpen} onOpenChange={(open) => { setZoneDialogOpen(open); if (!open) setEditingZone(null); }}>
              <DialogTrigger asChild><Button size="sm" data-testid="button-add-zone" onClick={() => setEditingZone(null)}><Plus className="h-3 w-3 mr-1" /> Add Zone</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingZone ? "Edit Zone" : "New Zone"}</DialogTitle></DialogHeader>
                <ZoneForm zone={editingZone} onClose={() => { setZoneDialogOpen(false); setEditingZone(null); }} />
              </DialogContent>
            </Dialog>
          ) : (
            <p className="text-xs text-muted-foreground" data-testid="text-zones-admin-only">Admins manage zones.</p>
          )}
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Named ZIP-code lists. The assignment rules below can match on a zone; dispatch and Smart Schedule will read the same zones later.
          </p>
          {zonesLoading ? (
            <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : !zones?.length ? (
            <div className="text-center py-8">
              <MapPin className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No zones yet. Add one to route opportunities by ZIP code.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {zones.map((zone) => (
                <div key={zone.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-3" data-testid={`row-zone-${zone.id}`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{zone.name}</span>
                      <Badge variant={zone.isActive ? "secondary" : "outline"} className="text-xs">{zone.isActive ? "Active" : "Inactive"}</Badge>
                      <Badge variant="outline" className="text-xs">{(zone.zipCodes ?? []).length} ZIP code{(zone.zipCodes ?? []).length === 1 ? "" : "s"}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{describeZipCodes(zone.zipCodes)}{zone.notes ? ` | ${zone.notes}` : ""}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { setEditingZone(zone); setZoneDialogOpen(true); }} disabled={!canManageSettings} title={canManageSettings ? undefined : "Admins manage zones"}>
                    Edit
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pass 26 (C4.1b): the assignment rules, listed in the order they are
          tried. A rule with a problem (inactive user or zone) is skipped by
          the server and says so here, through the same shared function. */}
      <Card data-testid="card-opportunity-assignment">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><UserCheck className="h-4 w-4" /> Opportunity Assignment</CardTitle>
          {canManageSettings ? (
            <Dialog open={ruleDialogOpen} onOpenChange={(open) => { setRuleDialogOpen(open); if (!open) setEditingRule(null); }}>
              <DialogTrigger asChild><Button size="sm" data-testid="button-add-assignment-rule" onClick={() => setEditingRule(null)}><Plus className="h-3 w-3 mr-1" /> Add Rule</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingRule ? "Edit Assignment Rule" : "New Assignment Rule"}</DialogTitle></DialogHeader>
                <OpportunityAssignmentRuleForm
                  rule={editingRule}
                  categories={opportunityCategories ?? []}
                  zones={zones ?? []}
                  users={orgUsers ?? []}
                  onClose={() => { setRuleDialogOpen(false); setEditingRule(null); }}
                />
              </DialogContent>
            </Dialog>
          ) : (
            <p className="text-xs text-muted-foreground" data-testid="text-assignment-admin-only">Admins manage assignment rules.</p>
          )}
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Tried in order when an opportunity is created: the first rule whose matchers all fit assigns its user, and no match leaves the opportunity unassigned. A manual reassignment on the Opportunities screen overrides a rule's, and is logged as one.
          </p>
          {assignmentRulesLoading ? (
            <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : !orderedRules.length ? (
            <div className="text-center py-8">
              <UserCheck className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No assignment rules. New opportunities stay unassigned until one exists.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {orderedRules.map((rule, index) => {
                const assignee = orgUserById.get(rule.assignedUserId);
                const problems = describeRuleProblems(rule, zones ?? [], orgUsers ?? []);
                return (
                  <div key={rule.id} className="flex items-start justify-between gap-3 rounded-md bg-muted/50 p-3" data-testid={`row-assignment-rule-${rule.id}`}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">#{index + 1}</span>
                        <span className="text-sm">{describeRuleMatchers(rule, { categories: opportunityCategories, zones })}</span>
                        <span className="text-sm font-medium">-&gt; {assignee ? userDisplayName(assignee) : "Unknown user"}</span>
                        <Badge variant={rule.isActive ? "secondary" : "outline"} className="text-xs">{rule.isActive ? "Active" : "Inactive"}</Badge>
                      </div>
                      {problems.map((problem) => (
                        <p key={problem.code} className="mt-1 flex items-start gap-1 text-xs text-amber-600" data-testid={`text-rule-problem-${rule.id}-${problem.code}`}>
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {problem.message}
                        </p>
                      ))}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" variant="ghost" size="sm" title="Move up" disabled={!canManageSettings || index === 0 || reorderRulesMutation.isPending} onClick={() => moveRule(index, -1)} data-testid={`button-rule-up-${rule.id}`}>
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" title="Move down" disabled={!canManageSettings || index === orderedRules.length - 1 || reorderRulesMutation.isPending} onClick={() => moveRule(index, 1)} data-testid={`button-rule-down-${rule.id}`}>
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { setEditingRule(rule); setRuleDialogOpen(true); }} disabled={!canManageSettings} title={canManageSettings ? undefined : "Admins manage assignment rules"}>
                        Edit
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><SettingsIcon className="h-4 w-4" /> Opportunity Dispositions</CardTitle>
          <Dialog open={dispositionDialogOpen} onOpenChange={(open) => { setDispositionDialogOpen(open); if (!open) setEditingDisposition(null); }}>
            <DialogTrigger asChild><Button size="sm" onClick={() => setEditingDisposition(null)}><Plus className="h-3 w-3 mr-1" /> Add Disposition</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingDisposition ? "Edit Opportunity Disposition" : "New Opportunity Disposition"}</DialogTitle></DialogHeader>
              <OpportunityDispositionForm disposition={editingDisposition} onClose={() => { setDispositionDialogOpen(false); setEditingDisposition(null); }} />
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {dispositionsLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : !opportunityDispositions?.length ? (
            <div className="text-center py-8">
              <SettingsIcon className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No opportunity dispositions configured</p>
            </div>
          ) : (
            <div className="space-y-2">
              {opportunityDispositions.map((disposition) => (
                <div key={disposition.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{disposition.label}</span>
                      <Badge variant={disposition.isActive ? "secondary" : "outline"} className="text-xs">{disposition.isActive ? "Active" : "Inactive"}</Badge>
                      <Badge variant="outline" className="text-xs">{disposition.resultingStatus}</Badge>
                      {disposition.isTerminal ? <Badge variant="outline" className="text-xs">Terminal</Badge> : null}
                      {disposition.isDoNotContact ? <Badge variant="outline" className="text-xs">DND</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Key: {disposition.key} | Callback: {disposition.defaultCallbackDays ?? "None"} day(s) | Sort: {disposition.sortOrder}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { setEditingDisposition(disposition); setDispositionDialogOpen(true); }}>
                    Edit
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><Users className="h-4 w-4" /> Technicians</CardTitle>
          <Dialog open={technicianDialogOpen} onOpenChange={closeTechnicianDialog}>
            <DialogTrigger asChild><Button size="sm" onClick={() => setEditingTechnician(null)}><Plus className="h-3 w-3 mr-1" /> Add Technician</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingTechnician ? "Edit Technician" : "New Technician"}</DialogTitle></DialogHeader>
              <TechnicianForm technician={editingTechnician} onClose={() => closeTechnicianDialog(false)} />
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {techniciansLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : !technicians || technicians.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No technicians configured</p>
            </div>
          ) : (
            <div className="space-y-2">
              {technicians.map((technician) => (
                <div key={technician.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{technician.displayName}</span>
                      <Badge variant={technician.status === "ACTIVE" ? "secondary" : "outline"} className={`text-xs ${technician.status === "ACTIVE" ? "bg-primary/10 text-primary" : ""}`}>{technician.status}</Badge>
                      <Badge variant="outline" className="text-xs">{technician.licenseId}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {technician.email || "No email"} {technician.phone ? `| ${technician.phone}` : ""}
                      {" | "}
                      {technician.userId ? `Linked to ${userDisplayName(orgUserById.get(technician.userId)) || "unknown user"}` : "No linked user"}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { setEditingTechnician(technician); setTechnicianDialogOpen(true); }}>
                    Edit
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Agreement Cancellation Policies</CardTitle>
          <Dialog open={policyDialogOpen} onOpenChange={closePolicyDialog}>
            <DialogTrigger asChild><Button size="sm" onClick={() => { setEditingPolicy(null); setPolicyDialogOpen(true); }}><Plus className="h-3 w-3 mr-1" /> Add Policy</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>{editingPolicy ? "Edit Cancellation Policy" : "New Cancellation Policy"}</DialogTitle></DialogHeader>
              <AgreementCancellationPolicyForm policy={editingPolicy} onClose={() => closePolicyDialog(false)} />
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {policiesLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : !cancellationPolicies?.length ? (
            <div className="text-center py-8">
              <ShieldCheck className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No cancellation policies configured</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cancellationPolicies.map((policy) => (
                <div key={policy.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{policy.name}</p>
                      <Badge variant={policy.isActive ? "default" : "secondary"}>{policy.isActive ? "Active" : "Inactive"}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatCancellationFee(policy)} - {policy.noticeDays} day notice - {policy.effectiveDateMode.replaceAll("_", " ").toLowerCase()}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { setEditingPolicy(policy); setPolicyDialogOpen(true); }}>Edit</Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> Agreement Templates</CardTitle>
          <Dialog open={templateDialogOpen} onOpenChange={closeTemplateDialog}>
            <DialogTrigger asChild><Button size="sm" data-testid="button-add-agreement-template" onClick={openCreateTemplate}><Plus className="h-3 w-3 mr-1" /> Add Template</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>{editingTemplate ? "Edit Agreement Template" : "New Agreement Template"}</DialogTitle></DialogHeader>
              <AgreementTemplateForm serviceTypes={serviceTypes} cancellationPolicies={cancellationPolicies} billingPlans={billingPlans} template={editingTemplate} onClose={() => closeTemplateDialog(false)} />
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {templatesLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : !agreementTemplates || agreementTemplates.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No agreement templates configured</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={openCreateTemplate}>Add Agreement Template</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {agreementTemplates
                .sort((a, b) => {
                  const sortA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
                  const sortB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
                  if (sortA !== sortB) return sortA - sortB;
                  return a.name.localeCompare(b.name);
                })
                .map((template) => {
                  const serviceType = serviceTypes?.find((serviceType) => serviceType.id === template.defaultServiceTypeId);
                  const cancellationPolicy = cancellationPolicies?.find((policy) => policy.id === template.cancellationPolicyId);
                  const billingPlan = billingPlans?.find((plan) => plan.id === template.billingPlanId);
                  const initialChargeSummary = describeInitialCharge(initialChargeFromTemplate(template), template.defaultPriceCents);
                  return (
                    <div key={template.id} className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/50" data-testid={`card-agreement-template-${template.id}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{template.name}</span>
                          <Badge variant="secondary" className={`text-xs ${template.isActive ? "bg-primary/10 text-primary" : ""}`}>{template.isActive ? "Active" : "Inactive"}</Badge>
                          {template.internalCode && <Badge variant="outline" className="text-xs">{template.internalCode}</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatTemplateRecurrence(template)} | {formatTemplateTerm(template)} | {template.defaultSchedulingMode || "MANUAL"} | {billingPlan?.name || "No billing plan"} | {serviceType?.name || "No service type"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Cancellation: {cancellationPolicy ? `${cancellationPolicy.name} (${formatCancellationFee(cancellationPolicy)})` : "No policy assigned"}
                        </p>
                        {initialChargeSummary && <p className="text-xs text-muted-foreground mt-0.5">Initial charge default - {initialChargeSummary}</p>}
                        <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-template-field-surcharge-${template.id}`}>
                          Field surcharge: {template.fieldSurchargeAllowed ? "the technician may add one on the ticket" : "not allowed"}
                        </p>
                        {template.description && <p className="text-xs text-muted-foreground mt-1">{template.description}</p>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {template.defaultPriceCents != null && <span className="text-sm font-semibold">{formatCents(template.defaultPriceCents)}</span>}
                        <Button variant="outline" size="sm" onClick={() => openEditTemplate(template)} data-testid={`button-edit-agreement-template-${template.id}`}>Edit</Button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2"><SettingsIcon className="h-4 w-4" /> Service Time Tracking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-md space-y-2">
            <Label>Service Time Tracking Mode</Label>
            <Select
              value={serviceTimeTracking?.mode || "AUTO_TIMEOUT_ON_TICKET_POST"}
              onValueChange={(mode) => updateServiceTimeTrackingMutation.mutate(mode)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="AUTO_TIMEOUT_ON_TICKET_POST">Auto time out on ticket post</SelectItem>
                <SelectItem value="PROMPT_FOR_TIMEOUT">Prompt tech after ticket post</SelectItem>
                <SelectItem value="MANUAL_TIMEOUT">Manual time out only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Controls appointment time-out behavior after technicians post service tickets. GPS fields are staged for a later route/field validation pass.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2"><SettingsIcon className="h-4 w-4" /> Appointment Cancel / Reschedule Reasons</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-xl space-y-2">
            <Label>Reasons</Label>
            {/* Pass 28 (decision 9): the list is read by the appointment disposition and by the
                per-service cancel, so changing it is MANAGE_SETTINGS - disabled, not hidden, for
                everyone else (dev behavior rule 6). */}
            <Textarea
              value={appointmentCancelReasonsText}
              onChange={(event) => setAppointmentCancelReasonsText(event.target.value)}
              rows={8}
              placeholder={"Weather\nGates locked\nSchedule conflict\nCustomer not home"}
              disabled={!canManageSettings}
              data-testid="textarea-appointment-cancel-reasons"
            />
            <p className="text-xs text-muted-foreground">
              One reason per line. Required when the office cancels an appointment or a single service, and when a technician cancels or requests a reschedule from the route view.
            </p>
            {!canManageSettings ? <p className="text-xs text-muted-foreground">Only an admin can change this list.</p> : null}
          </div>
          <Button
            type="button"
            onClick={() => updateAppointmentCancelReasonsMutation.mutate()}
            disabled={!canManageSettings || updateAppointmentCancelReasonsMutation.isPending || !appointmentCancelReasonsText.trim()}
          >
            {updateAppointmentCancelReasonsMutation.isPending ? "Saving..." : "Save Reasons"}
          </Button>
        </CardContent>
      </Card>

      {/* Pass 31 (C4.5): the dispatch board's four settings. The view
          interval is the board's column width; the snap is what a time typed
          on the appointment sheet rounds to (a placement lands on its slot's
          start, and the rules keep the snap no coarser than the view); the
          hours are the board's default window, which the board's own Window
          popover overrides for a session. One app_settings row per value, no
          seed row - the defaults are today's board. */}
      <Card data-testid="card-dispatch-board">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2"><LayoutGrid className="h-4 w-4" /> Dispatch Board</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>View interval</Label>
              <Select
                value={String(dispatchBoard.viewIntervalMinutes)}
                onValueChange={(value) => {
                  const viewIntervalMinutes = Number(value) as DispatchViewInterval;
                  updateDispatchBoardMutation.mutate(dispatchBoard.snapMinutes > viewIntervalMinutes
                    ? { viewIntervalMinutes, snapMinutes: viewIntervalMinutes as DispatchSnapInterval }
                    : { viewIntervalMinutes });
                }}
                disabled={!canManageSettings || updateDispatchBoardMutation.isPending}
              >
                <SelectTrigger data-testid="select-dispatch-view-interval"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DISPATCH_VIEW_INTERVALS.map((minutes) => (
                    <SelectItem key={minutes} value={String(minutes)}>{describeViewInterval(minutes).label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">The width of a board column; each column is one placement slot.</p>
            </div>
            <div className="space-y-2">
              <Label>Snap interval</Label>
              <Select
                value={String(dispatchBoard.snapMinutes)}
                onValueChange={(value) => updateDispatchBoardMutation.mutate({ snapMinutes: Number(value) as DispatchSnapInterval })}
                disabled={!canManageSettings || updateDispatchBoardMutation.isPending}
              >
                <SelectTrigger data-testid="select-dispatch-snap-interval"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DISPATCH_SNAP_INTERVALS.map((minutes) => (
                    <SelectItem key={minutes} value={String(minutes)} disabled={minutes > dispatchBoard.viewIntervalMinutes}>{describeSnapInterval(minutes)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">What Scheduled Start and End on the appointment sheet round to when saved. Never coarser than the view interval, so a placement lands on the slot that was clicked.</p>
            </div>
            <div className="space-y-2">
              <Label>Visible start hour</Label>
              <Select
                value={String(dispatchBoard.defaultStartHour)}
                onValueChange={(value) => {
                  const defaultStartHour = Number(value);
                  updateDispatchBoardMutation.mutate({ defaultStartHour, defaultEndHour: visibleEndHourFor(defaultStartHour, dispatchBoard.defaultEndHour) });
                }}
                disabled={!canManageSettings || updateDispatchBoardMutation.isPending}
              >
                <SelectTrigger data-testid="select-dispatch-start-hour"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {boardStartHourOptions().map((hour) => (
                    <SelectItem key={hour} value={String(hour)}>{formatHourOfDay(hour)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Visible end hour</Label>
              <Select
                value={String(dispatchBoard.defaultEndHour)}
                onValueChange={(value) => updateDispatchBoardMutation.mutate({ defaultEndHour: Number(value) })}
                disabled={!canManageSettings || updateDispatchBoardMutation.isPending}
              >
                <SelectTrigger data-testid="select-dispatch-end-hour"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {boardEndHourOptions(dispatchBoard.defaultStartHour).map((hour) => (
                    <SelectItem key={hour} value={String(hour)}>{formatHourOfDay(hour)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            The hours and the view interval are the board's defaults each time it loads; the Window popover on the Dispatch Board changes them for that session only. The snap has no session override.
          </p>
          {!canManageSettings ? <p className="text-xs text-muted-foreground">Only an admin can change this setting.</p> : null}
        </CardContent>
      </Card>

      {/* Pass 17 (C3.2): the reasons the office picks from when reopening a
          ticket in Service Ticket Review. "Other" is the pop-up's own last
          option (typed reason, manager+), never a line here - the server
          drops it. The PATCH is MANAGE_SETTINGS, so the editor is disabled -
          not hidden - for everyone else (dev behavior rule 6). */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2"><SettingsIcon className="h-4 w-4" /> Ticket Reopen Reasons</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-xl space-y-2">
            <Label>Reasons</Label>
            <Textarea
              value={ticketReopenReasonsText}
              onChange={(event) => setTicketReopenReasonsText(event.target.value)}
              rows={8}
              placeholder={"Wrong price\nWrong service date\nMaterials missing or incorrect"}
              disabled={!canManageSettings}
              data-testid="textarea-ticket-reopen-reasons"
            />
            <p className="text-xs text-muted-foreground">
              One reason per line. The office picks one when reopening a posted or finalized ticket from Service Ticket Review. "Other" is always offered last there and needs the reason typed out (manager or admin); it is not a line on this list.
            </p>
            {!canManageSettings ? <p className="text-xs text-muted-foreground">Only an admin can change this list.</p> : null}
          </div>
          <Button
            type="button"
            onClick={() => updateTicketReopenReasonsMutation.mutate()}
            disabled={!canManageSettings || updateTicketReopenReasonsMutation.isPending || !ticketReopenReasonsText.trim()}
            data-testid="button-save-ticket-reopen-reasons"
          >
            {updateTicketReopenReasonsMutation.isPending ? "Saving..." : "Save Reasons"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2"><SettingsIcon className="h-4 w-4" /> Company Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Company Name</Label><Input placeholder="Your Pest Control Co." data-testid="input-company-name-settings" /></div>
            <div className="space-y-1.5"><Label>License Number</Label><Input placeholder="PCO-XXXXX" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Phone</Label><Input placeholder="(555) 123-4567" /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input placeholder="office@pestcontrol.com" /></div>
          </div>
          <p className="text-xs text-muted-foreground">Company settings will be used in reports and invoices. (Save functionality coming soon)</p>
        </CardContent>
      </Card>
    </div>
  );
}
