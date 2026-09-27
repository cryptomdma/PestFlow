// Pass 20 (PLAN_ROADMAP_V2.md C3.4a; CANONICAL_DOMAIN_RULES_V1.md §12
// "Materials support"): the two org-level vocabularies behind a material
// row - the unit a quantity is measured in and the application areas a
// product went on. Each is one app_settings row in the ticket-reopen shape
// (shared/ticket-reopen.ts): a JSON array of strings, read by anyone (GET),
// written under MANAGE_SETTINGS (PATCH), the defaults below until Settings
// saves its own. The unit list feeds the Unit dropdown on a material line
// and the product form's Default Unit; the area list feeds the product
// form's Allowed Areas and, for a product that lists none, the material
// line's Application Area multi-select (a product with allowed areas offers
// those). Pass 21 (C3.4b) added the third vocabulary: the org's target-pest
// list (the target_pests table, its active rows) behind each material row's
// targetPests[] and the ticket's own picks; the ticket-level set is their
// union, deriveTicketTargetPests() below.
//
// What a value outside a list does: it is KEPT, never refused, and the
// editors show it marked "not on the list". A material row is the
// compliance record of what the technician did; refusing it over vocabulary
// would block a post from the field (the technician cannot edit the list)
// or drop what was recorded, and rows written before the lists existed
// carry free text the migration could not map. A value that matches a list
// entry apart from casing or surrounding whitespace is written in the
// list's spelling ("Each" -> "each") - by the migration once, and by every
// post, office edit and product save from then on - so the vocabulary
// converges without a refusal.

export const MATERIAL_UNITS_SETTING_KEY = "material_units";
export const APPLICATION_AREAS_SETTING_KEY = "application_areas";

/** The unit list an org starts with, until Settings saves its own. */
export const DEFAULT_MATERIAL_UNITS: readonly string[] = ["oz", "fl oz", "gal", "lb", "g", "mL", "L", "each"];

/** The application-area list an org starts with, until Settings saves its own. */
export const DEFAULT_APPLICATION_AREAS: readonly string[] = [
  "Exterior",
  "Exterior Perimeter",
  "Interior",
  "Interior Baseboards",
  "Kitchen",
  "Bathrooms",
  "Garage",
  "Attic",
  "Crawl Space",
  "Yard",
];

function foldKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * A list as Settings may store it: trimmed, nameless entries dropped,
 * duplicates dropped case-insensitively (the first spelling wins - a list
 * holding both "each" and "Each" would make the spelling rule ambiguous).
 */
export function sanitizeMaterialList(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    const key = foldKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/**
 * The stored app_settings value as a list: a JSON array of strings, or
 * (defensively, as the other lists read) newline / comma separated text.
 * No row, or nothing usable in it, reads as the defaults.
 */
export function normalizeMaterialList(value: string | null | undefined, defaults: readonly string[]): string[] {
  if (!value) return defaults.slice();
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = value.split(/\r?\n|,/);
  }
  const list = Array.isArray(parsed) ? sanitizeMaterialList(parsed) : [];
  return list.length ? list : defaults.slice();
}

export function normalizeMaterialUnits(value: string | null | undefined): string[] {
  return normalizeMaterialList(value, DEFAULT_MATERIAL_UNITS);
}

export function normalizeApplicationAreas(value: string | null | undefined): string[] {
  return normalizeMaterialList(value, DEFAULT_APPLICATION_AREAS);
}

/**
 * The list's spelling of a value that matches an entry apart from casing or
 * surrounding / repeated whitespace; null when it matches none (or is empty).
 */
export function matchListEntry(list: readonly string[], value: string | null | undefined): string | null {
  const key = foldKey(value ?? "");
  if (!key) return null;
  for (const entry of list) {
    if (foldKey(entry) === key) return entry;
  }
  return null;
}

/** True when the value is on the list, casing and whitespace aside. */
export function isOnList(list: readonly string[], value: string | null | undefined): boolean {
  return matchListEntry(list, value) !== null;
}

/**
 * The value in the list's spelling when it matches an entry, else the value
 * trimmed - kept, off the list, never dropped; null for nothing.
 */
export function toListSpelling(list: readonly string[], value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return matchListEntry(list, trimmed) ?? trimmed;
}

/**
 * Several values in the list's spelling: each trimmed, empties dropped,
 * duplicates dropped case-insensitively, order kept.
 */
export function toListSpellings(list: readonly string[], values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = toListSpelling(list, raw);
    if (!value) continue;
    const key = foldKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/** The fields of a material row this module reads for its areas. */
export interface MaterialRowAreas {
  applicationAreas?: readonly string[] | null;
  /**
   * The single area a ticket draft saved locally before Pass 20 may still
   * name. The column of that name was dropped in Pass 21 (C3.4b) and the
   * server accepts no such field: this is read only when the ticket dialog
   * restores such a draft.
   */
  applicationLocation?: string | null;
}

/**
 * A row's areas as a list: applicationAreas when it names any, else the
 * pre-Pass-20 single applicationLocation as one entry (a local draft from
 * before the list existed), else nothing.
 */
export function applicationAreasOf(row: MaterialRowAreas): string[] {
  const areas = (row.applicationAreas ?? []).map((area) => (area ?? "").trim()).filter((area) => area.length > 0);
  if (areas.length) return areas;
  const location = (row.applicationLocation ?? "").trim();
  return location ? [location] : [];
}

/**
 * service_records.areasServiced, derived (canon §12): the union of every
 * row's areas in row order, joined ", "; null when no row names one.
 */
export function deriveAreasServiced(rows: readonly MaterialRowAreas[]): string | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    for (const area of applicationAreasOf(row)) {
      const key = foldKey(area);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(area);
    }
  }
  return out.length ? out.join(", ") : null;
}

/** One line for a summary or a card: the row's areas joined ", ", or null. */
export function formatApplicationAreas(row: MaterialRowAreas): string | null {
  const areas = applicationAreasOf(row);
  return areas.length ? areas.join(", ") : null;
}

/** The fields of a material row this module reads for its target pests (Pass 21, C3.4b). */
export interface MaterialRowPests {
  targetPests?: readonly string[] | null;
}

/** A row's target pests as a list: trimmed, empties dropped, order kept. */
export function targetPestsOf(row: MaterialRowPests): string[] {
  return (row.targetPests ?? []).map((pest) => (pest ?? "").trim()).filter((pest) => pest.length > 0);
}

/**
 * service_records.targetPests, derived (canon §12, C3.4b): the ticket's own
 * picks first, in the order picked, then every row's pests in row order -
 * each in the pest list's spelling where it matches an entry apart from
 * casing or whitespace and kept as written otherwise, duplicates dropped
 * case-insensitively. Storage stores this on every post and office edit; the
 * ticket dialog shows the same union as its summary line. A pick is never
 * dropped because a material stopped naming it: the picks are the "selected"
 * part, and only removing the pick removes it.
 */
export function deriveTicketTargetPests(
  list: readonly string[],
  selected: readonly (string | null | undefined)[] | null | undefined,
  rows: readonly MaterialRowPests[],
): string[] {
  const fromRows: string[] = [];
  for (const row of rows) {
    for (const pest of targetPestsOf(row)) fromRows.push(pest);
  }
  return toListSpellings(list, [...(selected ?? []), ...fromRows]);
}

/** One line for a summary or a card: the row's target pests joined ", ", or null. */
export function formatTargetPests(row: MaterialRowPests): string | null {
  const pests = targetPestsOf(row);
  return pests.length ? pests.join(", ") : null;
}
