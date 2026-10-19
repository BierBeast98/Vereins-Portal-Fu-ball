import type { Express, Request } from "express";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { organizationChartSchema, type OrganizationChart } from "../shared/organization";

declare module "express-session" {
  interface SessionData {
    orgAccessVersion?: string;
  }
}

const deriveKey = promisify(scrypt);
const passwordSchema = z.object({ password: z.string().min(8, "Mindestens 8 Zeichen erforderlich.").max(200) }).strict();
const loginSchema = z.object({ password: z.string().min(1).max(200) }).strict();

export async function hashOrganizationPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await deriveKey(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}

export async function verifyOrganizationPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, salt, hash, extra] = encoded.split(":");
  if (algorithm !== "scrypt" || extra !== undefined || !/^[a-f0-9]{32}$/.test(salt ?? "") || !/^[a-f0-9]{128}$/.test(hash ?? "")) return false;
  const actual = await deriveKey(password, salt, 64) as Buffer;
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}

type OrganizationRow = {
  version: number;
  title: string;
  nodes: OrganizationChart["nodes"];
  password_hash: string | null;
  auth_version: string;
};

export function hasOrganizationAccess(session: { isAdmin?: boolean; orgAccessVersion?: string }, row: { password_hash: string | null; auth_version: string }): boolean {
  return session.isAdmin === true || (!!row.password_hash && session.orgAccessVersion === row.auth_version);
}

function toChart(row: OrganizationRow): OrganizationChart {
  return { version: Number(row.version), title: row.title, nodes: row.nodes };
}

function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
}

export async function registerOrganizationRoutes(app: Express): Promise<void> {
  const { db } = await import("./db");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS organization_chart (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL,
      nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
      password_hash TEXT,
      auth_version TEXT NOT NULL
    )
  `);
  await db.execute(sql`
    INSERT INTO organization_chart (id, title, auth_version)
    VALUES (1, 'Vereinsorganisation TSV Greding', ${randomBytes(24).toString("hex")})
    ON CONFLICT (id) DO NOTHING
  `);

  async function getRow(): Promise<OrganizationRow> {
    const result = await db.execute(sql`SELECT version, title, nodes, password_hash, auth_version FROM organization_chart WHERE id = 1`);
    if (!result.rows[0]) throw new Error("Organigramm nicht initialisiert");
    return result.rows[0] as unknown as OrganizationRow;
  }

  app.get("/api/organization/access", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const row = await getRow();
    res.json({ authenticated: hasOrganizationAccess(req.session, row), configured: !!row.password_hash, isAdmin: req.session.isAdmin === true });
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: "Zu viele Login-Versuche. Bitte warte 15 Minuten." },
  });

  app.post("/api/organization/login", loginLimiter, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Passwort erforderlich (maximal 200 Zeichen)." });
    const row = await getRow();
    if (!row.password_hash) return res.status(403).json({ error: "Der Zugang wurde noch nicht eingerichtet." });
    if (!await verifyOrganizationPassword(parsed.data.password, row.password_hash)) return res.status(401).json({ error: "Falsches Passwort." });
    // Preserve existing admin authentication, but rotate the session ID on login.
    const isAdmin = req.session.isAdmin === true;
    await new Promise<void>((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
    req.session.isAdmin = isAdmin;
    req.session.orgAccessVersion = row.auth_version;
    await saveSession(req);
    res.json({ success: true });
  });

  app.post("/api/organization/logout", async (req, res) => {
    delete req.session.orgAccessVersion;
    await saveSession(req);
    res.json({ success: true });
  });

  app.get("/api/organization/chart", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const row = await getRow();
    if (!hasOrganizationAccess(req.session, row)) return res.status(401).json({ error: "Bitte für das Organigramm anmelden." });
    res.json(toChart(row));
  });

  app.put("/api/organization/chart", async (req, res) => {
    const row = await getRow();
    if (!hasOrganizationAccess(req.session, row)) return res.status(401).json({ error: "Bitte für das Organigramm anmelden." });
    const parsed = organizationChartSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Ungültiges Organigramm.", details: parsed.error.flatten() });
    const chart = parsed.data;
    // Check authorization in the same statement as the write, including password rotations.
    const result = await db.execute(sql`
      UPDATE organization_chart
      SET version = version + 1, title = ${chart.title}, nodes = ${JSON.stringify(chart.nodes)}::jsonb
      WHERE id = 1 AND version = ${chart.version}
        AND (${req.session.isAdmin === true} OR (password_hash IS NOT NULL AND auth_version = ${req.session.orgAccessVersion ?? ""}))
      RETURNING version, title, nodes
    `);
    if (!result.rows[0]) {
      const latest = await getRow();
      if (!hasOrganizationAccess(req.session, latest)) return res.status(401).json({ error: "Der Zugang wurde geändert. Bitte erneut anmelden." });
      return res.status(409).json({ error: "Das Organigramm wurde inzwischen geändert. Bitte neu laden." });
    }
    res.json(toChart(result.rows[0] as unknown as OrganizationRow));
  });

  app.put("/api/admin/organization/password", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ error: "Nicht autorisiert." });
    const parsed = passwordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Das Passwort muss 8 bis 200 Zeichen lang sein." });
    const hash = await hashOrganizationPassword(parsed.data.password);
    await db.execute(sql`UPDATE organization_chart SET password_hash = ${hash}, auth_version = ${randomBytes(24).toString("hex")} WHERE id = 1`);
    res.json({ success: true });
  });
}
