import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, getApiErrorMessage, queryClient } from "@/lib/queryClient";
import { dollarsToCents, centsToDollarString, formatCents } from "@shared/money";
import { ServiceBillingBlock, VisitInitialChargeCallout, useVisitBillingSummary, type VisitBillingDraftPrice } from "@/components/visit-billing-summary";
import { CollectPaymentDialog } from "@/components/collect-payment-dialog";
import { BillingPlanPill, useBillingPlanById } from "@/components/billing-plan-pill";
import { can, PERMISSIONS, rolesWithPermission } from "@shared/permissions";
import { computeProductionValueCents } from "@shared/production-value";
import { describeTicketLifecycle } from "@shared/ticket-status";
import type { Agreement, Appointment, Location, MaterialProduct, ProductApplication, Service, ServiceRecord, ServiceType, TargetPest, Technician } from "@shared/schema";

interface MaterialLine {
  key: string;
  collapsed: boolean;
  materialProductId: string;
  productName: string;
  amountApplied: string;
  unit: string;
  dilutionLabel: string;
  dilutionRate: string;
  applicationMethod: string;
  device: string;
  applicationLocation: string;
  epaRegNumber: string;
  activeIngredientAmount: string;
  notes: string;
}

interface ServiceCompletionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service: Service | null;
  appointment?: Appointment | null;
  technicians?: Technician[];
  serviceTypes?: ServiceType[];
  defaultTechnicianId?: string | null;
  existingServiceRecord?: ServiceRecord | null;
  onCompleted?: () => void;
  // Pass 18 (PLAN_ROADMAP_V2.md C3.1b; D9): "post" is the technician's flow -
  // finish -> collect -> POST /api/services/:id/complete, the time-out prompt
  // after, a local draft meanwhile. "office-edit" is the review modal's Edit
  // on a posted ticket: the same fields and materials, seeded from
  // existingServiceRecord (required), saved through the gated PATCH
  // /api/service-records/:id (EDIT_TICKET) with the Service's price and type
  // when this user may set them; no collect step, no time-out prompt, no
  // local draft, and the technician and service date editable (the PATCH's
  // content, which a post fixes at start). Defaults to "post".
  mode?: "post" | "office-edit";
  // Pass 19 (PLAN_ROADMAP_V2.md C3.3): the visit's location, for its notes in
  // the instructions block. The technician view passes it from its work
  // read; a caller without one (the review modal, the Services tab) leaves
  // it out and the dialog reads the customer's locations instead.
  location?: Location | null;
}

type DilutionOption = {
  label?: string;
  ratio?: string;
  activeIngredientConcentration?: string | number | null;
};

function createClientKey() {
  return `material-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyMaterial(): MaterialLine {
  return {
    key: createClientKey(),
    collapsed: false,
    materialProductId: "",
    productName: "",
    amountApplied: "",
    unit: "",
    dilutionLabel: "",
    dilutionRate: "",
    applicationMethod: "",
    device: "",
    applicationLocation: "",
    epaRegNumber: "",
    activeIngredientAmount: "",
    notes: "",
  };
}

function materialFromApplication(application: ProductApplication): MaterialLine {
  return {
    key: application.id || createClientKey(),
    collapsed: true,
    materialProductId: application.materialProductId || "",
    productName: application.productName || "",
    amountApplied: application.amountApplied || "",
    unit: application.unit || "",
    dilutionLabel: application.dilutionLabel || "",
    dilutionRate: application.dilutionRate || "",
    applicationMethod: application.applicationMethod || "",
    device: application.device || "",
    applicationLocation: application.applicationLocation || "",
    epaRegNumber: application.epaRegNumber || "",
    activeIngredientAmount: application.activeIngredientAmount || "",
    notes: application.notes || "",
  };
}

const FALLBACK_TARGET_PEST_OPTIONS = [
  "Ants",
  "Roaches",
  "Spiders",
  "Rodents",
  "Mosquitoes",
  "Fleas",
  "Ticks",
  "Wasps",
  "Termites",
  "Bed Bugs",
  "Silverfish",
  "Occasional Invaders",
];

function formatDateTimeLocalValue(value: Date | string | null | undefined) {
  const date = value ? new Date(value) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseDilutionOptions(value: unknown): DilutionOption[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as DilutionOption[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value)));
}

function getConcentration(product?: MaterialProduct, dilution?: DilutionOption) {
  const dilutionConcentration = Number(dilution?.activeIngredientConcentration ?? "");
  if (Number.isFinite(dilutionConcentration) && dilutionConcentration > 0) return dilutionConcentration;
  const productConcentration = Number(product?.activeIngredientPercent ?? "");
  return Number.isFinite(productConcentration) && productConcentration > 0 ? productConcentration : null;
}

function calculateActiveIngredientAmount(amount: string, concentration: number | null) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !concentration) return "";
  return (numericAmount * (concentration / 100)).toFixed(4);
}

function getDraftKey(serviceId?: string | null) {
  return serviceId ? `pestflow.service-ticket-draft.${serviceId}` : null;
}

export function ServiceCompletionDialog({
  open,
  onOpenChange,
  service,
  appointment,
  technicians,
  serviceTypes,
  defaultTechnicianId,
  existingServiceRecord,
  onCompleted,
  mode = "post",
  location = null,
}: ServiceCompletionDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const isOfficeEdit = mode === "office-edit";
  const [technicianId, setTechnicianId] = useState("");
  const [serviceDate, setServiceDate] = useState(formatDateTimeLocalValue(new Date()));
  const [notes, setNotes] = useState("");
  const [targetPests, setTargetPests] = useState("");
  const [conditionsFound, setConditionsFound] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [deviceNotes, setDeviceNotes] = useState("");
  const [materials, setMaterials] = useState<MaterialLine[]>([emptyMaterial()]);
  const [targetPestSearch, setTargetPestSearch] = useState("");
  const [ticketServiceTypeId, setTicketServiceTypeId] = useState("");
  const [ticketPrice, setTicketPrice] = useState("");
  // Pass 19 (C3.3): the price as last COMMITTED - seeded with the box, then
  // set when the technician leaves the box - so the billing block and the
  // collect step re-read at the draft price on blur, never on every keystroke.
  const [committedPrice, setCommittedPrice] = useState("");
  // D8: finish -> collect -> post. "Finish & Collect" opens the collection
  // step; "Post Service Ticket" lives there. Office finalization owns
  // "complete", so neither button says it.
  const [collectOpen, setCollectOpen] = useState(false);

  const { data: materialProducts } = useQuery<MaterialProduct[]>({ queryKey: ["/api/material-products"] });
  const { data: productApplications } = useQuery<ProductApplication[]>({ queryKey: ["/api/product-applications"] });
  const { data: configuredTargetPests } = useQuery<TargetPest[]>({ queryKey: ["/api/target-pests"] });
  const { data: timeTrackingSetting } = useQuery<{ mode: "AUTO_TIMEOUT_ON_TICKET_POST" | "PROMPT_FOR_TIMEOUT" | "MANUAL_TIMEOUT" }>({
    queryKey: ["/api/settings/service-time-tracking"],
  });
  const { data: agreement } = useQuery<Agreement>({
    queryKey: [`/api/agreements/${service?.agreementId}`],
    enabled: !!service?.agreementId,
  });
  // Pass 19 (C3.3): D6's billing-plan pill on the ticket header for an
  // agreement service (the billing-profile display waits for C5.2).
  const { planById: billingPlanById, isLoading: billingPlansLoading } = useBillingPlanById(open && !!service?.agreementId);
  // The location's notes for the instructions block when no location was
  // passed in: the customer's locations read, the row this service sits at.
  const { data: customerLocations } = useQuery<Location[]>({
    queryKey: [`/api/locations/${service?.customerId}`],
    enabled: open && !location && !!service?.customerId,
  });
  const resolvedLocation = location ?? customerLocations?.find((row) => row.id === service?.locationId) ?? null;
  // D6: what this service bills and what is due today, resolved by the
  // server through the same code that prices the visit invoice - not from
  // the agreement row above, which cannot say whether its plan covers the visit.
  const visitAppointmentId = appointment?.id ?? service?.appointmentId ?? null;

  const serviceTypeName = useMemo(() => {
    return serviceTypes?.find((serviceType) => serviceType.id === ticketServiceTypeId || serviceType.id === service?.serviceTypeId)?.name ?? "Service";
  }, [service?.serviceTypeId, serviceTypes, ticketServiceTypeId]);

  const selectedTechnician = useMemo(() => {
    return technicians?.find((technician) => technician.id === technicianId) ?? null;
  }, [technicianId, technicians]);

  // The office's edit never reads or writes the technician's local draft: a
  // stale draft on a shared browser must not seed a posted ticket's edit, and
  // the edit must not overwrite what the technician is drafting.
  const draftKey = isOfficeEdit ? null : getDraftKey(service?.id);
  const existingApplications = useMemo(() => {
    if (!existingServiceRecord) return [];
    return (productApplications ?? []).filter((application) => application.serviceRecordId === existingServiceRecord.id);
  }, [existingServiceRecord, productApplications]);
  const isAgreementGeneratedService = !!service && (!!service.agreementId || service.source === "AGREEMENT_GENERATED");
  const allowServiceOverride = !!service && (!isAgreementGeneratedService || can(user?.role ?? "", PERMISSIONS.ADJUST_PRICE_AGREEMENT));
  // The locked price / type caption: the office is told who may (dev rule 6).
  const agreementLockNote = isOfficeEdit ? `(agreement - ${rolesWithPermission(PERMISSIONS.ADJUST_PRICE_AGREEMENT).join(" or ")} only)` : "(agreement locked)";
  const computedProductionValueCents = useMemo(
    () => computeProductionValueCents(agreement?.priceCents, agreement?.expectedServiceCount),
    [agreement?.priceCents, agreement?.expectedServiceCount],
  );
  const displayPriceCents = service?.priceCents ?? computedProductionValueCents;
  // Pass 19 (C3.3): the draft price the billing read is asked to price -
  // the rule of serviceOverridePayload below, so the figures preview exactly
  // what Post will stamp: only when this user may set the price, only once
  // the committed value differs from what is stored, and for an agreement
  // service never the computed default (which the post leaves unstamped).
  // Null means "the stored figures", the read as it was before this pass.
  const draftPrice = useMemo<VisitBillingDraftPrice | null>(() => {
    if (!service || !allowServiceOverride) return null;
    const cents = dollarsToCents(committedPrice);
    if (cents == null || cents < 0) return null;
    if (cents === service.priceCents) return null;
    if (isAgreementGeneratedService && cents === computedProductionValueCents) return null;
    return { serviceId: service.id, priceCents: cents };
  }, [allowServiceOverride, committedPrice, computedProductionValueCents, isAgreementGeneratedService, service]);
  const { data: visitBilling, isLoading: visitBillingLoading, isError: visitBillingError } = useVisitBillingSummary(open ? visitAppointmentId : null, draftPrice);
  const serviceBilling = visitBilling?.services.find((line) => line.serviceId === service?.id) ?? null;
  const selectedTargetPests = useMemo(() => targetPests.split(",").map((value) => value.trim()).filter(Boolean), [targetPests]);
  const targetPestOptions = useMemo(() => {
    const configured = (configuredTargetPests ?? []).map((pest) => pest.label);
    return configured.length ? configured : FALLBACK_TARGET_PEST_OPTIONS;
  }, [configuredTargetPests]);
  const filteredTargetPests = targetPestOptions.filter((pest) => pest.toLowerCase().includes(targetPestSearch.toLowerCase()));

  useEffect(() => {
    if (!open || !service) return;
    // An office edit seeds the technician from the ticket alone, so a save
    // with nothing touched sends what the ticket already holds.
    const nextTechnicianId = existingServiceRecord?.technicianId || (isOfficeEdit ? "" : defaultTechnicianId || service.assignedTechnicianId || appointment?.assignedTechnicianId || "");
    const nextServiceDate = formatDateTimeLocalValue(existingServiceRecord?.serviceDate ?? appointment?.scheduledDate ?? new Date());
    const cachedDraft = draftKey ? localStorage.getItem(draftKey) : null;

    if (cachedDraft) {
      try {
        const parsed = JSON.parse(cachedDraft);
        setTechnicianId(parsed.technicianId || nextTechnicianId);
        setServiceDate(parsed.serviceDate || nextServiceDate);
        setNotes(parsed.notes || "");
        setTargetPests(parsed.targetPests || "");
        setConditionsFound(parsed.conditionsFound || "");
        setRecommendations(parsed.recommendations || "");
        setFollowUpRequired(!!parsed.followUpRequired);
        setFollowUpNotes(parsed.followUpNotes || "");
        setDeviceNotes(parsed.deviceNotes || "");
        setTicketServiceTypeId(parsed.ticketServiceTypeId || service.serviceTypeId || "");
        const restoredPrice: string = parsed.ticketPrice ?? (service.priceCents != null ? centsToDollarString(service.priceCents) : "");
        setTicketPrice(restoredPrice);
        setCommittedPrice(restoredPrice);
        setMaterials(Array.isArray(parsed.materials) && parsed.materials.length ? parsed.materials : [emptyMaterial()]);
        return;
      } catch {
        if (draftKey) localStorage.removeItem(draftKey);
      }
    }

    setTechnicianId(nextTechnicianId);
    setServiceDate(nextServiceDate);
    setNotes(existingServiceRecord?.notes || "");
    setTargetPests(existingServiceRecord?.targetPests?.join(", ") || "");
    setConditionsFound(existingServiceRecord?.conditionsFound || "");
    setRecommendations(existingServiceRecord?.recommendations || "");
    setFollowUpRequired(existingServiceRecord?.followUpRequired ?? false);
    setFollowUpNotes(existingServiceRecord?.followUpNotes || "");
    setDeviceNotes("");
    setTicketServiceTypeId(service.serviceTypeId || "");
    const seededPrice = service.priceCents != null ? centsToDollarString(service.priceCents) : "";
    setTicketPrice(seededPrice);
    setCommittedPrice(seededPrice);
    setMaterials(existingApplications.length ? existingApplications.map(materialFromApplication) : []);
  }, [appointment?.assignedTechnicianId, appointment?.scheduledDate, defaultTechnicianId, draftKey, existingApplications, existingServiceRecord, isOfficeEdit, open, service]);

  // Agreement-generated services no longer carry a stamped price - prefill
  // the editable field with the live-computed production value once it's
  // available, but only if nothing has set a value yet (a real stamp or a
  // restored draft both win over this).
  useEffect(() => {
    if (!open || !service || service.priceCents != null || ticketPrice.trim() !== "" || computedProductionValueCents == null) return;
    setTicketPrice(centsToDollarString(computedProductionValueCents));
    setCommittedPrice(centsToDollarString(computedProductionValueCents));
  }, [open, service, ticketPrice, computedProductionValueCents]);

  useEffect(() => {
    if (!open) setCollectOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open || !draftKey || !service) return;
    localStorage.setItem(draftKey, JSON.stringify({
      technicianId,
      serviceDate,
      notes,
      targetPests,
      conditionsFound,
      recommendations,
      followUpRequired,
      followUpNotes,
      deviceNotes,
      ticketServiceTypeId,
      ticketPrice,
      materials,
      savedAt: new Date().toISOString(),
    }));
  }, [conditionsFound, deviceNotes, draftKey, followUpNotes, followUpRequired, materials, notes, open, recommendations, service, serviceDate, targetPests, technicianId, ticketPrice, ticketServiceTypeId]);

  // The materials as the post and the office edit both send them (the
  // PATCH's replace-all list is the post's shape).
  const materialsPayload = () => materials
    .filter((material) => material.productName.trim())
    .map((material) => ({
      materialProductId: material.materialProductId || null,
      productName: material.productName,
      epaRegNumber: material.epaRegNumber || null,
      dilutionLabel: material.dilutionLabel || null,
      dilutionRate: material.dilutionRate || null,
      amountApplied: material.amountApplied || null,
      unit: material.unit || null,
      activeIngredientAmount: material.activeIngredientAmount || null,
      applicationMethod: material.applicationMethod || null,
      device: material.device || null,
      applicationLocation: material.applicationLocation || null,
      notes: material.notes || null,
    }));

  // The Service's type and price, under one rule for the post and the office
  // edit: sent only when this user may override them (a manual service, or
  // ADJUST_PRICE_AGREEMENT on an agreement-generated one - the server refuses
  // them otherwise), and an agreement price only if it was deliberately
  // changed from the live-computed default - otherwise left unstamped so
  // production value keeps tracking the agreement (e.g. a later price edit)
  // instead of freezing at whatever the computed value happened to be.
  const serviceOverridePayload = () => ({
    serviceTypeId: allowServiceOverride ? ticketServiceTypeId || null : undefined,
    priceCents: !allowServiceOverride
      ? undefined
      : isAgreementGeneratedService && dollarsToCents(ticketPrice) === computedProductionValueCents
        ? undefined
        : dollarsToCents(ticketPrice),
  });

  // Pass 19 (C3.3): on leaving the price box - dollars.cents formatting, and
  // the committed value the billing read prices from. An empty or unparsable
  // box commits as empty (the stored figures).
  const commitPrice = () => {
    const cents = dollarsToCents(ticketPrice);
    const formatted = cents == null || cents < 0 ? "" : centsToDollarString(cents);
    if (formatted !== ticketPrice) setTicketPrice(formatted);
    setCommittedPrice(formatted);
  };

  // Pass 19 (C3.3): what the technician is told before the work - the
  // agreement's service instructions (defaulted from its template), the
  // service's own notes and the location's notes - each labelled, absent
  // when empty. Read from rows the dialog already has or reads; never typed
  // here (instructions are edited where they live).
  const instructions = [
    { label: "Agreement instructions", text: agreement?.serviceInstructions ?? "" },
    { label: "Service notes", text: service?.notes ?? "" },
    { label: "Location notes", text: resolvedLocation?.notes ?? "" },
  ].filter((entry) => entry.text.trim().length > 0);

  const invalidateTicketViews = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/services"] });
    queryClient.invalidateQueries({ queryKey: ["/api/services/by-location"] });
    queryClient.invalidateQueries({ queryKey: ["/api/service-records"] });
    queryClient.invalidateQueries({ queryKey: ["/api/service-records/by-location"] });
    queryClient.invalidateQueries({ queryKey: ["/api/product-applications"] });
    // Prefix-matches the visit billing summary too, so a price edit re-prices
    // the visit wherever it is shown.
    queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/appointments/by-location"] });
    queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
    queryClient.invalidateQueries({ queryKey: ["/api/opportunities/by-location"] });
  };

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!service) throw new Error("Service is required");
      const derivedAreas = uniqueValues(materials.map((material) => material.applicationLocation)).join(", ");
      const response = await apiRequest("POST", `/api/services/${service.id}/complete`, {
        appointmentId: appointment?.id ?? service.appointmentId ?? null,
        technicianId: technicianId || null,
        serviceDate,
        ...serviceOverridePayload(),
        notes: [notes, deviceNotes ? `Device notes: ${deviceNotes}` : null].filter(Boolean).join("\n\n"),
        targetPests: targetPests.split(",").map((value) => value.trim()).filter(Boolean),
        areasServiced: derivedAreas || null,
        conditionsFound,
        recommendations,
        followUpRequired,
        followUpNotes: followUpRequired ? followUpNotes : null,
        confirmed: false,
        productApplications: materialsPayload(),
      });
      return response.json();
    },
    onSuccess: async () => {
      if (draftKey) localStorage.removeItem(draftKey);
      if (timeTrackingSetting?.mode === "PROMPT_FOR_TIMEOUT" && appointment?.id && !appointment.timeOutAt && window.confirm("Would you like to time out now?")) {
        await apiRequest("POST", `/api/appointments/${appointment.id}/time-out`, {});
      }
      toast({ title: "Service ticket posted", description: "Office review is pending." });
      invalidateTicketViews();
      setCollectOpen(false);
      onCompleted?.();
      onOpenChange(false);
    },
    onError: (error: Error) => toast({ title: "Unable to post service ticket", description: error.message, variant: "destructive" }),
  });

  // Pass 18 (C3.1b): the office's save. The ticket's content through the
  // gated PATCH, the Service's price / type with it when this user may set
  // them; the server refuses a finalized ticket (409, "reopen first") and an
  // agreement price from anyone without ADJUST_PRICE_AGREEMENT (403, naming
  // who may), writes nothing for a save that changes nothing, and logs the
  // rest as `ticket_edited` (the ticket) and `price_overridden` (the Service).
  // No collect step and no time-out prompt: the visit already happened.
  const officeEditMutation = useMutation({
    mutationFn: async () => {
      if (!service || !existingServiceRecord) throw new Error("A posted ticket is required");
      const derivedAreas = uniqueValues(materials.map((material) => material.applicationLocation)).join(", ");
      const response = await apiRequest("PATCH", `/api/service-records/${existingServiceRecord.id}`, {
        technicianId: technicianId || null,
        serviceDate,
        ...serviceOverridePayload(),
        notes: [notes, deviceNotes ? `Device notes: ${deviceNotes}` : null].filter(Boolean).join("\n\n"),
        targetPests: targetPests.split(",").map((value) => value.trim()).filter(Boolean),
        areasServiced: derivedAreas || null,
        conditionsFound,
        recommendations,
        followUpRequired,
        followUpNotes: followUpRequired ? followUpNotes : null,
        productApplications: materialsPayload(),
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Service ticket updated", description: "The change is recorded in the ticket's history." });
      invalidateTicketViews();
      onCompleted?.();
      onOpenChange(false);
    },
    onError: (error: Error) => toast({ title: "Unable to save the ticket", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const updateMaterial = (index: number, key: keyof MaterialLine, value: string) => {
    setMaterials((current) => current.map((material, currentIndex) => {
      if (currentIndex !== index) return material;
      const next = { ...material, [key]: value };
      const selectedProduct = materialProducts?.find((product) => product.id === next.materialProductId);
      const dilution = parseDilutionOptions(selectedProduct?.dilutionOptions).find((option) => option.label === next.dilutionLabel);
      return {
        ...next,
        activeIngredientAmount: calculateActiveIngredientAmount(next.amountApplied, getConcentration(selectedProduct, dilution)),
      };
    }));
  };

  const toggleTargetPest = (pest: string) => {
    const next = selectedTargetPests.includes(pest)
      ? selectedTargetPests.filter((value) => value !== pest)
      : [...selectedTargetPests, pest];
    setTargetPests(next.join(", "));
  };

  const collapseMaterial = (index: number, collapsed: boolean) => {
    setMaterials((current) => current.map((material, currentIndex) => currentIndex === index ? { ...material, collapsed } : material));
  };

  const removeMaterial = (index: number) => {
    setMaterials((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const selectProduct = (index: number, productId: string) => {
    const product = materialProducts?.find((item) => item.id === productId);
    setMaterials((current) => current.map((material, currentIndex) => {
      if (currentIndex !== index || !product) return material;
      const dilution = parseDilutionOptions(product.dilutionOptions).find((option) => option.label === product.defaultDilutionLabel)
        ?? parseDilutionOptions(product.dilutionOptions)[0];
      const next = {
        ...material,
        materialProductId: product.id,
        productName: product.name,
        epaRegNumber: product.epaRegNumber || "",
        dilutionLabel: dilution?.label || product.defaultDilutionLabel || "",
        dilutionRate: dilution?.ratio || "",
        unit: product.defaultUnit || material.unit || "",
        applicationMethod: product.defaultApplicationMethod || "",
        device: product.defaultEquipment || "",
        applicationLocation: product.defaultApplicationArea || "",
      };
      return {
        ...next,
        activeIngredientAmount: calculateActiveIngredientAmount(next.amountApplied, getConcentration(product, dilution)),
      };
    }));
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isOfficeEdit ? "Edit Service Ticket" : existingServiceRecord ? "Service Ticket" : "Create Service Ticket"}</DialogTitle>
        </DialogHeader>
        {service && (
          <div className="space-y-5">
            <div className="rounded-lg border bg-muted/20 p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{serviceTypeName}</p>
                  {appointment?.scheduledDate && <p className="text-muted-foreground">Scheduled {new Date(appointment.scheduledDate).toLocaleString()}</p>}
                  <p className="text-xs text-muted-foreground">{isOfficeEdit ? "A saved change is recorded in the ticket's history as Ticket edited." : "Ticket drafts autosave locally on this device."}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant="outline" data-testid="badge-ticket-dialog-mode">{isOfficeEdit && existingServiceRecord ? `Office edit - ${describeTicketLifecycle(existingServiceRecord)}` : "Office review pending after post"}</Badge>
                  {/* Pass 19: D6's billing-plan pill - plans attach to agreements, so only an agreement service shows one. */}
                  {agreement && !billingPlansLoading && (
                    <BillingPlanPill agreement={agreement} plan={agreement.billingPlanId ? billingPlanById.get(agreement.billingPlanId) : null} />
                  )}
                </div>
              </div>
              <div className="mt-3 border-t pt-3">
                {visitAppointmentId ? (
                  <>
                    <ServiceBillingBlock summary={visitBilling} serviceId={service.id} isLoading={visitBillingLoading} isError={visitBillingError} />
                    <VisitInitialChargeCallout summary={visitBilling} className="mt-2" />
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">Not on an appointment - billing is resolved once the visit is scheduled.</p>
                )}
              </div>
            </div>

            {instructions.length > 0 && (
              <div className="space-y-2 rounded-lg border p-3" data-testid="block-ticket-instructions">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Instructions</p>
                {instructions.map((entry) => (
                  <div key={entry.label}>
                    <p className="text-xs font-medium text-muted-foreground">{entry.label}</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm">{entry.text}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Technician</p>
                {isOfficeEdit ? (
                  <>
                    {/* The compliance snapshot (name, license) follows the technician chosen; the server re-copies it. */}
                    <Select value={technicianId || "NONE"} onValueChange={(value) => setTechnicianId(value === "NONE" ? "" : value)}>
                      <SelectTrigger className="mt-1" data-testid="select-edit-technician"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">Unassigned</SelectItem>
                        {(technicians ?? []).map((technician) => <SelectItem key={technician.id} value={technician.id}>{technician.displayName}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">{selectedTechnician?.licenseId ? `License #${selectedTechnician.licenseId} - copied onto the ticket with the name.` : "The name and license on the ticket follow the technician chosen."}</p>
                  </>
                ) : (
                  <>
                    <p className="mt-1 font-medium">{selectedTechnician?.displayName || "Unassigned"}</p>
                    {selectedTechnician?.licenseId && <p className="text-xs text-muted-foreground">License #{selectedTechnician.licenseId}</p>}
                  </>
                )}
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Service Date / Time</p>
                {isOfficeEdit ? (
                  <>
                    <Input type="datetime-local" className="mt-1" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} data-testid="input-edit-service-date" />
                    <p className="mt-1 text-xs text-muted-foreground">When the work was done.</p>
                  </>
                ) : (
                  <>
                    <p className="mt-1 font-medium">{new Date(serviceDate).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Locked when ticket is started.</p>
                  </>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Service Type</Label>
                {allowServiceOverride ? (
                  <Select value={ticketServiceTypeId || "NONE"} onValueChange={(value) => setTicketServiceTypeId(value === "NONE" ? "" : value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Select service type</SelectItem>
                      {(serviceTypes ?? []).map((serviceType) => <SelectItem key={serviceType.id} value={serviceType.id}>{serviceType.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">{serviceTypeName} <span className="text-xs text-muted-foreground">{agreementLockNote}</span></div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Service Price</Label>
                {allowServiceOverride ? (
                  <Input type="number" inputMode="decimal" min="0" step="0.01" value={ticketPrice} onChange={(event) => setTicketPrice(event.target.value)} onBlur={commitPrice} data-testid="input-ticket-price" />
                ) : (
                  <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">{displayPriceCents != null ? formatCents(displayPriceCents) : "Not set"} <span className="text-xs text-muted-foreground">{agreementLockNote}</span></div>
                )}
                {serviceBilling?.designation === "PRODUCTION" && (
                  <p className="text-xs text-muted-foreground">Agreement-covered: not billed on this visit. The default shown is the visit's production value.</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Ticket Notes</Label>
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What was performed?" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Target Pests</Label>
                <Input value={targetPestSearch} onChange={(event) => setTargetPestSearch(event.target.value)} placeholder="Search pests" />
                <div className="flex flex-wrap gap-2">
                  {filteredTargetPests.map((pest) => (
                    <button
                      key={pest}
                      type="button"
                      className={`rounded-full border px-3 py-1 text-xs ${selectedTargetPests.includes(pest) ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}
                      onClick={() => toggleTargetPest(pest)}
                    >
                      {pest}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Device Notes</Label>
                <Input value={deviceNotes} onChange={(event) => setDeviceNotes(event.target.value)} placeholder="Device IDs/types staged for future tracking" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Conditions Found</Label>
                <Textarea value={conditionsFound} onChange={(event) => setConditionsFound(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Recommendations</Label>
                <Textarea value={recommendations} onChange={(event) => setRecommendations(event.target.value)} />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <label className="flex items-start gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={followUpRequired}
                  onChange={(event) => setFollowUpRequired(event.target.checked)}
                />
                <span>
                  Follow-up required
                  <span className="block text-xs font-normal text-muted-foreground">Office will use this to contact the customer and schedule next steps.</span>
                </span>
              </label>
              {followUpRequired ? (
                <div className="space-y-1.5">
                  <Label>Follow-up Notes</Label>
                  <Textarea
                    value={followUpNotes}
                    onChange={(event) => setFollowUpNotes(event.target.value)}
                    placeholder="Example: call in 2 weeks, follow up in 30 days, customer wants attic reinspected"
                  />
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Structured Materials / Chemicals</Label>
                  <p className="text-xs text-muted-foreground">Areas serviced are derived from application areas.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setMaterials((current) => [emptyMaterial(), ...current])}>
                  Add Material
                </Button>
              </div>
              {materials.map((material, index) => {
                const selectedProduct = materialProducts?.find((product) => product.id === material.materialProductId);
                const dilutionOptions = parseDilutionOptions(selectedProduct?.dilutionOptions);
                const methodOptions = uniqueValues(selectedProduct?.allowedApplicationMethods ?? []);
                const equipmentOptions = uniqueValues(selectedProduct?.allowedEquipment ?? []);
                const areaOptions = uniqueValues(selectedProduct?.allowedApplicationAreas ?? []);

                return (
                  <div key={material.key || index} className="space-y-3 rounded-lg border p-3">
                    {material.collapsed ? (
                      <button type="button" className="flex w-full items-start justify-between gap-3 text-left" onClick={() => collapseMaterial(index, false)}>
                        <span>
                          <span className="block font-medium">{material.productName || "Material"}</span>
                          <span className="block text-xs text-muted-foreground">
                            {[material.amountApplied && `${material.amountApplied} ${material.unit}`.trim(), material.dilutionLabel, material.applicationLocation, material.activeIngredientAmount && `AI ${material.activeIngredientAmount}`].filter(Boolean).join(" - ") || "Tap to edit"}
                          </span>
                        </span>
                        <span className="text-xs text-primary">Edit</span>
                      </button>
                    ) : (
                    <>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Product</Label>
                        <Select value={material.materialProductId || "CUSTOM"} onValueChange={(value) => value === "CUSTOM" ? updateMaterial(index, "materialProductId", "") : selectProduct(index, value)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CUSTOM">Custom / Unlisted</SelectItem>
                            {(materialProducts ?? []).map((product) => (
                              <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Product Name</Label>
                        <Input value={material.productName} onChange={(event) => updateMaterial(index, "productName", event.target.value)} disabled={!!material.materialProductId && !selectedProduct?.allowTechnicianOverride} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>EPA #</Label>
                        <Input value={material.epaRegNumber} onChange={(event) => updateMaterial(index, "epaRegNumber", event.target.value)} disabled={!!material.materialProductId && !selectedProduct?.allowTechnicianOverride} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Dilution</Label>
                        {dilutionOptions.length ? (
                          <Select value={material.dilutionLabel || "NONE"} onValueChange={(value) => {
                            const dilution = dilutionOptions.find((option) => option.label === value);
                            updateMaterial(index, "dilutionLabel", value === "NONE" ? "" : value);
                            updateMaterial(index, "dilutionRate", dilution?.ratio || "");
                          }}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="NONE">No dilution</SelectItem>
                              {dilutionOptions.map((option, optionIndex) => {
                                const optionValue = option.label || option.ratio || `Dilution ${optionIndex + 1}`;
                                return <SelectItem key={optionValue} value={optionValue}>{optionValue}</SelectItem>;
                              })}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input value={material.dilutionLabel} onChange={(event) => updateMaterial(index, "dilutionLabel", event.target.value)} placeholder="Label / ratio" />
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Amount</Label>
                        <Input value={material.amountApplied} onChange={(event) => updateMaterial(index, "amountApplied", event.target.value)} placeholder="0.5" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Unit</Label>
                        <Input value={material.unit} onChange={(event) => updateMaterial(index, "unit", event.target.value)} placeholder="oz, gal, lb" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Application Method</Label>
                        {methodOptions.length ? (
                          <Select value={material.applicationMethod || "NONE"} onValueChange={(value) => updateMaterial(index, "applicationMethod", value === "NONE" ? "" : value)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="NONE">Select method</SelectItem>
                              {methodOptions.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : <Input value={material.applicationMethod} onChange={(event) => updateMaterial(index, "applicationMethod", event.target.value)} />}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Equipment / Device</Label>
                        {equipmentOptions.length ? (
                          <Select value={material.device || "NONE"} onValueChange={(value) => updateMaterial(index, "device", value === "NONE" ? "" : value)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="NONE">Select equipment</SelectItem>
                              {equipmentOptions.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : <Input value={material.device} onChange={(event) => updateMaterial(index, "device", event.target.value)} />}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Application Area</Label>
                        {areaOptions.length ? (
                          <Select value={material.applicationLocation || "NONE"} onValueChange={(value) => updateMaterial(index, "applicationLocation", value === "NONE" ? "" : value)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="NONE">Select area</SelectItem>
                              {areaOptions.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : <Input value={material.applicationLocation} onChange={(event) => updateMaterial(index, "applicationLocation", event.target.value)} />}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Active Ingredient Applied</Label>
                        <Input value={material.activeIngredientAmount} onChange={(event) => updateMaterial(index, "activeIngredientAmount", event.target.value)} placeholder="Calculated" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Material Notes</Label>
                      <Input value={material.notes} onChange={(event) => updateMaterial(index, "notes", event.target.value)} />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => removeMaterial(index)}>Remove</Button>
                      <Button type="button" size="sm" onClick={() => collapseMaterial(index, true)}>Done</Button>
                    </div>
                    </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-sm font-medium">Future-ready device section</p>
              <p className="text-xs text-muted-foreground">RBS/TBS IDs, GPS locations, and inspection history are staged for a later device-tracking pass.</p>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {isOfficeEdit ? (
                <>
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={officeEditMutation.isPending}>Cancel</Button>
                  <Button type="button" onClick={() => officeEditMutation.mutate()} disabled={officeEditMutation.isPending || !serviceDate} data-testid="button-save-ticket-edit">
                    {officeEditMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                  <Button type="button" onClick={() => setCollectOpen(true)} disabled={completeMutation.isPending || !serviceDate} data-testid="button-finish-and-collect">
                    {completeMutation.isPending ? "Posting..." : "Finish & Collect"}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    {service && !isOfficeEdit && (
      <CollectPaymentDialog

        open={open && collectOpen}
        onOpenChange={setCollectOpen}
        appointmentId={visitAppointmentId}
        locationId={appointment?.locationId ?? service.locationId}
        designatedAgreementId={service.agreementId ?? null}
        onPostTicket={() => completeMutation.mutate()}
        postingTicket={completeMutation.isPending}
        draftPrice={draftPrice}
      />
    )}
    </>
  );
}
