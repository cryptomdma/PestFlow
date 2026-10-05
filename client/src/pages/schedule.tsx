import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { ApiError, apiRequest, getApiErrorCode, getApiErrorMessage, queryClient } from "@/lib/queryClient";
import { invalidateAuditViews } from "@/lib/invalidate-audit-views";
import { can, PERMISSIONS } from "@shared/permissions";
import { ServiceCancelDialog } from "@/components/service-cancel-dialog";
import { DraftInvoiceVoidPrompt, getDraftInvoiceDecisionRequired, type DraftInvoiceRef } from "@/components/draft-invoice-void-prompt";
import { VisitBillingRows, useVisitBillingSummary } from "@/components/visit-billing-summary";
import { InitialChargeDuePrompt, type WithInitialChargeDue } from "@/components/initial-charge-due-prompt";
import type { InitialChargeDue } from "@shared/initial-charge";
import { centsToDollarString, formatCents, dollarsToCents } from "@shared/money";
import { describeAnswersLink } from "@shared/service-kind";
import { ServiceWorkKindBadge, ServiceWorkKindListBadge } from "@/components/service-work-kind-badge";
import { FieldAddedBadge, MarkFieldReviewedButton } from "@/components/field-added-badge";
import {
  ExclusionOverridePrompt,
  PreferenceBypassPrompt,
  getPreferenceNotHonoredRefusal,
  getTechnicianExcludedRefusal,
  useCanOverrideExclusion,
} from "@/components/technician-preferences";
import {
  describePreferenceScope,
  describePreferredHint,
  findExclusion,
  type EffectiveTechnicianPreference,
  type ExclusionOverrideRequest,
  type PreferenceNotHonoredRefusal,
  type TechnicianExcludedRefusal,
} from "@shared/technician-preferences";
import {
  CREW_SCHEDULE_CONFLICT,
  describeCrewConflict,
  describeCrewRefusal,
  type AppointmentCrew,
  type CrewScheduleConflict,
  type SupportAssignment,
} from "@shared/appointment-crew";
import {
  DEFAULT_DISPATCH_BOARD_SETTINGS,
  DISPATCH_VIEW_INTERVALS,
  boardEndHourOptions,
  boardStartHourOptions,
  describeSnapInterval,
  describeViewInterval,
  formatHourOfDay,
  formatMinutesOfDay,
  minutesOfDay,
  slotStartFor,
  slotStartsForWindow,
  snapDateToInterval,
  visibleEndHourFor,
  windowEndMinutes,
  type DispatchBoardSettings,
  type DispatchSnapInterval,
  type DispatchViewInterval,
} from "@shared/dispatch-board";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  DollarSign,
  Lock,
  Settings2,
  Users,
} from "lucide-react";
import type { Appointment, Customer, Location, Opportunity, Service, ServiceRecord, ServiceType, Technician } from "@shared/schema";
import {
  describeAppointmentStatus,
  isBoardPlacement,
  type AppointmentDispositionMode,
  type AppointmentDispositionOutcome,
  type AppointmentDispositionRequest,
  type DispositionOpportunityChoice,
} from "@shared/appointment-disposition";
import {
  PLANNED_END_RULE_TEXT,
  describeCompositionRefusal,
  describeNextStopWarning,
  type AppointmentCompositionResult,
  type AppointmentServiceAddRequest,
  type AppointmentServiceUpdateRequest,
} from "@shared/appointment-composition";

const VIEW_OPTIONS = [
  { value: "day", label: "1 Day", step: 1 },
  { value: "three-day", label: "3 Day", step: 3 },
  { value: "week", label: "1 Week", step: 7 },
] as const;

// Pass 31 (C4.5): the board's window and its intervals come from
// shared/dispatch-board.ts - the view interval (30 / 60 / 120 minutes), the
// snap interval (15 / 30 / 60) and the default visible hours are Settings;
// the Window popover below overrides the window for this session only.

// Pass 31b (owner, OWNER_FEEDBACK.md FB-021): the grid's geometry. The
// technician column is fixed; on the 1-day view the slot columns share the
// page's full width with no floor, so a day fits without horizontal
// scrolling even in the 30-minute view (the hover card carries what a narrow
// card truncates). A 3-day or week view keeps a floor per column and scrolls.
const TECH_COLUMN_PX = 160;
const MULTI_DAY_MIN_COLUMN_PX = 96;

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTimeLocalValue(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// Pass 24 (C3.7): the date in "Answers <type> on <date>" - a date-only due
// date is parsed as local time so it does not slip a day.
function formatAnswersDate(value: string | Date | null | undefined) {
  if (!value) return "an unknown date";
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? "an unknown date" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatCurrency(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "Not set";
  return formatCents(cents);
}

// Pass 31: a slot is a start in minutes of day, not a whole hour, so a
// 30-minute view works end to end (the keys, the labels, the move check).
function buildSlotDate(baseDate: Date, slotStartMinutes: number) {
  return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 0, slotStartMinutes, 0, 0);
}

// Pass 31: a move is a change of the start time, to the minute. The old
// isSameSlot compared hours only, so a move inside the same hour (a visit
// saved at 8:15 from the sheet, clicked onto the 8:00 slot) was not a time
// move and escaped lockTime.
function isSameStart(a: Date | string, b: Date) {
  const left = new Date(a);
  return left.getFullYear() === b.getFullYear()
    && left.getMonth() === b.getMonth()
    && left.getDate() === b.getDate()
    && left.getHours() === b.getHours()
    && left.getMinutes() === b.getMinutes();
}

function getCustomerLabel(customer?: Customer, location?: Location) {
  if (customer) {
    const fullName = `${customer.firstName || ""} ${customer.lastName || ""}`.trim();
    if (fullName) return fullName;
    if (customer.companyName) return customer.companyName;
  }
  return location?.name || "Location service";
}

function getLocationLabel(location?: Location) {
  if (!location) return "Location";
  const parts = [location.name, location.address].filter(Boolean);
  return parts.join(" - ");
}

function getAppointmentDurationMinutes(appointment: Appointment, linkedService?: Service) {
  if (appointment.scheduledEndDate) {
    const start = new Date(appointment.scheduledDate).getTime();
    const end = new Date(appointment.scheduledEndDate).getTime();
    return Math.max(Math.round((end - start) / 60000), 0);
  }
  return linkedService?.expectedDurationMinutes || null;
}

function getViewportLabel(boardDates: Date[]) {
  if (!boardDates.length) return "";
  const startLabel = boardDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const endLabel = boardDates[boardDates.length - 1].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return boardDates.length > 1 ? `${startLabel} - ${endLabel}` : startLabel;
}

function getLocationServicesQueryKey(locationId: string | null | undefined) {
  return ["/api/services/by-location", locationId || ""];
}

function getLocationAppointmentsQueryKey(locationId: string | null | undefined) {
  return ["/api/appointments/by-location", locationId || ""];
}

// Pass 27 (B2): the slot named in the board-move confirmation.
function formatSlotLabel(date: Date) {
  return `${date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

function pluralize(count: number, noun: string, plural?: string) {
  return `${count} ${count === 1 ? noun : plural ?? `${noun}s`}`;
}

// Pass 30 (C4.4): what a placement resends after a manager's override;
// Pass 30b: or after the user confirmed passing over the preferred technician.
type PlacementConfirmations = { overrideExclusion?: ExclusionOverrideRequest; acknowledgePreference?: boolean };
type SchedulePlacementVariables = { service: Service; technician: Technician; slotDate: Date } & PlacementConfirmations;
type AppointmentUpdateVariables = { id: string; payload: Record<string, unknown> };
type ExclusionRetry =
  | { kind: "schedule"; variables: SchedulePlacementVariables }
  | { kind: "update"; variables: AppointmentUpdateVariables };

// Pass 30b (owner, 2026-10-03): every query a crew change or a moved visit can make stale - the support cards on the board.
function invalidateSupportAssignments() {
  queryClient.invalidateQueries({
    predicate: (query) => typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/appointment-crews"),
  });
}

/** Pass 30b: the 409 body of a support technician who is already booked, or null. */
function getCrewConflicts(error: unknown): { message: string; conflicts: CrewScheduleConflict[] } | null {
  if (!(error instanceof ApiError) || getApiErrorCode(error) !== CREW_SCHEDULE_CONFLICT) return null;
  const body = error.body as { message?: string; conflicts?: CrewScheduleConflict[] };
  return { message: body.message ?? "", conflicts: body.conflicts ?? [] };
}

/**
 * Pass 30 (PLAN_ROADMAP_V2.md C4.4; CURRENT_FOCUS "Crew."): the visit's crew
 * on the sheet - the lead (the visit's saved technician) and SUPPORT
 * technicians, added and removed through POST / DELETE
 * /api/appointments/:id/crew (one audit row each). A support technician the
 * customer excluded comes back 409 like a placement; a manager is prompted
 * for the override reason and the add is resent. Support technicians see
 * the stop on their own day; the ticket and production stay the lead's
 * until Phase 7's split allocation.
 */
function AppointmentCrewBlock({
  appointment,
  technicianOptions,
  preferences,
}: {
  appointment: Appointment;
  technicianOptions: Technician[];
  preferences: EffectiveTechnicianPreference[];
}) {
  const { toast } = useToast();
  const canOverride = useCanOverrideExclusion();
  const crewQueryKey = ["/api/appointments", appointment.id, "crew"];
  const { data: crew, isLoading } = useQuery<AppointmentCrew>({ queryKey: crewQueryKey });
  const [supportTechnicianId, setSupportTechnicianId] = useState("");
  type CrewAddVariables = { technicianId: string; overrideExclusion?: ExclusionOverrideRequest; confirmConflicts?: boolean };
  const [overridePrompt, setOverridePrompt] = useState<{ refusal: TechnicianExcludedRefusal; variables: CrewAddVariables } | null>(null);
  // Pass 30b (owner, 2026-10-03): the support technician is already booked - confirm to add them anyway.
  const [conflictPrompt, setConflictPrompt] = useState<{ message: string; conflicts: CrewScheduleConflict[]; variables: CrewAddVariables } | null>(null);
  useEffect(() => {
    setSupportTechnicianId("");
    setOverridePrompt(null);
    setConflictPrompt(null);
  }, [appointment.id]);
  const invalidateCrew = () => {
    queryClient.invalidateQueries({ queryKey: crewQueryKey });
    invalidateAuditViews();
    invalidateSupportAssignments();
  };
  const describeCrewError = (error: unknown) => describeCrewRefusal(getApiErrorCode(error)) ?? getApiErrorMessage(error);
  const addMutation = useMutation({
    mutationFn: async (variables: CrewAddVariables) => {
      const response = await apiRequest("POST", `/api/appointments/${appointment.id}/crew`, variables);
      return response.json() as Promise<AppointmentCrew>;
    },
    onSuccess: (_crew, variables) => {
      invalidateCrew();
      setSupportTechnicianId("");
      setOverridePrompt(null);
      setConflictPrompt(null);
      toast({
        title: variables.overrideExclusion ? "Support technician added - exclusion overridden" : "Support technician added",
        description: variables.confirmConflicts ? "Added over a schedule conflict - the visit now shows on their row too." : "The visit now shows on their row of the board too.",
      });
    },
    onError: (error, variables) => {
      const refusal = getTechnicianExcludedRefusal(error);
      if (refusal && canOverride && !variables.overrideExclusion) {
        setOverridePrompt({ refusal, variables });
        return;
      }
      const conflicts = getCrewConflicts(error);
      if (conflicts && !variables.confirmConflicts) {
        setConflictPrompt({ ...conflicts, variables });
        return;
      }
      toast({ title: "Support technician not added", description: describeCrewError(error), variant: "destructive" });
    },
  });
  const removeMutation = useMutation({
    mutationFn: async (technicianId: string) => {
      const response = await apiRequest("DELETE", `/api/appointments/${appointment.id}/crew/${technicianId}`);
      return response.json() as Promise<AppointmentCrew>;
    },
    onSuccess: () => {
      invalidateCrew();
      toast({ title: "Support technician removed" });
    },
    onError: (error) => toast({ title: "Support technician not removed", description: describeCrewError(error), variant: "destructive" }),
  });
  const members = crew?.members ?? [];
  const memberIds = new Set(members.map((member) => member.technicianId));
  const candidates = technicianOptions.filter((technician) => technician.status === "ACTIVE" && !memberIds.has(technician.id) && technician.id !== appointment.assignedTechnicianId);
  const editable = appointment.status !== "CANCELED" && appointment.status !== "COMPLETED";
  const busy = addMutation.isPending || removeMutation.isPending;

  return (
    <div className="space-y-2 rounded-lg border p-3" data-testid="sheet-crew">
      <div>
        <p className="text-sm font-medium">Crew</p>
        <p className="text-xs text-muted-foreground">
          The lead is the visit's saved technician. Support technicians see the stop on their day; the ticket and its production stay the lead's.
        </p>
      </div>
      {isLoading ? <p className="text-xs text-muted-foreground">Loading crew...</p> : null}
      {!isLoading && !members.length ? <p className="text-xs text-muted-foreground">No technician is assigned yet.</p> : null}
      {members.map((member) => (
        <div key={member.technicianId} className="flex items-center justify-between gap-2 rounded-md border bg-muted/10 px-2 py-1.5" data-testid={`row-crew-${member.technicianId}`}>
          <div className="flex items-center gap-2 text-sm">
            <span>{member.technicianName}</span>
            <Badge variant={member.role === "LEAD" ? "default" : "outline"} className="text-[10px]">{member.role === "LEAD" ? "Lead" : "Support"}</Badge>
          </div>
          {member.role === "SUPPORT" && editable ? (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={busy} onClick={() => removeMutation.mutate(member.technicianId)} data-testid={`button-crew-remove-${member.technicianId}`}>
              Remove
            </Button>
          ) : null}
        </div>
      ))}
      {editable && appointment.assignedTechnicianId ? (
        <div className="flex items-center gap-2">
          <select
            value={supportTechnicianId}
            onChange={(event) => setSupportTechnicianId(event.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
            data-testid="select-crew-support"
          >
            <option value="">Add a support technician</option>
            {candidates.map((technician) => {
              const preference = preferences.find((entry) => entry.technicianId === technician.id);
              return (
                <option key={technician.id} value={technician.id}>
                  {technician.displayName}{preference?.kind === "EXCLUDED" ? " - excluded by the customer" : preference?.kind === "PREFERRED" ? " - preferred" : ""}
                </option>
              );
            })}
          </select>
          <Button type="button" size="sm" variant="outline" disabled={!supportTechnicianId || busy} onClick={() => addMutation.mutate({ technicianId: supportTechnicianId })} data-testid="button-crew-add">
            Add
          </Button>
        </div>
      ) : null}
      {editable && !appointment.assignedTechnicianId ? (
        <p className="text-xs text-muted-foreground">Assign and save the technician first - a support technician joins a lead.</p>
      ) : null}
      <ExclusionOverridePrompt
        refusal={overridePrompt?.refusal ?? null}
        isPending={addMutation.isPending}
        onCancel={() => setOverridePrompt(null)}
        onConfirm={(reason) => {
          if (!overridePrompt) return;
          addMutation.mutate({ ...overridePrompt.variables, overrideExclusion: { reason } });
        }}
      />
      <Dialog open={!!conflictPrompt} onOpenChange={(next) => { if (!next) setConflictPrompt(null); }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-crew-conflict">
          <DialogHeader>
            <DialogTitle>Schedule conflict</DialogTitle>
            <DialogDescription>{conflictPrompt?.message}</DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            {conflictPrompt?.conflicts.map((conflict) => (
              <li key={conflict.appointmentId} data-testid={`text-crew-conflict-${conflict.appointmentId}`}>{describeCrewConflict(conflict)}</li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConflictPrompt(null)}>Cancel</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={addMutation.isPending}
              onClick={() => conflictPrompt && addMutation.mutate({ ...conflictPrompt.variables, confirmConflicts: true })}
              data-testid="button-crew-conflict-confirm"
            >
              Add anyway
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AppointmentSheet({
  appointment,
  service,
  linkedServices,
  technicianOptions,
  serviceTypeName,
  customerLabel,
  locationLabel,
  cancelReasons,
  openOpportunityCount,
  open,
  onOpenChange,
  onSave,
  onDisposition,
  isSaving,
  isDispositioning,
  serviceTypeNameById,
  answersLabelFor,
  serviceTypes,
  queueCandidates,
  ticketedServiceIds,
  canChangeAgreementType,
  onAddService,
  onRemoveService,
  onUpdateService,
  onCancelService,
  isComposing,
  preferences,
  snapMinutes,
}: {
  appointment: Appointment | null;
  service: Service | null;
  /** Pass 30 (C4.4): the customer's technician preferences in effect at the visit's location. */
  preferences: EffectiveTechnicianPreference[];
  /** Pass 31 (C4.5): Settings -> Dispatch Board's snap interval - what Scheduled Start / End round to on save. */
  snapMinutes: DispatchSnapInterval;
  /** Every service on the visit, the representative included - what a disposition touches. */
  linkedServices: Service[];
  technicianOptions: Technician[];
  serviceTypeName: string;
  /** Pass 28 (C4.3a): the org's service types - the type select and the new-service line. */
  serviceTypes: ServiceType[];
  /** Pass 28: the location's pending services not on this visit - the "add from the queue" choices. */
  queueCandidates: Service[];
  /** Pass 28: services with a posted ticket - their type, removal and cancel belong to the ticket flow. */
  ticketedServiceIds: Set<string>;
  /** Pass 28: ADJUST_PRICE_AGREEMENT - whether an agreement service's type select is offered. */
  canChangeAgreementType: boolean;
  /** Pass 28: POST /api/appointments/:id/services - a queued service, or a new one created placed. */
  onAddService: (payload: AppointmentServiceAddRequest) => void;
  /** Pass 28: POST .../services/:serviceId/remove - back to the queue, dates kept. */
  onRemoveService: (service: Service) => void;
  /** Pass 28: PATCH .../services/:serviceId - the type or the duration. */
  onUpdateService: (service: Service, payload: AppointmentServiceUpdateRequest) => void;
  /** Pass 28: opens the reason / opportunity dialog for POST /api/services/:id/cancel. */
  onCancelService: (service: Service) => void;
  isComposing: boolean;
  /** Pass 24 (C3.7): the kind block names each service on the visit. */
  serviceTypeNameById: Map<string, string>;
  /** Pass 24 (C3.7): "Answers <type> on <date>" for a callback, else null. */
  answersLabelFor: (service: Service) => string | null;
  customerLabel: string;
  locationLabel: string;
  /** The settings list a cancel reason must come from. */
  cancelReasons: string[];
  /** Open opportunities already on the visit's services - what "Update existing" would re-date. */
  openOpportunityCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: {
    assignedTechnicianId: string | null;
    scheduledDate: string;
    scheduledEndDate: string | null;
    status: string;
    lockTime: boolean;
    lockTechnician: boolean;
    notes: string | null;
  }) => void;
  /** Pass 27 (C4.2): Cancel appointment / Reschedule - POST /api/appointments/:id/disposition. */
  onDisposition: (payload: AppointmentDispositionRequest) => void;
  isSaving: boolean;
  isDispositioning: boolean;
}) {
  const [assignedTechnicianId, setAssignedTechnicianId] = useState<string>("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledEndDate, setScheduledEndDate] = useState("");
  const [status, setStatus] = useState("SCHEDULED");
  const [lockTime, setLockTime] = useState(false);
  const [lockTechnician, setLockTechnician] = useState(false);
  const [notes, setNotes] = useState("");
  // Pass 27 (C4.2): the two ways off the board. Cancel needs a reason from
  // the settings list and the opportunity choice; Reschedule is a confirm.
  const [disposition, setDisposition] = useState<AppointmentDispositionMode | null>(null);
  const [reasonCode, setReasonCode] = useState("");
  const [dispositionNotes, setDispositionNotes] = useState("");
  const [opportunityChoice, setOpportunityChoice] = useState<DispositionOpportunityChoice>("CREATE");
  // Pass 28 (C4.3a): the composition block's own state - the last-service
  // prompt, the add controls and the per-service duration drafts (committed
  // on blur, since every change is a request).
  const [lastServicePrompt, setLastServicePrompt] = useState<{ service: Service; action: "remove" | "cancel" } | null>(null);
  const [addQueueServiceId, setAddQueueServiceId] = useState("");
  const [newServiceTypeId, setNewServiceTypeId] = useState("");
  const [newServiceDuration, setNewServiceDuration] = useState("");
  const [newServicePrice, setNewServicePrice] = useState("");
  const [durationDrafts, setDurationDrafts] = useState<Record<string, string>>({});
  // D6: the visit's Price / COA / Due today per service and its due-today
  // sum, server-resolved - in place of the raw stamped service price, which
  // is null for agreement work and says nothing about coverage.
  const { data: visitBilling, isLoading: visitBillingLoading, isError: visitBillingError } = useVisitBillingSummary(open ? appointment?.id : null);

  // Pass 30 (C4.4): the "Prefers" hint and the chosen technician's exclusion.
  const preferredHint = describePreferredHint(preferences);
  const selectedExclusion = findExclusion(preferences, assignedTechnicianId || null);
  const activeServices = linkedServices.filter((linked) => linked.status !== "COMPLETED" && linked.status !== "CANCELLED");
  const agreementServiceCount = activeServices.filter((linked) => !!linked.agreementId).length;
  const oneTimeServiceCount = activeServices.length - agreementServiceCount;
  const defaultOpportunityChoice: DispositionOpportunityChoice = openOpportunityCount > 0 ? "UPDATE_EXISTING" : "CREATE";

  useEffect(() => {
    if (!appointment) return;
    setAssignedTechnicianId(appointment.assignedTechnicianId || "");
    setScheduledDate(formatDateTimeLocalValue(appointment.scheduledDate));
    setScheduledEndDate(formatDateTimeLocalValue(appointment.scheduledEndDate));
    setStatus(appointment.status || "SCHEDULED");
    setLockTime(appointment.lockTime ?? false);
    setLockTechnician(appointment.lockTechnician ?? false);
    setNotes(appointment.notes || "");
  }, [appointment]);

  // Pass 27b (C4.2b): the two dialogs belong to the sheet's appointment. When
  // it changes - another placement, or none once a disposition completes and
  // the page closes the sheet - their state goes with it, so neither dialog
  // outlives the sheet it was opened from. (The reset above returns early on
  // null, which left a dialog open over an empty sheet.) Keyed on the id, not
  // the row, so a refetch of the same placement cannot close a dialog
  // mid-edit.
  const appointmentId = appointment?.id ?? null;
  useEffect(() => {
    setDisposition(null);
    setReasonCode("");
    setDispositionNotes("");
    setOpportunityChoice("CREATE");
    setLastServicePrompt(null);
    setAddQueueServiceId("");
    setNewServiceTypeId("");
    setNewServiceDuration("");
    setNewServicePrice("");
    setDurationDrafts({});
  }, [appointmentId]);
  // A committed duration change comes back through the row; drop its draft.
  useEffect(() => {
    setDurationDrafts({});
  }, [linkedServices]);

  const visitServices = linkedServices.length ? linkedServices : service ? [service] : [];
  const commitDuration = (linked: Service, draft: string) => {
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : parseInt(trimmed, 10);
    if (next !== null && (Number.isNaN(next) || next < 0)) return;
    if ((next ?? null) !== (linked.expectedDurationMinutes ?? null)) {
      onUpdateService(linked, { expectedDurationMinutes: next });
    }
  };
  const submitNewService = () => {
    if (!newServiceTypeId) return;
    const duration = newServiceDuration.trim();
    onAddService({
      service: {
        serviceTypeId: newServiceTypeId,
        expectedDurationMinutes: duration === "" ? null : parseInt(duration, 10),
        priceCents: dollarsToCents(newServicePrice),
      },
    });
    setNewServiceTypeId("");
    setNewServiceDuration("");
    setNewServicePrice("");
  };

  const openDisposition = (mode: AppointmentDispositionMode) => {
    setReasonCode("");
    setDispositionNotes("");
    setOpportunityChoice(defaultOpportunityChoice);
    setDisposition(mode);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        {/* The sheet is pinned to the viewport's height (inset-y-0 h-full) and, since Pass 28's
            composition block, its content runs past the fold - the owner's first render (2026-09-30)
            could not reach the buttons. It scrolls, as the technician's Appointment Details dialog does. */}
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg" data-testid="sheet-appointment-details">
          <SheetHeader className="pr-8">
            <SheetTitle>Appointment Details</SheetTitle>
            <SheetDescription>
              Manage scheduling attributes without leaving the dispatch board.
            </SheetDescription>
          </SheetHeader>
          {appointment ? (
            <div className="mt-6 space-y-5">
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{customerLabel}</p>
                    <p className="text-xs text-muted-foreground">{serviceTypeName}</p>
                  </div>
                  <Badge variant="outline">{describeAppointmentStatus(appointment)}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{locationLabel}</p>
                {/* Pass 28 (C4.3a; B13 "Appointment Details"): the visit's composition - each service with its
                    type (a select on one-time work; locked on agreement work unless the role holds
                    ADJUST_PRICE_AGREEMENT, and once a ticket is posted), its expected duration (committed on
                    blur), its kind (Pass 24 - the Billable / Production badge in the billing rows below is the
                    invoice LINE, not the kind) and answers line, Remove (back to the queue, dates kept) and Cancel
                    (the reason / opportunity dialog). The last active service's Remove / Cancel prompts to
                    reschedule or cancel the appointment instead. Add from the location's queue, or create a
                    one-time service placed here. Every change is a route (B13: the field is a native app later). */}
                <div className="mt-3 space-y-2" data-testid="sheet-composition">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Services on this visit</p>
                  {visitServices.length === 0 ? <p className="text-xs text-muted-foreground">No service is linked to this visit.</p> : null}
                  {visitServices.map((linked) => {
                    const answers = answersLabelFor(linked);
                    const settled = linked.status === "COMPLETED" || linked.status === "CANCELLED";
                    const hasTicket = ticketedServiceIds.has(linked.id);
                    const isAgreement = !!linked.agreementId;
                    const typeLockReason = settled
                      ? "Settled - its type is history."
                      : hasTicket
                        ? "A ticket is posted - the type is changed on the ticket."
                        : isAgreement && !canChangeAgreementType
                          ? "Agreement work - a manager or an admin may change the type."
                          : null;
                    const actionLockReason = settled
                      ? (linked.status === "COMPLETED" ? "Completed - the ticket owns it" : "Cancelled")
                      : hasTicket
                        ? "A ticket is posted on this service - reopen or edit the ticket instead"
                        : null;
                    const isLastActive = !settled && activeServices.length === 1;
                    const durationDraft = durationDrafts[linked.id] ?? (linked.expectedDurationMinutes ? String(linked.expectedDurationMinutes) : "");
                    return (
                      <div key={linked.id} className="rounded-md border bg-background p-2 text-xs" data-testid={`sheet-service-${linked.id}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{serviceTypeNameById.get(linked.serviceTypeId || "") || "Service"}</span>
                          <ServiceWorkKindBadge workKind={linked.workKind} className="text-[10px]" />
                          {isAgreement ? <Badge variant="secondary" className="text-[10px]">Agreement</Badge> : null}
                          {settled ? (
                            <Badge variant="outline" className="text-[10px]">{linked.status === "COMPLETED" ? "Completed" : "Cancelled"}</Badge>
                          ) : hasTicket ? (
                            <Badge variant="outline" className="text-[10px]">Ticket posted</Badge>
                          ) : null}
                          {/* Pass 29 (C4.3b): added from the field - the office's review flag and its action. */}
                          <FieldAddedBadge service={linked} className="text-[10px]" />
                          <span className="ml-auto font-medium">{formatCurrency(linked.priceCents)}</span>
                        </div>
                        <MarkFieldReviewedButton service={linked} className="mt-2 h-7 px-2 text-xs" />
                        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_96px]">
                          <div className="space-y-1">
                            <label className="text-[11px] text-muted-foreground" htmlFor={`sheet-service-type-${linked.id}`}>Service type</label>
                            <select
                              id={`sheet-service-type-${linked.id}`}
                              value={linked.serviceTypeId || ""}
                              disabled={!!typeLockReason || isComposing}
                              title={typeLockReason ?? undefined}
                              onChange={(event) => {
                                if (event.target.value && event.target.value !== linked.serviceTypeId) {
                                  onUpdateService(linked, { serviceTypeId: event.target.value });
                                }
                              }}
                              className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-xs disabled:opacity-60"
                              data-testid={`select-sheet-service-type-${linked.id}`}
                            >
                              {!linked.serviceTypeId ? <option value="">No type</option> : null}
                              {serviceTypes.map((serviceType) => (
                                <option key={serviceType.id} value={serviceType.id}>{serviceType.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] text-muted-foreground" htmlFor={`sheet-service-minutes-${linked.id}`}>Minutes</label>
                            <Input
                              id={`sheet-service-minutes-${linked.id}`}
                              type="number"
                              min={0}
                              value={durationDraft}
                              disabled={settled || isComposing}
                              onChange={(event) => setDurationDrafts((current) => ({ ...current, [linked.id]: event.target.value }))}
                              onBlur={() => commitDuration(linked, durationDraft)}
                              className="h-9 text-xs"
                              data-testid={`input-sheet-service-minutes-${linked.id}`}
                            />
                          </div>
                        </div>
                        {typeLockReason ? <p className="mt-1 text-[11px] text-muted-foreground">{typeLockReason}</p> : null}
                        {answers ? <p className="mt-1 text-muted-foreground">{answers}</p> : null}
                        {!settled ? (
                          <div className="mt-2 flex flex-wrap justify-end gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={!!actionLockReason || isComposing}
                              title={actionLockReason ?? "Back to the pending queue, dates kept"}
                              onClick={() => (isLastActive ? setLastServicePrompt({ service: linked, action: "remove" }) : onRemoveService(linked))}
                              data-testid={`button-sheet-service-remove-${linked.id}`}
                            >
                              Remove
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={!!actionLockReason || isComposing}
                              title={actionLockReason ?? "Cancel this service with a reason"}
                              onClick={() => (isLastActive ? setLastServicePrompt({ service: linked, action: "cancel" }) : onCancelService(linked))}
                              data-testid={`button-sheet-service-cancel-${linked.id}`}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  <div className="rounded-md border border-dashed p-2" data-testid="sheet-add-service">
                    <p className="text-[11px] font-medium">Add service</p>
                    <div className="mt-1 flex flex-wrap items-end gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <label className="text-[11px] text-muted-foreground" htmlFor="sheet-add-queue">From the pending queue</label>
                        <select
                          id="sheet-add-queue"
                          value={addQueueServiceId}
                          onChange={(event) => setAddQueueServiceId(event.target.value)}
                          disabled={isComposing || queueCandidates.length === 0}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-xs disabled:opacity-60"
                          data-testid="select-sheet-add-queue"
                        >
                          <option value="">{queueCandidates.length ? "Select a pending service" : "No pending service at this location"}</option>
                          {queueCandidates.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {serviceTypeNameById.get(candidate.serviceTypeId || "") || "Service"}
                              {candidate.dueDate ? ` - due ${candidate.dueDate}` : ""}
                              {candidate.agreementId ? " (agreement)" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="h-9"
                        disabled={!addQueueServiceId || isComposing}
                        onClick={() => { onAddService({ serviceId: addQueueServiceId }); setAddQueueServiceId(""); }}
                        data-testid="button-sheet-add-queue"
                      >
                        Add
                      </Button>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_80px_88px_auto] sm:items-end">
                      <div className="space-y-1">
                        <label className="text-[11px] text-muted-foreground" htmlFor="sheet-add-type">New one-time service</label>
                        <select
                          id="sheet-add-type"
                          value={newServiceTypeId}
                          onChange={(event) => {
                            const serviceType = serviceTypes.find((item) => item.id === event.target.value);
                            setNewServiceTypeId(event.target.value);
                            setNewServiceDuration(serviceType?.estimatedDuration ? String(serviceType.estimatedDuration) : "");
                            setNewServicePrice(serviceType?.defaultPriceCents != null ? centsToDollarString(serviceType.defaultPriceCents) : "");
                          }}
                          disabled={isComposing}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-xs disabled:opacity-60"
                          data-testid="select-sheet-add-type"
                        >
                          <option value="">Select a service type</option>
                          {serviceTypes.map((serviceType) => (
                            <option key={serviceType.id} value={serviceType.id}>{serviceType.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-muted-foreground" htmlFor="sheet-add-minutes">Minutes</label>
                        <Input id="sheet-add-minutes" type="number" min={0} value={newServiceDuration} onChange={(event) => setNewServiceDuration(event.target.value)} disabled={isComposing} className="h-9 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-muted-foreground" htmlFor="sheet-add-price">Price</label>
                        <Input id="sheet-add-price" type="number" min={0} step="0.01" value={newServicePrice} onChange={(event) => setNewServicePrice(event.target.value)} disabled={isComposing} className="h-9 text-xs" />
                      </div>
                      <Button type="button" size="sm" className="h-9" disabled={!newServiceTypeId || isComposing} onClick={submitNewService} data-testid="button-sheet-add-new">
                        Create
                      </Button>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {PLANNED_END_RULE_TEXT} A callback is created from the location's Services tab, where the service it answers is picked.
                    </p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Billing below shows each service's invoice line (Billable / Production), not its kind.</p>
                </div>
                <div className="mt-3">
                  <VisitBillingRows summary={visitBilling} isLoading={visitBillingLoading} isError={visitBillingError} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Technician</label>
                <select
                  value={assignedTechnicianId}
                  onChange={(event) => setAssignedTechnicianId(event.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Unassigned</option>
                  {technicianOptions.map((technician) => {
                    // Pass 30: an excluded technician stays choosable - saving comes back 409 and a
                    // manager is asked for the override reason; the label says so up front.
                    const preference = preferences.find((entry) => entry.technicianId === technician.id);
                    return (
                      <option key={technician.id} value={technician.id}>
                        {technician.displayName} {technician.status !== "ACTIVE" ? `(${technician.status})` : ""}
                        {preference?.kind === "EXCLUDED" ? " - excluded by the customer" : preference?.kind === "PREFERRED" ? " - preferred" : ""}
                      </option>
                    );
                  })}
                </select>
                {preferredHint ? <p className="text-xs text-emerald-700" data-testid="text-sheet-preferred-hint">{preferredHint}</p> : null}
                {/* Pass 30b: a change to someone other than the preferred technician asks for confirmation on save. */}
                {preferredHint && !selectedExclusion && assignedTechnicianId && assignedTechnicianId !== (appointment.assignedTechnicianId || "")
                  && !preferences.some((entry) => entry.kind === "PREFERRED" && entry.technicianId === assignedTechnicianId) ? (
                  <p className="text-xs text-amber-700" data-testid="text-sheet-preference-warning">Not the customer's preferred technician - saving asks you to confirm.</p>
                ) : null}
                {selectedExclusion ? (
                  <p className="text-xs text-destructive" data-testid="text-sheet-exclusion-warning">
                    The customer asked that {selectedExclusion.technicianName} never be sent ({describePreferenceScope(selectedExclusion.scopeType)}){selectedExclusion.note ? `: ${selectedExclusion.note}` : ""}.
                    {assignedTechnicianId !== (appointment.assignedTechnicianId || "")
                      ? " Saving needs a manager's override with a reason."
                      : " This visit was placed before the exclusion was recorded."}
                  </p>
                ) : null}
              </div>

              <AppointmentCrewBlock appointment={appointment} technicianOptions={technicianOptions} preferences={preferences} />

              {/* Pass 31 (C4.5): the inputs step by the snap interval and the
                  save rounds both times to it (shared/dispatch-board.ts). */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Scheduled Start</label>
                  <input
                    type="datetime-local"
                    value={scheduledDate}
                    step={snapMinutes * 60}
                    onChange={(event) => setScheduledDate(event.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    data-testid="input-sheet-scheduled-start"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Scheduled End</label>
                  <input
                    type="datetime-local"
                    value={scheduledEndDate}
                    step={snapMinutes * 60}
                    onChange={(event) => setScheduledEndDate(event.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    data-testid="input-sheet-scheduled-end"
                  />
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-2" data-testid="text-sheet-snap-hint">
                  Times round to the nearest {describeSnapInterval(snapMinutes)} when saved (Settings &rarr; Dispatch Board).
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                {/* Pass 27: CANCELED is the disposition's to write, never the
                    form's. Since Pass 27b a cancelled placement is not a board
                    card (isBoardPlacement), so the sheet never shows one and
                    the select is always offered. */}
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                </select>
              </div>

              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Lock Time</p>
                    <p className="text-xs text-muted-foreground">Prevents board moves to a different time slot.</p>
                  </div>
                  <Switch checked={lockTime} onCheckedChange={setLockTime} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Lock Technician</p>
                    <p className="text-xs text-muted-foreground">Prevents reassignment to another technician row.</p>
                  </div>
                  <Switch checked={lockTechnician} onCheckedChange={setLockTechnician} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Scheduling Notes</label>
                <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="destructive" onClick={() => openDisposition("CANCEL")} disabled={isSaving || isDispositioning}>
                  Cancel appointment
                </Button>
                <Button type="button" variant="outline" onClick={() => openDisposition("RESCHEDULE")} disabled={isSaving || isDispositioning}>
                  Reschedule
                </Button>
                <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                <Button
                  onClick={() => {
                    // Pass 31: both times round to the snap (nearest; a half
                    // rounds up). An end that rounds onto or before the start
                    // keeps one snap of duration rather than inverting.
                    const start = snapDateToInterval(new Date(scheduledDate), snapMinutes);
                    let end = scheduledEndDate ? snapDateToInterval(new Date(scheduledEndDate), snapMinutes) : null;
                    if (end && end.getTime() <= start.getTime()) end = new Date(start.getTime() + snapMinutes * 60000);
                    onSave({
                      assignedTechnicianId: assignedTechnicianId || null,
                      scheduledDate: start.toISOString(),
                      scheduledEndDate: end ? end.toISOString() : null,
                      status,
                      lockTime,
                      lockTechnician,
                      notes: notes.trim() || null,
                    });
                  }}
                  disabled={isSaving || !scheduledDate}
                >
                  Save Appointment
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={disposition === "CANCEL"} onOpenChange={(next) => { if (!next) setDisposition(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel appointment</DialogTitle>
            <DialogDescription>
              The visit is cancelled with a reason. Agreement services return to the pending queue with their service window reset from today; one-time services are cancelled.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
              {activeServices.length ? (
                <>
                  {agreementServiceCount > 0 ? <p>{pluralize(agreementServiceCount, "agreement service")} back to the queue, window reset from today.</p> : null}
                  {oneTimeServiceCount > 0 ? <p>{pluralize(oneTimeServiceCount, "one-time service")} cancelled.</p> : null}
                </>
              ) : (
                <p>No active services on this visit.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="disposition-reason">Reason</Label>
              <select
                id="disposition-reason"
                value={reasonCode}
                onChange={(event) => setReasonCode(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select a reason</option>
                {cancelReasons.map((reason) => (
                  <option key={reason} value={reason}>{reason}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">From Settings, Appointment Cancel / Reschedule Reasons.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="disposition-notes">Notes</Label>
              <Textarea
                id="disposition-notes"
                value={dispositionNotes}
                onChange={(event) => setDispositionNotes(event.target.value)}
                rows={3}
                placeholder="Customer context or office instructions."
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Opportunity</legend>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="disposition-opportunity"
                  className="mt-1"
                  checked={opportunityChoice === "UPDATE_EXISTING"}
                  onChange={() => setOpportunityChoice("UPDATE_EXISTING")}
                  disabled={openOpportunityCount === 0}
                />
                <span>
                  <span className={openOpportunityCount === 0 ? "text-muted-foreground" : ""}>Update the open opportunity on the service</span>
                  <span className="block text-xs text-muted-foreground">
                    {openOpportunityCount > 0
                      ? `Re-dates ${pluralize(openOpportunityCount, "open opportunity", "open opportunities")} to today.`
                      : "None is open on this visit's services."}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="disposition-opportunity"
                  className="mt-1"
                  checked={opportunityChoice === "CREATE"}
                  onChange={() => setOpportunityChoice("CREATE")}
                />
                <span>
                  Create a new opportunity
                  <span className="block text-xs text-muted-foreground">Reschedule for a service back in the queue; Win-back for a cancelled one-time service.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="disposition-opportunity"
                  className="mt-1"
                  checked={opportunityChoice === "NONE"}
                  onChange={() => setOpportunityChoice("NONE")}
                />
                <span>
                  No opportunity
                  <span className="block text-xs text-muted-foreground">Nothing keeps this visit visible for follow-up.</span>
                </span>
              </label>
            </fieldset>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDisposition(null)} disabled={isDispositioning}>Back</Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!reasonCode || isDispositioning}
                onClick={() => onDisposition({ mode: "CANCEL", reasonCode, notes: dispositionNotes.trim() || null, opportunity: opportunityChoice })}
              >
                {isDispositioning ? "Cancelling..." : "Cancel appointment"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={disposition === "RESCHEDULE"} onOpenChange={(next) => { if (!next) setDisposition(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Return this appointment to the queue?</AlertDialogTitle>
            <AlertDialogDescription>
              {activeServices.length
                ? `${pluralize(activeServices.length, "service")} ${activeServices.length === 1 ? "goes" : "go"} back to Pending scheduling`
                : "The visit's services go back to Pending scheduling"}
              {" "}for the office to place on a new day and time. No reason is recorded and no opportunity is created; the placement stays in history as rescheduled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" onClick={() => setDisposition(null)} disabled={isDispositioning}>Back</Button>
            <Button
              type="button"
              onClick={() => onDisposition({ mode: "RESCHEDULE", reasonCode: null, notes: null, opportunity: "NONE" })}
              disabled={isDispositioning}
            >
              {isDispositioning ? "Returning..." : "Reschedule"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pass 28: the last active service cannot leave a visit on its own - an appointment leaves the
          board only through its disposition (canon §11). Offer the disposition that matches. */}
      <AlertDialog open={!!lastServicePrompt} onOpenChange={(next) => { if (!next) setLastServicePrompt(null); }}>
        <AlertDialogContent data-testid="dialog-last-service">
          <AlertDialogHeader>
            <AlertDialogTitle>This is the only service on the visit</AlertDialogTitle>
            <AlertDialogDescription>
              {lastServicePrompt?.action === "remove"
                ? "Removing it would leave an empty visit on the board. Reschedule the appointment instead: the service goes back to the queue with its dates kept and the placement stays in history."
                : "Cancelling it would leave an empty visit on the board. Cancel the appointment instead: the same reason list and opportunity choice apply to the visit."}
              {" "}An appointment leaves the board only through its disposition.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" onClick={() => setLastServicePrompt(null)}>Back</Button>
            {lastServicePrompt?.action === "remove" ? (
              <Button type="button" onClick={() => { setLastServicePrompt(null); openDisposition("RESCHEDULE"); }}>Reschedule appointment</Button>
            ) : (
              <Button type="button" variant="destructive" onClick={() => { setLastServicePrompt(null); openDisposition("CANCEL"); }}>Cancel appointment</Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ServiceDetailDialog({
  service,
  serviceTypeName,
  customerLabel,
  locationLabel,
  technicianName,
  answersLabel,
  open,
  onOpenChange,
}: {
  service: Service | null;
  serviceTypeName: string;
  customerLabel: string;
  locationLabel: string;
  technicianName: string;
  /** Pass 24 (C3.7): "Answers <type> on <date>" when the service is a callback. */
  answersLabel: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Service Details</DialogTitle>
          <DialogDescription>
            Current service details tied to the selected dispatch card.
          </DialogDescription>
        </DialogHeader>
        {service ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="font-semibold">{customerLabel}</p>
              <p className="text-muted-foreground">{locationLabel}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Service Type</p>
                <p className="mt-1 font-medium">{serviceTypeName}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
                <p className="mt-1 font-medium">{service.status}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Work Kind</p>
                <div className="mt-1"><ServiceWorkKindBadge workKind={service.workKind} /></div>
                {answersLabel ? <p className="mt-1 text-xs text-muted-foreground" data-testid={`text-service-answers-${service.id}`}>{answersLabel}</p> : null}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Due / Service Date</p>
                <p className="mt-1 font-medium">{service.dueDate || "Not set"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Expected Duration</p>
                <p className="mt-1 font-medium">{service.expectedDurationMinutes ? `${service.expectedDurationMinutes} min` : "Not set"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Technician</p>
                <p className="mt-1 font-medium">{technicianName || "Unassigned"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Service Value</p>
                <p className="mt-1 font-medium">{formatCurrency(service.priceCents)}</p>
              </div>
            </div>
            {service.notes ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
                <p className="mt-1 whitespace-pre-wrap rounded-md border bg-background px-3 py-2">{service.notes}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default function Schedule() {
  const { toast } = useToast();
  const { user } = useAuth();
  // Pass 28 (decision 6): an agreement service's type is the price's rule.
  const canChangeAgreementType = can(user?.role ?? "", PERMISSIONS.ADJUST_PRICE_AGREEMENT);
  const search = useSearch();
  const [, setLocation] = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);

  const [view, setView] = useState<(typeof VIEW_OPTIONS)[number]["value"]>("day");
  const [currentDate, setCurrentDate] = useState(() => {
    const dateParam = params.get("date");
    return dateParam ? new Date(`${dateParam}T00:00:00`) : new Date();
  });
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(params.get("serviceId"));
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(params.get("appointmentId"));
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const [detailServiceId, setDetailServiceId] = useState<string | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  // Pass 31 (C4.5): the window's defaults are Settings -> Dispatch Board
  // (GET /api/settings/dispatch-board - the defaults, today's board, until
  // the office changes them). The Window popover writes a session override
  // on top: React state, gone on reload, which is what its footer has
  // always said. The snap has no override, but on the board it is never
  // coarser than the view interval in use (a 30-minute view with a one-hour
  // snap would place a :30 slot's click on the next hour), the same rule
  // the settings enforce.
  const { data: dispatchSettings, isLoading: dispatchSettingsLoading } = useQuery<DispatchBoardSettings>({ queryKey: ["/api/settings/dispatch-board"] });
  const boardDefaults = dispatchSettings ?? DEFAULT_DISPATCH_BOARD_SETTINGS;
  const [windowOverride, setWindowOverride] = useState<{ startHour?: number; endHour?: number; viewIntervalMinutes?: DispatchViewInterval }>({});
  const boardStartHour = windowOverride.startHour ?? boardDefaults.defaultStartHour;
  const boardEndHour = visibleEndHourFor(boardStartHour, windowOverride.endHour ?? boardDefaults.defaultEndHour);
  const viewIntervalMinutes = windowOverride.viewIntervalMinutes ?? boardDefaults.viewIntervalMinutes;
  const snapMinutes = Math.min(boardDefaults.snapMinutes, viewIntervalMinutes) as DispatchSnapInterval;
  const windowOverridden = Object.keys(windowOverride).length > 0;
  const groupedServiceIds = useMemo(() => (params.get("serviceIds") || "").split(",").map((id) => id.trim()).filter(Boolean), [params]);

  const { data: technicians, isLoading: techniciansLoading } = useQuery<Technician[]>({ queryKey: ["/api/technicians?includeInactive=true"] });
  const { data: appointments, isLoading: appointmentsLoading } = useQuery<Appointment[]>({ queryKey: ["/api/appointments"] });
  const { data: allServices, isLoading: servicesLoading } = useQuery<Service[]>({ queryKey: ["/api/services"] });
  const { data: serviceRecords } = useQuery<ServiceRecord[]>({ queryKey: ["/api/service-records"] });
  const { data: pendingServices, isLoading: pendingLoading } = useQuery<Service[]>({ queryKey: ["/api/services/pending"] });
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });
  // Pass 27: the sheet's Cancel appointment takes its reason from the
  // settings list.
  const { data: cancelReasonSettings } = useQuery<{ reasons: string[] }>({ queryKey: ["/api/settings/appointment-cancel-reasons"] });
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/all-locations"] });

  const serviceTypeNameById = useMemo(() => new Map((serviceTypes ?? []).map((serviceType) => [serviceType.id, serviceType.name])), [serviceTypes]);
  const customerById = useMemo(() => new Map((customers ?? []).map((customer) => [customer.id, customer])), [customers]);
  const locationById = useMemo(() => new Map((locations ?? []).map((location) => [location.id, location])), [locations]);
  const serviceById = useMemo(() => new Map((allServices ?? []).map((service) => [service.id, service])), [allServices]);
  const technicianById = useMemo(() => new Map((technicians ?? []).map((technician) => [technician.id, technician])), [technicians]);
  const serviceRecordByServiceId = useMemo(() => {
    const map = new Map<string, ServiceRecord>();
    for (const serviceRecord of serviceRecords ?? []) {
      if (serviceRecord.serviceId) map.set(serviceRecord.serviceId, serviceRecord);
    }
    return map;
  }, [serviceRecords]);
  // Pass 24 (C3.7): "Answers <type> on <date>" for a callback - the queue,
  // the sheet and the service dialog. The date is the answered visit's ticket
  // date, else its appointment's, else its due date.
  const appointmentById = useMemo(() => new Map((appointments ?? []).map((appointment) => [appointment.id, appointment])), [appointments]);
  const answersLabelFor = (service: Service): string | null => {
    if (!service.answersServiceId) return null;
    const answered = serviceById.get(service.answersServiceId);
    if (!answered) return "Answers a service that is no longer listed";
    const record = serviceRecordByServiceId.get(answered.id);
    const appointment = answered.appointmentId ? appointmentById.get(answered.appointmentId) : undefined;
    return describeAnswersLink(
      serviceTypeNameById.get(answered.serviceTypeId || "") || "Service",
      formatAnswersDate(record?.serviceDate ?? appointment?.scheduledDate ?? answered.dueDate),
    );
  };
  // Pass 28: a CANCELLED service still linked to a visit (the disposition's
  // convention for a one-time service on a visit it cancels; a legacy row)
  // is not on the card - the "+N other services", the revenue sum and the
  // sheet's list stop counting it. A service this pass cancels off a live
  // visit is detached anyway.
  const servicesByAppointmentId = useMemo(() => {
    const map = new Map<string, Service[]>();
    for (const service of allServices ?? []) {
      if (!service.appointmentId || service.status === "CANCELLED") continue;
      const existing = map.get(service.appointmentId) ?? [];
      existing.push(service);
      map.set(service.appointmentId, existing);
    }
    return map;
  }, [allServices]);

  const currentView = VIEW_OPTIONS.find((option) => option.value === view)!;
  const boardDates = useMemo(() => Array.from({ length: currentView.step }, (_, index) => startOfDay(addDays(currentDate, index))), [currentDate, currentView.step]);
  // Pass 31: the slot starts (minutes of day) and where each day's window
  // really ends - the last slot's end, so 8 AM - 5 PM in two-hour columns
  // ends at 6 PM with the grid.
  const slotStarts = useMemo(() => slotStartsForWindow(boardStartHour, boardEndHour, viewIntervalMinutes), [boardEndHour, boardStartHour, viewIntervalMinutes]);
  const windowStartMinutes = boardStartHour * 60;
  const windowEnd = windowEndMinutes(slotStarts, viewIntervalMinutes, boardStartHour);

  // The fetch range for the support cards: the first day's start to the last day's end.
  const viewportBounds = useMemo(() => ({
    start: buildSlotDate(boardDates[0], windowStartMinutes),
    end: buildSlotDate(boardDates[boardDates.length - 1], windowEnd),
  }), [boardDates, windowEnd, windowStartMinutes]);

  // Pass 27b (C4.2b): what the board shows. A CANCELED placement - cancelled
  // or rescheduled alike - is history, not a card (owner, 2026-09-25): its
  // slot is free, and the location's Services and History tabs keep the
  // record. One shared predicate, applied once here; the viewport, the slot
  // map, the analytics and the card selection all derive from this list, so
  // none of them can show what the others hide. The read itself stays
  // unfiltered (the dashboard, the ticket review queue and the Services tab
  // still need the row).
  const boardAppointments = useMemo(() => (appointments ?? []).filter(isBoardPlacement), [appointments]);

  // Pass 31: "in view" is per day - the visit's own day is on the board and
  // its start falls inside that day's window. The old test was one continuous
  // range from the first day's start to the last day's end, so on a 3-day or
  // week view an off-window visit on a middle day passed it and landed in the
  // first or last slot of its row (the multi-day spill); it also let a visit
  // up to one interval past the end hour ride the last slot.
  const boardDayKeys = useMemo(() => new Set(boardDates.map(formatDateInputValue)), [boardDates]);
  const viewportAppointments = useMemo(() => {
    return boardAppointments.filter((appointment) => {
      const scheduled = new Date(appointment.scheduledDate);
      if (!boardDayKeys.has(formatDateInputValue(scheduled))) return false;
      const minutes = minutesOfDay(scheduled);
      return minutes >= windowStartMinutes && minutes < windowEnd;
    });
  }, [boardAppointments, boardDayKeys, windowEnd, windowStartMinutes]);

  const visibleTechnicians = useMemo(() => {
    const base = (technicians ?? []).filter((technician) => technician.status === "ACTIVE");
    const visibleIds = new Set(base.map((technician) => technician.id));
    const extras = viewportAppointments
      .map((appointment) => appointment.assignedTechnicianId)
      .filter((technicianId): technicianId is string => !!technicianId)
      .map((technicianId) => technicianById.get(technicianId))
      .filter((technician): technician is Technician => !!technician && !visibleIds.has(technician.id));
    return [...base, ...extras];
  }, [technicianById, technicians, viewportAppointments]);

  // Pass 31: one key shape for both maps and the grid - technician, day,
  // slot start in minutes of day. A start no slot covers (none in practice,
  // since viewportAppointments is already inside the window) has no key.
  const slotKeyFor = useCallback((technicianId: string, scheduledDate: Date | string): string | null => {
    const scheduled = new Date(scheduledDate);
    const slotStart = slotStartFor(minutesOfDay(scheduled), slotStarts, viewIntervalMinutes);
    return slotStart === null ? null : `${technicianId}:${formatDateInputValue(scheduled)}:${slotStart}`;
  }, [slotStarts, viewIntervalMinutes]);

  const appointmentsByTechnicianAndSlot = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const appointment of viewportAppointments) {
      if (!appointment.assignedTechnicianId) continue;
      const key = slotKeyFor(appointment.assignedTechnicianId, appointment.scheduledDate);
      if (!key) continue;
      const items = map.get(key) ?? [];
      items.push(appointment);
      map.set(key, items);
    }
    return map;
  }, [slotKeyFor, viewportAppointments]);

  // Pass 30b (owner, 2026-10-03): a support technician's copy of each visit
  // they are crewed on - a second card on their row, so their time reads as
  // booked. It is the same visit (one appointment, one invoice): the card
  // opens its sheet and is never selected for a move.
  const { data: supportAssignments } = useQuery<SupportAssignment[]>({
    queryKey: [`/api/appointment-crews/support?from=${viewportBounds.start.toISOString()}&to=${viewportBounds.end.toISOString()}`],
  });
  const supportAppointmentsBySlot = useMemo(() => {
    const byId = new Map(viewportAppointments.map((appointment) => [appointment.id, appointment]));
    const map = new Map<string, Appointment[]>();
    for (const assignment of supportAssignments ?? []) {
      const appointment = byId.get(assignment.appointmentId);
      if (!appointment) continue;
      const key = slotKeyFor(assignment.technicianId, appointment.scheduledDate);
      if (!key) continue;
      const items = map.get(key) ?? [];
      items.push(appointment);
      map.set(key, items);
    }
    return map;
  }, [slotKeyFor, supportAssignments, viewportAppointments]);

  const selectedService = useMemo(() => (pendingServices ?? []).find((service) => service.id === selectedServiceId) ?? null, [pendingServices, selectedServiceId]);
  const selectedAppointment = useMemo(() => boardAppointments.find((appointment) => appointment.id === selectedAppointmentId) ?? null, [boardAppointments, selectedAppointmentId]);
  const editingAppointment = useMemo(() => boardAppointments.find((appointment) => appointment.id === editingAppointmentId) ?? null, [boardAppointments, editingAppointmentId]);
  const detailService = useMemo(() => (detailServiceId ? serviceById.get(detailServiceId) ?? null : null), [detailServiceId, serviceById]);

  const prefillServiceMutation = useMutation({
    mutationFn: async () => {
      const customerId = params.get("customerId");
      const locationId = params.get("locationId");
      const serviceTypeId = params.get("serviceTypeId");
      const expectedDurationMinutes = params.get("expectedDurationMinutes");
      const price = params.get("price");
      const serviceTemplateName = params.get("serviceTemplateName");
      if (!customerId || !locationId || !serviceTypeId) {
        throw new Error("Missing context to create the pending service");
      }
      const dueDate = params.get("date") || params.get("scheduledDate")?.slice(0, 10) || formatDateInputValue(new Date());
      const response = await apiRequest("POST", "/api/services", {
        customerId,
        locationId,
        agreementId: params.get("agreementId") || null,
        serviceTypeId,
        dueDate,
        expectedDurationMinutes: expectedDurationMinutes ? parseInt(expectedDurationMinutes, 10) : null,
        priceCents: dollarsToCents(price),
        status: "PENDING_SCHEDULING",
        assignedTechnicianId: null,
        source: params.get("agreementId") ? "AGREEMENT_INITIAL" : "MANUAL",
        notes: [params.get("agreementName") ? `Agreement: ${params.get("agreementName")}` : null, serviceTemplateName].filter(Boolean).join("\n") || null,
      });
      return response.json() as Promise<Service>;
    },
    onSuccess: (service) => {
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
      setSelectedServiceId(service.id);
      const nextParams = new URLSearchParams(params);
      nextParams.set("serviceId", service.id);
      setLocation(`/schedule?${nextParams.toString()}`);
    },
    // Pass 24 (C3.7): the prefill takes the type's kind. Its only caller today
    // is the agreement's initial service, which never defaults to a callback,
    // so a CALLBACK_LINK_REQUIRED refusal here means a link built by hand -
    // say so instead of failing silently.
    onError: (error: Error) => toast({
      title: "Unable to create the pending service",
      description: `${getApiErrorMessage(error)} A callback is created from the location's Services tab, where the service it answers is picked.`,
      variant: "destructive",
    }),
  });

  useEffect(() => {
    const hasExistingService = !!params.get("serviceId");
    const hasSeedContext = !!params.get("customerId") && !!params.get("locationId") && !!params.get("serviceTypeId");
    if (!hasExistingService && hasSeedContext && !prefillServiceMutation.isPending && !prefillServiceMutation.isSuccess) {
      prefillServiceMutation.mutate();
    }
  }, [params, prefillServiceMutation]);

  useEffect(() => {
    const appointmentId = params.get("appointmentId");
    if (appointmentId) {
      setSelectedAppointmentId(appointmentId);
      setSelectedServiceId(null);
    }
  }, [params]);

  // Pass 27b: a deep link (`?appointmentId=` from an invoice's "Open on
  // schedule" or a payment's visit link) can name a placement that has since
  // been cancelled or rescheduled. It is not a card any more, so say so
  // rather than leave a selection with nothing to move.
  useEffect(() => {
    if (!selectedAppointmentId || !appointments) return;
    const named = appointments.find((appointment) => appointment.id === selectedAppointmentId);
    if (!named || isBoardPlacement(named)) return;
    toast({
      title: `Appointment ${describeAppointmentStatus(named).toLowerCase()}`,
      description: "It is no longer on the dispatch board. The location's Services tab and History tab keep its record.",
    });
    setSelectedAppointmentId(null);
  }, [appointments, selectedAppointmentId, toast]);

  // Pass 30 (C4.4; B14): a placement or a re-assignment of a technician the
  // customer EXCLUDED comes back 409 TECHNICIAN_EXCLUDED. A manager
  // (OVERRIDE_TECHNICIAN_EXCLUSION) is asked for the reason and the same
  // request is resent with it - the dispositionDraftPrompt resend pattern;
  // anyone else gets the refusal as a toast.
  const canOverrideExclusion = useCanOverrideExclusion();
  const [exclusionPrompt, setExclusionPrompt] = useState<{ refusal: TechnicianExcludedRefusal; retry: ExclusionRetry } | null>(null);
  // Pass 30b (owner, 2026-10-03): a placement that passes over the customer's
  // preferred technician comes back 409 PREFERENCE_NOT_HONORED; any role
  // confirms and the request is resent with acknowledgePreference. Both
  // prompts resend the same request with what was confirmed so far.
  const [preferencePrompt, setPreferencePrompt] = useState<{ refusal: PreferenceNotHonoredRefusal; retry: ExclusionRetry } | null>(null);
  const promptPlacementCheck = (error: unknown, retry: ExclusionRetry, sent: PlacementConfirmations) => {
    const exclusion = getTechnicianExcludedRefusal(error);
    if (exclusion) {
      if (!canOverrideExclusion || sent.overrideExclusion) return false;
      setExclusionPrompt({ refusal: exclusion, retry });
      return true;
    }
    const preference = getPreferenceNotHonoredRefusal(error);
    if (preference && !sent.acknowledgePreference) {
      setPreferencePrompt({ refusal: preference, retry });
      return true;
    }
    return false;
  };
  // The customers' technician preferences at the queue's locations and the
  // open sheet's: the queue row's "Prefers" hint, the sheet's select.
  const preferenceLocationIds = useMemo(() => {
    const ids = new Set<string>();
    for (const pending of pendingServices ?? []) {
      if (pending.locationId) ids.add(pending.locationId);
    }
    if (editingAppointment?.locationId) ids.add(editingAppointment.locationId);
    return Array.from(ids).sort().slice(0, 200);
  }, [pendingServices, editingAppointment?.locationId]);
  const { data: effectivePreferences } = useQuery<Record<string, EffectiveTechnicianPreference[]>>({
    queryKey: [`/api/technician-preferences/effective?locationIds=${preferenceLocationIds.join(",")}`],
    enabled: preferenceLocationIds.length > 0,
  });
  const preferencesFor = (locationId: string | null | undefined): EffectiveTechnicianPreference[] => (locationId && effectivePreferences?.[locationId]) || [];

  const scheduleMutation = useMutation({
    mutationFn: async ({ service, technician, slotDate, overrideExclusion, acknowledgePreference }: SchedulePlacementVariables) => {
      const endDate = service.expectedDurationMinutes ? new Date(slotDate.getTime() + service.expectedDurationMinutes * 60 * 1000) : null;
      const response = await apiRequest("POST", "/api/appointments", {
        customerId: service.customerId,
        locationId: service.locationId,
        serviceId: service.id,
        agreementId: service.agreementId || null,
        serviceTypeId: service.serviceTypeId,
        assignedTechnicianId: technician.id,
        assignedTo: technician.displayName,
        source: service.source,
        generatedForDate: service.source === "AGREEMENT_GENERATED" ? service.generatedForDate || service.dueDate || null : null,
        scheduledDate: slotDate.toISOString(),
        scheduledEndDate: endDate ? endDate.toISOString() : null,
        status: "SCHEDULED",
        lockTime: false,
        lockTechnician: false,
        notes: service.notes || null,
        overrideExclusion,
        acknowledgePreference,
      });
      return response.json() as Promise<WithInitialChargeDue<Appointment>>;
    },
    onSuccess: async (createdAppointment) => {
      const additionalServiceIds = groupedServiceIds.filter((id) => id !== createdAppointment.serviceId);
      // Pass 28 (decided): the grouped extras (?serviceIds=) land through the
      // add route, one after another, so the visit's end covers every service
      // and each extra's handoff opportunity converts - the same path as the
      // sheet's Add. They used to PATCH the service directly, which did
      // neither and wrote no audit row.
      let extrasFailed: string | null = null;
      for (const serviceId of additionalServiceIds) {
        try {
          await apiRequest("POST", `/api/appointments/${createdAppointment.id}/services`, { serviceId });
        } catch (error) {
          extrasFailed = describeCompositionRefusal(getApiErrorCode(error)) ?? getApiErrorMessage(error);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
      // Pass 32: a placement writes the visit's `created` row.
      invalidateAuditViews();
      if (selectedService?.locationId) {
        queryClient.invalidateQueries({ queryKey: getLocationServicesQueryKey(selectedService.locationId) });
        queryClient.invalidateQueries({ queryKey: getLocationAppointmentsQueryKey(selectedService.locationId) });
      }
      setSelectedServiceId(null);
      if (extrasFailed) {
        toast({ title: "Service scheduled, but a grouped service was not added", description: extrasFailed, variant: "destructive" });
      } else {
        toast({ title: additionalServiceIds.length ? "Grouped services scheduled" : "Service scheduled" });
      }
      const returnTo = params.get("returnTo");
      // Pass 11d: the office's prompt at scheduling. The server said whether
      // a down payment is still owed on this visit; ask before leaving the
      // board, and follow returnTo once the prompt is answered.
      if (createdAppointment.initialChargeDue) {
        setInitialChargePrompt({ due: createdAppointment.initialChargeDue, returnTo });
        return;
      }
      if (returnTo) {
        setLocation(returnTo);
      }
    },
    onError: (error: Error, variables) => {
      if (promptPlacementCheck(error, { kind: "schedule", variables }, variables)) return;
      toast({ title: "Unable to schedule service", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });
  const [initialChargePrompt, setInitialChargePrompt] = useState<{ due: InitialChargeDue; returnTo: string | null } | null>(null);
  const closeInitialChargePrompt = () => {
    const returnTo = initialChargePrompt?.returnTo ?? null;
    setInitialChargePrompt(null);
    if (returnTo) {
      setLocation(returnTo);
    }
  };

  // Pass 28 (C4.3a): the composition routes' invalidations - the board, the
  // queue, the opportunities and the location's tabs - and the refusal text
  // (a code from shared/appointment-composition.ts, else the message).
  const invalidateComposition = (locationId: string | null | undefined) => {
    queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/services"] });
    queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
    queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
    queryClient.invalidateQueries({ queryKey: ["/api/opportunities/by-location"] });
    invalidateAuditViews();
    if (locationId) {
      queryClient.invalidateQueries({ queryKey: getLocationServicesQueryKey(locationId) });
      queryClient.invalidateQueries({ queryKey: getLocationAppointmentsQueryKey(locationId) });
    }
  };
  const describeCompositionError = (error: unknown) => describeCompositionRefusal(getApiErrorCode(error)) ?? getApiErrorMessage(error);
  // Pass 29: the office's add is never refused for the technician's next
  // stop, but the toast says when the visit now runs past it.
  const describeCompositionResult = (result: AppointmentCompositionResult) => [
    result.scheduledEndDateExtendedMinutes ? `Visit end extended by ${result.scheduledEndDateExtendedMinutes} min` : null,
    result.opportunitiesConverted ? `${pluralize(result.opportunitiesConverted, "open opportunity", "open opportunities")} converted` : null,
    describeNextStopWarning(result.nextStop),
  ].filter(Boolean).join("; ") || undefined;

  // The queue-then-card attach (select a pending service, click a card at
  // the same location). Since Pass 28 it goes through the add route - the
  // end date extends, the added service's handoff opportunities convert and
  // the audit row is written, exactly as from the sheet - one request per
  // service in order, so each add sees the previous one's end. It used to
  // PATCH the service directly, which did none of that.
  const attachServiceToAppointmentMutation = useMutation({
    mutationFn: async ({ service, appointment }: { service: Service; appointment: Appointment }) => {
      const bundleIds = groupedServiceIds.length ? groupedServiceIds : [service.id];
      const results: AppointmentCompositionResult[] = [];
      for (const serviceId of bundleIds) {
        const response = await apiRequest("POST", `/api/appointments/${appointment.id}/services`, { serviceId });
        results.push(await response.json() as AppointmentCompositionResult);
      }
      return results;
    },
    onSuccess: (results, variables) => {
      invalidateComposition(variables.service.locationId);
      setSelectedServiceId(null);
      const extended = results.reduce((sum, result) => sum + result.scheduledEndDateExtendedMinutes, 0);
      const converted = results.reduce((sum, result) => sum + result.opportunitiesConverted, 0);
      const lastResult = results[results.length - 1];
      toast({
        title: results.length > 1 ? "Services added to shared visit" : "Service added to shared visit",
        description: [
          extended ? `Visit end extended by ${extended} min` : null,
          converted ? `${pluralize(converted, "open opportunity", "open opportunities")} converted` : null,
          lastResult ? describeNextStopWarning(lastResult.nextStop) : null,
        ].filter(Boolean).join("; ") || undefined,
      });
      const returnTo = params.get("returnTo");
      if (returnTo) {
        setLocation(returnTo);
      } else {
        setSelectedAppointmentId(variables.appointment.id);
      }
    },
    onError: (error: Error) => toast({ title: "Unable to add service to visit", description: describeCompositionError(error), variant: "destructive" }),
  });

  // Pass 28: the sheet's composition block - add, remove, re-type / re-time -
  // and the target of the per-service cancel dialog (the sheet, the queue).
  const addServiceMutation = useMutation({
    mutationFn: async ({ appointmentId, payload }: { appointmentId: string; payload: AppointmentServiceAddRequest }) => {
      const response = await apiRequest("POST", `/api/appointments/${appointmentId}/services`, payload);
      return response.json() as Promise<AppointmentCompositionResult>;
    },
    onSuccess: (result) => {
      invalidateComposition(result.appointment.locationId);
      toast({ title: "Service added to the visit", description: describeCompositionResult(result) });
    },
    onError: (error: Error) => toast({ title: "Unable to add service", description: describeCompositionError(error), variant: "destructive" }),
  });
  const removeServiceMutation = useMutation({
    mutationFn: async ({ appointmentId, serviceId }: { appointmentId: string; serviceId: string }) => {
      const response = await apiRequest("POST", `/api/appointments/${appointmentId}/services/${serviceId}/remove`, {});
      return response.json() as Promise<AppointmentCompositionResult>;
    },
    onSuccess: (result) => {
      invalidateComposition(result.appointment.locationId);
      toast({ title: "Service returned to the queue", description: "Its dates are kept; the visit's end is unchanged." });
    },
    onError: (error: Error) => toast({ title: "Unable to remove service", description: describeCompositionError(error), variant: "destructive" }),
  });
  const updateVisitServiceMutation = useMutation({
    mutationFn: async ({ appointmentId, serviceId, payload }: { appointmentId: string; serviceId: string; payload: AppointmentServiceUpdateRequest }) => {
      const response = await apiRequest("PATCH", `/api/appointments/${appointmentId}/services/${serviceId}`, payload);
      return response.json() as Promise<AppointmentCompositionResult>;
    },
    onSuccess: (result) => {
      invalidateComposition(result.appointment.locationId);
      toast({ title: "Service updated", description: describeCompositionResult(result) });
    },
    onError: (error: Error) => toast({ title: "Unable to update service", description: describeCompositionError(error), variant: "destructive" }),
  });
  const isComposing = addServiceMutation.isPending || removeServiceMutation.isPending || updateVisitServiceMutation.isPending;
  const [cancelServiceTarget, setCancelServiceTarget] = useState<Service | null>(null);

  const updateAppointmentMutation = useMutation({
    mutationFn: async ({ id, payload }: AppointmentUpdateVariables) => {
      const response = await apiRequest("PATCH", `/api/appointments/${id}`, payload);
      return response.json() as Promise<Appointment>;
    },
    onSuccess: (appointment) => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      // Pass 32: a move or re-assignment writes the visit's `update` row.
      invalidateAuditViews();
      // Pass 30b: a new lead who was a support technician leaves the support cards.
      invalidateSupportAssignments();
      queryClient.invalidateQueries({ queryKey: getLocationAppointmentsQueryKey(appointment.locationId) });
      queryClient.invalidateQueries({ queryKey: getLocationServicesQueryKey(appointment.locationId) });
      setSelectedAppointmentId(null);
      setEditingAppointmentId((current) => current === appointment.id ? null : current);
      toast({ title: "Appointment updated" });
    },
    onError: (error: Error, variables) => {
      if (promptPlacementCheck(error, { kind: "update", variables }, variables.payload as PlacementConfirmations)) return;
      toast({ title: "Unable to update appointment", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  // Pass 27 (C4.2): Cancel appointment / Reschedule from the sheet, one
  // route. A DRAFT invoice on the visit comes back 409 (Q3); the prompt asks,
  // and the same request is resent with the answer.
  const [dispositionDraftPrompt, setDispositionDraftPrompt] = useState<{ id: string; payload: AppointmentDispositionRequest; drafts: DraftInvoiceRef[] } | null>(null);
  const dispositionMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: AppointmentDispositionRequest }) => {
      const response = await apiRequest("POST", `/api/appointments/${id}/disposition`, payload);
      return response.json() as Promise<AppointmentDispositionOutcome & { appointment: Appointment }>;
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities/by-location"] });
      invalidateAuditViews();
      queryClient.invalidateQueries({ queryKey: getLocationAppointmentsQueryKey(result.appointment.locationId) });
      queryClient.invalidateQueries({ queryKey: getLocationServicesQueryKey(result.appointment.locationId) });
      setDispositionDraftPrompt(null);
      setEditingAppointmentId((current) => current === variables.id ? null : current);
      setSelectedAppointmentId((current) => current === variables.id ? null : current);
      const requeued = result.services.filter((outcome) => outcome.effect === "REQUEUED").length;
      const cancelled = result.services.filter((outcome) => outcome.effect === "CANCELLED").length;
      const created = result.opportunities.filter((outcome) => outcome.action === "CREATED").length;
      const updated = result.opportunities.filter((outcome) => outcome.action === "UPDATED").length;
      toast({
        title: result.mode === "CANCEL" ? "Appointment cancelled" : "Appointment returned to the queue",
        description: [
          requeued ? `${pluralize(requeued, "service")} back in the pending queue` : null,
          cancelled ? `${pluralize(cancelled, "one-time service")} cancelled` : null,
          created ? `${pluralize(created, "opportunity", "opportunities")} created` : null,
          updated ? `${pluralize(updated, "open opportunity", "open opportunities")} re-dated` : null,
          result.draftInvoicesVoided ? `${pluralize(result.draftInvoicesVoided, "draft invoice")} voided` : null,
        ].filter(Boolean).join("; ") || undefined,
      });
    },
    onError: (error: Error, variables) => {
      const drafts = getDraftInvoiceDecisionRequired(error);
      if (drafts) {
        setDispositionDraftPrompt({ id: variables.id, payload: variables.payload, drafts });
        return;
      }
      toast({
        title: variables.payload.mode === "CANCEL" ? "Unable to cancel appointment" : "Unable to reschedule appointment",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  // Pass 27 (B2): a board move is confirmed before it writes. Click a card,
  // click a slot, and this holds the move until "Move" is pressed.
  const [pendingMove, setPendingMove] = useState<{ appointment: Appointment; technician: Technician; slotDate: Date } | null>(null);

  const moveWindow = (direction: 1 | -1) => {
    setCurrentDate((prev) => addDays(prev, currentView.step * direction));
  };

  const moveAppointmentToSlot = (appointment: Appointment, technician: Technician, slotDate: Date) => {
    const currentTechId = appointment.assignedTechnicianId || "";
    const movingTechnician = currentTechId !== technician.id;
    const movingTime = !isSameStart(appointment.scheduledDate, slotDate);

    if (appointment.lockTechnician && movingTechnician) {
      toast({ title: "Technician locked", description: "Unlock technician assignment before reassigning this job.", variant: "destructive" });
      return;
    }

    if (appointment.lockTime && movingTime) {
      toast({ title: "Time locked", description: "Unlock time before moving this job to a different slot.", variant: "destructive" });
      return;
    }

    if (!movingTechnician && !movingTime) {
      return;
    }

    setPendingMove({ appointment, technician, slotDate });
  };

  const confirmPendingMove = () => {
    if (!pendingMove) return;
    const { appointment, technician, slotDate } = pendingMove;
    const linkedService = appointment.serviceId ? serviceById.get(appointment.serviceId) : null;
    const durationMinutes = getAppointmentDurationMinutes(appointment, linkedService || undefined);
    const scheduledEndDate = durationMinutes ? new Date(slotDate.getTime() + durationMinutes * 60 * 1000).toISOString() : null;

    setPendingMove(null);
    updateAppointmentMutation.mutate({
      id: appointment.id,
      payload: {
        assignedTechnicianId: technician.id,
        assignedTo: technician.displayName,
        scheduledDate: slotDate.toISOString(),
        scheduledEndDate,
      },
    });
  };

  const handleSlotClick = (technician: Technician, slotDate: Date) => {
    // Pass 31 (C4.5): every start the board writes passes through the snap.
    // A slot start is on the view grid and the snap in use is never coarser
    // than the view interval, so this is the rule made literal, not a change
    // of where a click lands. There is no drag-and-drop: placement is this
    // click, a move is click-then-confirm (pendingMove).
    const start = snapDateToInterval(slotDate, snapMinutes);
    if (selectedService) {
      scheduleMutation.mutate({ service: selectedService, technician, slotDate: start });
      return;
    }

    if (selectedAppointment) {
      moveAppointmentToSlot(selectedAppointment, technician, start);
    }
  };

  // Pass 30b: resend a placement or a re-assignment with what the user confirmed.
  const resendPlacement = (retry: ExclusionRetry, confirmed: PlacementConfirmations) => {
    if (retry.kind === "schedule") {
      scheduleMutation.mutate({ ...retry.variables, ...confirmed });
    } else {
      updateAppointmentMutation.mutate({ id: retry.variables.id, payload: { ...retry.variables.payload, ...confirmed } });
    }
  };

  const handleAppointmentCardClick = (appointment: Appointment) => {
    if (selectedService) {
      if (selectedService.locationId !== appointment.locationId) {
        toast({
          title: "Different location",
          description: "Only services from the same location can be grouped into one appointment.",
          variant: "destructive",
        });
        return;
      }

      attachServiceToAppointmentMutation.mutate({ service: selectedService, appointment });
      return;
    }

    setSelectedAppointmentId(appointment.id);
    setSelectedServiceId(null);
  };

  const analytics = useMemo(() => {
    const totals = { jobs: viewportAppointments.length, revenueCents: 0 };
    const byTechnician = new Map<string, { technicianName: string; jobs: number; revenueCents: number }>();

    for (const appointment of viewportAppointments) {
      const linkedServices = servicesByAppointmentId.get(appointment.id)
        ?? (appointment.serviceId ? [serviceById.get(appointment.serviceId)].filter((service): service is Service => !!service && service.status !== "CANCELLED") : []);
      const revenueCents = linkedServices.reduce((sum, service) => sum + (service.priceCents ?? 0), 0);
      totals.revenueCents += revenueCents;

      const technician = appointment.assignedTechnicianId ? technicianById.get(appointment.assignedTechnicianId) : null;
      const key = appointment.assignedTechnicianId || "unassigned";
      const current = byTechnician.get(key) || {
        technicianName: technician?.displayName || appointment.assignedTo || "Unassigned",
        jobs: 0,
        revenueCents: 0,
      };
      current.jobs += 1;
      current.revenueCents += revenueCents;
      byTechnician.set(key, current);
    }

    return {
      ...totals,
      byTechnician: Array.from(byTechnician.values()).sort((left, right) => right.jobs - left.jobs),
    };
  }, [serviceById, servicesByAppointmentId, technicianById, viewportAppointments]);

  const editingAppointmentService = editingAppointment?.serviceId ? serviceById.get(editingAppointment.serviceId) ?? null : null;
  // Pass 27: what the sheet's disposition touches, and whether an
  // opportunity is already open on any of it (the "Update existing" choice).
  const editingLinkedServices = useMemo(() => {
    if (!editingAppointment) return [];
    const linked = servicesByAppointmentId.get(editingAppointment.id) ?? [];
    return editingAppointmentService && editingAppointmentService.status !== "CANCELLED" && !linked.some((linkedService) => linkedService.id === editingAppointmentService.id)
      ? [...linked, editingAppointmentService]
      : linked;
  }, [editingAppointment, editingAppointmentService, servicesByAppointmentId]);
  // Pass 28: what the sheet's Add offers (the location's queue, minus what is
  // on the visit) and which services carry a posted ticket (locked rows).
  const editingQueueCandidates = useMemo(() => {
    if (!editingAppointment) return [];
    return (pendingServices ?? []).filter((pending) => pending.locationId === editingAppointment.locationId && pending.status === "PENDING_SCHEDULING" && pending.appointmentId !== editingAppointment.id);
  }, [editingAppointment, pendingServices]);
  const ticketedServiceIds = useMemo(() => new Set(Array.from(serviceRecordByServiceId.keys())), [serviceRecordByServiceId]);
  const { data: editingLocationOpportunities } = useQuery<Opportunity[]>({
    queryKey: ["/api/opportunities/by-location", editingAppointment?.locationId ?? ""],
    enabled: !!editingAppointment?.locationId,
  });
  const editingOpenOpportunityCount = useMemo(() => {
    const serviceIds = new Set(editingLinkedServices.map((linkedService) => linkedService.id));
    return (editingLocationOpportunities ?? []).filter((opportunity) => opportunity.status === "OPEN" && !!opportunity.sourceServiceId && serviceIds.has(opportunity.sourceServiceId)).length;
  }, [editingLinkedServices, editingLocationOpportunities]);
  const detailTechnicianName = detailService?.assignedTechnicianId ? technicianById.get(detailService.assignedTechnicianId)?.displayName || "" : "";
  // Pass 31: "8 AM - 6 PM | 30-min view" (was "N-hour slots"); the grid waits
  // for the settings so it never renders the fallback window first.
  const configSummary = `${formatHourOfDay(boardStartHour)} - ${formatHourOfDay(boardEndHour)} | ${describeViewInterval(viewIntervalMinutes).summary}`;
  // Pass 31b (FB-021): the grid fits the page on the 1-day view and scrolls on a multi-day one.
  const boardColumns = boardDates.length * slotStarts.length;
  const boardGridTemplate = `${TECH_COLUMN_PX}px repeat(${boardColumns}, minmax(0, 1fr))`;
  const boardMinWidth = boardDates.length === 1 ? undefined : `${TECH_COLUMN_PX + boardColumns * MULTI_DAY_MIN_COLUMN_PX}px`;
  const denseColumns = viewIntervalMinutes === 30;
  const isLoading = techniciansLoading || appointmentsLoading || servicesLoading || pendingLoading || dispatchSettingsLoading || prefillServiceMutation.isPending;

  // Pass 31b (owner, FB-021): the page is full-width, and nothing that comes
  // and goes sits above the navigation row - the in-view figures are the last
  // section of the page and the selection box sits just below the board.
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Dispatch Board</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Select pending work to place it, or select an appointment card to move or reassign it.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {VIEW_OPTIONS.map((option) => (
            <Button key={option.value} variant={view === option.value ? "default" : "outline"} size="sm" onClick={() => setView(option.value)}>
              {option.label}
            </Button>
          ))}
        </div>
      </div>


      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="icon" onClick={() => moveWindow(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => moveWindow(1)}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>Today</Button>
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <CalendarDays className="h-4 w-4" />
                Jump to Date
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={currentDate}
                onSelect={(date) => {
                  if (!date) return;
                  setCurrentDate(date);
                  setDatePickerOpen(false);
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="rounded-md border bg-background px-3 py-2 text-sm font-medium">
            {getViewportLabel(boardDates)}
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Settings2 className="h-4 w-4" />
                Window
              </Button>
            </PopoverTrigger>
            {/* Pass 31 (C4.5): the session override of the window. The hour
                options and the end-hour clamp share shared/dispatch-board.ts
                with Settings (the old clamp reached 9 PM on a select that
                stopped at 8 PM); "View Interval" was "Slot Interval", and 30
                minutes joins 1 and 2 hours. */}
            <PopoverContent align="end" className="space-y-3">
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Visible Start Hour</label>
                <select
                  value={boardStartHour}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setWindowOverride((current) => ({ ...current, startHour: value, endHour: visibleEndHourFor(value, boardEndHour) }));
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  data-testid="select-board-start-hour"
                >
                  {boardStartHourOptions().map((hour) => <option key={`start-${hour}`} value={hour}>{formatHourOfDay(hour)}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Visible End Hour</label>
                <select
                  value={boardEndHour}
                  onChange={(event) => setWindowOverride((current) => ({ ...current, endHour: Number(event.target.value) }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  data-testid="select-board-end-hour"
                >
                  {boardEndHourOptions(boardStartHour).map((hour) => <option key={`end-${hour}`} value={hour}>{formatHourOfDay(hour)}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">View Interval</label>
                <select
                  value={viewIntervalMinutes}
                  onChange={(event) => setWindowOverride((current) => ({ ...current, viewIntervalMinutes: Number(event.target.value) as DispatchViewInterval }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  data-testid="select-board-view-interval"
                >
                  {DISPATCH_VIEW_INTERVALS.map((minutes) => <option key={`interval-${minutes}`} value={minutes}>{describeViewInterval(minutes).label}</option>)}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                Defaults come from Settings &rarr; Dispatch Board; changes here last for this session. Placements and typed times round to {describeSnapInterval(snapMinutes)}. Technician/day availability blocks remain a follow-up pass.
              </p>
              {windowOverridden ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setWindowOverride({})} data-testid="button-board-window-reset">
                  Back to the defaults
                </Button>
              ) : null}
            </PopoverContent>
          </Popover>
        </div>
      </div>


      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><Users className="h-4 w-4" /> Technician Dispatch Board</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((index) => <Skeleton key={index} className="h-20" />)}</div>
          ) : visibleTechnicians.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No technicians available for dispatch in this viewport.</div>
          ) : (
            <div className="overflow-x-auto">
              <div style={{ minWidth: boardMinWidth }} data-testid="board-grid">
                <div className="grid border-b bg-muted/20" style={{ gridTemplateColumns: boardGridTemplate }}>
                  <div className="border-r px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Technician</div>
                  {boardDates.flatMap((date) => slotStarts.map((slotStart) => (
                    <div key={`${formatDateInputValue(date)}-${slotStart}`} className={`border-r ${denseColumns ? "px-1" : "px-2"} py-2 text-center text-xs font-medium text-muted-foreground`}>
                      <div>{date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                      <div>{formatMinutesOfDay(slotStart)}</div>
                    </div>
                  )))}
                </div>
                {visibleTechnicians.map((technician) => (
                  <div key={technician.id} className="grid border-b last:border-b-0" style={{ gridTemplateColumns: boardGridTemplate }}>
                    <div className="border-r px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: technician.color || "#2563eb" }} />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{technician.displayName}</p>
                            {technician.status !== "ACTIVE" ? <Badge variant="secondary" className="text-[10px]">{technician.status}</Badge> : null}
                          </div>
                          <p className="text-xs text-muted-foreground">{technician.licenseId}</p>
                        </div>
                      </div>
                    </div>
                    {boardDates.flatMap((date) => slotStarts.map((slotStart) => {
                      const slotDate = buildSlotDate(date, slotStart);
                      const slotKey = `${technician.id}:${formatDateInputValue(slotDate)}:${slotStart}`;
                      const slotAppointments = appointmentsByTechnicianAndSlot.get(slotKey) ?? [];
                      const slotSupportAppointments = supportAppointmentsBySlot.get(slotKey) ?? [];
                      const slotActionable = !!selectedService || !!selectedAppointment;
                      return (
                        <div
                          key={slotKey}
                          className={`min-h-[108px] border-r ${denseColumns ? "px-1 py-1.5" : "px-2 py-2"} align-top transition-colors ${slotActionable ? "cursor-pointer hover:bg-primary/5" : "hover:bg-muted/20"}`}
                          onClick={() => slotActionable && handleSlotClick(technician, slotDate)}
                        >
                          <div className="text-[11px] text-muted-foreground">{formatMinutesOfDay(slotStart)}</div>
                          <div className="mt-2 space-y-2">
                            {slotAppointments.map((appointment) => {
                              const linkedServices = servicesByAppointmentId.get(appointment.id)
                                ?? (appointment.serviceId ? [serviceById.get(appointment.serviceId)].filter((service): service is Service => !!service && service.status !== "CANCELLED") : []);
                              const linkedService = linkedServices[0] ?? null;
                              const customer = customerById.get(appointment.customerId);
                              const location = appointment.locationId ? locationById.get(appointment.locationId) : undefined;
                              const customerLabel = getCustomerLabel(customer, location);
                              const locationLabel = getLocationLabel(location);
                              const serviceTypeName = serviceTypeNameById.get(appointment.serviceTypeId || linkedService?.serviceTypeId || "") || "Service";
                              const durationMinutes = getAppointmentDurationMinutes(appointment, linkedService || undefined);
                              const technicianName = appointment.assignedTechnicianId ? technicianById.get(appointment.assignedTechnicianId)?.displayName || appointment.assignedTo || "Technician" : appointment.assignedTo || "Unassigned";
                              const isSelected = selectedAppointmentId === appointment.id;
                              const hasLocks = appointment.lockTime || appointment.lockTechnician;
                              const siblingCount = Math.max(linkedServices.length - 1, 0);
                              const linkedServiceRecords = linkedServices
                                .map((service) => serviceRecordByServiceId.get(service.id))
                                .filter((record): record is ServiceRecord => !!record);
                              const anyTicketPosted = linkedServiceRecords.length > 0 || linkedServices.some((service) => service.status === "COMPLETED");
                              const allTicketsFinalized = linkedServices.length > 0
                                && linkedServices.every((service) => serviceRecordByServiceId.get(service.id)?.confirmed);
                              const isCompletedAppointment = appointment.status === "COMPLETED" && allTicketsFinalized;
                              const isPendingOfficeReview = anyTicketPosted && !allTicketsFinalized;
                              // Pass 27b: no red tone - a CANCELED placement is not a card (isBoardPlacement).
                              const statusTone = isCompletedAppointment
                                ? "border-green-600 bg-green-100 text-green-950"
                                : isPendingOfficeReview || appointment.status === "IN_PROGRESS"
                                  ? "border-yellow-500 bg-yellow-50 text-yellow-950"
                                  : "border-blue-500 bg-blue-50 text-blue-950";
                              const mutedTextTone = isCompletedAppointment
                                ? "text-green-900"
                                : isPendingOfficeReview || appointment.status === "IN_PROGRESS"
                                  ? "text-yellow-900"
                                  : "text-blue-900";
                              const locationHref = location ? `/customers/${appointment.customerId}?locationId=${location.id}` : `/customers/${appointment.customerId}`;

                              return (
                                <HoverCard key={appointment.id} openDelay={150}>
                                  <HoverCardTrigger asChild>
                                    <div
                                      className={`rounded-md border ${denseColumns ? "px-1.5 py-1.5" : "px-2 py-2"} text-xs shadow-sm transition-colors ${statusTone} ${isSelected ? "border-primary ring-1 ring-primary" : ""}`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleAppointmentCardClick(appointment);
                                      }}
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          <button type="button" className="truncate text-left font-medium underline-offset-2 hover:underline" onClick={(event) => { event.stopPropagation(); setLocation(locationHref); }}>
                                            {customerLabel}
                                          </button>
                                          <button type="button" className={`mt-0.5 block truncate text-left underline-offset-2 hover:underline ${mutedTextTone}`} onClick={(event) => { event.stopPropagation(); if (linkedService?.id) setDetailServiceId(linkedService.id); }}>
                                            {serviceTypeName}
                                          </button>
                                          {siblingCount > 0 ? <p className={`mt-1 text-[11px] ${mutedTextTone}`}>+ {siblingCount} other service{siblingCount === 1 ? "" : "s"}</p> : null}
                                        </div>
                                        <div className="flex items-center gap-1">
                                          {hasLocks ? <Lock className={`h-3.5 w-3.5 ${mutedTextTone}`} /> : null}
                                          <button type="button" className={`rounded p-1 transition-colors hover:bg-muted hover:text-foreground ${mutedTextTone}`} onClick={(event) => { event.stopPropagation(); setEditingAppointmentId(appointment.id); }} aria-label="Edit appointment">
                                            <Settings2 className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      </div>
                                      <div className={`mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[11px] ${mutedTextTone}`}>
                                        <span>{new Date(appointment.scheduledDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                                        {durationMinutes ? <span>{durationMinutes} min</span> : null}
                                      </div>
                                    </div>
                                  </HoverCardTrigger>
                                  <HoverCardContent align="start" className="w-72 p-3">
                                    <div className="space-y-2 text-xs">
                                      <div>
                                        <p className="font-semibold">{customerLabel}</p>
                                        <p className="text-muted-foreground">{locationLabel}</p>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div><p className="uppercase tracking-wide text-muted-foreground">Service</p><p className="mt-1">{serviceTypeName}</p></div>
                                        <div><p className="uppercase tracking-wide text-muted-foreground">Technician</p><p className="mt-1">{technicianName}</p></div>
                                        <div><p className="uppercase tracking-wide text-muted-foreground">Time</p><p className="mt-1">{new Date(appointment.scheduledDate).toLocaleString()}</p></div>
                                        <div><p className="uppercase tracking-wide text-muted-foreground">Duration</p><p className="mt-1">{durationMinutes ? `${durationMinutes} min` : "Not set"}</p></div>
                                        <div><p className="uppercase tracking-wide text-muted-foreground">Status</p><p className="mt-1">{describeAppointmentStatus(appointment)}</p></div>
                                        <div><p className="uppercase tracking-wide text-muted-foreground">Revenue</p><p className="mt-1">{formatCurrency(linkedServices.reduce((sum, service) => sum + (service.priceCents ?? 0), 0))}</p></div>
                                      </div>
                                      {siblingCount > 0 ? <div className="rounded-md border bg-muted/20 px-2 py-2 text-[11px]">This appointment includes {linkedServices.length} services in one visit.</div> : null}
                                      {hasLocks ? <div className="rounded-md border bg-muted/20 px-2 py-2 text-[11px]">Lock state: {appointment.lockTime ? "Time locked" : "Time flexible"} | {appointment.lockTechnician ? "Technician locked" : "Technician flexible"}</div> : null}
                                    </div>
                                  </HoverCardContent>
                                </HoverCard>
                              );
                            })}
                            {/* Pass 30b (owner, 2026-10-03): the support technician's copy of a visit - dashed,
                                not selectable for a move (the lead's card moves the visit); a click opens its sheet. */}
                            {slotSupportAppointments.map((appointment) => {
                              const customer = customerById.get(appointment.customerId);
                              const location = appointment.locationId ? locationById.get(appointment.locationId) : undefined;
                              const leadName = appointment.assignedTechnicianId ? technicianById.get(appointment.assignedTechnicianId)?.displayName || appointment.assignedTo || "the lead" : "no lead";
                              const supportService = servicesByAppointmentId.get(appointment.id)?.[0] ?? (appointment.serviceId ? serviceById.get(appointment.serviceId) : undefined);
                              const supportMinutes = getAppointmentDurationMinutes(appointment, supportService || undefined);
                              return (
                                <div
                                  key={`support-${appointment.id}`}
                                  className={`cursor-pointer rounded-md border border-dashed border-slate-400 bg-slate-50 ${denseColumns ? "px-1.5 py-1.5" : "px-2 py-2"} text-xs text-slate-800`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setEditingAppointmentId(appointment.id);
                                  }}
                                  title="Support on this visit - the lead's card moves it"
                                  data-testid={`card-support-${appointment.id}-${technician.id}`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="truncate font-medium">{getCustomerLabel(customer, location)}</p>
                                    <Badge variant="outline" className="text-[10px]">Support</Badge>
                                  </div>
                                  <p className="mt-0.5 truncate text-[11px] text-slate-600">With {leadName}</p>
                                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-600">
                                    <span>{new Date(appointment.scheduledDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                                    {supportMinutes ? <span>{supportMinutes} min</span> : null}
                                  </div>
                                </div>
                              );
                            })}
                            {!slotAppointments.length && slotActionable ? <div className="rounded-md border border-dashed px-2 py-3 text-center text-[11px] text-primary">{selectedService ? "Place service here" : "Move here"}</div> : null}
                          </div>
                        </div>
                      );
                    }))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pass 31b (owner, FB-021): the selection box sits below the board, not
          above it, so selecting never moves the board or the navigation row.
          The empty slots' "Place service here" / "Move here" hints already say
          the board is in placement mode. */}
      {(selectedService || selectedAppointment) ? (
        <Card className="border-primary/30 bg-primary/5" data-testid="card-selection-banner">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="text-sm">
              {selectedService ? (
                <>
                  <p className="font-medium">Scheduling selected service</p>
                  <p className="text-muted-foreground">Click an empty slot to create a new visit, or click an existing appointment card at the same location to add this service to that visit.</p>
                  {selectedService.timeWindow ? <p className="text-muted-foreground">Preferred time window: {selectedService.timeWindow}</p> : null}
                </>
              ) : selectedAppointment ? (
                <>
                  <p className="font-medium">Move / reassign selected appointment</p>
                  <p className="text-muted-foreground">Click a new slot to move it. Locked dimensions stay fixed. This visit currently includes {(servicesByAppointmentId.get(selectedAppointment.id)?.length ?? 1)} service(s).</p>
                </>
              ) : null}
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setSelectedServiceId(null); setSelectedAppointmentId(null); }}>
              Clear Selection
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Pending Dispatch Queue</CardTitle>
        </CardHeader>
        <CardContent>
          {pendingLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((index) => <Skeleton key={index} className="h-16" />)}</div>
          ) : !pendingServices || pendingServices.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No pending services waiting for dispatch.</div>
          ) : (
            <div className="space-y-2">
              {pendingServices.map((service) => {
                const location = locationById.get(service.locationId);
                const customer = customerById.get(service.customerId);
                const isSelected = service.id === selectedServiceId;
                // Pass 30 (C4.4): the customer's word on who goes - a hint, and the block up front.
                const queuePreferences = preferencesFor(service.locationId);
                const preferredHint = describePreferredHint(queuePreferences);
                const excludedNames = queuePreferences.filter((entry) => entry.kind === "EXCLUDED").map((entry) => entry.technicianName);
                const selectForDispatch = () => {
                  setSelectedServiceId(service.id);
                  setSelectedAppointmentId(null);
                };
                return (
                  // Pass 28: the row selects for placement as before, and carries a Cancel action
                  // (the owner's review of 2026-09-25, finding 5) - so it is a div with the button
                  // role rather than a button, which cannot nest one.
                  <div
                    key={service.id}
                    role="button"
                    tabIndex={0}
                    className={`flex w-full cursor-pointer items-start justify-between gap-3 rounded-md border px-3 py-3 text-left transition-colors ${isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/20"}`}
                    onClick={selectForDispatch}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectForDispatch();
                      }
                    }}
                    data-testid={`queue-row-${service.id}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{getCustomerLabel(customer, location)}</p>
                        <Badge variant="outline" className="text-xs">{service.status}</Badge>
                        {service.source === "AGREEMENT_GENERATED" ? <Badge variant="secondary" className="text-xs">Agreement</Badge> : null}
                        {service.schedulingMode ? <Badge variant="outline" className="text-xs">{service.schedulingMode}</Badge> : null}
                        <ServiceWorkKindListBadge workKind={service.workKind} className="text-xs" />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{serviceTypeNameById.get(service.serviceTypeId || "") || "Service"} | {service.expectedDurationMinutes ? `${service.expectedDurationMinutes} min` : "Duration not set"} | Due {service.dueDate || "Not set"}</p>
                      {answersLabelFor(service) ? <p className="mt-1 text-xs text-muted-foreground" data-testid={`text-queue-answers-${service.id}`}>{answersLabelFor(service)}</p> : null}
                      {preferredHint || excludedNames.length ? (
                        <p className="mt-1 text-xs" data-testid={`text-queue-preferences-${service.id}`}>
                          {preferredHint ? <span className="text-emerald-700">{preferredHint}</span> : null}
                          {preferredHint && excludedNames.length ? <span className="text-muted-foreground"> | </span> : null}
                          {excludedNames.length ? <span className="text-destructive">Never {excludedNames.join(", ")}</span> : null}
                        </p>
                      ) : null}
                      {service.serviceWindowStart ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Service window: {service.serviceWindowStart}{service.serviceWindowEnd ? ` to ${service.serviceWindowEnd}` : ""}
                        </p>
                      ) : null}
                      {service.timeWindow ? <p className="mt-1 text-xs text-muted-foreground">Time window: {service.timeWindow}</p> : null}
                      {service.agreementId ? <p className="mt-1 text-xs text-muted-foreground">Agreement: {service.agreementId.slice(0, 8)}</p> : null}
                      <p className="mt-1 text-xs text-muted-foreground">{getLocationLabel(location)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium">{formatCurrency(service.priceCents)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{isSelected ? "Selected" : "Click to dispatch"}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-1 h-7 px-2 text-xs text-destructive hover:text-destructive"
                        onClick={(event) => { event.stopPropagation(); setCancelServiceTarget(service); }}
                        title={service.agreementId ? "Recycle this agreement visit with a reason" : "Cancel this pending service with a reason"}
                        data-testid={`button-queue-cancel-${service.id}`}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pass 31b (owner, FB-021): the in-view figures are the last section of
          the page. The per-technician cards exist only when something is in
          view, so above the board they moved the navigation row every time
          the window changed. */}
      <div className="space-y-3" data-testid="section-board-analytics">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">In view</p>
        <div className="grid gap-3 md:grid-cols-3">
          <Card><CardContent className="p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">Jobs In View</p><p className="mt-1 text-2xl font-semibold">{analytics.jobs}</p></div><ClipboardList className="h-5 w-5 text-muted-foreground" /></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">Scheduled Revenue</p><p className="mt-1 text-2xl font-semibold">{formatCurrency(analytics.revenueCents)}</p></div><DollarSign className="h-5 w-5 text-muted-foreground" /></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">Board Window</p><p className="mt-1 text-sm font-semibold">{configSummary}</p><p className="mt-1 text-xs text-muted-foreground">{getViewportLabel(boardDates)}</p></div><Clock3 className="h-5 w-5 text-muted-foreground" /></div></CardContent></Card>
        </div>
        {analytics.byTechnician.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {analytics.byTechnician.map((row) => (
              <Card key={row.technicianName}>
                <CardContent className="p-4">
                  <p className="text-sm font-medium">{row.technicianName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{row.jobs} jobs in view</p>
                  <p className="mt-2 text-sm font-semibold">{formatCurrency(row.revenueCents)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}
      </div>

      <AppointmentSheet
        appointment={editingAppointment}
        service={editingAppointmentService}
        linkedServices={editingLinkedServices}
        technicianOptions={technicians ?? []}
        serviceTypeName={editingAppointment ? serviceTypeNameById.get(editingAppointment.serviceTypeId || editingAppointmentService?.serviceTypeId || "") || "Service" : "Service"}
        customerLabel={editingAppointment ? getCustomerLabel(customerById.get(editingAppointment.customerId), editingAppointment.locationId ? locationById.get(editingAppointment.locationId) : undefined) : "Location service"}
        locationLabel={editingAppointment?.locationId ? getLocationLabel(locationById.get(editingAppointment.locationId)) : "Location"}
        cancelReasons={cancelReasonSettings?.reasons ?? []}
        openOpportunityCount={editingOpenOpportunityCount}
        open={!!editingAppointment}
        onOpenChange={(open) => { if (!open) setEditingAppointmentId(null); }}
        onSave={(payload) => {
          if (!editingAppointment) return;
          updateAppointmentMutation.mutate({
            id: editingAppointment.id,
            payload: {
              assignedTechnicianId: payload.assignedTechnicianId,
              assignedTo: payload.assignedTechnicianId ? technicianById.get(payload.assignedTechnicianId)?.displayName || null : null,
              scheduledDate: payload.scheduledDate,
              scheduledEndDate: payload.scheduledEndDate,
              status: payload.status,
              lockTime: payload.lockTime,
              lockTechnician: payload.lockTechnician,
              notes: payload.notes,
            },
          });
        }}
        onDisposition={(payload) => {
          if (!editingAppointment) return;
          dispositionMutation.mutate({ id: editingAppointment.id, payload });
        }}
        isSaving={updateAppointmentMutation.isPending}
        isDispositioning={dispositionMutation.isPending}
        snapMinutes={snapMinutes}
        serviceTypeNameById={serviceTypeNameById}
        answersLabelFor={answersLabelFor}
        serviceTypes={serviceTypes ?? []}
        queueCandidates={editingQueueCandidates}
        ticketedServiceIds={ticketedServiceIds}
        canChangeAgreementType={canChangeAgreementType}
        onAddService={(payload) => {
          if (!editingAppointment) return;
          addServiceMutation.mutate({ appointmentId: editingAppointment.id, payload });
        }}
        onRemoveService={(service) => {
          if (!editingAppointment) return;
          removeServiceMutation.mutate({ appointmentId: editingAppointment.id, serviceId: service.id });
        }}
        onUpdateService={(service, payload) => {
          if (!editingAppointment) return;
          updateVisitServiceMutation.mutate({ appointmentId: editingAppointment.id, serviceId: service.id, payload });
        }}
        onCancelService={(service) => setCancelServiceTarget(service)}
        isComposing={isComposing}
        preferences={preferencesFor(editingAppointment?.locationId)}
      />

      {/* Pass 30 (C4.4; B14): the manager's override of a customer's exclusion - the placement or the
          re-assignment resent with the reason (placement_exclusion_overridden on the visit). */}
      <ExclusionOverridePrompt
        refusal={exclusionPrompt?.refusal ?? null}
        onCancel={() => setExclusionPrompt(null)}
        onConfirm={(reason) => {
          const pending = exclusionPrompt;
          setExclusionPrompt(null);
          if (!pending) return;
          resendPlacement(pending.retry, { overrideExclusion: { reason } });
        }}
      />
      {/* Pass 30b (owner, 2026-10-03): the reminder of the customer's preferred technician. */}
      <PreferenceBypassPrompt
        refusal={preferencePrompt?.refusal ?? null}
        onCancel={() => setPreferencePrompt(null)}
        onConfirm={() => {
          const pending = preferencePrompt;
          setPreferencePrompt(null);
          if (!pending) return;
          resendPlacement(pending.retry, { acknowledgePreference: true });
        }}
      />

      {/* Pass 28: cancel ONE service - from the sheet's row or the queue's row - with the reason and
          the opportunity choice. The dialog invalidates the board, the queue and the location itself. */}
      <ServiceCancelDialog
        service={cancelServiceTarget}
        serviceTypeName={cancelServiceTarget ? serviceTypeNameById.get(cancelServiceTarget.serviceTypeId || "") || "Service" : "Service"}
        open={!!cancelServiceTarget}
        onOpenChange={(open) => { if (!open) setCancelServiceTarget(null); }}
        onCancelled={() => {
          setCancelServiceTarget(null);
          setSelectedServiceId((current) => (current === cancelServiceTarget?.id ? null : current));
        }}
      />

      <InitialChargeDuePrompt due={initialChargePrompt?.due ?? null} onClose={closeInitialChargePrompt} />

      <DraftInvoiceVoidPrompt
        drafts={dispositionDraftPrompt?.drafts ?? null}
        isPending={dispositionMutation.isPending}
        onDecide={(voidDraftInvoices) => {
          if (!dispositionDraftPrompt) return;
          dispositionMutation.mutate({ id: dispositionDraftPrompt.id, payload: { ...dispositionDraftPrompt.payload, voidDraftInvoices } });
        }}
        onBack={() => setDispositionDraftPrompt(null)}
      />

      <AlertDialog open={!!pendingMove} onOpenChange={(open) => { if (!open) setPendingMove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingMove ? `Move to ${pendingMove.technician.displayName}, ${formatSlotLabel(pendingMove.slotDate)}?` : "Move appointment?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingMove
                ? `${getCustomerLabel(customerById.get(pendingMove.appointment.customerId), pendingMove.appointment.locationId ? locationById.get(pendingMove.appointment.locationId) : undefined)} - ${serviceTypeNameById.get(pendingMove.appointment.serviceTypeId || "") || "Service"}, now ${formatSlotLabel(new Date(pendingMove.appointment.scheduledDate))} with ${pendingMove.appointment.assignedTechnicianId ? technicianById.get(pendingMove.appointment.assignedTechnicianId)?.displayName || pendingMove.appointment.assignedTo || "an unnamed technician" : "no technician"}.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingMove(null)}>Keep it where it is</Button>
            <Button type="button" onClick={confirmPendingMove} disabled={updateAppointmentMutation.isPending}>Move</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ServiceDetailDialog
        service={detailService}
        answersLabel={detailService ? answersLabelFor(detailService) : null}
        serviceTypeName={detailService ? serviceTypeNameById.get(detailService.serviceTypeId || "") || "Service" : "Service"}
        customerLabel={detailService ? getCustomerLabel(customerById.get(detailService.customerId), locationById.get(detailService.locationId)) : "Location service"}
        locationLabel={detailService ? getLocationLabel(locationById.get(detailService.locationId)) : "Location"}
        technicianName={detailTechnicianName}
        open={!!detailService}
        onOpenChange={(open) => { if (!open) setDetailServiceId(null); }}
      />
    </div>
  );
}
