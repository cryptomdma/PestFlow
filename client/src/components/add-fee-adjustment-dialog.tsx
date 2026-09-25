import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getApiErrorMessage } from "@/lib/queryClient";
import { invalidateInvoiceViews } from "@/lib/invalidate-invoice-views";
import { dollarsToCents, formatCents } from "@shared/money";
import { describeInvoiceTerms } from "@shared/invoice-detail";
import type { BillingProfile, Invoice } from "@shared/schema";

// "Add fee / adjustment" (PLAN_ROADMAP_V2.md B6 / C2.3, Pass 13): the manual
// invoice - one ADJUSTMENT line, no service behind it - and the only place it
// survives, on the location ledger panel where the location is already known
// (owner, second review of 2026-09-19), so a location-less invoice can never
// recur. For the charges that have no visit to draft against: a returned-
// check or late fee, a re-inspection fee, a product sale, a cancellation fee,
// billing history back for a plan-less period. Work performed is the visit's
// invoice (Draft invoice for a visit, or generation), never this. Issued
// immediately through POST /api/invoices, which keeps requiring the location
// (Pass 10) and defaults a blank due date from the location's billing terms.

const EMPTY_FORM = { description: "", amount: "", tax: "0", dueDate: "", notes: "" };

export function AddFeeAdjustmentDialog({
  open,
  onOpenChange,
  customerId,
  locationId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  locationId: string;
  /** The issued invoice, for the caller to open in the modal. */
  onCreated?: (invoice: Invoice) => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);

  // The terms a blank due date falls back to. A 404 means no profile resolves
  // for the location, so a blank due date stays blank.
  const { data: billingProfile, isError: noBillingProfile } = useQuery<BillingProfile>({
    queryKey: ["/api/locations", locationId, "billing-profile"],
    enabled: open && !!locationId,
    retry: false,
  });
  const terms = describeInvoiceTerms(billingProfile?.invoiceTerms);

  const amountCents = dollarsToCents(form.amount) ?? 0;
  const taxCents = dollarsToCents(form.tax) ?? 0;
  const totalAmountCents = amountCents + taxCents;

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/invoices", {
        customerId,
        locationId,
        description: form.description.trim(),
        amountCents,
        taxCents,
        notes: form.notes.trim() || null,
        dueDate: form.dueDate || null,
      });
      return (await response.json()) as Invoice;
    },
    onSuccess: (invoice) => {
      invalidateInvoiceViews();
      toast({
        title: `${invoice.invoiceNumber} issued for ${formatCents(invoice.totalAmountCents)}`,
        description: `On this location's balance now${invoice.dueDate ? `, due ${new Date(invoice.dueDate).toLocaleDateString()}` : ", no due date"}.`,
      });
      onOpenChange(false);
      setForm(EMPTY_FORM);
      onCreated?.(invoice);
    },
    onError: (error: Error) => toast({ title: "Unable to add the fee", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const close = (next: boolean) => {
    if (mutation.isPending) return;
    onOpenChange(next);
    if (!next) setForm(EMPTY_FORM);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add fee / adjustment</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          A charge with no visit behind it - a returned-check or late fee, a re-inspection fee, a product sale, a cancellation fee. Issued now,
          on this location's balance. Work performed is invoiced from its visit, not here.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="fee-description">Description *</Label>
            <Input
              id="fee-description"
              placeholder="e.g., Returned check fee, Re-inspection fee"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              data-testid="input-fee-description"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fee-amount">Amount *</Label>
              <Input id="fee-amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))} data-testid="input-fee-amount" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fee-tax">Tax</Label>
              <Input id="fee-tax" type="number" min="0" step="0.01" value={form.tax} onChange={(e) => setForm((prev) => ({ ...prev, tax: e.target.value }))} data-testid="input-fee-tax" />
            </div>
            <div className="space-y-1.5">
              <Label>Total</Label>
              <Input value={formatCents(totalAmountCents)} disabled />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Tax is entered here, not computed: a fee has no service type for a tax rule to key off.</p>
          <div className="space-y-1.5">
            <Label htmlFor="fee-due-date">Due date</Label>
            <Input id="fee-due-date" type="date" value={form.dueDate} onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))} data-testid="input-fee-due-date" />
            <p className="text-xs text-muted-foreground" data-testid="text-fee-due-date-note">
              {terms
                ? `Leave blank to use the location's billing terms: ${terms}${billingProfile?.label ? ` (${billingProfile.label})` : ""}.`
                : noBillingProfile || (billingProfile && !terms)
                  ? "Leave blank for no due date - no billing terms resolve for this location."
                  : "Leave blank to use the location's billing terms, if any."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fee-notes">Notes</Label>
            <Textarea id="fee-notes" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} className="resize-none" rows={2} data-testid="input-fee-notes" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={mutation.isPending}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending || !form.description.trim() || amountCents <= 0} data-testid="button-add-fee">
              {mutation.isPending ? "Issuing..." : "Issue Invoice"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
