import { sql } from "drizzle-orm";
import { db } from "./db";
import { isPermission, PERMISSIONS, setPermissionMatrix, type BuiltInRole, type Permission, type PermissionMatrixEntry } from "@shared/permissions";
import { ROLE_PROFILE_SEED } from "@shared/role-profiles";

// A permission added AFTER an org's profiles were seeded is granted here to
// the seeded built-in profiles that should hold it (the rule in the comment
// below): an INSERT per (built-in key, permission) guarded by the profile's
// key and is_built_in, ON CONFLICT DO NOTHING, printed once when it inserts.
// ROLE_PERMISSIONS seeds a NEW org only; the office's own profiles and a
// built-in the office edited are never touched beyond the one row added.
const SEEDED_PROFILE_GRANTS: ReadonlyArray<{ permission: Permission; keys: readonly BuiltInRole[]; addedIn: string }> = [
  // Pass 38 (C5.7): open another technician's day on the Tech View.
  { permission: PERMISSIONS.VIEW_OTHER_TECHNICIAN_WORK, keys: ["support", "manager", "admin"], addedIn: "Pass 38" },
  // Pass 40 (C6.1): add, default or remove a card on file.
  { permission: PERMISSIONS.MANAGE_PAYMENT_METHODS, keys: ["support", "manager", "admin"], addedIn: "Pass 40" },
];

// Pass 37 (PLAN_ROADMAP_V2.md C5.6; B16): the role-profile tables and the
// per-org seed of the four built-in profiles, on Pass 35's
// bootstrapAgreementVocabulary pattern (CREATE TABLE IF NOT EXISTS, the
// unique index, a per-org seed printed when inserted). Runs between the auth
// bootstrap and the agreement bootstrap (server/index.ts) so the permission
// registry is filled before any route is served.
//
// The seed inserts each built-in key with ON CONFLICT DO NOTHING: an
// existing org keeps whatever the office made of its profiles (renamed,
// edited, deactivated). The permissions of a seeded profile are written
// once, with the row; a LATER pass that adds a permission to
// shared/permissions.ts must also grant it to the seeded profiles that
// should hold it (an UPDATE guarded by key and is_built_in, printed), since
// nothing here re-syncs a profile with ROLE_PERMISSIONS - that record is the
// default for a NEW org, not the truth for an existing one.
//
// None of these writes goes through the storage writers, so none writes
// audit_logs (Pass 35's seed did not either); the printed report at the
// owner's restart is the record.
export async function bootstrapRoleProfiles(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS role_profiles (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id varchar NOT NULL,
      key text NOT NULL,
      name text NOT NULL,
      description text,
      is_built_in boolean NOT NULL DEFAULT false,
      is_active boolean NOT NULL DEFAULT true,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS role_profiles_org_key_uidx ON role_profiles (org_id, key)`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS role_profile_permissions (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id varchar NOT NULL,
      profile_id varchar NOT NULL REFERENCES role_profiles(id) ON DELETE CASCADE,
      permission text NOT NULL
    )
  `);
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS role_profile_permissions_profile_permission_uidx ON role_profile_permissions (profile_id, permission)`,
  );

  const orgRows = await db.execute(sql`SELECT id, name FROM organizations ORDER BY created_at, id`);
  const orgs = orgRows.rows as Array<{ id: string; name: string }>;
  let seededAny = false;
  for (const org of orgs) {
    const inserted: string[] = [];
    for (const seed of ROLE_PROFILE_SEED) {
      const result = await db.execute(sql`
        INSERT INTO role_profiles (org_id, key, name, description, is_built_in, is_active, sort_order)
        VALUES (${org.id}, ${seed.key}, ${seed.name}, ${seed.description}, true, true, ${seed.sortOrder})
        ON CONFLICT (org_id, key) DO NOTHING
        RETURNING id
      `);
      const row = result.rows[0] as { id: string } | undefined;
      if (!row) continue;
      for (const permission of seed.permissions) {
        await db.execute(sql`
          INSERT INTO role_profile_permissions (org_id, profile_id, permission)
          VALUES (${org.id}, ${row.id}, ${permission})
          ON CONFLICT (profile_id, permission) DO NOTHING
        `);
      }
      inserted.push(`${seed.key} "${seed.name}" (${seed.permissions.length} permissions)`);
    }
    if (inserted.length) {
      seededAny = true;
      console.log(
        `[role-profile-bootstrap] Pass 37: role_profiles seeded for org "${org.name}" (${org.id}) - ${inserted.length} row(s): ` +
          `${inserted.join(", ")}. Settings -> Roles edits, clones and adds profiles from here; Settings -> Users assigns them.`,
      );
    }
    // A user whose role names no profile of their org holds no permission at
    // all (can() finds no entry). Say so at boot rather than let a login
    // wonder why every button is disabled.
    const orphans = await db.execute(sql`
      SELECT u.email, u.role FROM users u
      WHERE u.org_id = ${org.id}
        AND NOT EXISTS (SELECT 1 FROM role_profiles p WHERE p.org_id = u.org_id AND p.key = u.role AND p.is_active)
      ORDER BY u.email
    `);
    for (const orphan of orphans.rows as Array<{ email: string; role: string }>) {
      console.warn(`[role-profile-bootstrap] user ${orphan.email} holds role "${orphan.role}", which is not an active role profile of org "${org.name}" - they have no permissions until Settings -> Users assigns one`);
    }
    // The later-added permissions, granted to the seeded built-ins once.
    for (const grant of SEEDED_PROFILE_GRANTS) {
      const granted: string[] = [];
      for (const key of grant.keys) {
        const result = await db.execute(sql`
          INSERT INTO role_profile_permissions (org_id, profile_id, permission)
          SELECT p.org_id, p.id, ${grant.permission} FROM role_profiles p
          WHERE p.org_id = ${org.id} AND p.key = ${key} AND p.is_built_in
          ON CONFLICT (profile_id, permission) DO NOTHING
        `);
        if (result.rowCount) granted.push(key);
      }
      if (granted.length) {
        seededAny = true;
        console.log(`[role-profile-bootstrap] ${grant.addedIn}: ${grant.permission} granted to the seeded built-in profile(s) ${granted.join(", ")} of org "${org.name}"`);
      }
    }
  }

  if (orgs.length > 1) {
    console.warn(
      `[role-profile-bootstrap] ${orgs.length} organizations exist; the permission registry is per process and is loaded from the first ("${orgs[0].name}"). Keying it by org is Phase 9's work.`,
    );
  }
  // Quiet on an established database (the second boot prints only the
  // serving line); the count is printed with a seed, and a registry with
  // nothing in it is always said - can() would read the built-in defaults.
  const loaded = await loadPermissionRegistry();
  if (seededAny) {
    console.log(`[role-profile-bootstrap] permission registry loaded: ${loaded} active profile(s)`);
  } else if (loaded === 0) {
    console.warn("[role-profile-bootstrap] no active role profile found - can() is reading the built-in defaults until Settings -> Roles has one");
  }
}

/** The org whose profiles fill the process registry: the first organization by creation (the only one today). */
async function registryOrgId(): Promise<string | null> {
  const result = await db.execute(sql`SELECT id FROM organizations ORDER BY created_at, id LIMIT 1`);
  return (result.rows[0] as { id: string } | undefined)?.id ?? null;
}

/**
 * Rebuild the process-level registry `can()` reads from the registry org's
 * ACTIVE profiles. Called at boot and by storage after every profile write
 * (create, update, clone) once its transaction has committed. A user on an
 * inactive profile holds nothing: deactivation is refused while users hold
 * the profile, so that state is reachable only by SQL. Returns how many
 * profiles the registry holds.
 */
export async function loadPermissionRegistry(): Promise<number> {
  const orgId = await registryOrgId();
  if (!orgId) {
    setPermissionMatrix(null);
    return 0;
  }
  const rows = await db.execute(sql`
    SELECT p.key, p.name, p.sort_order, pp.permission
    FROM role_profiles p
    LEFT JOIN role_profile_permissions pp ON pp.profile_id = p.id
    WHERE p.org_id = ${orgId} AND p.is_active
    ORDER BY p.sort_order, p.name, p.key
  `);
  const byKey = new Map<string, PermissionMatrixEntry>();
  for (const row of rows.rows as Array<{ key: string; name: string; sort_order: number; permission: string | null }>) {
    let entry = byKey.get(row.key);
    if (!entry) {
      entry = { key: row.key, name: row.name, sortOrder: Number(row.sort_order), permissions: [] };
      byKey.set(row.key, entry);
    }
    if (row.permission && isPermission(row.permission)) {
      entry.permissions.push(row.permission as Permission);
    }
  }
  const entries = Array.from(byKey.values());
  setPermissionMatrix(entries);
  return entries.length;
}
