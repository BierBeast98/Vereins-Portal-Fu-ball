import type { Request } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { PERMISSIONS, type Permission, type PortalUser } from "../shared/permissions";
import { hashPassword, isPasswordHash } from "./passwords";

declare module "express-session" {
  interface SessionData {
    authUserId?: string;
    authUserVersion?: string;
    authPermissions?: Permission[];
  }
}

declare global {
  namespace Express {
    interface Request { portalUser?: PortalUser; }
  }
}

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const nameSchema = z.string().trim().min(1).max(120);
export const newPortalPasswordSchema = z.string().min(12).max(200);
const permissionSchema = z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length).transform((values) => Array.from(new Set(values)));
export const createPortalUserSchema = z.object({
  name: nameSchema, email: emailSchema, password: newPortalPasswordSchema,
  fullAccess: z.boolean().default(false), permissions: permissionSchema.default([]),
}).strict();
export const updatePortalUserSchema = z.object({
  name: nameSchema.optional(), email: emailSchema.optional(), password: newPortalPasswordSchema.optional(),
  fullAccess: z.boolean().optional(), permissions: permissionSchema.optional(), active: z.boolean().optional(),
  pending: z.literal(false).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Keine Änderungen angegeben.");
export const portalLoginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) }).strict();
export const portalRegistrationSchema = z.object({ name: nameSchema, email: emailSchema, password: newPortalPasswordSchema }).strict();
export const portalSetupSchema = z.object({
  name: nameSchema, email: emailSchema, password: newPortalPasswordSchema,
  bootstrapPassword: z.string().min(1).max(200),
}).strict();

type UserRow = {
  id: string; name: string; email: string; password_hash: string;
  full_access: boolean; permissions: unknown; active: boolean; pending: boolean;
  auth_version: string; created_at: Date | string;
};
export type PortalUserRecord = { user: PortalUser; passwordHash: string; version: string };

export class PortalUserError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function database() { return (await import("./db")).db; }
function version() { return randomBytes(32).toString("hex"); }
function record(row: UserRow): PortalUserRecord {
  const allowed = new Set<string>(PERMISSIONS);
  const permissions = row.full_access ? [...PERMISSIONS] : Array.isArray(row.permissions)
    ? row.permissions.filter((value): value is Permission => typeof value === "string" && allowed.has(value)) : [];
  return {
    user: { id: row.id, name: row.name, email: row.email, fullAccess: row.full_access, permissions,
      active: row.active, pending: row.pending, createdAt: new Date(row.created_at).toISOString() },
    passwordHash: row.password_hash, version: row.auth_version,
  };
}
function fromRows(rows: unknown[]): PortalUserRecord | null {
  return rows[0] ? record(rows[0] as UserRow) : null;
}

export function requestHasPermission(req: Request, permission: Permission): boolean {
  return !!req.session.authUserId && !!req.session.authUserVersion && req.session.authPermissions?.includes(permission) === true;
}

export async function initializePortalUsers(): Promise<void> {
  const db = await database();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS portal_users (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(254) NOT NULL UNIQUE CHECK (email = lower(btrim(email))),
      password_hash TEXT NOT NULL,
      full_access BOOLEAN NOT NULL DEFAULT FALSE,
      permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      pending BOOLEAN NOT NULL DEFAULT FALSE,
      auth_version VARCHAR(64) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.execute(sql`ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS pending BOOLEAN NOT NULL DEFAULT FALSE`);
}

export async function hasPortalUsers(): Promise<boolean> {
  const db = await database();
  const result = await db.execute(sql`SELECT id FROM portal_users LIMIT 1`);
  return result.rows.length > 0;
}

export async function getPortalUserById(id: string): Promise<PortalUserRecord | null> {
  const db = await database();
  const result = await db.execute(sql`SELECT * FROM portal_users WHERE id = ${id}`);
  return fromRows(result.rows);
}

export async function getPortalUserByEmail(email: string): Promise<PortalUserRecord | null> {
  const db = await database();
  const result = await db.execute(sql`SELECT * FROM portal_users WHERE email = ${email.trim().toLowerCase()}`);
  return fromRows(result.rows);
}

export async function listPortalUsers(): Promise<PortalUser[]> {
  const db = await database();
  const result = await db.execute(sql`SELECT * FROM portal_users ORDER BY created_at, id`);
  return result.rows.map((row) => record(row as UserRow).user);
}

/** Serializes setup and all user mutations across processes, including last-owner checks. */
export async function createPortalUser(input: z.infer<typeof createPortalUserSchema>): Promise<PortalUser> {
  const data = createPortalUserSchema.parse(input);
  const passwordHash = await hashPassword(data.password);
  const db = await database();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(739105, 1)`);
    const result = await tx.execute(sql`
      INSERT INTO portal_users (id, name, email, password_hash, full_access, permissions, auth_version)
      VALUES (${randomUUID()}, ${data.name}, ${data.email}, ${passwordHash}, ${data.fullAccess}, ${JSON.stringify(data.permissions)}::jsonb, ${version()})
      RETURNING *
    `);
    return record(result.rows[0] as UserRow).user;
  });
}

export async function updatePortalUser(id: string, input: z.infer<typeof updatePortalUserSchema>): Promise<PortalUser> {
  const data = updatePortalUserSchema.parse(input);
  const passwordHash = data.password !== undefined ? await hashPassword(data.password) : undefined;
  const db = await database();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(739105, 1)`);
    const found = await tx.execute(sql`SELECT * FROM portal_users WHERE id = ${id} FOR UPDATE`);
    const previous = found.rows[0] as UserRow | undefined;
    if (!previous) throw new PortalUserError(404, "Konto nicht gefunden.");
    const fullAccess = data.fullAccess ?? previous.full_access;
    const active = data.active ?? previous.active;
    const pending = active ? false : (data.pending ?? previous.pending);
    const permissions = data.permissions ?? previous.permissions;
    if (previous.pending && active && !fullAccess && (!Array.isArray(permissions) || permissions.length === 0)) {
      throw new PortalUserError(400, "Für die Freigabe bitte mindestens eine Berechtigung vergeben.");
    }
    if (previous.full_access && previous.active && (!fullAccess || !active)) {
      const otherOwners = await tx.execute(sql`SELECT id FROM portal_users WHERE full_access = TRUE AND active = TRUE AND id <> ${id} LIMIT 1`);
      if (!otherOwners.rows.length) throw new PortalUserError(409, "Mindestens ein aktives Konto mit Vollzugriff muss erhalten bleiben.");
    }
    const result = await tx.execute(sql`
      UPDATE portal_users SET name = ${data.name ?? previous.name}, email = ${data.email ?? previous.email},
        password_hash = ${passwordHash ?? previous.password_hash}, full_access = ${fullAccess}, active = ${active}, pending = ${pending},
        permissions = ${JSON.stringify(permissions)}::jsonb, auth_version = ${version()}
      WHERE id = ${id} RETURNING *
    `);
    return record(result.rows[0] as UserRow).user;
  });
}

/** Public self-registration never grants permissions or an authenticated session. */
export async function registerPendingPortalUser(input: z.infer<typeof portalRegistrationSchema>): Promise<void> {
  const data = portalRegistrationSchema.parse(input);
  const encoded = await hashPassword(data.password);
  const db = await database();
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(739105, 1)`);
    const owners = await tx.execute(sql`SELECT id FROM portal_users WHERE active = TRUE AND full_access = TRUE AND pending = FALSE LIMIT 1`);
    if (!owners.rows.length) throw new PortalUserError(409, "Bitte zuerst die Ersteinrichtung abschließen.");
    await tx.execute(sql`
      INSERT INTO portal_users (id, name, email, password_hash, full_access, permissions, active, pending, auth_version)
      VALUES (${randomUUID()}, ${data.name}, ${data.email}, ${encoded}, FALSE, '[]'::jsonb, FALSE, TRUE, ${version()})
    `);
  });
}

export async function changePortalUserPassword(id: string, expectedVersion: string, expectedHash: string, newPassword: string): Promise<PortalUserRecord | null> {
  const encoded = await hashPassword(newPortalPasswordSchema.parse(newPassword));
  const db = await database();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(739105, 1)`);
    const result = await tx.execute(sql`
      UPDATE portal_users SET password_hash = ${encoded}, auth_version = ${version()}
      WHERE id = ${id} AND auth_version = ${expectedVersion} AND password_hash = ${expectedHash} AND active = TRUE
      RETURNING *
    `);
    return fromRows(result.rows);
  });
}

/** Caller verifies the legacy password first; transaction rechecks its exact hash. */
export async function setupFirstPortalUser(input: { name: string; email: string; password: string }, expectedLegacyHash: string): Promise<PortalUserRecord> {
  const data = createPortalUserSchema.parse({ ...input, fullAccess: true, permissions: [...PERMISSIONS] });
  const encoded = await hashPassword(data.password);
  const db = await database();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(739105, 1)`);
    const users = await tx.execute(sql`SELECT id FROM portal_users LIMIT 1`);
    if (users.rows.length) throw new PortalUserError(409, "Die Ersteinrichtung wurde bereits abgeschlossen.");
    const legacy = await tx.execute(sql`SELECT value FROM admin_settings WHERE key = 'admin_password' FOR UPDATE`);
    if (!legacy.rows[0] || (legacy.rows[0] as { value: string }).value !== expectedLegacyHash) {
      throw new PortalUserError(401, "Die Einrichtungsberechtigung ist nicht mehr gültig.");
    }
    const result = await tx.execute(sql`
      INSERT INTO portal_users (id, name, email, password_hash, full_access, permissions, auth_version)
      VALUES (${randomUUID()}, ${data.name}, ${data.email}, ${encoded}, TRUE, ${JSON.stringify([...PERMISSIONS])}::jsonb, ${version()})
      RETURNING *
    `);
    await tx.execute(sql`DELETE FROM admin_settings WHERE key = 'admin_password' AND value = ${expectedLegacyHash}`);
    return record(result.rows[0] as UserRow);
  });
}

/** Trusted local maintenance only. Never expose this helper as an unproven HTTP endpoint. */
export async function bootstrapPortalUserFromLegacy(input: { name: string; email: string }): Promise<PortalUser> {
  const data = z.object({ name: nameSchema, email: emailSchema }).strict().parse(input);
  const db = await database();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(739105, 1)`);
    const users = await tx.execute(sql`SELECT id FROM portal_users LIMIT 1`);
    if (users.rows.length) throw new PortalUserError(409, "Die Ersteinrichtung wurde bereits abgeschlossen.");
    const legacy = await tx.execute(sql`SELECT value FROM admin_settings WHERE key = 'admin_password' FOR UPDATE`);
    const encoded = (legacy.rows[0] as { value?: string } | undefined)?.value;
    if (!encoded || !isPasswordHash(encoded)) throw new PortalUserError(409, "Kein gültiger bestehender Passwort-Hash für die lokale Übernahme vorhanden.");
    const result = await tx.execute(sql`
      INSERT INTO portal_users (id, name, email, password_hash, full_access, permissions, auth_version)
      VALUES (${randomUUID()}, ${data.name}, ${data.email}, ${encoded}, TRUE, ${JSON.stringify([...PERMISSIONS])}::jsonb, ${version()})
      RETURNING *
    `);
    await tx.execute(sql`DELETE FROM admin_settings WHERE key = 'admin_password' AND value = ${encoded}`);
    return record(result.rows[0] as UserRow).user;
  });
}
