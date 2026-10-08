// PLAN_ROADMAP_V2.md C5.6 (Pass 37; B16): role profiles - the org's roles as
// permission sets, kept in Settings -> Roles. `role_profiles` (id, orgId, key,
// name, description, isBuiltIn, isActive, sortOrder) with one
// `role_profile_permissions` row per permission a profile holds. A user's
// `role` column holds the profile's KEY (the assignment; there is no
// users.role_profile_id - the key is the pointer, as agreements.agreementType
// holds an agreement type's key), and `can()` (shared/permissions.ts) reads
// the registry the server fills from these rows.
//
// The four built-in profiles are seeded per org under the keys the users
// rows already carried ("admin", "manager", "support", "technician" -
// lowercase, the one exception to the upper-snake keys the office's own
// profiles derive from their names) with the permissions of
// ROLE_PERMISSIONS; they can be renamed, edited, cloned and even made
// inactive (when no user holds them), never deleted (the route answers 405).
//
// The rules the writers enforce (server/storage.ts RoleProfileError):
//  - a user is assigned only an ACTIVE profile key of the org
//    (ROLE_PROFILE_UNKNOWN);
//  - a profile with users on it cannot be made inactive (ROLE_PROFILE_IN_USE,
//    Pass 35's in-use rule) - move them first;
//  - the acting user cannot remove Manage Settings from the profile THEIR OWN
//    role names, make that profile inactive, or move themselves to a profile
//    without Manage Settings (ROLE_PROFILE_SELF_LOCKOUT) - the C5.6 row's
//    "an admin cannot remove MANAGE_SETTINGS from their own profile";
//  - no write may leave the org with NO active profile holding Manage
//    Settings (ROLE_PROFILE_LAST_SETTINGS_MANAGER) - defense in depth: while
//    the actor must hold Manage Settings to write and the self-lockout
//    protects the actor's own profile, no API request can reach it today, but
//    a later user-deactivation route could.
// Every write is audited (`role_profile` created / update with the permission
// list in the snapshots; `user` update with the role before and after); none
// is revertable - a permission change is undone by hand on the card.
import {
  BUILT_IN_ROLE_PROFILES,
  PERMISSIONS,
  sortPermissions,
  type BuiltInRole,
  type Permission,
  type PermissionMatrixEntry,
} from "./permissions";

export const BUILT_IN_ROLE_PROFILE_KEYS: readonly BuiltInRole[] = BUILT_IN_ROLE_PROFILES.map((profile) => profile.key);

/** The per-org seed: key, name, description, sort order and the permissions from ROLE_PERMISSIONS. */
export const ROLE_PROFILE_SEED = BUILT_IN_ROLE_PROFILES;

export const ROLE_PROFILE_KEY_MAX_LENGTH = 64;
export const ROLE_PROFILE_NAME_MAX_LENGTH = 80;
export const ROLE_PROFILE_DESCRIPTION_MAX_LENGTH = 500;

/** Upper snake case: letters and digits, underscores between words, never empty. */
const ROLE_PROFILE_KEY_PATTERN = /^[A-Z0-9][A-Z0-9_]*$/;

/**
 * The key a name derives, the agreement-type derivation: "Office lead" ->
 * OFFICE_LEAD, "Field (senior)" -> FIELD_SENIOR, "Évaluation" -> EVALUATION.
 * Letters outside A-Z fold to their base letter where one exists and are
 * dropped otherwise, so a name with no letters or digits derives "" (refused
 * by the writer). A derived key is fixed once the profile is created.
 */
export function deriveRoleProfileKey(name: string): string {
  const key = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, ROLE_PROFILE_KEY_MAX_LENGTH);
  return key.replace(/_+$/g, "");
}

export function isBuiltInRoleProfileKey(key: string): key is BuiltInRole {
  return (BUILT_IN_ROLE_PROFILE_KEYS as readonly string[]).includes(key);
}

/** A built-in key, or upper snake case at most 64 characters. */
export function isValidRoleProfileKey(key: string): boolean {
  if (isBuiltInRoleProfileKey(key)) return true;
  return key.length > 0 && key.length <= ROLE_PROFILE_KEY_MAX_LENGTH && ROLE_PROFILE_KEY_PATTERN.test(key);
}

/** The codes a role-profile or user-role write answers when the rules refuse it (server/storage.ts RoleProfileError). */
export const ROLE_PROFILE_ERROR_CODES = {
  /** 404: no profile with that id in the org. */
  NOT_FOUND: "ROLE_PROFILE_NOT_FOUND",
  /** 400: a blank name. */
  NAME_REQUIRED: "ROLE_PROFILE_NAME_REQUIRED",
  /** 400: the name derives no key. */
  KEY_INVALID: "ROLE_PROFILE_KEY_INVALID",
  /** 400: another profile of the org already has that key (case-insensitive). */
  KEY_TAKEN: "ROLE_PROFILE_KEY_TAKEN",
  /** 400: a permission value that is not on the list. */
  PERMISSION_UNKNOWN: "ROLE_PROFILE_PERMISSION_UNKNOWN",
  /** 409: a profile with users on it cannot be made inactive - move them first. */
  IN_USE: "ROLE_PROFILE_IN_USE",
  /** 409: the acting user would lose Manage Settings - their own profile stripped of it or made inactive, or themselves moved off it. */
  SELF_LOCKOUT: "ROLE_PROFILE_SELF_LOCKOUT",
  /** 409: the write would leave the org with no active profile holding Manage Settings. */
  LAST_SETTINGS_MANAGER: "ROLE_PROFILE_LAST_SETTINGS_MANAGER",
  /** 400: a user assigned a key that is not one of the org's ACTIVE profiles. */
  UNKNOWN: "ROLE_PROFILE_UNKNOWN",
  /** 404: no user with that id in the org. */
  USER_NOT_FOUND: "USER_NOT_FOUND",
} as const;
export type RoleProfileErrorCode = (typeof ROLE_PROFILE_ERROR_CODES)[keyof typeof ROLE_PROFILE_ERROR_CODES];

/** A row of GET /api/role-profiles: the profile, its permissions (declaration order) and how many users hold it. */
export interface RoleProfileSummary {
  id: string;
  orgId: string;
  key: string;
  name: string;
  description: string | null;
  isBuiltIn: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string | Date;
  updatedAt: string | Date;
  permissions: Permission[];
  userCount: number;
}

/** The registry entry a profile row makes (the server fills `can()` from these; GET /api/auth/me carries them). */
export function toPermissionMatrixEntry(profile: Pick<RoleProfileSummary, "key" | "name" | "sortOrder" | "permissions">): PermissionMatrixEntry {
  return { key: profile.key, name: profile.name, sortOrder: profile.sortOrder, permissions: sortPermissions(profile.permissions) };
}

/** Whether a permission list holds Manage Settings - the lockout rules' question. */
export function holdsManageSettings(permissions: ReadonlyArray<string>): boolean {
  return permissions.includes(PERMISSIONS.MANAGE_SETTINGS);
}

/** "3 users" / "1 user" / "no users" - the card's usage column and the in-use refusal. */
export function describeRoleProfileUsage(userCount: number): string {
  if (!userCount) return "no users";
  return `${userCount} user${userCount === 1 ? "" : "s"}`;
}

/** The clone form's default name: "Support (copy)". */
export function cloneRoleProfileName(name: string): string {
  return `${name} (copy)`.slice(0, ROLE_PROFILE_NAME_MAX_LENGTH);
}
