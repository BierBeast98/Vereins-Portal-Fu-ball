import type { OrganizationNode } from "./organization";

/** Level 1 contains every top-level role, independent of the node order. */
export function organizationDepths(nodes: OrganizationNode[]): Map<string, number> {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const depths = new Map<string, number>();
  for (const node of nodes) {
    const path: string[] = [];
    const visited = new Set<string>();
    let current: OrganizationNode | undefined = node;
    while (current && !depths.has(current.id) && !visited.has(current.id)) {
      visited.add(current.id);
      path.push(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    let depth = current ? depths.get(current.id) ?? 0 : 0;
    for (let index = path.length - 1; index >= 0; index--) depths.set(path[index], ++depth);
  }
  return depths;
}

/** Closing deeper branches too makes an individual expansion reveal one level at a time. */
export function collapseOrganizationAtLevel(nodes: OrganizationNode[], level: number): Set<string> {
  const depths = organizationDepths(nodes);
  const parents = new Set(nodes.map(node => node.parentId).filter((id): id is string => id !== null));
  return new Set(nodes.filter(node => parents.has(node.id) && (depths.get(node.id) ?? 1) >= level).map(node => node.id));
}

export function visibleOrganizationNodes(nodes: OrganizationNode[], collapsed: ReadonlySet<string>): OrganizationNode[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  return nodes.filter(node => {
    const visited = new Set<string>([node.id]);
    let parentId = node.parentId;
    while (parentId !== null) {
      if (collapsed.has(parentId) || visited.has(parentId)) return false;
      visited.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    return true;
  });
}

/** Reveal a newly added role without opening unrelated branches. */
export function revealOrganizationRole(nodes: OrganizationNode[], collapsed: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(collapsed);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const visited = new Set<string>();
  let parentId = byId.get(id)?.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    next.delete(parentId);
    parentId = byId.get(parentId)?.parentId;
  }
  return next;
}
