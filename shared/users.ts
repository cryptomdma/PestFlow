// Small, pure helpers over the users table for screens that name a person:
// the sold-by selector and card line (Pass 12, agreements.soldByUserId) and
// the technician -> user bridge in Settings. A user is shown as "First Last"
// everywhere; the same order getAuditActor() stamps into actorLabel.
import type { UserSummary } from "./schema";
import { describeRoleName } from "./permissions";

export function userDisplayName(user: Pick<UserSummary, "firstName" | "lastName"> | null | undefined): string {
  if (!user) return "";
  return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
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
