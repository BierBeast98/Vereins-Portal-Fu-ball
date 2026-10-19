import test from "node:test";
import assert from "node:assert/strict";
import type { OrganizationNode } from "./organization";
import { collapseOrganizationAtLevel, organizationDepths, revealOrganizationRole, visibleOrganizationNodes } from "./organization-visibility";

const role = (id: string, parentId: string | null = null): OrganizationNode => ({ id, parentId, title: id, people: [id], description: "Aufgaben", color: "green", x: 40, y: 40 });
const nodes = [role("root"), role("board2", "root"), role("football", "board2"), role("youth", "football"), role("board3", "root"), role("triathlon", "board3"), role("treasurer", "root"), role("cashier", "treasurer"), role("second-root"), role("independent", "second-root")];
const ids = (items: OrganizationNode[]) => items.map(node => node.id);

test("level selection retains all roots and board roles, independent of node order", () => {
  const depths = organizationDepths([...nodes].reverse());
  assert.equal(depths.get("root"), 1);
  assert.equal(depths.get("board2"), 2);
  assert.equal(depths.get("youth"), 4);
  assert.equal(depths.get("second-root"), 1);
  assert.deepEqual(ids(visibleOrganizationNodes(nodes, collapseOrganizationAtLevel(nodes, 2))), ["root", "board2", "board3", "treasurer", "second-root", "independent"]);
  assert.deepEqual(ids(visibleOrganizationNodes(nodes, collapseOrganizationAtLevel(nodes, 1))), ["root", "second-root"]);
});

test("collapsing one board role hides its descendants without hiding siblings or changing saved data", () => {
  const before = JSON.stringify(nodes);
  const visible = visibleOrganizationNodes(nodes, new Set(["board2"]));
  assert.ok(visible.some(node => node.id === "board2"));
  assert.ok(!visible.some(node => node.id === "football" || node.id === "youth"));
  assert.ok(visible.some(node => node.id === "triathlon"));
  assert.ok(visible.some(node => node.id === "cashier"));
  assert.equal(JSON.stringify(nodes), before);
  assert.equal(visible.find(node => node.id === "board2"), nodes[1], "view retains the original node objects");
});

test("expanding from a two-level preset reveals one level while retaining nested collapse state", () => {
  const collapsed = collapseOrganizationAtLevel(nodes, 2);
  collapsed.delete("board2");
  assert.ok(visibleOrganizationNodes(nodes, collapsed).some(node => node.id === "football"));
  assert.ok(!visibleOrganizationNodes(nodes, collapsed).some(node => node.id === "youth"));
  collapsed.delete("football");
  assert.ok(visibleOrganizationNodes(nodes, collapsed).some(node => node.id === "youth"));
  collapsed.add("board2");
  assert.ok(!visibleOrganizationNodes(nodes, collapsed).some(node => node.id === "youth"));
  collapsed.delete("board2");
  assert.ok(visibleOrganizationNodes(nodes, collapsed).some(node => node.id === "youth"));
});

test("revealing a new descendant opens its ancestor path and leaves unrelated branches closed", () => {
  const collapsed = collapseOrganizationAtLevel(nodes, 1);
  const opened = revealOrganizationRole(nodes, collapsed, "youth");
  assert.ok(visibleOrganizationNodes(nodes, opened).some(node => node.id === "youth"));
  assert.ok(!visibleOrganizationNodes(nodes, opened).some(node => node.id === "triathlon"));
  assert.ok(collapsed.has("root"), "input collapse state is not mutated");
});

test("showing all, empty charts and removed roles are handled without losing data", () => {
  assert.deepEqual(visibleOrganizationNodes(nodes, new Set()), nodes);
  assert.deepEqual(visibleOrganizationNodes(nodes, new Set(["removed-role"])), nodes);
  assert.equal(organizationDepths([]).size, 0);
  assert.deepEqual(visibleOrganizationNodes([], new Set()), []);
  assert.equal(collapseOrganizationAtLevel([], 2).size, 0);
});
