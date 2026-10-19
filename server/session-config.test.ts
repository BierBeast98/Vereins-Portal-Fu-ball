import { test } from "node:test";
import assert from "node:assert/strict";
import express, { type Request, type Response } from "express";
import session from "express-session";
import { createServer } from "node:http";
import {
  createPortalSession, enforceSessionLifetime, initializeSessionLifetime,
  SESSION_IDLE_LIMIT_MS, SESSION_ABSOLUTE_LIMIT_MS,
} from "./session-config";

function lifetimeRequest(data: Record<string, unknown>): Request {
  return { session: data } as unknown as Request;
}

test("successful authentication explicitly starts both server-side clocks", (t) => {
  t.mock.method(Date, "now", () => 10_000);
  const req = lifetimeRequest({ isAdmin: true });
  initializeSessionLifetime(req);
  assert.equal(req.session.authenticatedAt, 10_000);
  assert.equal(req.session.lastAuthenticatedActivityAt, 10_000);
});

test("activity advances the idle clock without renewing the absolute lifetime", (t) => {
  t.mock.method(Date, "now", () => 100_000);
  const req = lifetimeRequest({ orgAccessVersion: "v1", authenticatedAt: 10_000, lastAuthenticatedActivityAt: 50_000 });
  let calls = 0;
  enforceSessionLifetime(req, {} as Response, () => { calls++; });
  assert.equal(calls, 1);
  assert.equal(req.session.orgAccessVersion, "v1");
  assert.equal(req.session.authenticatedAt, 10_000);
  assert.equal(req.session.lastAuthenticatedActivityAt, 100_000);
  assert.equal(req.session.isAdmin, undefined);
});

test("idle and absolute deadlines revoke both auth flags before advancing activity", (t) => {
  const now = 2 * SESSION_ABSOLUTE_LIMIT_MS;
  t.mock.method(Date, "now", () => now);
  for (const clocks of [
    { authenticatedAt: now - SESSION_IDLE_LIMIT_MS, lastAuthenticatedActivityAt: now - SESSION_IDLE_LIMIT_MS },
    { authenticatedAt: now - SESSION_ABSOLUTE_LIMIT_MS, lastAuthenticatedActivityAt: now - 1 },
    {},
    { authenticatedAt: now + 1, lastAuthenticatedActivityAt: now },
    { authenticatedAt: now - 1, lastAuthenticatedActivityAt: NaN },
  ]) {
    const req = lifetimeRequest({ isAdmin: true, orgAccessVersion: "v1", ...clocks });
    let continued = false;
    enforceSessionLifetime(req, {} as Response, () => { continued = true; });
    assert.ok(continued);
    assert.equal(req.session.isAdmin, undefined);
    assert.equal(req.session.orgAccessVersion, undefined);
    assert.equal(req.session.authenticatedAt, undefined);
    assert.equal(req.session.lastAuthenticatedActivityAt, undefined);
  }
});

test("anonymous traffic does not create authentication clocks", () => {
  const req = lifetimeRequest({});
  enforceSessionLifetime(req, {} as Response, () => {});
  assert.deepEqual(req.session, {});
});

test("injected store persists authentication across middleware instances with hardened cookies", async (t) => {
  const store = new session.MemoryStore();
  const app = express();
  app.use((req, res, next) => {
    const middleware = createPortalSession({ isProduction: false, secret: "isolated-session-test-secret-only", store });
    middleware(req, res, next);
  });
  app.use(enforceSessionLifetime);
  app.post("/login", (req, res) => {
    req.session.isAdmin = true;
    initializeSessionLifetime(req);
    res.json({ ok: true });
  });
  app.get("/state", (req, res) => res.json({ authenticated: Boolean(req.session.isAdmin) }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const anonymous = await fetch(`${base}/state`);
  assert.equal(anonymous.headers.get("set-cookie"), null);
  const login = await fetch(`${base}/login`, { method: "POST" });
  const cookie = login.headers.get("set-cookie");
  assert.ok(cookie);
  assert.match(cookie, /^tsv\.sid=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(cookie, /Expires=/i);
  const authenticated = await fetch(`${base}/state`, { headers: { Cookie: cookie.split(";")[0] } });
  assert.deepEqual(await authenticated.json(), { authenticated: true });
  assert.ok(authenticated.headers.get("set-cookie"), "rolling cookie is renewed on authenticated traffic");
});

test("production cookies require HTTPS", async (t) => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(createPortalSession({ isProduction: true, secret: "isolated-production-cookie-test-secret", store: new session.MemoryStore() }));
  app.get("/", (req, res) => { req.session.isAdmin = true; initializeSessionLifetime(req); res.end("ok"); });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const insecure = await fetch(base);
  assert.equal(insecure.headers.get("set-cookie"), null);
  const secure = await fetch(base, { headers: { "X-Forwarded-Proto": "https" } });
  assert.match(secure.headers.get("set-cookie") || "", /; Secure/i);
});
