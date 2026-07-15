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
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS users_email_uidx ON users (lower(email))`);

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
}
