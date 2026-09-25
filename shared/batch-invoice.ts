// Batch invoicing (PLAN_ROADMAP_V2.md C2.3, Pass 13): the filters the
// Invoices screen's Batch Invoice dialog sends, the preview the server
// answers, and the grouping the dialog renders from it. Every figure in the
// preview is resolved SERVER-SIDE (getBatchInvoicePreviewForDateRange in
// server/storage.ts) through the same code generation uses; the client only
// groups and adds. A "route" is a technician on a day - appointments carry no
// route columns - so the preview groups by technician, then by service date.

import type { ServiceRecord } from "./schema";

/**
 * What the batch reads. `dateFrom` / `dateTo` (YYYY-MM-DD, inclusive) are a
 * POSTING window: the server keeps a ticket whose `postedAt`, falling back to
 * `serviceDate`, lands on a UTC calendar day inside it - which is why the
 * dialog says "posted between". `technicianId` narrows to one technician's
 * tickets (service_records.technicianId); absent, every technician's are in.
 * Preview and generate read the same object, so the two can never disagree
 * about which tickets are in the batch.
 */
export interface BatchInvoiceFilters {
  dateFrom: string;
  dateTo: string;
  technicianId?: string | null;
}

/**
 * A preview row: the eligible ticket plus what it will actually bill.
 * `billingLineType: null` means the ticket cannot be billed as things stand
 * and `billingNote` carries the reason - shown rather than hidden, since
 * generate would report the same reason as a skip.
 */
export interface BatchInvoicePreviewTicket extends ServiceRecord {
  billingLineType: "SERVICE" | "AGREEMENT_COVERED" | null;
  billableAmountCents: number | null;
  billingNote: string | null;
}

/**
 * A down payment the visit's invoice will carry beside its service lines
 * (Pass 11d's INITIAL_CHARGE line), resolved for the preview so the office
 * sees the deposit generate is about to bill instead of finding it on the
 * invoice afterwards. Keyed to the visit's anchor: `appointmentId`, or the
 * ticket itself for appointment-less work. Listed once per agreement across
 * the whole preview, on the first visit that would carry it - a second visit
 * of the same agreement in the batch finds the event live and bills nothing.
 */
export interface BatchInvoicePreviewCharge {
  appointmentId: string | null;
  serviceRecordId: string | null;
  agreementId: string;
  agreementName: string;
  description: string;
  amountCents: number;
  taxCents: number;
}

export interface BatchInvoicePreview {
  tickets: BatchInvoicePreviewTicket[];
  charges: BatchInvoicePreviewCharge[];
}

/** What POST /api/invoices/batch-generate answers (batchGenerateInvoicesForDateRange). */
export interface BatchGenerateResult {
  /** Tickets the run considered, counted from the visits it grouped (a visit reaching past the window is counted whole). */
  totalEligible: number;
  /** Visits - the most invoices the run could produce (D1: one visit, one invoice). */
  totalVisits: number;
  invoiced: Array<{ appointmentId: string | null; serviceRecordIds: string[]; invoiceId: string; invoiceNumber: string; totalAmountCents: number }>;
  skipped: Array<{ appointmentId: string | null; serviceRecordIds: string[]; reason: string }>;
  totalAmountCents: number;
}

/** The visit a ticket bills on: its appointment, or the ticket itself when it has none (D1's fallback anchor). */
export function batchVisitKey(ticket: Pick<ServiceRecord, "id" | "appointmentId">): string {
  return ticket.appointmentId ? `appointment:${ticket.appointmentId}` : `serviceRecord:${ticket.id}`;
}

function chargeVisitKey(charge: Pick<BatchInvoicePreviewCharge, "appointmentId" | "serviceRecordId">): string {
  return charge.appointmentId ? `appointment:${charge.appointmentId}` : `serviceRecord:${charge.serviceRecordId ?? ""}`;
}

/** The UTC calendar day of a timestamp, YYYY-MM-DD - the convention every date-only value in this repo uses. */
export function toUtcDay(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

export interface BatchPreviewVisit {
  key: string;
  appointmentId: string | null;
  customerId: string;
  locationId: string | null;
  /** The earliest UTC service day among this group's tickets on the visit. */
  serviceDate: string;
  tickets: BatchInvoicePreviewTicket[];
  /** The visit's down payment lines; attached to the first group the visit appears in, empty elsewhere. */
  charges: BatchInvoicePreviewCharge[];
  /** Billable service lines plus charges, before tax. */
  amountCents: number;
}

export interface BatchPreviewDay {
  serviceDate: string;
  visits: BatchPreviewVisit[];
  amountCents: number;
}

export interface BatchPreviewTechnicianGroup {
  technicianId: string | null;
  technicianLabel: string;
  days: BatchPreviewDay[];
  ticketCount: number;
  /** Distinct visits within this technician's tickets. */
  visitCount: number;
  amountCents: number;
}

export interface BatchPreviewSummary {
  groups: BatchPreviewTechnicianGroup[];
  ticketCount: number;
  /** Distinct visits across the whole preview - the most invoices generate can produce. */
  visitCount: number;
  chargeCount: number;
  /** Everything billable, before tax: every ticket's amount plus every charge, each counted once. */
  amountCents: number;
}

/**
 * Groups the preview by technician, then by service date, then by visit.
 * The technician is the ticket's (`technicianId`, with the name the ticket
 * snapshotted); tickets with none sit last under "Unassigned". A visit whose
 * tickets belong to two technicians appears under both, its tickets split
 * between them - the invoice is still one - and its charges are listed once,
 * with its first appearance. Groups are ordered by label, days ascending,
 * visits by customer id then key so the order is stable across refetches.
 */
export function groupBatchInvoicePreview(
  preview: BatchInvoicePreview,
  technicianLabel: (technicianId: string | null, snapshotName: string | null) => string,
): BatchPreviewSummary {
  const chargesByVisit = new Map<string, BatchInvoicePreviewCharge[]>();
  for (const charge of preview.charges) {
    const key = chargeVisitKey(charge);
    chargesByVisit.set(key, [...(chargesByVisit.get(key) ?? []), charge]);
  }

  type MutableVisit = Omit<BatchPreviewVisit, "charges" | "amountCents">;
  const byTechnician = new Map<string, { technicianId: string | null; technicianLabel: string; visits: Map<string, MutableVisit> }>();
  for (const ticket of preview.tickets) {
    const technicianId = ticket.technicianId ?? null;
    const technicianKey = technicianId ?? "";
    const group = byTechnician.get(technicianKey) ?? {
      technicianId,
      technicianLabel: technicianLabel(technicianId, ticket.technicianName ?? null),
      visits: new Map<string, MutableVisit>(),
    };
    byTechnician.set(technicianKey, group);
    const visitKey = batchVisitKey(ticket);
    const day = toUtcDay(ticket.serviceDate);
    const visit = group.visits.get(visitKey) ?? {
      key: visitKey,
      appointmentId: ticket.appointmentId ?? null,
      customerId: ticket.customerId,
      locationId: ticket.locationId ?? null,
      serviceDate: day,
      tickets: [],
    };
    visit.tickets.push(ticket);
    if (day < visit.serviceDate) visit.serviceDate = day;
    group.visits.set(visitKey, visit);
  }

  const groups = Array.from(byTechnician.values())
    .sort((a, b) => {
      if (a.technicianId === null) return 1;
      if (b.technicianId === null) return -1;
      return a.technicianLabel.localeCompare(b.technicianLabel) || a.technicianId.localeCompare(b.technicianId);
    })
    .map((group) => {
      const byDay = new Map<string, MutableVisit[]>();
      for (const visit of Array.from(group.visits.values())) {
        byDay.set(visit.serviceDate, [...(byDay.get(visit.serviceDate) ?? []), visit]);
      }
      const days = Array.from(byDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([serviceDate, visits]) => ({
          serviceDate,
          visits: visits.sort((a, b) => a.customerId.localeCompare(b.customerId) || a.key.localeCompare(b.key)),
        }));
      return { technicianId: group.technicianId, technicianLabel: group.technicianLabel, days };
    });

  // Charges ride the first appearance of their visit, in render order, so a
  // visit split between two technicians never shows its deposit twice.
  const chargesListed = new Set<string>();
  let ticketCount = 0;
  let chargeCount = 0;
  let amountCents = 0;
  const allVisitKeys = new Set<string>();
  const summaryGroups: BatchPreviewTechnicianGroup[] = groups.map((group) => {
    let groupTickets = 0;
    let groupAmount = 0;
    const days: BatchPreviewDay[] = group.days.map((day) => {
      let dayAmount = 0;
      const visits: BatchPreviewVisit[] = day.visits.map((visit) => {
        allVisitKeys.add(visit.key);
        const charges = chargesListed.has(visit.key) ? [] : chargesByVisit.get(visit.key) ?? [];
        chargesListed.add(visit.key);
        const ticketAmount = visit.tickets.reduce((sum, ticket) => sum + (ticket.billableAmountCents ?? 0), 0);
        const chargeAmount = charges.reduce((sum, charge) => sum + charge.amountCents, 0);
        groupTickets += visit.tickets.length;
        chargeCount += charges.length;
        dayAmount += ticketAmount + chargeAmount;
        return { ...visit, charges, amountCents: ticketAmount + chargeAmount };
      });
      groupAmount += dayAmount;
      return { serviceDate: day.serviceDate, visits, amountCents: dayAmount };
    });
    ticketCount += groupTickets;
    amountCents += groupAmount;
    return {
      technicianId: group.technicianId,
      technicianLabel: group.technicianLabel,
      days,
      ticketCount: groupTickets,
      visitCount: group.days.reduce((sum, day) => sum + day.visits.length, 0),
      amountCents: groupAmount,
    };
  });

  return { groups: summaryGroups, ticketCount, visitCount: allVisitKeys.size, chargeCount, amountCents };
}

/** The amount column of a preview ticket, as the office reads it. */
export function describeBatchTicketBilling(ticket: Pick<BatchInvoicePreviewTicket, "billingLineType" | "billableAmountCents" | "billingNote">): {
  kind: "AMOUNT" | "COVERED" | "CALLBACK" | "CANNOT_BILL";
  amountCents: number | null;
  note: string | null;
} {
  if (ticket.billingLineType === "AGREEMENT_COVERED") {
    return ticket.billingNote === "warranty callback - no charge"
      ? { kind: "CALLBACK", amountCents: 0, note: ticket.billingNote }
      : { kind: "COVERED", amountCents: 0, note: ticket.billingNote };
  }
  if (ticket.billableAmountCents != null) {
    return { kind: "AMOUNT", amountCents: ticket.billableAmountCents, note: ticket.billingNote };
  }
  return { kind: "CANNOT_BILL", amountCents: null, note: ticket.billingNote };
}
