import PDFDocument from "pdfkit";
import { formatCents } from "@shared/money";
import { AGING_BASIS_LABEL, AGING_BUCKET_LABELS, AGING_BUCKET_RANGES, AGING_BUCKETS, type AgedInvoice, type AgingFigures } from "@shared/aging";
import { describeAgreementStatus, STATEMENT_VARIANT_LABELS, type AccountStatementSection, type LocationStatement, type StatementFigures } from "@shared/statements";
import type { StatementDocumentContext, StatementDocumentParty } from "./types";

// Deterministic PDF generation for statements (PLAN_ROADMAP_V2.md C2.5, Pass
// 15), the invoice renderer's rule: the same context must always produce the
// exact same bytes, so PDFKit's CreationDate / ModDate are pinned to the
// statement date rather than Date.now(), and nothing here reads a clock.
// Two generations on the same day over an unmoved ledger are byte-identical;
// a generation on another day prints another statement date, which is
// content, not noise.
//
// Pure layout: every figure and every line comes from the context, which
// storage assembled through shared/statements.ts. The table helper paginates
// - a property manager's account statement runs to pages - and redraws the
// column headings on each new page.

const LEFT = 50;
const WIDTH = 512;
const TEXT = "#111827";
const MUTED = "#6b7280";
const RULE = "#d1d5db";

interface Column {
  label: string;
  width: number;
  align?: "left" | "right";
}

interface Row {
  cells: string[];
  bold?: boolean;
  muted?: boolean;
  /** Cells (by index) printed muted while the rest of the row is not - a pending amount. */
  mutedCells?: number[];
  /** A rule above the row - the closing line of a table. */
  ruleAbove?: boolean;
}

export function renderStatementPdf(context: StatementDocumentContext): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const fixedDate = new Date(`${context.statementDate}T00:00:00.000Z`);
    const title = STATEMENT_VARIANT_LABELS[context.variant];
    const doc = new PDFDocument({
      size: "LETTER",
      margin: 50,
      info: {
        Title: `${title} - ${context.statementDate}`,
        Author: context.branding.orgName,
        CreationDate: fixedDate,
        ModDate: fixedDate,
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const accent = context.branding.primaryColorHex || "#2563eb";
    const bottom = doc.page.height - 50;
    let y = 50;

    const ensureRoom = (height: number) => {
      if (y + height > bottom) {
        doc.addPage();
        y = 50;
      }
    };
    const body = () => doc.font("Helvetica").fontSize(10).fillColor(TEXT);
    const gap = (points: number) => {
      y += points;
    };
    const paragraph = (text: string, options: { size?: number; color?: string; bold?: boolean; width?: number } = {}) => {
      doc.font(options.bold ? "Helvetica-Bold" : "Helvetica").fontSize(options.size ?? 10).fillColor(options.color ?? TEXT);
      const width = options.width ?? WIDTH;
      const height = doc.heightOfString(text, { width });
      ensureRoom(height);
      doc.text(text, LEFT, y, { width });
      y += height;
      body();
    };
    const sectionHeading = (text: string) => {
      ensureRoom(30);
      gap(6);
      doc.font("Helvetica-Bold").fontSize(11).fillColor(accent).text(text, LEFT, y, { width: WIDTH });
      y += 16;
      body();
    };
    const rule = () => {
      doc.moveTo(LEFT, y).lineTo(LEFT + WIDTH, y).strokeColor(RULE).stroke();
    };

    // Columns are given as widths summing to WIDTH; rows paginate, and the
    // heading row is redrawn on every new page.
    const drawTable = (columns: Column[], rows: Row[]) => {
      const cellX: number[] = [];
      let x = LEFT;
      for (const column of columns) {
        cellX.push(x);
        x += column.width;
      }
      const drawHeading = () => {
        doc.font("Helvetica").fontSize(8).fillColor(MUTED);
        columns.forEach((column, index) => {
          doc.text(column.label.toUpperCase(), cellX[index] + 2, y, { width: column.width - 4, align: column.align ?? "left", lineBreak: false });
        });
        y += 12;
        rule();
        y += 4;
        body();
      };
      ensureRoom(40);
      drawHeading();
      for (const row of rows) {
        doc.font(row.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
        let height = 0;
        row.cells.forEach((cell, index) => {
          height = Math.max(height, doc.heightOfString(cell || " ", { width: columns[index].width - 4 }));
        });
        height = Math.max(height, 11);
        if (y + height + 6 > bottom) {
          doc.addPage();
          y = 50;
          drawHeading();
        }
        if (row.ruleAbove) {
          rule();
          y += 4;
        }
        row.cells.forEach((cell, index) => {
          const muted = row.muted || (row.mutedCells ?? []).includes(index);
          doc.font(row.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(muted ? MUTED : TEXT);
          doc.text(cell, cellX[index] + 2, y, { width: columns[index].width - 4, align: columns[index].align ?? "left" });
        });
        y += height + 5;
      }
      rule();
      y += 8;
      body();
    };

    const partyLines = (party: StatementDocumentParty) => [party.name, party.address].filter((line): line is string => !!line);

    // ---- Header: the org, then the document's title and dates on the right.
    doc.font("Helvetica-Bold").fontSize(20).fillColor(accent).text(context.branding.orgName, LEFT, y, { width: 300 });
    body();
    const metaX = LEFT + 300;
    const metaWidth = WIDTH - 300;
    doc.font("Helvetica-Bold").fontSize(12).fillColor(TEXT).text(title, metaX, y, { width: metaWidth, align: "right" });
    let metaY = y + 16;
    doc.font("Helvetica").fontSize(10);
    const metaLine = (text: string) => {
      doc.text(text, metaX, metaY, { width: metaWidth, align: "right" });
      metaY += 13;
    };
    metaLine(`Statement date: ${context.statementDate}`);
    if (context.variant === "ZERO_BALANCE_LETTER") {
      metaLine(`Balance as of ${context.letter.asOf}`);
    } else {
      metaLine(`Period: ${context.statement.periodFrom} to ${context.statement.periodTo}`);
    }
    y = Math.max(y + 26, metaY) + 10;
    rule();
    y += 14;

    // ---- Parties: Remit To, Bill To, and the service location (or, for the
    // account statement, the customer the sections belong to).
    const partiesTop = y;
    let partiesBottom = y;
    const partyBlock = (heading: string, lines: string[], x: number, width: number) => {
      doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(heading.toUpperCase(), x, partiesTop, { width });
      doc.font("Helvetica").fontSize(10).fillColor(TEXT).text(lines.join("\n") || "-", x, partiesTop + 12, { width });
      partiesBottom = Math.max(partiesBottom, doc.y);
    };
    const remitLines = [context.branding.remitToName, context.branding.remitToAddress, context.branding.remitToEmail, context.branding.remitToPhone].filter(
      (line): line is string => !!line,
    );
    const columnWidth = 165;
    partyBlock("Remit to", remitLines, LEFT, columnWidth);
    partyBlock("Bill to", partyLines(context.billTo), LEFT + columnWidth + 8, columnWidth);
    if (context.variant === "ACCOUNT") {
      partyBlock("Account", [context.customerName, `${context.statement.sections.length} location${context.statement.sections.length === 1 ? "" : "s"}`], LEFT + (columnWidth + 8) * 2, columnWidth);
    } else {
      partyBlock("Service location", partyLines(context.location), LEFT + (columnWidth + 8) * 2, columnWidth);
    }
    y = partiesBottom + 16;
    body();

    // ---- The figures box every statement variant opens with.
    const summaryRows = (figures: StatementFigures, label: string): Row[] => {
      const rows: Row[] = [
        { cells: [`Opening balance on ${label}`, formatCents(figures.openingBalanceCents)] },
        { cells: [`Charges - ${figures.invoiceCount} invoice${figures.invoiceCount === 1 ? "" : "s"} issued`, formatCents(figures.chargesCents)] },
        { cells: ["Payments and credits applied", figures.creditsCents ? `-${formatCents(figures.creditsCents)}` : formatCents(0)] },
        { cells: ["Closing balance", formatCents(figures.closingBalanceCents)], bold: true, ruleAbove: true },
      ];
      if (figures.onAccountCents > 0) {
        rows.push({ cells: ["On account - confirmed money not yet applied to an invoice; shown beside the balance, not subtracted", formatCents(figures.onAccountCents)], muted: true });
      }
      const pending = figures.pendingAppliedCents + figures.pendingUnappliedCents;
      if (pending > 0) {
        rows.push({ cells: ["Pending confirmation - recorded payments the office has not confirmed; they show here and count once confirmed", formatCents(pending)], muted: true });
      }
      return rows;
    };
    const summaryColumns: Column[] = [
      { label: "Summary", width: 392 },
      { label: "Amount", width: 120, align: "right" },
    ];

    const activityColumns: Column[] = [
      { label: "Date", width: 62 },
      { label: "Description", width: 258 },
      { label: "Charges", width: 64, align: "right" },
      { label: "Payments", width: 64, align: "right" },
      { label: "Balance", width: 64, align: "right" },
    ];
    const activityRows = (statement: LocationStatement): Row[] => {
      const rows: Row[] = [{ cells: [statement.periodFrom, "Opening balance", "", "", formatCents(statement.openingBalanceCents)], bold: true }];
      for (const line of statement.lines) {
        const payments = line.creditCents ? formatCents(line.creditCents) : line.pendingCents ? `${formatCents(line.pendingCents)} pending` : "";
        rows.push({
          cells: [line.date, line.description, line.chargeCents ? formatCents(line.chargeCents) : "", payments, line.chargeCents || line.creditCents ? formatCents(line.balanceCents) : ""],
          mutedCells: line.pendingCents ? [3] : line.chargeCents || line.creditCents ? [] : [1],
        });
      }
      rows.push({ cells: [statement.periodTo, "Closing balance", formatCents(statement.chargesCents), formatCents(statement.creditsCents), formatCents(statement.closingBalanceCents)], bold: true, ruleAbove: true });
      return rows;
    };

    const agingStrip = (aging: AgingFigures, asOf: string, openInvoices: AgedInvoice[] | null) => {
      sectionHeading(`Open balance by ${AGING_BASIS_LABEL}, as of ${asOf}`);
      ensureRoom(48);
      const boxWidth = WIDTH / AGING_BUCKETS.length;
      AGING_BUCKETS.forEach((bucket, index) => {
        const x = LEFT + boxWidth * index;
        doc.roundedRect(x + 2, y, boxWidth - 4, 40, 4).strokeColor(RULE).stroke();
        doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(`${AGING_BUCKET_LABELS[bucket]} - ${AGING_BUCKET_RANGES[bucket]}`, x + 8, y + 6, { width: boxWidth - 16, lineBreak: false });
        doc.font("Helvetica-Bold").fontSize(11).fillColor(aging.buckets[bucket] > 0 ? TEXT : MUTED).text(formatCents(aging.buckets[bucket]), x + 8, y + 20, { width: boxWidth - 16, lineBreak: false });
      });
      y += 48;
      body();
      paragraph(
        `Open balance ${formatCents(aging.openBalanceCents)} across ${aging.invoiceCount} invoice${aging.invoiceCount === 1 ? "" : "s"}; ${formatCents(aging.onAccountCents)} on account; ${formatCents(aging.pendingAppliedCents + aging.pendingUnappliedCents)} pending confirmation. Days are counted from the invoice date, not the due date.`,
        { size: 8, color: MUTED },
      );
      gap(6);
      if (openInvoices && openInvoices.length > 0) {
        drawTable(
          [
            { label: "Invoice", width: 110 },
            { label: "Issued", width: 90 },
            { label: "Total", width: 88, align: "right" },
            { label: "Balance", width: 88, align: "right" },
            { label: "Days", width: 56, align: "right" },
            { label: "Bucket", width: 80 },
          ],
          openInvoices.map((invoice) => ({
            cells: [
              invoice.invoiceNumber,
              invoice.issuedAt.slice(0, 10),
              formatCents(invoice.totalAmountCents),
              `${formatCents(invoice.balanceDueCents)}${invoice.pendingAppliedCents ? ` (${formatCents(invoice.pendingAppliedCents)} pending)` : ""}`,
              String(invoice.daysSinceInvoiced),
              AGING_BUCKET_LABELS[invoice.bucket],
            ],
          })),
        );
      }
    };

    const footerNote = () => {
      gap(6);
      paragraph(
        "The balance is what is owed on issued invoices. A payment reduces it when the office applies the payment to an invoice and confirms it; money received and not yet applied is on account, shown beside the balance and never subtracted from it. Pending payments show; confirmed payments count. Voided invoices and payments recorded in error are not listed.",
        { size: 8, color: MUTED },
      );
    };

    if (context.variant === "LOCATION") {
      const statement = context.statement;
      drawTable(summaryColumns, summaryRows(statement, statement.periodFrom));
      sectionHeading("Activity");
      if (statement.lines.length === 0) {
        paragraph("No activity in this period.", { color: MUTED });
        gap(8);
      }
      drawTable(activityColumns, activityRows(statement));
      agingStrip(statement.aging, statement.periodTo, statement.openInvoices);
      footerNote();
    } else if (context.variant === "ACCOUNT") {
      const statement = context.statement;
      drawTable(summaryColumns, summaryRows(statement, statement.periodFrom));
      const sectionLabel = (section: AccountStatementSection) => (section.locationId ? section.locationName || "Location" : "Invoices with no location");
      sectionHeading("By location");
      drawTable(
        [
          { label: "Location", width: 172 },
          { label: "Opening", width: 68, align: "right" },
          { label: "Charges", width: 68, align: "right" },
          { label: "Payments", width: 68, align: "right" },
          { label: "Closing", width: 68, align: "right" },
          { label: "On account", width: 68, align: "right" },
        ],
        [
          ...statement.sections.map((section) => ({
            cells: [
              `${sectionLabel(section)}${section.isPrimary ? " (primary)" : ""}`,
              formatCents(section.openingBalanceCents),
              formatCents(section.chargesCents),
              formatCents(section.creditsCents),
              formatCents(section.closingBalanceCents),
              formatCents(section.onAccountCents),
            ],
          })),
          {
            cells: ["All locations", formatCents(statement.openingBalanceCents), formatCents(statement.chargesCents), formatCents(statement.creditsCents), formatCents(statement.closingBalanceCents), formatCents(statement.onAccountCents)],
            bold: true,
            ruleAbove: true,
          },
        ],
      );
      agingStrip(statement.aging, statement.periodTo, null);
      drawTable(
        [
          { label: "Location", width: 172 },
          { label: AGING_BUCKET_LABELS.CURRENT, width: 68, align: "right" },
          { label: AGING_BUCKET_LABELS.DAYS_31_60, width: 68, align: "right" },
          { label: AGING_BUCKET_LABELS.DAYS_61_90, width: 68, align: "right" },
          { label: AGING_BUCKET_LABELS.OVER_90, width: 68, align: "right" },
          { label: "Open", width: 68, align: "right" },
        ],
        [
          ...statement.sections.map((section) => ({
            cells: [sectionLabel(section), ...AGING_BUCKETS.map((bucket) => formatCents(section.aging.buckets[bucket])), formatCents(section.aging.openBalanceCents)],
          })),
          { cells: ["All locations", ...AGING_BUCKETS.map((bucket) => formatCents(statement.aging.buckets[bucket])), formatCents(statement.aging.openBalanceCents)], bold: true, ruleAbove: true },
        ],
      );
      for (const section of statement.sections) {
        ensureRoom(80);
        sectionHeading(`${sectionLabel(section)}${section.isPrimary ? " (primary)" : ""}`);
        if (section.locationAddress) paragraph(section.locationAddress, { size: 9, color: MUTED });
        gap(4);
        if (section.lines.length === 0) {
          paragraph(`No activity in this period. Opening balance ${formatCents(section.openingBalanceCents)}, closing balance ${formatCents(section.closingBalanceCents)}.`, { color: MUTED });
          gap(8);
        } else {
          drawTable(activityColumns, activityRows(section));
        }
        if (section.openInvoices.length > 0) {
          paragraph(
            `Open as of ${section.periodTo}: ${section.openInvoices.map((invoice) => `${invoice.invoiceNumber} ${formatCents(invoice.balanceDueCents)} (${invoice.daysSinceInvoiced} days)`).join(", ")}.`,
            { size: 8, color: MUTED },
          );
          gap(6);
        }
      }
      footerNote();
    } else {
      const letter = context.letter;
      const locationLine = partyLines(context.location).join(", ");
      paragraph("To whom it may concern,", { size: 11 });
      gap(10);
      paragraph(
        `This letter confirms that, as of ${letter.asOf}, the account of ${context.customerName} for the service location at ${locationLine} carries no outstanding balance with ${context.branding.orgName}. ${
          letter.invoiceCount === 0
            ? "No invoices have been issued for this location."
            : `All ${letter.invoiceCount} invoice${letter.invoiceCount === 1 ? "" : "s"} issued for this location ${letter.invoiceCount === 1 ? "has" : "have"} been paid in full${letter.lastInvoice ? `; the most recent, ${letter.lastInvoice.invoiceNumber} for ${formatCents(letter.lastInvoice.totalAmountCents)}, was issued on ${letter.lastInvoice.issuedOn}` : ""}.`
        }`,
        { size: 11 },
      );
      gap(8);
      if (letter.onAccountCents > 0) {
        paragraph(`A credit of ${formatCents(letter.onAccountCents)} remains on account at this location, available against future invoices or for refund.`, { size: 11 });
        gap(8);
      }
      if (letter.pendingUnappliedCents > 0) {
        paragraph(`A payment of ${formatCents(letter.pendingUnappliedCents)} has been recorded and is awaiting confirmation; it does not affect the balance stated above.`, { size: 11 });
        gap(8);
      }
      sectionHeading("Service agreements at this location");
      if (letter.agreements.length === 0) {
        paragraph("No service agreements are on record for this location.", { color: MUTED });
        gap(8);
      } else {
        drawTable(
          [
            { label: "Agreement", width: 160 },
            { label: "Service", width: 110 },
            { label: "Status", width: 62 },
            { label: "Start", width: 60 },
            { label: "Next service", width: 60 },
            { label: "Ended", width: 60 },
          ],
          letter.agreements.map((agreement) => ({
            cells: [
              agreement.agreementName,
              agreement.serviceTypeName ?? "-",
              describeAgreementStatus(agreement.status),
              agreement.startDate,
              agreement.status === "ACTIVE" ? agreement.nextServiceDate ?? "-" : "-",
              agreement.cancellationEffectiveDate ?? (agreement.cancelledAt ? agreement.cancelledAt.slice(0, 10) : agreement.status === "ACTIVE" ? "-" : agreement.renewalDate ?? "-"),
            ],
          })),
        );
        paragraph(
          "An active agreement continues at the location; on a change of ownership the new owner may assume, transfer or cancel it under its terms. A cancelled agreement is shown with the date it ended.",
          { size: 8, color: MUTED },
        );
      }
      gap(14);
      paragraph(`Balance due: ${formatCents(letter.openBalanceCents)}`, { size: 12, bold: true });
      gap(14);
      paragraph(`Prepared by ${context.branding.orgName}${remitLines.length > 1 ? `, ${remitLines.slice(1).join(", ")}` : ""}, on ${context.statementDate}.`, { size: 9, color: MUTED });
    }

    doc.end();
  });
}
