// Small, pure helpers over the users table for screens that name a person:
// the sold-by selector and card line (Pass 12, agreements.soldByUserId), the
// Users card in Settings and - since Pass 38 (C5.7), when technicians became
// users - every technician name: a technician's displayName IS
// userDisplayName(user), "First Last", never stored (shared/technicians.ts).
// The same order getAuditActor() stamps into actorLabel.
import type { UserSummary } from "./schema";
import { describeRoleName } from "./permissions";

export function userDisplayName(user: Pick<UserSummary, "firstName" | "lastName"> | null | undefined): string {
  if (!user) return "";
  return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
}

/** The login flag's vocabulary (server/auth.ts lets only "active" sign in). The field flag is shared/technicians.ts TECHNICIAN_STATUSES. */
export const USER_STATUSES = ["active", "inactive"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export function isUserStatus(value: unknown): value is UserStatus {
  return typeof value === "string" && (USER_STATUSES as readonly string[]).includes(value);
}

/** Trimmed and lowercased - the DB's uniqueness is lower(email), and the login lowercases what is typed. */
export function normalizeUserEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** Something@something - the shape a login compares against; the DB and the owner decide the rest. */
export function isPlausibleUserEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+$/.test(email);
}

/**
 * Pass 38: "First" / "Last" from a one-line name ("Austin Lowe" -> Austin /
 * Lowe, "Cher" -> Cher / "", "Mary Ann Jones" -> Mary / Ann Jones) - the
 * migration's split of the old technicians.display_name, and the form's
 * fallback when a caller has one line.
 */
export function splitDisplayName(displayName: string): { firstName: string; lastName: string } {
  const trimmed = displayName.trim().replace(/\s+/g, " ");
  const at = trimmed.indexOf(" ");
  if (at < 0) return { firstName: trimmed, lastName: "" };
  return { firstName: trimmed.slice(0, at), lastName: trimmed.slice(at + 1) };
}

/** Alphabetical by last name, then first name - the order every user selector lists in. */
export function sortUsersByName<T extends Pick<UserSummary, "firstName" | "lastName">>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const byLast = (a.lastName ?? "").localeCompare(b.lastName ?? "");
    return byLast !== 0 ? byLast : (a.firstName ?? "").localeCompare(b.firstName ?? "");
  });
}

// Pass 37 (C5.6): a role is a role profile's KEY; its name is the profile's
// (shared/permissions.ts describeRoleName reads the registry - the org's
// profiles once /api/auth/me has answered, the built-in names before, the
// key itself for a profile no longer on the list).
export function describeUserRole(role: string): string {
  return describeRoleName(role);
}

/**
 * The users a selector offers: every active user, plus the one currently
 * selected even when inactive, so an agreement sold by someone who has since
 * left still names them instead of silently reading as "not recorded".
 */
export function selectableUsers<T extends Pick<UserSummary, "id" | "firstName" | "lastName" | "status">>(list: T[], currentId: string | null | undefined): T[] {
  return sortUsersByName(list.filter((user) => user.status === "active" || user.id === currentId));
}
