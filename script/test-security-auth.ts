/** Local PostgreSQL integration test. All fixtures live in a temporary schema. */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import express from "express";
import pg from "pg";
import { createPortalSession, enforceSessionLifetime } from "../server/session-config";
import { isPasswordHash, verifyPassword } from "../server/passwords";

const url = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Requires local PostgreSQL");
const control = new pg.Pool({ connectionString: url.toString() });
const schema = `auth_test_${randomBytes(8).toString("hex")}`;
await control.query(`CREATE SCHEMA ${schema}`);
url.searchParams.set("options", `-c search_path=${schema}`);
process.env.DATABASE_URL = url.toString();
process.env.BFV_URL = "";
process.env.RESEND_API_KEY = "";
let database: any;
let server: Server | undefined;
let base = "";
const secret = randomBytes(32).toString("hex");

try {
  database = (await import("../server/db")).db;
  await database.$client.query(`
    CREATE TABLE admin_settings (key VARCHAR(100) PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE campaigns (id VARCHAR(36) PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
      start_date VARCHAR(10) NOT NULL, end_date VARCHAR(10) NOT NULL, active BOOLEAN DEFAULT TRUE,
      product_ids JSONB DEFAULT '[]', password VARCHAR(255), created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());
    CREATE TABLE festivals (id VARCHAR(36) PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', location TEXT DEFAULT '',
      start_date VARCHAR(10) NOT NULL, end_date VARCHAR(10) NOT NULL, active BOOLEAN DEFAULT TRUE,
      password TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());
    CREATE TABLE calendar_events (LIKE public.calendar_events INCLUDING ALL);
    CREATE TABLE field_mappings (id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), team TEXT, event_type TEXT, default_field TEXT);
    CREATE TABLE orders (id VARCHAR(36) PRIMARY KEY, campaign_id VARCHAR(36), campaign_name TEXT, email TEXT,
      first_name TEXT, last_name TEXT, items JSONB, total_amount DOUBLE PRECISION, created_at TIMESTAMP DEFAULT NOW());
    CREATE TABLE festival_shifts (id VARCHAR(36) PRIMARY KEY, festival_id VARCHAR(36), station_id VARCHAR(36),
      start_time TIMESTAMP, end_time TIMESTAMP, required_helpers INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT NOW());
    CREATE TABLE festival_signups (id VARCHAR(36) PRIMARY KEY, shift_id VARCHAR(36), helper_name TEXT,
      helper_phone TEXT, notes TEXT, created_at TIMESTAMP DEFAULT NOW());
  `);
  const { dbStorage, migrateStoredPasswords } = await import("../server/dbStorage");
  assert.equal(await dbStorage.getAdminPassword(), null, "no admin fallback");
  const oldPassword = "fixture-admin-password";
  await database.$client.query("INSERT INTO admin_settings VALUES ('admin_password', $1)", [oldPassword]);
  await database.$client.query("INSERT INTO campaigns (id,name,description,start_date,end_date,password) VALUES ('campaign', 'Test', '', '2026-01-01','2099-12-31',$1)", ["fixture-campaign-password"]);
  await database.$client.query("INSERT INTO festivals (id,name,start_date,end_date,password) VALUES ('festival','Test','2026-01-01','2099-12-31',$1)", ["fixture-festival-password"]);
  await database.$client.query("INSERT INTO campaigns (id,name,description,start_date,end_date,password) VALUES ('empty', 'Empty', '', '2026-01-01','2099-12-31','')");
  await Promise.all([migrateStoredPasswords(), migrateStoredPasswords()]);
  const firstHash = await dbStorage.getAdminPassword();
  assert.ok(firstHash && isPasswordHash(firstHash));
  assert.ok(await verifyPassword(oldPassword, firstHash));
  assert.ok(await verifyPassword("fixture-campaign-password", await dbStorage.getCampaignPassword("campaign")));
  assert.ok(await verifyPassword("fixture-festival-password", await dbStorage.getFestivalPassword("festival")));
  assert.equal(await dbStorage.getCampaignPassword("empty"), null);
  await migrateStoredPasswords();
  assert.equal(await dbStorage.getAdminPassword(), firstHash, "migration is idempotent");
  const campaign = await dbStorage.createCampaign({ name: "New", description: "", startDate: "2026-01-01", endDate: "2099-12-31", productIds: [], password: "new-campaign-password" });
  assert.ok(await verifyPassword("new-campaign-password", await dbStorage.getCampaignPassword(campaign.id)));
  await dbStorage.updateCampaign(campaign.id, { password: null });
  assert.equal(await dbStorage.getCampaignPassword(campaign.id), null);
  const festival = await dbStorage.createFestival({ name: "New", startDate: "2026-01-01", endDate: "2099-12-31", password: "new-festival-password" });
  assert.ok(await verifyPassword("new-festival-password", await dbStorage.getFestivalPassword(festival.id)));
  await dbStorage.updateFestival(festival.id, { password: "" });
  assert.equal(await dbStorage.getFestivalPassword(festival.id), null);

  const { registerRoutes } = await import("../server/routes");
  async function start() {
    const app = express();
    app.use(createPortalSession({ isProduction: false, secret }));
    app.use(enforceSessionLifetime);
    app.use(express.json());
    server = createServer(app);
    await registerRoutes(server, app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    base = `http://127.0.0.1:${address.port}`;
  }
  async function stop() {
    server?.closeAllConnections();
    if (server?.listening) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  }
  function client() {
    let cookie = "";
    return {
      get cookie() { return cookie; },
      async request(path: string, method = "GET", body?: unknown) {
        const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
        const setCookie = response.headers.get("set-cookie");
        if (setCookie) cookie = setCookie.split(";")[0];
        return { status: response.status, data: response.status === 204 ? null : await response.json() };
      },
    };
  }
  await start();
  const anonymous = client(), adminA = client(), adminB = client(), member = client(), ownerOtherSession = client(), restricted = client();
  const ownerEmail = "owner@example.invalid", colleagueEmail = "colleague@example.invalid";
  const colleaguePassword = "fixture-colleague-password";
  assert.equal((await anonymous.request("/api/orders")).status, 401);
  assert.equal((await anonymous.request("/api/admin/organization/password", "PUT", { password: "not-allowed-password" })).status, 401);
  assert.equal((await adminA.request("/api/auth/login", "POST", { password: oldPassword })).status, 400, "password-only login is disabled");
  assert.equal((await adminA.request("/api/auth/setup", "POST", { name: "Fixture Owner", email: ownerEmail, password: oldPassword, bootstrapPassword: "wrong-bootstrap" })).status, 401);
  assert.equal((await adminA.request("/api/auth/setup", "POST", { name: "Fixture Owner", email: ownerEmail, password: oldPassword, bootstrapPassword: oldPassword })).status, 201);
  assert.equal((await anonymous.request("/api/auth/setup", "POST", { name: "Intruder", email: "intruder@example.invalid", password: oldPassword, bootstrapPassword: oldPassword })).status, 409, "setup is one-time");
  assert.equal(await dbStorage.getAdminPassword(), null, "legacy bootstrap credential is removed");
  assert.equal((await adminA.request("/api/auth/login", "POST", { email: ownerEmail, password: "wrong-password" })).status, 401);
  assert.equal((await adminA.request("/api/auth/login", "POST", { email: ownerEmail, password: oldPassword })).status, 200);
  const cookieBefore = adminA.cookie;
  await adminA.request("/api/auth/login", "POST", { email: ownerEmail, password: oldPassword });
  assert.notEqual(adminA.cookie, cookieBefore, "login rotates session ID");
  const requestedColleague = await anonymous.request("/api/auth/register", "POST", { name: "Fixture Colleague", email: colleagueEmail, password: colleaguePassword });
  assert.equal(requestedColleague.status, 201);
  assert.equal(requestedColleague.data.pending, true);
  assert.equal((await adminB.request("/api/auth/login", "POST", { email: colleagueEmail, password: colleaguePassword })).status, 401, "registration is not login access");
  const waiting = (await adminA.request("/api/admin/users")).data.find((user: any) => user.email === colleagueEmail);
  assert.ok(waiting.pending && !waiting.active && !waiting.fullAccess && waiting.permissions.length === 0);
  const colleagueId = waiting.id;
  assert.equal((await anonymous.request("/api/auth/register", "POST", { name: "Attacker", email: "attacker@example.invalid", password: colleaguePassword, fullAccess: true })).status, 400, "registration cannot self-assign rights");
  assert.equal((await adminA.request(`/api/admin/users/${colleagueId}`, "PATCH", { active: true, fullAccess: true, permissions: [] })).status, 200, "owner approves account explicitly");
  assert.equal((await adminA.request("/api/admin/users", "POST", { name: "Duplicate", email: "COLLEAGUE@EXAMPLE.INVALID", password: colleaguePassword, fullAccess: true, permissions: [] })).status, 409);
  await adminB.request("/api/auth/login", "POST", { email: colleagueEmail, password: colleaguePassword });
  await ownerOtherSession.request("/api/auth/login", "POST", { email: ownerEmail, password: oldPassword });
  const readUser = await adminA.request("/api/admin/users", "POST", { name: "Reader", email: "reader@example.invalid", password: "fixture-reader-password", fullAccess: false, permissions: ["calendar.read"] });
  assert.equal(readUser.status, 201);
  const readerId = readUser.data.id;
  await restricted.request("/api/auth/login", "POST", { email: "reader@example.invalid", password: "fixture-reader-password" });
  assert.equal((await restricted.request("/api/auth/check")).data.authenticated, true);
  assert.equal((await restricted.request("/api/auth/check")).data.isAdmin, false);
  assert.equal((await restricted.request("/api/calendar/events")).status, 200);
  assert.equal((await restricted.request("/api/calendar/events", "POST", {})).status, 403);
  assert.equal((await restricted.request("/api/orders/export/test")).status, 403);
  assert.equal((await restricted.request("/API/Orders/Export/test/")).status, 403);
  assert.equal((await restricted.request("/API/Products/test/", "DELETE")).status, 403);
  assert.equal((await restricted.request("/api/admin/users")).status, 403);
  assert.equal((await restricted.request(`/api/admin/users/${readerId}`, "PATCH", { fullAccess: true })).status, 403);
  await adminA.request(`/api/admin/users/${readerId}`, "PATCH", { permissions: [] });
  assert.equal((await restricted.request("/api/auth/check")).data.authenticated, false, "permission changes invalidate existing sessions");
  await anonymous.request("/api/auth/register", "POST", { name: "Rejected", email: "rejected@example.invalid", password: colleaguePassword });
  const rejected = (await adminA.request("/api/admin/users")).data.find((user: any) => user.email === "rejected@example.invalid");
  assert.equal((await adminA.request(`/api/admin/users/${rejected.id}`, "PATCH", { active: false, pending: false })).status, 200);
  assert.equal((await client().request("/api/auth/login", "POST", { email: "rejected@example.invalid", password: colleaguePassword })).status, 401);
  const list = await adminA.request("/api/admin/users");
  assert.ok(!JSON.stringify(list.data).includes("password"), "user API never exposes credentials");
  await adminA.request("/api/admin/organization/password", "PUT", { password: "fixture-organization-password" });
  await member.request("/api/organization/login", "POST", { password: "fixture-organization-password" });
  assert.equal((await member.request("/api/auth/check")).data.isAdmin, false);
  assert.equal((await member.request("/api/admin/organization/password", "PUT", { password: "not-allowed-password" })).status, 401);

  // A fresh application instance must recover the session from PostgreSQL.
  await stop(); await start();
  assert.equal((await adminA.request("/api/auth/check")).data.isAdmin, true);
  assert.equal((await member.request("/api/organization/access")).data.authenticated, true);
  const oldAdminSid = decodeURIComponent(adminA.cookie.split("=")[1]).slice(2).split(".")[0];
  const oldClock = (await database.$client.query("SELECT sess->>'authenticatedAt' AS started FROM portal_sessions WHERE sid=$1", [oldAdminSid])).rows[0].started;
  await adminA.request("/api/organization/login", "POST", { password: "fixture-organization-password" });
  const renewedAdminSid = decodeURIComponent(adminA.cookie.split("=")[1]).slice(2).split(".")[0];
  const renewedClock = (await database.$client.query("SELECT sess->>'authenticatedAt' AS started FROM portal_sessions WHERE sid=$1", [renewedAdminSid])).rows[0].started;
  assert.equal(renewedClock, oldClock, "organization login cannot extend the admin's absolute deadline");
  assert.equal((await adminA.request("/api/auth/check")).data.isAdmin, true);
  assert.equal((await adminA.request("/api/auth/change-password", "POST", { currentPassword: oldPassword, newPassword: "short" })).status, 400);
  const nextPassword = "fixture-replacement-password";
  assert.equal((await adminA.request("/api/auth/change-password", "POST", { currentPassword: oldPassword, newPassword: nextPassword })).status, 200);
  assert.equal((await adminA.request("/api/auth/check")).data.isAdmin, true);
  assert.equal((await ownerOtherSession.request("/api/admin/organization/password", "PUT", { password: "not-allowed-password" })).status, 401);
  assert.equal((await ownerOtherSession.request("/api/organization/access")).data.authenticated, false, "stale admin cannot bypass org access");
  assert.equal((await member.request("/api/organization/access")).data.authenticated, true, "independent member remains authorized");
  assert.equal((await adminB.request("/api/auth/check")).data.authenticated, true, "own password change does not log out colleague");
  assert.equal((await anonymous.request("/api/auth/login", "POST", { email: ownerEmail, password: oldPassword })).status, 401);

  const validItem = { productId: "fixture", productName: "Fixture", category: "Test", size: "M", quantity: 1, withInitials: false, unitPrice: 10, initialsPrice: 0, totalPrice: 10 };
  const order = { campaignId: "campaign", email: "fixture@example.invalid", firstName: "Test", lastName: "Person", items: [validItem] };
  assert.equal((await anonymous.request("/api/campaigns/campaign/verify-password", "POST", { password: "fixture-campaign-password" })).status, 200);
  assert.equal((await anonymous.request("/api/orders", "POST", { ...order, campaignPassword: "wrong" })).status, 401);
  assert.equal((await anonymous.request("/api/orders", "POST", { ...order, campaignPassword: "fixture-campaign-password" })).status, 201);
  assert.equal((await anonymous.request("/api/festivals/verify-password", "POST", { festivalId: "festival", password: "fixture-festival-password" })).status, 200);

  const sid = decodeURIComponent(adminA.cookie.split("=")[1]).slice(2).split(".")[0];
  await database.$client.query("UPDATE portal_sessions SET sess = jsonb_set(sess::jsonb, '{lastAuthenticatedActivityAt}', $1::jsonb) WHERE sid=$2", [JSON.stringify(Date.now() - 31 * 60 * 1000), sid]);
  assert.equal((await adminA.request("/api/auth/check")).data.isAdmin, false, "idle session expires");
  await adminA.request("/api/auth/login", "POST", { email: ownerEmail, password: nextPassword });
  const absoluteSid = decodeURIComponent(adminA.cookie.split("=")[1]).slice(2).split(".")[0];
  await database.$client.query("UPDATE portal_sessions SET sess = jsonb_set(sess::jsonb, '{authenticatedAt}', $1::jsonb) WHERE sid=$2", [JSON.stringify(Date.now() - 25 * 60 * 60 * 1000), absoluteSid]);
  assert.equal((await adminA.request("/api/auth/check")).data.isAdmin, false, "absolute session deadline expires");
  await adminA.request("/api/auth/login", "POST", { email: ownerEmail, password: nextPassword });
  assert.equal((await adminA.request(`/api/admin/users/${colleagueId}`, "PATCH", { active: false })).status, 200);
  const ownerId = (await adminA.request("/api/auth/check")).data.user.id;
  assert.equal((await adminA.request(`/api/admin/users/${ownerId}`, "PATCH", { active: false })).status, 409, "last active full-access account cannot be disabled");
  assert.equal((await adminA.request(`/api/admin/users/${ownerId}`, "PATCH", { fullAccess: false, permissions: ["users.manage"] })).status, 409, "last full-access account cannot be downgraded");
  assert.equal((await adminB.request("/api/auth/check")).data.authenticated, false, "disabled users lose their sessions");
  await adminA.request("/api/auth/logout", "POST");
  assert.equal((await adminA.request("/api/auth/check")).data.isAdmin, false);
  for (let i = 0; i < 21; i++) await anonymous.request("/api/campaigns/campaign/verify-password", "POST", { password: "wrong" });
  assert.equal((await anonymous.request("/api/orders", "POST", { ...order, campaignPassword: "wrong" })).status, 429, "password protection covers order endpoint too");
  await database.$client.query("DELETE FROM admin_settings WHERE key='admin_password'");
  assert.equal((await anonymous.request("/api/auth/login", "POST", { email: ownerEmail, password: "12345" })).status, 401, "unconfigured portal never accepts the old fallback");
  console.log("Benutzerverwaltung: Erstkonto, E-Mail-Login, persönliche Passwörter, Rechteprüfung, Sitzungswiderruf, letzter Administrator und getrenntes Organigramm bestanden.");
} finally {
  server?.closeAllConnections();
  if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
  if (database) await database.$client.end();
  await control.query(`DROP SCHEMA ${schema} CASCADE`);
  await control.end();
}
