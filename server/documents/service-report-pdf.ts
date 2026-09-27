import PDFDocument from "pdfkit";
import type { ServiceReportDocumentContext, ServiceReportMaterialLine } from "./types";

// The service report (PLAN_ROADMAP_V2.md C3.5, Pass 22; B11; canon §12): the
// customer-facing summary of one Service Record - who came and under which
// license, when, what was serviced and for which pests, which products went
// where, what the technician found and recommends, and a signature line that
// says whether a signature was captured on the ticket.
//
// Deterministic, the invoice and statement renderers' rule: the same context
// always produces the exact same bytes, so PDFKit's CreationDate / ModDate
// are pinned to the service date and nothing here reads a clock. Pure
// layout: every line comes from the context storage assembled.
//
// Two entry points. renderServiceReportPdf() is the stored document and the
// preview - a document of its own. drawServiceReport() draws the same report
// into a document the caller owns, from the top of its current page: the
// invoice renderer appends a report per ticket this way when the office
// turns "Attach service report to visit invoices" on (B11), so the visit's
// invoice and its reports are one PDF without a second PDF library (pdfkit
// cannot embed another PDF's pages; drawing them is the dependency-free way).
// The layout helpers below are local, as they are in statement-pdf.ts: no
// shared layout module exists yet.

const LEFT = 50;
const WIDTH = 512;
const TEXT = "#111827";
const MUTED = "#6b7280";
const RULE = "#d1d5db";

export const SERVICE_REPORT_TITLE = "Service Report";

type Doc = InstanceType<typeof PDFDocument>;

interface Column {
  label: string;
  width: number;
  align?: "left" | "right";
}

interface Row {
  cells: string[];
  bold?: boolean;
  muted?: boolean;
  /** Cells (by index) printed muted while the rest of the row is not - a label column. */
  mutedCells?: number[];
}

function amountCell(line: ServiceReportMaterialLine): string {
  return [line.amountApplied, line.unit].map((part) => (part ?? "").trim()).filter(Boolean).join(" ") || "-";
}

function dilutionCell(line: ServiceReportMaterialLine): string {
  const label = (line.dilutionLabel ?? "").trim();
  const rate = (line.dilutionRate ?? "").trim();
  if (label && rate && label !== rate) return `${label} (${rate})`;
  return label || rate || "-";
}

function methodCell(line: ServiceReportMaterialLine): string {
  return [line.applicationMethod, line.device].map((part) => (part ?? "").trim()).filter(Boolean).join("\n") || "-";
}

function listCell(values: readonly string[]): string {
  return values.length ? values.join(", ") : "-";
}

export function drawServiceReport(doc: Doc, context: ServiceReportDocumentContext): void {
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
    ensureRoom(Math.min(height, bottom - 50));
    doc.text(text, LEFT, y, { width });
    // doc.y is where the text ended - on a later page when a paragraph
    // longer than a page made PDFKit paginate on its own.
    y = doc.y;
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
  // heading row (when there is one) is redrawn on every new page.
  const drawTable = (columns: Column[], rows: Row[], options: { heading?: boolean } = {}) => {
    const withHeading = options.heading !== false;
    const cellX: number[] = [];
    let x = LEFT;
    for (const column of columns) {
      cellX.push(x);
      x += column.width;
    }
    const drawHeading = () => {
      if (!withHeading) return;
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

  // ---- Header: the org and its letterhead lines, the title and the dates on the right.
  doc.font("Helvetica-Bold").fontSize(20).fillColor(accent).text(context.branding.orgName, LEFT, y, { width: 300 });
  let leftY = doc.y + 2;
  const letterhead = [context.branding.remitToAddress, context.branding.remitToEmail, context.branding.remitToPhone].filter((line): line is string => !!line);
  if (letterhead.length) {
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(letterhead.join("\n"), LEFT, leftY, { width: 300 });
    leftY = doc.y;
  }
  body();
  const metaX = LEFT + 300;
  const metaWidth = WIDTH - 300;
  doc.font("Helvetica-Bold").fontSize(12).fillColor(TEXT).text(SERVICE_REPORT_TITLE, metaX, y, { width: metaWidth, align: "right" });
  let metaY = y + 16;
  doc.font("Helvetica").fontSize(10);
  const metaLine = (text: string, color = TEXT) => {
    doc.fillColor(color).text(text, metaX, metaY, { width: metaWidth, align: "right" });
    metaY += 13;
  };
  metaLine(`Service date: ${context.serviceDate}`);
  if (context.serviceTypeName) metaLine(`Service: ${context.serviceTypeName}`);
  // The preview of an unposted ticket says so, as a draft invoice prints
  // "Status: DRAFT": nobody should mistake it for the record.
  if (context.preview) metaLine("PREVIEW - not yet posted", MUTED);
  y = Math.max(leftY, metaY) + 10;
  rule();
  y += 14;
  body();

  // ---- Parties: the customer, the service location, the technician of record.
  const partiesTop = y;
  let partiesBottom = y;
  const partyBlock = (heading: string, lines: string[], x: number, width: number) => {
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(heading.toUpperCase(), x, partiesTop, { width });
    doc.font("Helvetica").fontSize(10).fillColor(TEXT).text(lines.join("\n") || "-", x, partiesTop + 12, { width });
    partiesBottom = Math.max(partiesBottom, doc.y);
  };
  const columnWidth = 165;
  partyBlock("Customer", [context.customerName], LEFT, columnWidth);
  partyBlock(
    "Service location",
    context.serviceLocation ? [context.serviceLocation.name, context.serviceLocation.address].filter((line): line is string => !!line) : ["Location not on record"],
    LEFT + columnWidth + 8,
    columnWidth,
  );
  // Canon §12: the name and license number are the snapshot copied onto the
  // ticket at post, never a live join to today's technician profile.
  partyBlock(
    "Technician",
    [context.technicianName ?? "Not recorded", context.technicianLicenseNumber ? `License # ${context.technicianLicenseNumber}` : "License not on record"],
    LEFT + (columnWidth + 8) * 2,
    columnWidth,
  );
  y = partiesBottom + 16;
  body();

  // ---- The service: type, the ticket's target pests (the stored union of
  // the ticket's picks and every material's), the areas serviced, follow-up.
  sectionHeading("Service");
  const detailColumns: Column[] = [
    { label: "Item", width: 130 },
    { label: "Detail", width: 382 },
  ];
  const detailRows: Row[] = [
    { cells: ["Service type", context.serviceTypeName ?? "-"], mutedCells: [0] },
    { cells: ["Target pests", context.targetPests.length ? context.targetPests.join(", ") : "None recorded"], mutedCells: [0] },
  ];
  if (context.areasServiced) detailRows.push({ cells: ["Areas serviced", context.areasServiced], mutedCells: [0] });
  detailRows.push({
    cells: ["Follow-up", context.followUpRequired ? `Required${context.followUpNotes ? ` - ${context.followUpNotes}` : ""}` : "None required"],
    mutedCells: [0],
  });
  drawTable(detailColumns, detailRows, { heading: false });

  // ---- Materials: one row per product application, as the ticket records it.
  sectionHeading("Materials applied");
  if (context.materials.length === 0) {
    paragraph("No materials were applied on this visit.", { color: MUTED });
    gap(8);
  } else {
    drawTable(
      [
        { label: "Product", width: 118 },
        { label: "EPA #", width: 66 },
        { label: "Amount", width: 58 },
        { label: "Dilution", width: 62 },
        { label: "Method", width: 62 },
        { label: "Areas", width: 73 },
        { label: "Pests", width: 73 },
      ],
      context.materials.map((line) => ({
        cells: [
          line.productName || "-",
          (line.epaRegNumber ?? "").trim() || "-",
          amountCell(line),
          dilutionCell(line),
          methodCell(line),
          listCell(line.applicationAreas),
          listCell(line.targetPests),
        ],
      })),
    );
  }

  // ---- The technician's write-up, each part only when it was written.
  const writeUp: Array<[string, string | null]> = [
    ["Notes", context.notes],
    ["Conditions found", context.conditionsFound],
    ["Recommendations", context.recommendations],
  ];
  for (const [heading, text] of writeUp) {
    if (!text) continue;
    sectionHeading(heading);
    paragraph(text);
    gap(4);
  }

  // ---- Signature: a place to sign, and the truth about the ticket.
  sectionHeading("Customer signature");
  ensureRoom(60);
  const lineY = y + 26;
  doc.moveTo(LEFT, lineY).lineTo(LEFT + 300, lineY).strokeColor(RULE).stroke();
  doc.moveTo(LEFT + 332, lineY).lineTo(LEFT + WIDTH, lineY).strokeColor(RULE).stroke();
  doc.font("Helvetica").fontSize(8).fillColor(MUTED);
  doc.text("Customer signature", LEFT, lineY + 4, { width: 300, lineBreak: false });
  doc.text("Date", LEFT + 332, lineY + 4, { width: WIDTH - 332, lineBreak: false });
  y = lineY + 18;
  body();
  paragraph(
    context.customerSignature ? "A customer signature was captured on the service ticket." : "No customer signature was captured on the service ticket.",
    { size: 8, color: MUTED },
  );

  // ---- Footer note.
  gap(10);
  const contact = [context.branding.remitToEmail, context.branding.remitToPhone].filter((line): line is string => !!line).join(" / ");
  paragraph(
    `Prepared by ${context.branding.orgName} from the service ticket${context.preview ? " as drafted by the technician; the posted ticket is the record" : " posted by the technician"}. Products are listed as applied on this visit with the EPA registration number of each.${contact ? ` Questions: ${contact}.` : ""}`,
    { size: 8, color: MUTED },
  );
}

export function renderServiceReportPdf(context: ServiceReportDocumentContext): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const fixedDate = new Date(`${context.serviceDate}T00:00:00.000Z`);
    const doc = new PDFDocument({
      size: "LETTER",
      margin: 50,
      info: {
        Title: `${SERVICE_REPORT_TITLE} - ${context.serviceDate}`,
        Author: context.branding.orgName,
        CreationDate: fixedDate,
        ModDate: fixedDate,
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawServiceReport(doc, context);
    doc.end();
  });
}
