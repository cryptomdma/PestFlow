// Pass 39 (PLAN_ROADMAP_V2.md C5.8; canon §17): the `app_settings` keys the
// Settings page writes, labelled for the "Recent settings changes" list.
// Every settings write records an `app_setting` audit row whose entityId is
// the KEY (shared/audit.ts), so the list needs a name for each; the keys
// themselves stay where their owning modules declare them
// (shared/dispatch-board.ts, shared/material-lists.ts, shared/ticket-reopen.ts,
// shared/invoice-on-finalize.ts, shared/service-report.ts,
// shared/billing-profile-defaults.ts, and the two literals storage.ts has
// carried since Phase 1). An unknown key (a row written before a rename, a
// key added later) is humanized rather than hidden.

export const APP_SETTING_AUDIT_ENTITY_TYPE = "app_setting";

export const APP_SETTING_KEY_LABELS: Record<string, string> = {
  service_time_tracking_mode: "Service time tracking",
  appointment_cancel_reschedule_reasons: "Appointment cancel / reschedule reasons",
  ticket_reopen_reasons: "Ticket reopen reasons",
  material_units: "Material units",
  application_areas: "Application areas",
  invoice_on_finalize: "Invoicing on finalization",
  attach_service_report_to_invoices: "Attach service report to invoices",
  dispatch_view_interval_minutes: "Dispatch board: view interval",
  dispatch_snap_minutes: "Dispatch board: snap interval",
  dispatch_default_start_hour: "Dispatch board: default start hour",
  dispatch_default_end_hour: "Dispatch board: default end hour",
  default_billing_profile_template_id: "Billing defaults: default template",
};

/** "Invoicing on finalization" for a known key; "Some new key" for one this list does not know. */
export function describeAppSettingKey(key: string): string {
  const known = APP_SETTING_KEY_LABELS[key];
  if (known) return known;
  const spaced = key.replace(/_/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
}
