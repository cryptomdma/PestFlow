// Pass 40 (PLAN_ROADMAP_V2.md C6.1; B18): the cards on file for an account,
// as the customer screen's Edit Location dialog shows them - "Visa •••• 4242
// · exp 04/28" with Default / Expired / Test mode badges, Make default and
// Remove (MANAGE_PAYMENT_METHODS; the list itself is open to every role, the
// last four being the owner's "must be visible"), and Add card: a dialog
// that asks the server for a SetupIntent session (POST
// /api/accounts/:id/setup-intents) and mounts Stripe's own Payment Element
// against its client secret, so no card number ever reaches PestFlow (PCI
// SAQ-A - PLAN_BILLING_V1.md §1.2); on success the SetupIntent id goes to
// POST /api/accounts/:id/payment-methods, which reads the intent back from
// the provider and stores the display fields. Stripe.js loads from
// js.stripe.com only when the dialog opens, keyed by the org's publishable
// key. No provider connected (Settings -> Payments): Add card says so and
// does nothing (dev rule 6). The block is account-level - cards belong to
// the account, a billing profile picks one (PaymentMethodSelect).

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, getApiErrorMessage } from "@/lib/queryClient";
import { invalidatePaymentMethodViews } from "@/lib/invalidate-audit-views";
import { can, describePermissionHolders, PERMISSIONS } from "@shared/permissions";
import {
  describePaymentProvider,
  describeStoredPaymentMethod,
  isPaymentMethodExpired,
  pickDefaultPaymentMethod,
  type PaymentProviderAccountSummary,
  type SetupIntentSession,
  type StoredPaymentMethodSummary,
} from "@shared/payment-methods";
import { CreditCard, Plus } from "lucide-react";

export function usePaymentProviderSummary() {
  return useQuery<PaymentProviderAccountSummary>({ queryKey: ["/api/payment-provider"] });
}

/** The account's ACTIVE cards (GET /api/accounts/:accountId/payment-methods). */
export function useAccountPaymentMethods(accountId: string | null | undefined) {
  return useQuery<StoredPaymentMethodSummary[]>({ queryKey: ["/api/accounts", accountId, "payment-methods"], enabled: !!accountId });
}

// One Stripe.js load per publishable key for the life of the page.
const stripeLoaders = new Map<string, Promise<Stripe | null>>();
function getStripe(publishableKey: string): Promise<Stripe | null> {
  let loader = stripeLoaders.get(publishableKey);
  if (!loader) {
    loader = loadStripe(publishableKey);
    stripeLoaders.set(publishableKey, loader);
  }
  return loader;
}

/** "Card for this profile": the account's default card (named) or one of the active cards - the profile's `defaultPaymentMethodId`. */
export function PaymentMethodSelect({
  value,
  onChange,
  methods,
  idPrefix,
}: {
  /** "" = the account's default card. */
  value: string;
  onChange: (next: string) => void;
  methods: StoredPaymentMethodSummary[];
  idPrefix: string;
}) {
  const accountDefault = pickDefaultPaymentMethod(methods);
  const active = methods.filter((method) => method.status === "active");
  const current = value && !active.some((method) => method.id === value) ? "" : value;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-card`}>Card for this profile</Label>
      <Select value={current || "ACCOUNT_DEFAULT"} onValueChange={(next) => onChange(next === "ACCOUNT_DEFAULT" ? "" : next)}>
        <SelectTrigger id={`${idPrefix}-card`} data-testid={`select-${idPrefix}-card`}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ACCOUNT_DEFAULT">{accountDefault ? `Account default card (${describeStoredPaymentMethod(accountDefault)})` : "Account default card (none on file yet)"}</SelectItem>
          {active.map((method) => (
            <SelectItem key={method.id} value={method.id}>{describeStoredPaymentMethod(method)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CardBadges({ method }: { method: StoredPaymentMethodSummary }) {
  const expired = isPaymentMethodExpired(method);
  return (
    <>
      {method.isDefault && <Badge variant="secondary" className="text-xs" data-testid={`badge-card-default-${method.id}`}>Default</Badge>}
      {expired && <Badge variant="destructive" className="text-xs" data-testid={`badge-card-expired-${method.id}`}>Expired</Badge>}
      {!method.livemode && <Badge variant="outline" className="text-xs" data-testid={`badge-card-test-${method.id}`}>Test mode</Badge>}
    </>
  );
}

export function PaymentMethodsBlock({
  accountId,
  idPrefix,
  warnNoCard,
}: {
  accountId: string;
  idPrefix: string;
  /** The profile shown beside this block bills by card: say so when there is none. */
  warnNoCard: boolean;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const canManage = can(user?.role ?? "", PERMISSIONS.MANAGE_PAYMENT_METHODS);
  const managedBy = `Managed by ${describePermissionHolders(PERMISSIONS.MANAGE_PAYMENT_METHODS)} (Manage cards on file)`;
  const { data: methods, isLoading } = useAccountPaymentMethods(accountId);
  const { data: provider } = usePaymentProviderSummary();
  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState<StoredPaymentMethodSummary | null>(null);

  const makeDefault = useMutation({
    mutationFn: async (method: StoredPaymentMethodSummary) => (await apiRequest("POST", `/api/payment-methods/${method.id}/make-default`, {})).json(),
    onSuccess: () => {
      invalidatePaymentMethodViews();
      toast({ title: "Default card updated" });
    },
    onError: (err: Error) => toast({ title: "Could not change the default card", description: getApiErrorMessage(err), variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async (method: StoredPaymentMethodSummary) => (await apiRequest("POST", `/api/payment-methods/${method.id}/remove`, {})).json(),
    onSuccess: () => {
      invalidatePaymentMethodViews();
      setRemoving(null);
      toast({ title: "Card removed" });
    },
    onError: (err: Error) => {
      setRemoving(null);
      toast({ title: "Could not remove the card", description: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const active = (methods ?? []).filter((method) => method.status === "active");
  const providerReady = !!provider?.configured;
  const addDisabledReason = !canManage ? managedBy : !providerReady ? "Connect a payment provider under Settings -> Payments before adding a card." : null;

  return (
    <div className="space-y-2 rounded-md border p-3" data-testid={`block-${idPrefix}-cards`}>
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-sm font-medium flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Cards on file</p>
          <p className="text-xs text-muted-foreground">Held by the payment provider for this account; PestFlow keeps the brand, last four and expiry only.</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setAddOpen(true)} disabled={!!addDisabledReason} title={addDisabledReason ?? undefined} data-testid={`button-${idPrefix}-add-card`}>
          <Plus className="h-3 w-3 mr-1" /> Add card
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-10" />
      ) : active.length === 0 ? (
        <p className={warnNoCard ? "text-xs text-amber-700 dark:text-amber-400" : "text-xs text-muted-foreground"} data-testid={`text-${idPrefix}-no-card`}>
          {warnNoCard ? "No card on file - this profile bills by card. Invoices still issue; nothing can be charged until a card is added." : "No card on file."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {active.map((method) => (
            <li key={method.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5" data-testid={`row-card-${method.id}`}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span data-testid={`text-card-${method.id}`}>{describeStoredPaymentMethod(method)}</span>
                <CardBadges method={method} />
              </div>
              <div className="flex items-center gap-1">
                {!method.isDefault && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => makeDefault.mutate(method)} disabled={!canManage || makeDefault.isPending} title={canManage ? undefined : managedBy} data-testid={`button-card-default-${method.id}`}>
                    Make default
                  </Button>
                )}
                <Button type="button" size="sm" variant="ghost" onClick={() => setRemoving(method)} disabled={!canManage || remove.isPending} title={canManage ? undefined : managedBy} data-testid={`button-card-remove-${method.id}`}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!providerReady && canManage && (
        <p className="text-xs text-muted-foreground" data-testid={`text-${idPrefix}-no-provider`}>No payment provider is connected yet - Settings &rarr; Payments.</p>
      )}
      <AddCardDialog accountId={accountId} open={addOpen} onOpenChange={setAddOpen} provider={provider ?? null} />
      <AlertDialog open={!!removing} onOpenChange={(open) => { if (!open) setRemoving(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this card?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing ? `${describeStoredPaymentMethod(removing)} is detached at the provider and can no longer be charged. Any billing profile pointing at it falls back to the account's default card. The record of it stays in History.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (removing) remove.mutate(removing); }} data-testid="button-card-remove-confirm">Remove card</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// The capture dialog. Opening it asks the server for a SetupIntent session;
// the Payment Element mounts against the session's client secret (one
// Elements instance per session - the secret is single-use); Save confirms
// with Stripe in the browser (no redirect for a card) and then posts the
// intent id for the server to verify and store.
function AddCardDialog({
  accountId,
  open,
  onOpenChange,
  provider,
}: {
  accountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: PaymentProviderAccountSummary | null;
}) {
  const [session, setSession] = useState<SetupIntentSession | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSession(null);
      setSessionError(null);
      return;
    }
    let cancelled = false;
    apiRequest("POST", `/api/accounts/${accountId}/setup-intents`, {})
      .then((res) => res.json() as Promise<SetupIntentSession>)
      .then((next) => { if (!cancelled) setSession(next); })
      .catch((err) => { if (!cancelled) setSessionError(getApiErrorMessage(err)); });
    return () => { cancelled = true; };
  }, [open, accountId]);

  const stripePromise = useMemo(() => (session?.provider === "stripe" && session.publishableKey ? getStripe(session.publishableKey) : null), [session?.provider, session?.publishableKey]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-add-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Add card on file
            {session && session.mode === "test" && <Badge variant="outline" className="text-xs font-normal" data-testid="badge-add-card-test-mode">Test mode</Badge>}
          </DialogTitle>
        </DialogHeader>
        {sessionError ? (
          <p className="text-sm text-destructive" data-testid="text-add-card-error">{sessionError}</p>
        ) : !session ? (
          <Skeleton className="h-24" />
        ) : session.provider !== "stripe" ? (
          <p className="text-sm text-muted-foreground" data-testid="text-add-card-no-form">
            The connected provider ({describePaymentProvider(session.provider)}) has no card form in the browser; a card is confirmed through the API.
          </p>
        ) : !session.publishableKey ? (
          <p className="text-sm text-destructive">The payment provider has no publishable key - add it under Settings -&gt; Payments.</p>
        ) : (
          <Elements key={session.setupIntentId} stripe={stripePromise} options={{ clientSecret: session.clientSecret }}>
            <CardForm accountId={accountId} session={session} onDone={() => onOpenChange(false)} providerName={provider?.provider ?? session.provider} />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CardForm({ accountId, session, onDone, providerName }: { accountId: string; session: SetupIntentSession; onDone: () => void; providerName: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [makeDefault, setMakeDefault] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const result = await stripe.confirmSetup({ elements, confirmParams: { return_url: window.location.href }, redirect: "if_required" });
    if (result.error) {
      setError(result.error.message ?? "The card was not saved");
      setSubmitting(false);
      return;
    }
    const setupIntentId = result.setupIntent?.id ?? session.setupIntentId;
    try {
      const res = await apiRequest("POST", `/api/accounts/${accountId}/payment-methods`, { setupIntentId, makeDefault });
      const saved = (await res.json()) as StoredPaymentMethodSummary;
      invalidatePaymentMethodViews();
      toast({ title: "Card saved", description: `${describeStoredPaymentMethod(saved)} is on file${saved.isDefault ? " as the default card" : ""}.` });
      onDone();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="form-add-card">
      <PaymentElement options={{ layout: "tabs" }} />
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={makeDefault} onCheckedChange={(checked) => setMakeDefault(checked === true)} data-testid="checkbox-add-card-default" />
        <span>Make this the account's default card</span>
      </label>
      {error && <p className="text-sm text-destructive" data-testid="text-add-card-error">{error}</p>}
      <p className="text-xs text-muted-foreground">The card details go to {describePaymentProvider(providerName)} directly; PestFlow stores the brand, last four and expiry.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={submitting}>Cancel</Button>
        <Button type="submit" disabled={!stripe || !elements || submitting} data-testid="button-add-card-save">{submitting ? "Saving..." : "Save card"}</Button>
      </div>
    </form>
  );
}
