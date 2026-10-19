import { test } from "node:test";
import assert from "node:assert/strict";
import { organizationChartSchema, type OrganizationNode } from "../shared/organization";
import { hashOrganizationPassword, verifyOrganizationPassword, hasOrganizationAccess } from "./organization";

function node(id: string, parentId: string | null = null): OrganizationNode {
  return { id, title: "Vorstand", people: ["Max Muster"], description: "", color: "green", parentId, x: 0, y: 0 };
}

function valid(nodes: OrganizationNode[]) {
  return organizationChartSchema.safeParse({ version: 0, title: "Verein", nodes }).success;
}

test("empty chart, multiple roots, multi-person roles and hierarchy are allowed", () => {
  assert.ok(valid([]));
  assert.ok(valid([node("a"), node("b"), { ...node("c", "a"), people: ["Anna", "Ben", "Chris"] }]));
});

test("duplicate IDs, missing parents, self-reference and multi-node cycles are rejected", () => {
  assert.equal(valid([node("a"), node("a")]), false);
  assert.equal(valid([node("a", "missing")]), false);
  assert.equal(valid([node("a", "a")]), false);
  assert.equal(valid([node("a", "b"), node("b", "c"), node("c", "a")]), false);
});

test("node count, coordinates, text lengths and version are bounded", () => {
  assert.ok(valid(Array.from({ length: 200 }, (_, i) => node(String(i)))));
  assert.equal(valid(Array.from({ length: 201 }, (_, i) => node(String(i)))), false);
  assert.equal(valid([{ ...node("a"), x: -1 }]), false);
  assert.equal(valid([{ ...node("a"), y: 100001 }]), false);
  assert.equal(valid([{ ...node("a"), people: Array.from({ length: 21 }, () => "Person") }]), false);
  assert.equal(valid([{ ...node("a"), x: Infinity }]), false);
  assert.equal(valid([{ ...node("a"), title: "a".repeat(121) }]), false);
  assert.equal(valid([{ ...node("a"), people: ["a".repeat(101)] }]), false);
  assert.equal(valid([{ ...node("a"), description: "a".repeat(2001) }]), false);
  assert.equal(organizationChartSchema.safeParse({ version: -1, title: "Verein", nodes: [] }).success, false);
});

test("password hashes are salted and verified without accepting malformed hashes", async () => {
  const first = await hashOrganizationPassword("gemeinsam-sicher");
  const second = await hashOrganizationPassword("gemeinsam-sicher");
  assert.notEqual(first, second);
  assert.equal(first.includes("gemeinsam-sicher"), false);
  assert.ok(await verifyOrganizationPassword("gemeinsam-sicher", first));
  assert.equal(await verifyOrganizationPassword("falsch", first), false);
  assert.equal(await verifyOrganizationPassword("x", "invalid"), false);
  assert.equal(await verifyOrganizationPassword("x", first + ":extra"), false);
});

test("organization access stays separate from admin; rotation invalidates organization sessions", () => {
  const row = { password_hash: "configured", auth_version: "v1" };
  assert.equal(hasOrganizationAccess({}, row), false);
  const session = { orgAccessVersion: "v1" };
  assert.ok(hasOrganizationAccess(session, row));
  assert.equal("isAdmin" in session, false);
  assert.equal(hasOrganizationAccess(session, { ...row, auth_version: "v2" }), false);
  assert.equal(hasOrganizationAccess(session, { ...row, password_hash: null }), false);
  assert.ok(hasOrganizationAccess({ isAdmin: true }, { ...row, password_hash: null }));
});
