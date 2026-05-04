import { useState } from "react";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Settings as SettingsIcon, Wrench, FileText, Users } from "lucide-react";
import type { AgreementTemplate, OpportunityDisposition, ServiceType, Technician } from "@shared/schema";

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

function ServiceTypeForm({ serviceType, onClose }: { serviceType?: ServiceType | null; onClose: () => void }) {
  const { toast } = useToast();
  const isEditMode = !!serviceType;
  const [form, setForm] = useState({
    name: serviceType?.name ?? "",
    description: serviceType?.description ?? "",
    defaultPrice: serviceType?.defaultPrice ?? "",
    estimatedDuration: serviceType?.estimatedDuration ? String(serviceType.estimatedDuration) : "",
    category: serviceType?.category ?? "",
    opportunityLeadDays: serviceType?.opportunityLeadDays ? String(serviceType.opportunityLeadDays) : "",
    opportunityLabel: serviceType?.opportunityLabel ?? "",
  });

  const mutation = useMutation({
    mutationFn: (data: typeof form) => {
      const payload = {
        ...data,
        defaultPrice: data.defaultPrice || null,
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
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Opportunity Lead Days</Label><Input type="number" min="0" value={form.opportunityLeadDays} onChange={(e) => setForm((p) => ({ ...p, opportunityLeadDays: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Opportunity Label</Label><Input placeholder="e.g., Annual Renewal" value={form.opportunityLabel} onChange={(e) => setForm((p) => ({ ...p, opportunityLabel: e.target.value }))} /></div>
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={mutation.isPending || !form.name} data-testid="button-save-service-type">{mutation.isPending ? "Saving..." : isEditMode ? "Save Type" : "Create"}</Button></div>
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
  const [form, setForm] = useState({
    displayName: technician?.displayName ?? "",
    licenseId: technician?.licenseId ?? "",
    status: technician?.status ?? "ACTIVE",
    email: technician?.email ?? "",
    phone: technician?.phone ?? "",
    color: technician?.color ?? "",
    notes: technician?.notes ?? "",
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

function AgreementTemplateForm({
  serviceTypes,
  template,
  onClose,
}: {
  serviceTypes?: ServiceType[];
  template?: AgreementTemplate | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const isEditMode = !!template;
  const [form, setForm] = useState({
    name: template?.name ?? "",
    description: template?.description ?? "",
    isActive: template?.isActive ?? true,
    defaultAgreementType: template?.defaultAgreementType ?? "",
    defaultBillingFrequency: template?.defaultBillingFrequency ?? "",
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
    defaultPrice: template?.defaultPrice ?? "",
    defaultInstructions: template?.defaultInstructions ?? "",
    sortOrder: template?.sortOrder ? String(template.sortOrder) : "",
    internalCode: template?.internalCode ?? "",
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        name: data.name.trim(),
        description: data.description.trim() || null,
        isActive: data.isActive,
        defaultAgreementType: data.defaultAgreementType.trim() || null,
        defaultBillingFrequency: data.defaultBillingFrequency.trim() || null,
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
        defaultPrice: data.defaultPrice.trim() || null,
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

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
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
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Agreement Type</Label><Input value={form.defaultAgreementType} onChange={(e) => setForm((prev) => ({ ...prev, defaultAgreementType: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Billing Frequency</Label><Input value={form.defaultBillingFrequency} onChange={(e) => setForm((prev) => ({ ...prev, defaultBillingFrequency: e.target.value }))} /></div>
      </div>
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

export default function Settings() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingServiceType, setEditingServiceType] = useState<ServiceType | null>(null);
  const [technicianDialogOpen, setTechnicianDialogOpen] = useState(false);
  const [editingTechnician, setEditingTechnician] = useState<Technician | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AgreementTemplate | null>(null);
  const [dispositionDialogOpen, setDispositionDialogOpen] = useState(false);
  const [editingDisposition, setEditingDisposition] = useState<OpportunityDisposition | null>(null);
  const { data: serviceTypes, isLoading } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });
  const { data: technicians, isLoading: techniciansLoading } = useQuery<Technician[]>({ queryKey: ["/api/technicians?includeInactive=true"] });
  const { data: agreementTemplates, isLoading: templatesLoading } = useQuery<AgreementTemplate[]>({ queryKey: ["/api/agreement-templates"] });
  const { data: opportunityDispositions, isLoading: dispositionsLoading } = useQuery<OpportunityDisposition[]>({ queryKey: ["/api/opportunity-dispositions?includeInactive=true"] });

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

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Settings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Configure your PestFlow CRM</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><Wrench className="h-4 w-4" /> Service Types</CardTitle>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingServiceType(null); }}>
            <DialogTrigger asChild><Button size="sm" data-testid="button-add-service-type" onClick={() => setEditingServiceType(null)}><Plus className="h-3 w-3 mr-1" /> Add Type</Button></DialogTrigger>
            <DialogContent><DialogHeader><DialogTitle>{editingServiceType ? "Edit Service Type" : "New Service Type"}</DialogTitle></DialogHeader><ServiceTypeForm serviceType={editingServiceType} onClose={() => { setDialogOpen(false); setEditingServiceType(null); }} /></DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : !serviceTypes || serviceTypes.length === 0 ? (
            <div className="text-center py-8">
              <Wrench className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No service types configured</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setDialogOpen(true)}>Add Service Type</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {serviceTypes.map((st) => (
                <div key={st.id} className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/50" data-testid={`card-service-type-${st.id}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{st.name}</span>
                      {st.category && <Badge variant="outline" className="text-xs">{st.category}</Badge>}
                      {st.opportunityLeadDays ? <Badge variant="secondary" className="text-xs">{st.opportunityLeadDays}d opportunity</Badge> : null}
                    </div>
                    {st.description && <p className="text-xs text-muted-foreground mt-0.5">{st.description}</p>}
                    {st.opportunityLabel && <p className="text-xs text-muted-foreground mt-0.5">Opportunity: {st.opportunityLabel}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-sm">
                    {st.defaultPrice && <span className="font-semibold">${parseFloat(st.defaultPrice).toFixed(2)}</span>}
                    {st.estimatedDuration && <span className="text-xs text-muted-foreground">{st.estimatedDuration} min</span>}
                    <Button variant="outline" size="sm" onClick={() => { setEditingServiceType(st); setDialogOpen(true); }}>
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
          <CardTitle className="text-base font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> Agreement Templates</CardTitle>
          <Dialog open={templateDialogOpen} onOpenChange={closeTemplateDialog}>
            <DialogTrigger asChild><Button size="sm" data-testid="button-add-agreement-template" onClick={openCreateTemplate}><Plus className="h-3 w-3 mr-1" /> Add Template</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>{editingTemplate ? "Edit Agreement Template" : "New Agreement Template"}</DialogTitle></DialogHeader>
              <AgreementTemplateForm serviceTypes={serviceTypes} template={editingTemplate} onClose={() => closeTemplateDialog(false)} />
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
                  return (
                    <div key={template.id} className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/50" data-testid={`card-agreement-template-${template.id}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{template.name}</span>
                          <Badge variant="secondary" className={`text-xs ${template.isActive ? "bg-primary/10 text-primary" : ""}`}>{template.isActive ? "Active" : "Inactive"}</Badge>
                          {template.internalCode && <Badge variant="outline" className="text-xs">{template.internalCode}</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatTemplateRecurrence(template)} | {formatTemplateTerm(template)} | {template.defaultSchedulingMode || "MANUAL"} | {template.defaultBillingFrequency || "No billing frequency"} | {serviceType?.name || "No service type"}
                        </p>
                        {template.description && <p className="text-xs text-muted-foreground mt-1">{template.description}</p>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {template.defaultPrice && <span className="text-sm font-semibold">${parseFloat(template.defaultPrice).toFixed(2)}</span>}
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
