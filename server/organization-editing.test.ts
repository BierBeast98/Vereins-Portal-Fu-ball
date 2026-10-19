import { test } from "node:test";
import assert from "node:assert/strict";
import { canConnectRoles, connectRoles, removeRole } from "../shared/organization-editing";
import type { OrganizationNode } from "../shared/organization";

const role = (id: string, parentId: string | null = null): OrganizationNode => ({ id, parentId, title: id, people: [], description: "", color: "green", x: 40, y: 40 });

test("connecting roles replaces the old parent and preserves their positions", () => {
  const nodes = [role("a"), role("b"), role("c", "a")];
  const result = connectRoles(nodes, "b", "c");
  assert.equal(result[2].parentId, "b");
  assert.equal(result[2].x, nodes[2].x);
  assert.equal(nodes[2].parentId, "a");
});

test("self-connections, ancestor cycles and missing roles leave the chart unchanged", () => {
  const nodes = [role("a"), role("b", "a"), role("c", "b")];
  for (const [parent, child] of [["a", "a"], ["c", "a"], ["c", "b"], ["missing", "a"], ["a", "missing"]]) {
    assert.equal(canConnectRoles(nodes, parent, child), false);
    assert.equal(connectRoles(nodes, parent, child), nodes);
  }
});

test("deleting a role preserves descendants and reconnects its children", () => {
  const nodes = [role("a"), role("b", "a"), role("c", "b"), role("d", "c")];
  assert.deepEqual(removeRole(nodes, "b").map(({ id, parentId }) => ({ id, parentId })), [
    { id: "a", parentId: null }, { id: "c", parentId: "a" }, { id: "d", parentId: "c" },
  ]);
  assert.equal(removeRole(nodes, "a").find((node) => node.id === "b")?.parentId, null);
});
