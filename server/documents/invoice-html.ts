import { formatCents } from "@shared/money";
import type { InvoiceDocumentContext } from "./types";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Deterministic: the same context always produces the same string. No
// current-time values, no random ids - everything comes from context,
// which itself is a frozen snapshot of the invoice (see
// getInvoiceDocumentContext in storage.ts).
export function renderInvoiceHtml(context: InvoiceDocumentContext): string {
  const accentColor = context.branding.primaryColorHex || "#2563eb";
  const rows = context.lineItems
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.description)}</td>
          <td class="num">${item.quantity}</td>
          <td class="num">${formatCents(item.unitPriceCents)}</td>
          <td class="num">${formatCents(item.amountCents)}</td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Invoice ${escapeHtml(context.invoiceNumber)}</title>
<style>
  body { font-family: Helvetica, Arial, sans-serif; color: #111827; margin: 0; padding: 32px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${accentColor}; padding-bottom: 16px; }
  .header h1 { margin: 0; color: ${accentColor}; font-size: 22px; }
  .meta { text-align: right; font-size: 12px; color: #4b5563; }
  .parties { display: flex; justify-content: space-between; margin-top: 24px; font-size: 13px; }
  .parties .block { max-width: 45%; white-space: pre-line; }
  .parties h3 { font-size: 11px; text-transform: uppercase; color: #6b7280; margin: 0 0 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 24px; font-size: 13px; }
  th { text-align: left; border-bottom: 1px solid #d1d5db; padding: 6px 4px; font-size: 11px; text-transform: uppercase; color: #6b7280; }
  td { padding: 6px 4px; border-bottom: 1px solid #f3f4f6; }
  .num { text-align: right; }
  .totals { margin-top: 16px; width: 260px; margin-left: auto; font-size: 13px; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals .total { font-weight: bold; border-top: 1px solid #d1d5db; padding-top: 8px; font-size: 15px; }
  .notes { margin-top: 24px; font-size: 12px; color: #4b5563; white-space: pre-line; }
</style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(context.branding.orgName)}</h1>
    <div class="meta">
      <div><strong>Invoice ${escapeHtml(context.invoiceNumber)}</strong></div>
      <div>Issued: ${escapeHtml(context.issueDate)}</div>
      ${context.dueDate ? `<div>Due: ${escapeHtml(context.dueDate)}</div>` : ""}
      <div>Status: ${escapeHtml(context.status)}</div>
    </div>
  </div>
  <div class="parties">
    <div class="block">
      <h3>Remit To</h3>
      ${context.branding.remitToName ? escapeHtml(context.branding.remitToName) + "<br>" : ""}
      ${context.branding.remitToAddress ? escapeHtml(context.branding.remitToAddress) + "<br>" : ""}
      ${context.branding.remitToEmail ? escapeHtml(context.branding.remitToEmail) + "<br>" : ""}
      ${context.branding.remitToPhone ? escapeHtml(context.branding.remitToPhone) : ""}
    </div>
    <div class="block">
      <h3>Bill To</h3>
      ${escapeHtml(context.billToName)}<br>
      ${context.billToAddress ? escapeHtml(context.billToAddress) : ""}
    </div>
  </div>
  <table>
    <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>${formatCents(context.subtotalCents)}</span></div>
    <div><span>Tax</span><span>${formatCents(context.taxCents)}</span></div>
    <div class="total"><span>Total</span><span>${formatCents(context.totalCents)}</span></div>
  </div>
  ${context.notes ? `<div class="notes">${escapeHtml(context.notes)}</div>` : ""}
</body>
</html>`;
}
