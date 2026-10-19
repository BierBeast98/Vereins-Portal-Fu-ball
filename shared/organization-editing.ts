import type { OrganizationNode } from "./organization";

export function canConnectRoles(nodes: OrganizationNode[], parentId: string, childId: string): boolean {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (!byId.has(parentId) || !byId.has(childId) || parentId === childId) return false;
  const visited = new Set<string>();
  let current: string | null = parentId;
  while (current !== null) {
    if (current === childId || visited.has(current)) return false;
    visited.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return true;
}

export function connectRoles(nodes: OrganizationNode[], parentId: string, childId: string): OrganizationNode[] {
  if (!canConnectRoles(nodes, parentId, childId)) return nodes;
  return nodes.map((node) => node.id === childId ? { ...node, parentId } : node);
}

export function removeRole(nodes: OrganizationNode[], id: string): OrganizationNode[] {
  const removed = nodes.find((node) => node.id === id);
  if (!removed) return nodes;
  return nodes.filter((node) => node.id !== id).map((node) => node.parentId === id ? { ...node, parentId: removed.parentId } : node);
}
