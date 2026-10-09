// Pass 40 (PLAN_ROADMAP_V2.md C6.1; PLAN_BILLING_V1.md §0.4): Settings ->
// Payments - the org's payment provider account. The read (GET
// /api/payment-provider) answers connected / mode / publishable key /
// connected account and whether a webhook secret is stored - never a
// secret; the form is write-only for the secret key and the webhook signing
// secret (a blank field keeps the stored one; a disconnect clears both) and
// MANAGE_SETTINGS like every other settings write, so everyone else sees the
// status and the "managed by" note. The row's audit rows
// (payment_provider_account - a fingerprint per secret, never a key) are
// listed under the form so a key rotation is visible without a database.
// The server stores the secrets encrypted under PAYMENT_CREDENTIALS_KEY;
// when that variable is missing the card says so instead of offering a Save
// that would 503.

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getApiErrorMessage, queryClient } from "@/lib/queryClient";
import { invalidateAuditViews } from "@/lib/invalidate-audit-views";
import { AuditLogEntryCard, type AuditLogEntry } from "@/components/audit-log-entry-card";
import {
  PAYMENT_PROVIDER_MODES,
  describePaymentProvider,
  describePaymentProviderMode,
  type PaymentProviderAccountInput,
  type PaymentProviderAccountSummary,
  type PaymentProviderMode,
} from "@shared/payment-methods";
import { CreditCard } from "lucide-react";

const RECENT_PROVIDER_CHANGES_LIMIT = 10;

export function PaymentProviderSettingsCard({ canManageSettings, settingsManagers }: { canManageSettings: boolean; settingsManagers: string }) {
  const { toast } = useToast();
  const { data: summary, isLoading } = useQuery<PaymentProviderAccountSummary>({ queryKey: ["/api/payment-provider"] });
  const { data: changes } = useQuery<AuditLogEntry[]>({ queryKey: [`/api/audit-logs?entityType=payment_provider_account&limit=${RECENT_PROVIDER_CHANGES_LIMIT}`] });
  const [form, setForm] = useState<{ mode: PaymentProviderMode; publishableKey: string; secretKey: string; webhookSecret: string; connectedAccountId: string }>({
    mode: "test",
    publishableKey: "",
    secretKey: "",
    webhookSecret: "",
    connectedAccountId: "",
  });
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (summary) {
      setForm((prev) => ({ ...prev, mode: summary.mode ?? "test", publishableKey: summary.publishableKey ?? "", connectedAccountId: summary.connectedAccountId ?? "" }));
    }
  }, [summary]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/payment-provider"] });
    invalidateAuditViews();
  };

  const save = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload: PaymentProviderAccountInput = {
        provider: "stripe",
        mode: data.mode,
        publishableKey: data.publishableKey.trim() || null,
        connectedAccountId: data.connectedAccountId.trim() || null,
        ...(data.secretKey.trim() ? { secretKey: data.secretKey.trim() } : {}),
        ...(data.webhookSecret.trim() ? { webhookSecret: data.webhookSecret.trim() } : {}),
      };
      return (await apiRequest("PUT", "/api/payment-provider", payload)).json() as Promise<PaymentProviderAccountSummary>;
    },
    onSuccess: () => {
      refresh();
      setForm((prev) => ({ ...prev, secretKey: "", webhookSecret: "" }));
      toast({ title: "Payment provider saved" });
    },
    onError: (err: Error) => toast({ title: "Payment provider not saved", description: getApiErrorMessage(err), variant: "destructive" }),
  });

  const disconnect = useMutation({
    mutationFn: async () => (await apiRequest("DELETE", "/api/payment-provider")).json() as Promise<PaymentProviderAccountSummary>,
    onSuccess: () => {
      refresh();
      setDisconnecting(false);
      toast({ title: "Payment provider disconnected", description: "The stored keys were cleared. Cards already on file stay listed; nothing can be captured or charged until a provider is connected again." });
    },
    onError: (err: Error) => {
      setDisconnecting(false);
      toast({ title: "Could not disconnect", description: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const configured = !!summary?.configured;
  const encryptionReady = summary?.encryptionReady ?? true;

  return (
    <Card data-testid="card-payment-provider">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base font-semibold flex items-center gap-2"><CreditCard className="h-4 w-4" /> Payments</CardTitle>
        {!canManageSettings && (
          <p className="text-xs text-muted-foreground" data-testid="text-payment-provider-admin-only">The payment provider is managed by {settingsManagers} (Manage Settings).</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !summary ? (
          <Skeleton className="h-16" />
        ) : (
          <div className="space-y-1" data-testid="block-payment-provider-status">
            <div className="flex flex-wrap items-center gap-2">
              {configured ? (
                <>
                  <Badge variant="secondary" data-testid="badge-payment-provider-connected">Connected · {describePaymentProvider(summary.provider)}</Badge>
                  <Badge variant={summary.mode === "live" ? "default" : "outline"} data-testid="badge-payment-provider-mode">{describePaymentProviderMode(summary.mode)}</Badge>
                </>
              ) : (
                <Badge variant="outline" data-testid="badge-payment-provider-not-connected">{summary.status === "inactive" ? "Disconnected" : "Not connected"}</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {configured
                ? `Cards on file are captured through ${describePaymentProvider(summary.provider)} in ${describePaymentProviderMode(summary.mode).toLowerCase()}. Charging from an invoice and webhooks are a later pass (C6.2).`
                : "Connect Stripe to capture cards on file from the customer screen. PestFlow never sees a card number: the card form is Stripe's own."}
            </p>
            {configured && (
              <dl className="grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-[auto_1fr]">
                <dt className="text-muted-foreground">Publishable key</dt>
                <dd className="font-mono break-all" data-testid="text-payment-provider-publishable-key">{summary.publishableKey ?? "not set"}</dd>
                <dt className="text-muted-foreground">Connected account</dt>
                <dd className="font-mono" data-testid="text-payment-provider-connected-account">{summary.connectedAccountId ?? "the organization's own account"}</dd>
                <dt className="text-muted-foreground">Webhook signing secret</dt>
                <dd data-testid="text-payment-provider-webhook">{summary.hasWebhookSecret ? "stored" : "not set (needed when webhooks land, C6.2)"}</dd>
              </dl>
            )}
          </div>
        )}

        {!encryptionReady && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200" data-testid="text-payment-provider-no-encryption-key">
            The server has no PAYMENT_CREDENTIALS_KEY, so provider keys cannot be stored. Add one to .env (PROJECT_MAP.md says how) and restart the server.
          </p>
        )}

        {canManageSettings && (
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(form); }} className="space-y-3" data-testid="form-payment-provider">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="payment-provider-mode">Mode</Label>
                <Select value={form.mode} onValueChange={(value) => setForm((prev) => ({ ...prev, mode: value === "live" ? "live" : "test" }))}>
                  <SelectTrigger id="payment-provider-mode" data-testid="select-payment-provider-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_PROVIDER_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>{describePaymentProviderMode(mode)}{mode === "test" ? " - test keys, test cards" : " - real keys, real cards"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payment-provider-publishable-key">Publishable key</Label>
                <Input id="payment-provider-publishable-key" value={form.publishableKey} onChange={(e) => setForm((prev) => ({ ...prev, publishableKey: e.target.value }))} placeholder={form.mode === "live" ? "pk_live_..." : "pk_test_..."} autoComplete="off" data-testid="input-payment-provider-publishable-key" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="payment-provider-secret-key">Secret key</Label>
                <Input id="payment-provider-secret-key" type="password" value={form.secretKey} onChange={(e) => setForm((prev) => ({ ...prev, secretKey: e.target.value }))} placeholder={configured && summary?.mode === form.mode ? "Stored - paste a new key to rotate it" : form.mode === "live" ? "sk_live_..." : "sk_test_..."} autoComplete="new-password" data-testid="input-payment-provider-secret-key" />
                <p className="text-xs text-muted-foreground">Write-only: stored encrypted, never shown again. Required to connect, and when the mode changes.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payment-provider-webhook-secret">Webhook signing secret (optional)</Label>
                <Input id="payment-provider-webhook-secret" type="password" value={form.webhookSecret} onChange={(e) => setForm((prev) => ({ ...prev, webhookSecret: e.target.value }))} placeholder={summary?.hasWebhookSecret ? "Stored - paste a new one to rotate it" : "whsec_... (used once webhooks land)"} autoComplete="new-password" data-testid="input-payment-provider-webhook-secret" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-provider-connected-account">Connected account (Stripe Connect, optional)</Label>
              <Input id="payment-provider-connected-account" value={form.connectedAccountId} onChange={(e) => setForm((prev) => ({ ...prev, connectedAccountId: e.target.value }))} placeholder="acct_... - leave blank to use the organization's own Stripe account" autoComplete="off" data-testid="input-payment-provider-connected-account" />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {configured && (
                <Button type="button" variant="outline" onClick={() => setDisconnecting(true)} disabled={disconnect.isPending || save.isPending} data-testid="button-payment-provider-disconnect">Disconnect</Button>
              )}
              <Button type="submit" disabled={save.isPending || !encryptionReady} title={encryptionReady ? undefined : "Set PAYMENT_CREDENTIALS_KEY on the server first"} data-testid="button-payment-provider-save">
                {save.isPending ? "Saving..." : configured ? "Save changes" : "Connect Stripe"}
              </Button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">Recent changes</p>
          {!changes?.length ? (
            <p className="text-xs text-muted-foreground" data-testid="text-payment-provider-changes-empty">No provider changes recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {changes.map((entry) => (
                <div key={entry.id} data-testid={`row-payment-provider-change-${entry.id}`}>
                  <AuditLogEntryCard entry={entry} showEntityType={false} />
                </div>
              ))}
            </div>
          )}
        </div>

        <AlertDialog open={disconnecting} onOpenChange={setDisconnecting}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disconnect the payment provider?</AlertDialogTitle>
              <AlertDialogDescription>
                The stored secret key and webhook secret are cleared. Cards already on file stay listed with their last four, but nothing can be captured or charged until a provider is connected again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction onClick={() => disconnect.mutate()} data-testid="button-payment-provider-disconnect-confirm">Disconnect</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
