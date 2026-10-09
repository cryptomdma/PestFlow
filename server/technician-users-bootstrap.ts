import { randomBytes } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { hashPassword } from "./password";
import { normalizeUserEmail, splitDisplayName } from "@shared/users";

// Pass 38 (PLAN_ROADMAP_V2.md C5.7; Part E answer 2; canon §16): technicians
// are users. One guarded migration, run once and quiet after, in ONE
// transaction (Postgres DDL is transactional, so a failure leaves the old
// table and its constraints exactly as they were):
//
//   1. every foreign key that references `technicians` is dropped by the
//      name pg_catalog gives it (db:push named three `*_technicians_id_fk`,
//      the Pass 30 bootstrap two `*_fkey`; both forms are found, never
//      guessed);
//   2. each technician row becomes a users row:
//        - an UNLINKED technician (user_id NULL - both rows on the dev DB)
//          is MINTED as a users row under the SAME id, so the five FK columns
//          and the bare production_value_entries.technician_id keep their
//          values and no row is rewritten: first / last name split from
//          display_name on the first space, the technician's email (or
//          <id>@technicians.local when it has none or the address is taken -
//          users.email is NOT NULL and lower()-unique), a random unusable
//          password hash, status 'inactive' (no login until a password flow
//          exists and the office turns it on), role 'technician', the
//          technician columns copied;
//        - a LINKED technician (user_id set - none on the dev DB, but the
//          owner may link one in Settings before this runs) is REMAPPED: the
//          five FK columns and the ledger column move technician.id ->
//          user_id, and the technician columns are copied onto that user;
//   3. the five foreign keys are re-created against users(id) under the
//      names db:push would give them, so a migrated database and a fresh one
//      agree; an id with no users row would fail the ADD CONSTRAINT and roll
//      everything back - the visible failure;
//   4. `technicians` is dropped (its indexes and its own users FK go with it).
//
// The users columns themselves (phone, license_id, color, technician_notes,
// technician_status) are the auth bootstrap's - it owns the users table and
// runs first. The 39 audit_logs rows whose JSON embeds a technicianId stay as
// written (display-only history, never revertable). Runs after bootstrapAuth
// and before bootstrapRoleProfiles (server/index.ts).

interface TechnicianRow {
  id: string;
  org_id: string | null;
  display_name: string;
  license_id: string | null;
  status: string | null;
  email: string | null;
  phone: string | null;
  color: string | null;
  notes: string | null;
  user_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

/** The columns that named a technician, each re-pointed at users(id) under the name db:push gives the constraint. */
const TECHNICIAN_FK_COLUMNS: ReadonlyArray<{ table: string; column: string; constraint: string }> = [
  { table: "services", column: "assigned_technician_id", constraint: "services_assigned_technician_id_users_id_fk" },
  { table: "appointments", column: "assigned_technician_id", constraint: "appointments_assigned_technician_id_users_id_fk" },
  { table: "service_records", column: "technician_id", constraint: "service_records_technician_id_users_id_fk" },
  { table: "technician_preferences", column: "technician_id", constraint: "technician_preferences_technician_id_users_id_fk" },
  { table: "appointment_technicians", column: "technician_id", constraint: "appointment_technicians_technician_id_users_id_fk" },
];

/** The bare snapshot column (no FK, by design): remapped for a linked technician, untouched for a minted one. */
const LEDGER_COLUMN = { table: "production_value_entries", column: "technician_id" } as const;

const LOG = "[technician-users-bootstrap] Pass 38:";

type Executor = Pick<typeof db, "execute">;

async function tableExists(reader: Executor, table: string): Promise<boolean> {
  const result = await reader.execute(sql`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${table}`);
  return result.rows.length > 0;
}

async function columnExists(reader: Executor, table: string, column: string): Promise<boolean> {
  const result = await reader.execute(sql`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}`);
  return result.rows.length > 0;
}

async function constraintExists(reader: Executor, table: string, name: string): Promise<boolean> {
  const result = await reader.execute(sql`SELECT 1 FROM pg_constraint WHERE conname = ${name} AND conrelid = ${table}::regclass`);
  return result.rows.length > 0;
}

/** A hash nobody can log in with: a real scrypt hash of 32 random bytes that are thrown away. */
async function unusablePasswordHash(): Promise<string> {
  return hashPassword(randomBytes(32).toString("hex"));
}

export async function bootstrapTechnicianUsers(): Promise<void> {
  if (!(await tableExists(db, "technicians"))) return;
  for (const column of ["phone", "license_id", "color", "technician_notes", "technician_status"]) {
    if (!(await columnExists(db, "users", column))) {
      throw new Error(`${LOG} users.${column} is missing - the auth bootstrap adds it and must run first`);
    }
  }

  await db.transaction(async (tx) => {
    // 1. Every FK that references technicians, by the name the catalog holds.
    const fks = await tx.execute(sql`
      SELECT c.conname, c.conrelid::regclass::text AS table_name
      FROM pg_constraint c
      WHERE c.contype = 'f' AND c.confrelid = 'technicians'::regclass
      ORDER BY 2, 1
    `);
    for (const fk of fks.rows as Array<{ conname: string; table_name: string }>) {
      await tx.execute(sql.raw(`ALTER TABLE ${fk.table_name} DROP CONSTRAINT ${fk.conname}`));
      console.log(`${LOG} dropped ${fk.table_name}.${fk.conname} (referenced technicians)`);
    }

    // 2. Each technician row -> a users row.
    const hasOrgId = await columnExists(tx, "technicians", "org_id");
    const orgColumn = hasOrgId ? sql.raw("org_id") : sql.raw("NULL::varchar AS org_id");
    const rows = await tx.execute(sql`
      SELECT id, ${orgColumn}, display_name, license_id, status, email, phone, color, notes, user_id, created_at, updated_at
      FROM technicians ORDER BY created_at, id
    `);
    const technicians = rows.rows as unknown as TechnicianRow[];
    const [firstOrg] = (await tx.execute(sql`SELECT id FROM organizations ORDER BY created_at, id LIMIT 1`)).rows as Array<{ id: string }>;
    const ledgerExists = await tableExists(tx, LEDGER_COLUMN.table);
    let minted = 0;
    let remapped = 0;
    for (const technician of technicians) {
      const orgId = technician.org_id ?? firstOrg?.id;
      if (!orgId) throw new Error(`${LOG} technician ${technician.id} has no org and no organization exists`);
      const technicianStatus = technician.status || "ACTIVE";
      const [existingSelf] = (await tx.execute(sql`SELECT id FROM users WHERE id = ${technician.id}`)).rows as Array<{ id: string }>;
      const linkedUserId = technician.user_id && technician.user_id !== technician.id ? technician.user_id : null;

      if (!linkedUserId && !existingSelf) {
        // MINT under the same id.
        const { firstName, lastName } = splitDisplayName(technician.display_name || "Technician");
        const fallbackEmail = `${technician.id}@technicians.local`;
        let email = normalizeUserEmail(technician.email) || fallbackEmail;
        let emailNote = "";
        if (email !== fallbackEmail) {
          const [taken] = (await tx.execute(sql`SELECT id FROM users WHERE lower(email) = ${email}`)).rows as Array<{ id: string }>;
          if (taken) {
            emailNote = ` (its email ${email} belongs to user ${taken.id}, so it got the placeholder)`;
            email = fallbackEmail;
          }
        }
        const passwordHash = await unusablePasswordHash();
        const mintedName = `${firstName} ${lastName}`.trim();
        await tx.execute(sql`
          INSERT INTO users (id, org_id, first_name, last_name, email, password_hash, role, status, phone, license_id, color, technician_notes, technician_status, created_at, updated_at)
          VALUES (${technician.id}, ${orgId}, ${firstName}, ${lastName || ""}, ${email}, ${passwordHash}, 'technician', 'inactive',
                  ${technician.phone}, ${technician.license_id}, ${technician.color}, ${technician.notes}, ${technicianStatus},
                  ${technician.created_at}, ${technician.updated_at})
        `);
        minted++;
        console.log(
          `${LOG} minted user ${technician.id} "${mintedName}" <${email}> from technician "${technician.display_name}" (license ${technician.license_id ?? "none"}, ` +
            `technician status ${technicianStatus}, login inactive, role technician - no password; every row that named the technician keeps its id)${emailNote}`,
        );
        continue;
      }

      // LINKED (or a users row already exists under the technician's id): copy the technician block onto the user and remap where needed.
      const targetUserId = linkedUserId ?? technician.id;
      await tx.execute(sql`
        UPDATE users SET
          phone = COALESCE(phone, ${technician.phone}),
          license_id = COALESCE(${technician.license_id}, license_id),
          color = COALESCE(${technician.color}, color),
          technician_notes = COALESCE(${technician.notes}, technician_notes),
          technician_status = COALESCE(technician_status, ${technicianStatus}),
          updated_at = now()
        WHERE id = ${targetUserId}
      `);
      if (!linkedUserId) {
        console.log(`${LOG} technician ${technician.id} already has a users row under its own id - technician block copied, nothing remapped`);
        continue;
      }
      const moved: string[] = [];
      for (const target of TECHNICIAN_FK_COLUMNS) {
        if (!(await tableExists(tx, target.table))) continue;
        const result = await tx.execute(sql.raw(`UPDATE ${target.table} SET ${target.column} = '${linkedUserId}' WHERE ${target.column} = '${technician.id}'`));
        moved.push(`${target.table}.${target.column} ${result.rowCount ?? 0}`);
      }
      if (ledgerExists) {
        const result = await tx.execute(sql.raw(`UPDATE ${LEDGER_COLUMN.table} SET ${LEDGER_COLUMN.column} = '${linkedUserId}' WHERE ${LEDGER_COLUMN.column} = '${technician.id}'`));
        moved.push(`${LEDGER_COLUMN.table}.${LEDGER_COLUMN.column} ${result.rowCount ?? 0}`);
      }
      remapped++;
      console.log(`${LOG} remapped technician ${technician.id} "${technician.display_name}" -> its linked user ${linkedUserId}: ${moved.join(", ")} row(s); technician block copied onto the user`);
    }

    // 3. The five foreign keys, now against users(id).
    for (const target of TECHNICIAN_FK_COLUMNS) {
      if (!(await tableExists(tx, target.table))) continue;
      if (await constraintExists(tx, target.table, target.constraint)) continue;
      await tx.execute(sql.raw(`ALTER TABLE ${target.table} ADD CONSTRAINT ${target.constraint} FOREIGN KEY (${target.column}) REFERENCES users(id)`));
      console.log(`${LOG} added ${target.table}.${target.constraint} (${target.column} -> users.id)`);
    }

    // 4. The table itself.
    await tx.execute(sql`DROP TABLE technicians`);
    console.log(
      `${LOG} technicians dropped - ${technicians.length} row(s) became users (${minted} minted under the same id, ${remapped} remapped onto a linked user). ` +
        `GET /api/technicians now answers from users rows with a technician status; Settings -> Users edits the technician block.`,
    );
  });
}
