/** First-time setup only. Run from the project directory:
 * node --import tsx script/setup-admin.ts --generate
 * Or supply a chosen password via stdin, rather than shell arguments.
 * Configured credentials cannot be overwritten by this script.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { hashPassword } from "../server/passwords";

const generate = process.argv.slice(2).includes("--generate");
const password = generate ? randomBytes(24).toString("base64url") : readFileSync(0, "utf8").replace(/\r?\n$/, "");
if (password.length < 12 || password.length > 200) throw new Error("Das Passwort muss 12 bis 200 Zeichen lang sein.");
const { db } = await import("../server/db");
try {
  const table = await db.execute(sql`SELECT to_regclass('portal_users') AS name`);
  if (table.rows[0]?.name) {
    const existing = await db.execute(sql`SELECT id FROM portal_users LIMIT 1`);
    if (existing.rows.length) throw new Error("Persönliche Konten sind bereits eingerichtet. Benutzerverwaltung verwenden.");
  }
  const hash = await hashPassword(password);
  const result = await db.execute(sql`
    INSERT INTO admin_settings (key, value) VALUES ('admin_password', ${hash})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    WHERE admin_settings.value = ''
    RETURNING key
  `);
  if (!result.rows.length) throw new Error("Adminzugang ist bereits eingerichtet. Passwort über den Adminbereich ändern.");
  console.log("Adminzugang eingerichtet.");
  if (generate) console.log(`Einmalig erzeugtes Adminpasswort: ${password}`);
} finally {
  await db.$client.end();
}
