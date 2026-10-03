import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ApiError, apiRequest, getApiErrorCode, getApiErrorMessage, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { can, PERMISSIONS } from "@shared/permissions";
import type { Technician } from "@shared/schema";
import {
  MAX_EXCLUSION_OVERRIDE_REASON_LENGTH,
  MAX_TECHNICIAN_PREFERENCE_NOTE_LENGTH,
  TECHNICIAN_EXCLUDED,
  describePreferenceChip,
  describePreferenceTitle,
  describeTechnicianPreferenceRefusal,
  type LocationTechnicianPreferences,
  type TechnicianExcludedRefusal,
  type TechnicianPreferenceKind,
  type TechnicianPreferenceSetRequest,
  type TechnicianPreferenceView,
} from "@shared/technician-preferences";

/**
 * Pass 30 (PLAN_ROADMAP_V2.md C4.4; B14; D8): a customer's PREFERRED /
 * EXCLUDED technicians (shared/technician-preferences.ts). The chips (the
 * customer header card: the account's "all locations" rows; the location
 * profile card: what applies here, inherited rows marked), the live editor
 * in Edit Location (the primary location's carries "Apply to all
 * locations", which writes the account-scoped row), the draft list in Add
 * Location (written once the location exists), and the manager's override
 * prompt the dispatch board opens on a 409 TECHNICIAN_EXCLUDED.
 */

export function locationTechnicianPreferencesQueryKey(locationId: string | null | undefined) {
  return ["/api/locations", locationId ?? "", "technician-preferences"];
}

export function useLocationTechnicianPreferences(locationId: string | null | undefined) {
  return useQuery<LocationTechnicianPreferences>({
    queryKey: locationTechnicianPreferencesQueryKey(locationId),
    enabled: !!locationId,
  });
}

/** Every read a preference write changes: the location reads, the board's effective map, the History tab. */
export function invalidateTechnicianPreferences() {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const [head, , tail] = query.queryKey;
      if (head === "/api/locations" && tail === "technician-preferences") return true;
      return typeof head === "string" && head.startsWith("/api/technician-preferences/effective");
    },
  });
  queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
}

type ChipEntry = {
  technicianId: string;
  technicianName: string;
  kind: string;
  scopeType: string;
  note: string | null;
  inherited?: boolean;
};

/** "Prefers <name>" (green) / "Never <name>" (red), the note and the origin as the title; nothing when empty. */
export function TechnicianPreferenceChips({ entries, testIdPrefix, className }: { entries: ChipEntry[]; testIdPrefix: string; className?: string }) {
  if (!entries.length) return null;
  return (
    <>
      {entries.map((entry) => (
        <Badge
          key={`${entry.scopeType}-${entry.technicianId}`}
          variant="outline"
          className={cn(
            "text-xs",
            entry.kind === "EXCLUDED" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-emerald-300 bg-emerald-50 text-emerald-900",
            className,
          )}
          title={describePreferenceTitle(entry)}
          data-testid={`${testIdPrefix}-${entry.technicianId}`}
        >
          {describePreferenceChip(entry.kind, entry.technicianName)}
          {entry.inherited ? " (all locations)" : ""}
        </Badge>
      ))}
    </>
  );
}

const SELECT_CLASS = "flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm";

/** The add line both editors share: technician, Prefer / Never, a note, and (on the primary location) "Apply to all locations". */
function PreferenceAddRow({
  technicians,
  showAllLocations,
  isPending,
  onAdd,
}: {
  technicians: Technician[];
  showAllLocations: boolean;
  isPending: boolean;
  onAdd: (value: { technicianId: string; kind: TechnicianPreferenceKind; note: string; allLocations: boolean }) => void;
}) {
  const [technicianId, setTechnicianId] = useState("");
  const [kind, setKind] = useState<TechnicianPreferenceKind>("PREFERRED");
  const [note, setNote] = useState("");
  const [allLocations, setAllLocations] = useState(false);
  const reset = () => {
    setTechnicianId("");
    setKind("PREFERRED");
    setNote("");
    setAllLocations(false);
  };
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
        <select value={technicianId} onChange={(event) => setTechnicianId(event.target.value)} className={SELECT_CLASS} data-testid="select-preference-technician">
          <option value="">Choose a technician</option>
          {technicians.map((technician) => (
            <option key={technician.id} value={technician.id}>{technician.displayName}</option>
          ))}
        </select>
        <select value={kind} onChange={(event) => setKind(event.target.value as TechnicianPreferenceKind)} className={SELECT_CLASS} data-testid="select-preference-kind">
          <option value="PREFERRED">Prefer</option>
          <option value="EXCLUDED">Never send</option>
        </select>
      </div>
      <Input
        value={note}
        maxLength={MAX_TECHNICIAN_PREFERENCE_NOTE_LENGTH}
        onChange={(event) => setNote(event.target.value)}
        placeholder={kind === "EXCLUDED" ? "Why (optional) - e.g. the customer was unhappy with the last visit" : "Note (optional)"}
        className="h-9"
        data-testid="input-preference-note"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {showAllLocations ? (
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={allLocations} onChange={(event) => setAllLocations(event.target.checked)} data-testid="checkbox-preference-all-locations" />
            Apply to all locations
          </label>
        ) : <span />}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!technicianId || isPending}
          onClick={() => {
            onAdd({ technicianId, kind, note: note.trim(), allLocations: showAllLocations && allLocations });
            reset();
          }}
          data-testid="button-preference-add"
        >
          Add preference
        </Button>
      </div>
    </div>
  );
}

function PreferenceRow({ row, label, onRemove, removeTitle, isPending }: { row: TechnicianPreferenceView; label: string; onRemove: (() => void) | null; removeTitle?: string; isPending: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-md border bg-background px-2 py-1.5" data-testid={`row-preference-${row.id}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <TechnicianPreferenceChips entries={[{ ...row, inherited: false }]} testIdPrefix="chip-preference-row" />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        {row.note ? <p className="mt-1 text-xs text-muted-foreground">{row.note}</p> : null}
      </div>
      {onRemove ? (
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={isPending} onClick={onRemove} title={removeTitle} data-testid={`button-preference-remove-${row.id}`}>
          Remove
        </Button>
      ) : null}
    </div>
  );
}

const EDITOR_HELP = "Prefer a technician (a hint on the dispatch board) or exclude one - the customer asked they never be sent; placing them needs a manager's override with a reason.";

/**
 * The live editor (Edit Location): every add and remove is a request of its
 * own, independent of the dialog's Save. The location's own rows, then the
 * account's "all locations" rows - removable from the primary location only,
 * where "Apply to all locations" writes them. A location row for the same
 * technician wins over the account's (it is marked).
 */
export function TechnicianPreferencesEditor({ locationId }: { locationId: string }) {
  const { toast } = useToast();
  const { data, isLoading } = useLocationTechnicianPreferences(locationId);
  const { data: technicians } = useQuery<Technician[]>({ queryKey: ["/api/technicians"] });
  const describeError = (error: unknown) => describeTechnicianPreferenceRefusal(getApiErrorCode(error)) ?? getApiErrorMessage(error);
  const setMutation = useMutation({
    mutationFn: async (payload: TechnicianPreferenceSetRequest) => {
      const response = await apiRequest("PUT", `/api/locations/${locationId}/technician-preferences`, payload);
      return response.json() as Promise<LocationTechnicianPreferences>;
    },
    onSuccess: () => {
      invalidateTechnicianPreferences();
      toast({ title: "Technician preference saved" });
    },
    onError: (error) => toast({ title: "Preference not saved", description: describeError(error), variant: "destructive" }),
  });
  const clearMutation = useMutation({
    mutationFn: async (preferenceId: string) => {
      const response = await apiRequest("DELETE", `/api/locations/${locationId}/technician-preferences/${preferenceId}`);
      return response.json() as Promise<LocationTechnicianPreferences>;
    },
    onSuccess: () => {
      invalidateTechnicianPreferences();
      toast({ title: "Technician preference removed" });
    },
    onError: (error) => toast({ title: "Preference not removed", description: describeError(error), variant: "destructive" }),
  });
  const isPending = setMutation.isPending || clearMutation.isPending;
  const isPrimary = !!data?.isPrimaryLocation;
  const locationTechnicianIds = new Set((data?.locationRows ?? []).map((row) => row.technicianId));

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 px-3 py-2" data-testid="technician-preferences-editor">
      <div>
        <p className="text-sm font-semibold">Technician preferences</p>
        <p className="text-xs text-muted-foreground">{EDITOR_HELP}</p>
      </div>
      {isLoading ? <p className="text-xs text-muted-foreground">Loading preferences...</p> : null}
      {data && !data.locationRows.length && !data.accountRows.length ? <p className="text-xs text-muted-foreground">No technician preference recorded.</p> : null}
      {data?.locationRows.map((row) => (
        <PreferenceRow
          key={row.id}
          row={row}
          label={data.accountRows.some((accountRow) => accountRow.technicianId === row.technicianId) ? "This location - overrides all locations" : "This location"}
          onRemove={() => clearMutation.mutate(row.id)}
          isPending={isPending}
        />
      ))}
      {data?.accountRows.map((row) => (
        <PreferenceRow
          key={row.id}
          row={row}
          label={locationTechnicianIds.has(row.technicianId) ? "All locations - overridden here" : "All locations"}
          onRemove={isPrimary ? () => clearMutation.mutate(row.id) : null}
          isPending={isPending}
        />
      ))}
      {data && !isPrimary && data.accountRows.length ? (
        <p className="text-[11px] text-muted-foreground">"All locations" preferences are changed on the primary location.</p>
      ) : null}
      <PreferenceAddRow
        technicians={technicians ?? []}
        showAllLocations={isPrimary && !!data?.accountId}
        isPending={isPending}
        onAdd={({ technicianId, kind, note, allLocations }) =>
          setMutation.mutate({ technicianId, kind, note: note || null, scope: allLocations ? "ACCOUNT" : "LOCATION" })
        }
      />
    </div>
  );
}

export interface TechnicianPreferenceDraft {
  technicianId: string;
  kind: TechnicianPreferenceKind;
  note: string;
}

/**
 * Add Location's list: the location does not exist yet, so the rows are
 * drafts the dialog writes (PUT, scope LOCATION) once it is created. The
 * account's "all locations" preferences reach the new location by
 * themselves; they are edited on the primary location.
 */
export function TechnicianPreferenceDraftEditor({ drafts, onChange }: { drafts: TechnicianPreferenceDraft[]; onChange: (drafts: TechnicianPreferenceDraft[]) => void }) {
  const { data: technicians } = useQuery<Technician[]>({ queryKey: ["/api/technicians"] });
  const nameOf = (technicianId: string) => technicians?.find((technician) => technician.id === technicianId)?.displayName ?? "Technician";
  return (
    <div className="space-y-2 rounded-md border bg-muted/20 px-3 py-2" data-testid="technician-preferences-drafts">
      <div>
        <p className="text-sm font-semibold">Technician preferences</p>
        <p className="text-xs text-muted-foreground">{EDITOR_HELP} Preferences set on the primary location for all locations apply here too.</p>
      </div>
      {drafts.map((draft) => (
        <div key={draft.technicianId} className="flex items-start justify-between gap-2 rounded-md border bg-background px-2 py-1.5">
          <div className="min-w-0">
            <TechnicianPreferenceChips entries={[{ technicianId: draft.technicianId, technicianName: nameOf(draft.technicianId), kind: draft.kind, scopeType: "LOCATION", note: draft.note || null }]} testIdPrefix="chip-preference-draft" />
            {draft.note ? <p className="mt-1 text-xs text-muted-foreground">{draft.note}</p> : null}
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onChange(drafts.filter((candidate) => candidate.technicianId !== draft.technicianId))}>
            Remove
          </Button>
        </div>
      ))}
      <PreferenceAddRow
        technicians={technicians ?? []}
        showAllLocations={false}
        isPending={false}
        onAdd={({ technicianId, kind, note }) =>
          // One row per technician, as on the server: a second add replaces the first.
          onChange([...drafts.filter((draft) => draft.technicianId !== technicianId), { technicianId, kind, note }])
        }
      />
    </div>
  );
}

/** The 409 body of an EXCLUDED placement, or null for any other error. */
export function getTechnicianExcludedRefusal(error: unknown): TechnicianExcludedRefusal | null {
  if (!(error instanceof ApiError) || getApiErrorCode(error) !== TECHNICIAN_EXCLUDED) return null;
  return error.body as TechnicianExcludedRefusal;
}

export function useCanOverrideExclusion(): boolean {
  const { user } = useAuth();
  return can(user?.role ?? "", PERMISSIONS.OVERRIDE_TECHNICIAN_EXCLUSION);
}

/**
 * The manager's override (OVERRIDE_TECHNICIAN_EXCLUSION): the refusal's
 * message and note, a required reason, and the resend. Opened only for a
 * role that may override - anyone else gets the refusal as a toast.
 */
export function ExclusionOverridePrompt({
  refusal,
  isPending,
  onCancel,
  onConfirm,
}: {
  refusal: TechnicianExcludedRefusal | null;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    setReason("");
  }, [refusal]);
  return (
    <Dialog open={!!refusal} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-exclusion-override">
        <DialogHeader>
          <DialogTitle>{refusal ? `The customer excluded ${refusal.technicianName}` : "Technician excluded"}</DialogTitle>
          <DialogDescription>{refusal?.message}</DialogDescription>
        </DialogHeader>
        {refusal?.note ? <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">Customer's note: {refusal.note}</p> : null}
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Reason for the override</p>
          <Textarea
            value={reason}
            maxLength={MAX_EXCLUSION_OVERRIDE_REASON_LENGTH}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            placeholder="Why this technician must go anyway - recorded in the visit's history"
            data-testid="textarea-exclusion-override-reason"
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="button" variant="destructive" disabled={!reason.trim() || isPending} onClick={() => onConfirm(reason.trim())} data-testid="button-exclusion-override-confirm">
            Override and schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
