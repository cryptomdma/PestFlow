import { sql } from "drizzle-orm";
import { db } from "./db";
import { hashPassword } from "./password";

const DEFAULT_ADMIN_EMAIL = "admin@heritage.local";
const DEFAULT_ADMIN_PASSWORD = "ChangeMe123!";

const DEMO_ROLE_USERS: Array<{ firstName: string; lastName: string; email: string; role: string }> = [
  { firstName: "Heritage", lastName: "Manager", email: "manager@heritage.local", role: "manager" },
  { firstName: "Heritage", lastName: "Support", email: "support@heritage.local", role: "support" },
  { firstName: "Heritage", lastName: "Tech", email: "tech@heritage.local", role: "technician" },
];

// Pass 38 (C5.7): the demo technician login is a field technician too, so
// the Tech View resolves to a real technician for tech@heritage.local and
// the smoke test has a technician user without minting one. Granted once
// (the UPDATE is guarded by a NULL technician status), with a placeholder
// license the office replaces in Settings -> Users.
const DEMO_TECHNICIAN_EMAIL = "tech@heritage.local";
const DEMO_TECHNICIAN_LICENSE = "DEMO-0001";

// Pass 38 (C5.7): the technician block on users (shared/technicians.ts) -
// phone (any user's), license_id, color, technician_notes and
// technician_status (ACTIVE | INACTIVE | TERMINATED; NULL = not a
// technician). This bootstrap owns the users table, so it owns the columns;
// server/technician-users-bootstrap.ts (next in server/index.ts) moves the
// old technicians rows onto them.
const TECHNICIAN_COLUMNS: ReadonlyArray<{ column: string; type: string }> = [
  { column: "phone", type: "text" },
  { column: "license_id", type: "text" },
  { column: "color", type: "text" },
  { column: "technician_notes", type: "text" },
  { column: "technician_status", type: "text" },
];

export async function bootstrapAuth(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      first_name text NOT NULL,
      last_name text NOT NULL,
      email text NOT NULL,
      password_hash text NOT NULL,
      role text NOT NULL DEFAULT 'admin',
      status text NOT NULL DEFAULT 'active',
      phone text,
      license_id text,
      color text,
      technician_notes text,
      technician_status text,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS users_email_uidx ON users (lower(email))`);
  const added: string[] = [];
  for (const { column, type } of TECHNICIAN_COLUMNS) {
    const present = await db.execute(sql`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = ${column}`);
    if (present.rows.length) continue;
    await db.execute(sql.raw(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${column} ${type}`));
    added.push(column);
  }
  if (added.length) {
    console.log(`[auth-bootstrap] Pass 38: users gained the technician block - ${added.join(", ")} (technician_status NULL = not a technician; the login flag users.status is separate)`);
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS session (
      sid varchar PRIMARY KEY,
      sess jsonb NOT NULL,
      expire timestamp NOT NULL
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS session_expire_idx ON session (expire)`);

  const existing = await db.execute(sql`SELECT id FROM users LIMIT 1`);
  if (existing.rows.length === 0) {
    const passwordHash = await hashPassword(DEFAULT_ADMIN_PASSWORD);
    await db.execute(sql`
      INSERT INTO users (first_name, last_name, email, password_hash, role, status)
      VALUES ('Heritage', 'Admin', ${DEFAULT_ADMIN_EMAIL}, ${passwordHash}, 'admin', 'active')
    `);
    console.log(`Seeded default admin user: ${DEFAULT_ADMIN_EMAIL} / ${DEFAULT_ADMIN_PASSWORD} (change this password)`);
  }

  // One demo login per non-admin role, for exercising the RBAC matrix.
  // Same shared password as the admin seed - local/test-data only.
  for (const demoUser of DEMO_ROLE_USERS) {
    const passwordHash = await hashPassword(DEFAULT_ADMIN_PASSWORD);
    await db.execute(sql`
      INSERT INTO users (first_name, last_name, email, password_hash, role, status)
      VALUES (${demoUser.firstName}, ${demoUser.lastName}, ${demoUser.email}, ${passwordHash}, ${demoUser.role}, 'active')
      ON CONFLICT ((lower(email))) DO NOTHING
    `);
  }

  const technicianGrant = await db.execute(sql`
    UPDATE users SET technician_status = 'ACTIVE', license_id = COALESCE(license_id, ${DEMO_TECHNICIAN_LICENSE}), updated_at = now()
    WHERE lower(email) = ${DEMO_TECHNICIAN_EMAIL} AND technician_status IS NULL
  `);
  if (technicianGrant.rowCount) {
    console.log(`[auth-bootstrap] Pass 38: ${DEMO_TECHNICIAN_EMAIL} is now an ACTIVE field technician (license ${DEMO_TECHNICIAN_LICENSE}, a placeholder) - the demo login for the Tech View`);
  }
}
