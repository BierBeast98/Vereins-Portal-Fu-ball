/** Trusted first-account migration. Preserves the existing admin password.
 * node --import tsx script/setup-portal-user.ts 'email@example.org' 'Name'
 * Never overwrites existing personal accounts and never prints password hashes.
 */
import "dotenv/config";
import { migrateStoredPasswords } from "../server/dbStorage";
import { bootstrapPortalUserFromLegacy, initializePortalUsers } from "../server/portal-users";

const [email, name, extra] = process.argv.slice(2);
if (!email || !name || extra) throw new Error("Aufruf: setup-portal-user.ts E-Mail Name");
const { db } = await import("../server/db");
try {
  await migrateStoredPasswords();
  await initializePortalUsers();
  const user = await bootstrapPortalUserFromLegacy({ email, name });
  console.log(`Persönliches Konto mit Vollzugriff eingerichtet: ${user.email}. Bisheriges Adminpasswort bleibt gültig.`);
} finally {
  await db.$client.end();
}
