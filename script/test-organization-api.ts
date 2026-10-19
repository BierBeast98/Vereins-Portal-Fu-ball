/** Run with: node --import tsx script/test-organization-api.ts
 * Uses a temporary PostgreSQL schema on localhost; existing portal data stays intact.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import express from "express";
import session from "express-session";
import pg from "pg";
import { registerOrganizationRoutes } from "../server/organization";

const connection = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(connection.hostname), "API test requires a local PostgreSQL database");
const schema = `org_test_${randomBytes(8).toString("hex")}`;
const control = new pg.Pool({ connectionString: connection.toString() });
await control.query(`CREATE SCHEMA ${schema}`);
connection.searchParams.set("options", `-c search_path=${schema}`);
process.env.DATABASE_URL = connection.toString();
let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
let database: any;

try {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: randomBytes(32).toString("hex"), resave: false, saveUninitialized: false }));
  const adminToken = randomBytes(24).toString("hex");
  // This route exists only inside this isolated test server.
  app.post("/test/admin-session", (req, res) => {
    if (req.body.token !== adminToken) return res.sendStatus(401);
    req.session.isAdmin = true;
    res.json({ success: true });
  });
  app.get("/test/is-admin", (req, res) => res.json({ isAdmin: req.session.isAdmin === true }));
  database = (await import("../server/db")).db;
  await registerOrganizationRoutes(app);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;

  function client() {
    let cookie = "";
    return async (path: string, method = "GET", body?: unknown) => {
      const response = await fetch(base + path, {
        method,
        headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const next = response.headers.get("set-cookie");
      if (next) cookie = next.split(";")[0];
      return { status: response.status, data: await response.json() };
    };
  }

  const anonymous = client(), admin = client(), member = client(), otherMember = client();
  const path = "/api/organization";
  assert.deepEqual((await anonymous(path + "/access")).data, { authenticated: false, configured: false, isAdmin: false });
  assert.equal((await anonymous(path + "/chart")).status, 401);
  assert.equal((await anonymous(path + "/chart", "PUT", {})).status, 401);
  assert.equal((await anonymous("/api/admin/organization/password", "PUT", { password: "unallowed-password" })).status, 401);
  assert.equal((await member(path + "/login", "POST", { password: "not-configured" })).status, 403);
  await admin("/test/admin-session", "POST", { token: adminToken });
  assert.equal((await admin(path + "/access")).data.authenticated, true);
  assert.equal((await admin("/api/admin/organization/password", "PUT", { password: "short" })).status, 400);
  const password = randomBytes(20).toString("hex");
  assert.equal((await admin("/api/admin/organization/password", "PUT", { password })).status, 200);
  assert.equal((await member(path + "/login", "POST", { password: "incorrect" })).status, 401);
  assert.equal((await member(path + "/login", "POST", { password })).status, 200);
  assert.equal((await member("/test/is-admin")).data.isAdmin, false);
  assert.equal((await member("/api/admin/organization/password", "PUT", { password })).status, 401);
  const initial = (await member(path + "/chart")).data;
  assert.equal(initial.version, 0);
  assert.deepEqual(initial.nodes, []);
  const nodes = [
    { id: "a", title: "Vorstand A", people: ["Anna Beispiel", "Ben Beispiel"], description: "", color: "green", parentId: null, x: 80, y: 40 },
    { id: "b", title: "Vorstand B", people: [], description: "", color: "blue", parentId: null, x: 400, y: 40 },
    { id: "c", title: "Jugend", people: [], description: "", color: "orange", parentId: "a", x: 80, y: 300 },
  ];
  const save = await member(path + "/chart", "PUT", { ...initial, nodes });
  assert.equal(save.status, 200);
  assert.equal(save.data.version, 1);
  await otherMember(path + "/login", "POST", { password });
  assert.deepEqual((await otherMember(path + "/chart")).data.nodes, nodes);
  const invalid = { ...save.data, nodes: nodes.map((node) => node.id === "a" ? { ...node, parentId: "c" } : node) };
  assert.equal((await member(path + "/chart", "PUT", invalid)).status, 400);
  const concurrent = await Promise.all([
    member(path + "/chart", "PUT", { ...save.data, title: "Version A" }),
    otherMember(path + "/chart", "PUT", { ...save.data, title: "Version B" }),
  ]);
  assert.deepEqual(concurrent.map((result) => result.status).sort(), [200, 409]);
  assert.equal((await member(path + "/chart")).data.version, 2);
  const nextPassword = randomBytes(20).toString("hex");
  await admin("/api/admin/organization/password", "PUT", { password: nextPassword });
  assert.equal((await member(path + "/chart")).status, 401);
  assert.equal((await otherMember(path + "/chart", "PUT", { ...save.data, version: 2 })).status, 401);
  await member(path + "/login", "POST", { password: nextPassword });
  await member(path + "/logout", "POST");
  assert.equal((await member(path + "/chart")).status, 401);
  await admin(path + "/logout", "POST");
  assert.equal((await admin("/test/is-admin")).data.isAdmin, true);
  const persisted = await control.query(`SELECT password_hash FROM ${schema}.organization_chart`);
  assert.ok(persisted.rows[0].password_hash.startsWith("scrypt:"));
  assert.notEqual(persisted.rows[0].password_hash, nextPassword);
  console.log("Organigramm API: Zugang, Rechte, Speichern, Hierarchie, Parallelzugriff, Passwortrotation und Logout bestanden.");
} finally {
  if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  if (database) await database.$client.end();
  await control.query(`DROP SCHEMA ${schema} CASCADE`);
  await control.end();
}
