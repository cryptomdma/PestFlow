// PLAN_ROADMAP_V2.md C4.5 (Pass 31): the dispatch board's settings - the
// view interval (the width of a board column), the snap interval (what a
// time typed on the appointment sheet rounds to) and the default visible
// hours (the board's window until the Window popover changes it for the
// session). Shared because both sides need the same vocabulary: Settings
// offers the choices, storage normalizes the rows, the routes validate a
// change, and the board builds its slots from the same numbers.
//
// Shape (decided in Pass 31): one app_settings row per value, the
// invoice_on_finalize / attach_service_report_to_invoices model, so each
// value normalizes on its own (an unrecognised view interval falls back
// without losing the snap) and `dispatch_snap_minutes` is the key the
// roadmap row names. No seed row: the reader returns the defaults - today's
// board - until the office changes something.
//
// The snap is a CLIENT rule (like lockTechnician): the server stores it and
// never rounds a time an API caller asked for. The board rounds every start
// it writes - a time typed on the sheet, and a slot's start, which is a no-op
// because the rules refuse a snap coarser than the view interval (a slot you
// can see must be a time you can place on).

export const DISPATCH_VIEW_INTERVALS = [30, 60, 120] as const;
export type DispatchViewInterval = (typeof DISPATCH_VIEW_INTERVALS)[number];

export const DISPATCH_SNAP_INTERVALS = [15, 30, 60] as const;
export type DispatchSnapInterval = (typeof DISPATCH_SNAP_INTERVALS)[number];

/** The board's edges: a visible start hour is at least 6 AM, a visible end hour at most 9 PM. */
export const DISPATCH_BOARD_FIRST_HOUR = 6;
export const DISPATCH_BOARD_LAST_HOUR = 21;

export interface DispatchBoardSettings {
  viewIntervalMinutes: DispatchViewInterval;
  snapMinutes: DispatchSnapInterval;
  defaultStartHour: number;
  defaultEndHour: number;
}

export type DispatchBoardSettingField = keyof DispatchBoardSettings;

export const DISPATCH_BOARD_SETTING_FIELDS: readonly DispatchBoardSettingField[] = [
  "viewIntervalMinutes",
  "snapMinutes",
  "defaultStartHour",
  "defaultEndHour",
];

/** Today's board: two-hour columns, placement on the hour, 8 AM to 6 PM. */
export const DEFAULT_DISPATCH_BOARD_SETTINGS: DispatchBoardSettings = {
  viewIntervalMinutes: 120,
  snapMinutes: 60,
  defaultStartHour: 8,
  defaultEndHour: 18,
};

/** The app_settings keys, one per value. */
export const DISPATCH_BOARD_SETTING_KEYS: Record<DispatchBoardSettingField, string> = {
  viewIntervalMinutes: "dispatch_view_interval_minutes",
  snapMinutes: "dispatch_snap_minutes",
  defaultStartHour: "dispatch_default_start_hour",
  defaultEndHour: "dispatch_default_end_hour",
};

/** Every app_settings key this module owns, for one read. */
export const DISPATCH_BOARD_SETTING_KEY_LIST: string[] = DISPATCH_BOARD_SETTING_FIELDS.map((field) => DISPATCH_BOARD_SETTING_KEYS[field]);

/** The PATCH's 400 code when the four values do not hold together. */
export const DISPATCH_BOARD_SETTINGS_INVALID = "DISPATCH_BOARD_SETTINGS_INVALID";

export function isDispatchViewInterval(value: unknown): value is DispatchViewInterval {
  return (DISPATCH_VIEW_INTERVALS as readonly number[]).includes(value as number);
}

export function isDispatchSnapInterval(value: unknown): value is DispatchSnapInterval {
  return (DISPATCH_SNAP_INTERVALS as readonly number[]).includes(value as number);
}

/** A whole hour the board may start at: 6 AM through 8 PM. */
export function isBoardStartHour(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= DISPATCH_BOARD_FIRST_HOUR && value < DISPATCH_BOARD_LAST_HOUR;
}

/** A whole hour the board may end at: 7 AM through 9 PM. */
export function isBoardEndHour(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > DISPATCH_BOARD_FIRST_HOUR && value <= DISPATCH_BOARD_LAST_HOUR;
}

/** The start hours a select offers. */
export function boardStartHourOptions(): number[] {
  const hours: number[] = [];
  for (let hour = DISPATCH_BOARD_FIRST_HOUR; hour < DISPATCH_BOARD_LAST_HOUR; hour++) hours.push(hour);
  return hours;
}

/** The end hours a select offers after a given start. */
export function boardEndHourOptions(startHour: number): number[] {
  const hours: number[] = [];
  for (let hour = Math.max(startHour + 1, DISPATCH_BOARD_FIRST_HOUR + 1); hour <= DISPATCH_BOARD_LAST_HOUR; hour++) hours.push(hour);
  return hours;
}

/**
 * The end hour to keep when the start moves: the current one if it is still
 * after the start, else the next whole hour (capped at the board's last).
 * Fixes the old popover's clamp to 21 on a select that stopped at 20.
 */
export function visibleEndHourFor(startHour: number, endHour: number): number {
  return endHour > startHour ? endHour : Math.min(startHour + 1, DISPATCH_BOARD_LAST_HOUR);
}

/** "8 AM", "8:30 AM" - the board's column header, the hour selects, the window summary. */
export function formatMinutesOfDay(minutes: number): string {
  const date = new Date(2000, 0, 1, 0, minutes, 0, 0);
  return date.toLocaleTimeString("en-US", minutes % 60 === 0 ? { hour: "numeric" } : { hour: "numeric", minute: "2-digit" });
}

export function formatHourOfDay(hour: number): string {
  return formatMinutesOfDay(hour * 60);
}

/** The four rules a change must satisfy; null when the settings hold together. */
export function describeDispatchBoardProblem(settings: DispatchBoardSettings): string | null {
  if (!isDispatchViewInterval(settings.viewIntervalMinutes)) {
    return `The view interval must be ${DISPATCH_VIEW_INTERVALS.join(", ")} minutes.`;
  }
  if (!isDispatchSnapInterval(settings.snapMinutes)) {
    return `The snap interval must be ${DISPATCH_SNAP_INTERVALS.join(", ")} minutes.`;
  }
  if (!isBoardStartHour(settings.defaultStartHour)) {
    return `The visible start hour must be a whole hour from ${formatHourOfDay(DISPATCH_BOARD_FIRST_HOUR)} to ${formatHourOfDay(DISPATCH_BOARD_LAST_HOUR - 1)}.`;
  }
  if (!isBoardEndHour(settings.defaultEndHour)) {
    return `The visible end hour must be a whole hour from ${formatHourOfDay(DISPATCH_BOARD_FIRST_HOUR + 1)} to ${formatHourOfDay(DISPATCH_BOARD_LAST_HOUR)}.`;
  }
  if (settings.defaultStartHour >= settings.defaultEndHour) {
    return "The visible end hour must be after the visible start hour.";
  }
  if (settings.snapMinutes > settings.viewIntervalMinutes) {
    return "The snap interval cannot be coarser than the view interval: a slot you can see must be a time you can place on.";
  }
  return null;
}

function toInteger(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === "number" ? String(value) : value.trim();
  if (!/^-?\d+$/.test(text)) return null;
  return Number(text);
}

/**
 * Stored text -> settings. Each value that is missing or unrecognised reads
 * as its default; a start / end pair out of order reads as the default pair;
 * a snap coarser than the view interval reads as the view interval (30 and
 * 60 are snaps, so the result is always on the list).
 */
export function normalizeDispatchBoardSettings(
  values: Partial<Record<DispatchBoardSettingField, string | number | null | undefined>>,
): DispatchBoardSettings {
  const view = toInteger(values.viewIntervalMinutes);
  const snap = toInteger(values.snapMinutes);
  const start = toInteger(values.defaultStartHour);
  const end = toInteger(values.defaultEndHour);
  const settings: DispatchBoardSettings = {
    viewIntervalMinutes: isDispatchViewInterval(view) ? view : DEFAULT_DISPATCH_BOARD_SETTINGS.viewIntervalMinutes,
    snapMinutes: isDispatchSnapInterval(snap) ? snap : DEFAULT_DISPATCH_BOARD_SETTINGS.snapMinutes,
    defaultStartHour: isBoardStartHour(start) ? start : DEFAULT_DISPATCH_BOARD_SETTINGS.defaultStartHour,
    defaultEndHour: isBoardEndHour(end) ? end : DEFAULT_DISPATCH_BOARD_SETTINGS.defaultEndHour,
  };
  if (settings.defaultStartHour >= settings.defaultEndHour) {
    settings.defaultStartHour = DEFAULT_DISPATCH_BOARD_SETTINGS.defaultStartHour;
    settings.defaultEndHour = DEFAULT_DISPATCH_BOARD_SETTINGS.defaultEndHour;
  }
  if (settings.snapMinutes > settings.viewIntervalMinutes) {
    settings.snapMinutes = settings.viewIntervalMinutes as DispatchSnapInterval;
  }
  return settings;
}

/** The value as app_settings stores it. */
export function serializeDispatchBoardSetting(value: number): string {
  return String(value);
}

/** The Settings select's label and the board's window summary ("30-min view"). */
export function describeViewInterval(minutes: DispatchViewInterval): { label: string; summary: string } {
  switch (minutes) {
    case 30:
      return { label: "30 minutes", summary: "30-min view" };
    case 60:
      return { label: "1 hour", summary: "1-hour view" };
    case 120:
      return { label: "2 hours", summary: "2-hour view" };
  }
}

export function describeSnapInterval(minutes: DispatchSnapInterval): string {
  switch (minutes) {
    case 15:
      return "15 minutes";
    case 30:
      return "30 minutes";
    case 60:
      return "1 hour";
  }
}

/** Minutes since local midnight. */
export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * The slot starts of a window, as minutes of day: the start hour, then one
 * view interval at a time while before the end hour. When the window is not
 * a multiple of the interval (8 AM - 5 PM in two-hour columns) the last slot
 * runs past the end hour (4 PM - 6 PM); windowEndMinutes() is where the
 * board really ends.
 */
export function slotStartsForWindow(startHour: number, endHour: number, viewIntervalMinutes: number): number[] {
  const starts: number[] = [];
  const interval = Math.max(viewIntervalMinutes, 1);
  for (let minutes = startHour * 60; minutes < endHour * 60; minutes += interval) starts.push(minutes);
  return starts;
}

/** Where the grid ends: the last slot's end (the start hour for an empty window). */
export function windowEndMinutes(slotStarts: number[], viewIntervalMinutes: number, startHour: number): number {
  return slotStarts.length ? slotStarts[slotStarts.length - 1] + viewIntervalMinutes : startHour * 60;
}

/**
 * The slot a time falls in: the last slot start not after it; null before
 * the first slot or at / after the window's end. The old board bucketed by
 * hour and clamped anything earlier into the first slot, which is how an
 * off-window appointment on a middle day of a 3-day view landed in a slot.
 */
export function slotStartFor(minutes: number, slotStarts: number[], viewIntervalMinutes: number): number | null {
  let selected: number | null = null;
  for (const slotStart of slotStarts) {
    if (slotStart <= minutes) selected = slotStart;
    else break;
  }
  if (selected === null) return null;
  return minutes < selected + viewIntervalMinutes ? selected : null;
}

/**
 * Round a local time to the nearest multiple of the snap within its day: a
 * half rounds up, a time already on the snap is unchanged, seconds and
 * milliseconds are dropped. 11:50 PM at a one-hour snap rolls to midnight of
 * the next day.
 */
export function snapDateToInterval(date: Date, snapMinutes: number): Date {
  const snap = Math.max(Math.trunc(snapMinutes), 1);
  const minutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60 + date.getMilliseconds() / 60000;
  const rounded = Math.round(minutes / snap) * snap;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, rounded, 0, 0);
}
