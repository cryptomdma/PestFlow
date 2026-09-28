// Pass 26 (PLAN_ROADMAP_V2.md C4.1b): zones - named zip-code lists the
// office keeps in Settings -> Zones. Opportunity assignment rules are their
// first reader (a rule may say "in zone North -> this user"); dispatch and
// Smart Schedule (Phase 9 names "the zones from C4.1b" as its one existing
// prerequisite) read the same table later, which is why the zip
// normalization and the match predicate live here rather than inside
// shared/opportunity-assignment.ts.
//
// A zone's list holds unique five-digit ZIPs and nothing else. Input is
// normalized, never guessed: a ZIP+4 ("76053-1234") is its first five digits,
// anything that is not a ZIP or a ZIP+4 is reported back and refused. A
// location matches a zone when the first five characters of its zip are in
// the list - so a location stored with a ZIP+4 matches the zone that names
// its five-digit ZIP.

export const ZIP_CODE_PATTERN = /^\d{5}(?:-\d{4})?$/;
export const MAX_ZONE_NAME_LENGTH = 80;

export interface ZoneLike {
  id: string;
  name: string;
  zipCodes: string[] | null;
  isActive: boolean;
}

/** The five-digit ZIP a value stands for: a ZIP+4 is its first five digits; anything else is null. */
export function normalizeZipCode(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  if (!ZIP_CODE_PATTERN.test(trimmed)) return null;
  return trimmed.slice(0, 5);
}

/** Free text from the zone form: one ZIP per line, or comma / semicolon / space separated. */
export function splitZipCodeText(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export interface NormalizedZipCodes {
  /** Unique five-digit ZIPs, sorted. */
  zipCodes: string[];
  /** Every entry that is not a ZIP or a ZIP+4, as typed - reported, never dropped silently. */
  invalid: string[];
}

export function normalizeZipCodes(values: readonly unknown[]): NormalizedZipCodes {
  const seen = new Set<string>();
  const invalid: string[] = [];
  for (const raw of values) {
    const text = String(raw ?? "").trim();
    if (!text) continue;
    const zip = normalizeZipCode(text);
    if (!zip) {
      if (!invalid.includes(text)) invalid.push(text);
      continue;
    }
    seen.add(zip);
  }
  return { zipCodes: Array.from(seen).sort(), invalid };
}

/** A location's zip as the rules compare it: its five-digit ZIP, or null when the stored value is not one. */
export function locationZipKey(zip: string | null | undefined): string | null {
  return normalizeZipCode(zip);
}

/** True when the zone is active and its list names the location's five-digit ZIP. */
export function zoneCoversZip(zone: Pick<ZoneLike, "zipCodes" | "isActive">, zip: string | null | undefined): boolean {
  if (!zone.isActive) return false;
  const key = locationZipKey(zip);
  if (!key) return false;
  return (zone.zipCodes ?? []).includes(key);
}

/** "76053, 76102, 76969" or "76053, 76102, 76969 and 4 more" - the card's one-line summary. */
export function describeZipCodes(zipCodes: readonly string[] | null | undefined, max = 6): string {
  const list = zipCodes ?? [];
  if (!list.length) return "No ZIP codes";
  if (list.length <= max) return list.join(", ");
  return `${list.slice(0, max).join(", ")} and ${list.length - max} more`;
}
