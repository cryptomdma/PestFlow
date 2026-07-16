import PDFDocument from "pdfkit";
import { formatCents } from "@shared/money";
import type { InvoiceDocumentContext } from "./types";

// Deterministic PDF generation: the same context must always produce the
// exact same bytes (PLAN_BILLING_V1.md §1.7 - "what you sent is what you
// can always re-produce, byte for byte"). PDFKit stamps CreationDate/
// ModDate with the current time by default, which would break that
// guarantee on every regeneration - both are pinned here to the invoice's
// own issueDate instead of Date.now(). Everything else PDFKit writes
// (object ordering, the trailer /ID) is a pure function of the document
// content and these info fields, so fixing this one source of "now" is
// sufficient for byte-identical output across regenerations.
export function renderInvoicePdf(context: InvoiceDocumentContext): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const fixedDate = new Date(`${context.issueDate}T00:00:00.000Z`);
    const doc = new PDFDocument({
      size: "LETTER",
      margin: 50,
      info: {
        Title: `Invoice ${context.invoiceNumber}`,
        Author: context.branding.orgName,
        CreationDate: fixedDate,
        ModDate: fixedDate,
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const accentColor = context.branding.primaryColorHex || "#2563eb";

    doc.fillColor(accentColor).fontSize(20).text(context.branding.orgName, { continued: false });
    doc.moveDown(0.3);
    doc.fillColor("#111827").fontSize(10);
    doc.text(`Invoice ${context.invoiceNumber}`, { align: "right" });
    doc.text(`Issued: ${context.issueDate}`, { align: "right" });
    if (context.dueDate) doc.text(`Due: ${context.dueDate}`, { align: "right" });
    doc.text(`Status: ${context.status}`, { align: "right" });

    doc.moveDown(1.5);
    const partiesY = doc.y;
    doc.fontSize(9).fillColor("#6b7280").text("REMIT TO", 50, partiesY);
    doc.fillColor("#111827").fontSize(10);
    const remitLines = [context.branding.remitToName, context.branding.remitToAddress, context.branding.remitToEmail, context.branding.remitToPhone].filter(
      (line): line is string => !!line,
    );
    doc.text(remitLines.join("\n") || "-", 50, partiesY + 12, { width: 220 });

    doc.fontSize(9).fillColor("#6b7280").text("BILL TO", 320, partiesY);
    doc.fillColor("#111827").fontSize(10);
    const billLines = [context.billToName, context.billToAddress].filter((line): line is string => !!line);
    doc.text(billLines.join("\n"), 320, partiesY + 12, { width: 220 });

    doc.moveDown(4);
    const tableTop = doc.y + 10;
    const columns = { description: 50, qty: 320, unitPrice: 380, amount: 460 };
    doc.fontSize(9).fillColor("#6b7280");
    doc.text("DESCRIPTION", columns.description, tableTop);
    doc.text("QTY", columns.qty, tableTop, { width: 50, align: "right" });
    doc.text("UNIT PRICE", columns.unitPrice, tableTop, { width: 70, align: "right" });
    doc.text("AMOUNT", columns.amount, tableTop, { width: 70, align: "right" });
    doc.moveTo(50, tableTop + 14).lineTo(545, tableTop + 14).strokeColor("#d1d5db").stroke();

    let rowY = tableTop + 22;
    doc.fontSize(10).fillColor("#111827");
    for (const item of context.lineItems) {
      doc.text(item.description, columns.description, rowY, { width: 260 });
      doc.text(String(item.quantity), columns.qty, rowY, { width: 50, align: "right" });
      doc.text(formatCents(item.unitPriceCents), columns.unitPrice, rowY, { width: 70, align: "right" });
      doc.text(formatCents(item.amountCents), columns.amount, rowY, { width: 70, align: "right" });
      rowY += 20;
    }

    doc.moveTo(50, rowY + 4).lineTo(545, rowY + 4).strokeColor("#d1d5db").stroke();
    let totalsY = rowY + 14;
    const totalLine = (label: string, value: string, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 12 : 10);
      doc.text(label, 380, totalsY, { width: 90, align: "right" });
      doc.text(value, 470, totalsY, { width: 75, align: "right" });
      totalsY += bold ? 18 : 16;
    };
    totalLine("Subtotal", formatCents(context.subtotalCents));
    totalLine("Tax", formatCents(context.taxCents));
    totalLine("Total", formatCents(context.totalCents), true);
    doc.font("Helvetica");

    if (context.notes) {
      doc.moveDown(2);
      doc.fontSize(9).fillColor("#4b5563").text(context.notes, 50, totalsY + 20, { width: 495 });
    }

    doc.end();
  });
}
