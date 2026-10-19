import { z } from "zod";

export const organizationNodeSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().trim().min(1).max(120),
  people: z.array(z.string().trim().min(1).max(100)).max(20),
  description: z.string().max(2000),
  color: z.enum(["green", "blue", "orange", "purple", "slate"]),
  parentId: z.string().min(1).max(100).nullable(),
  x: z.number().finite().min(0).max(100000),
  y: z.number().finite().min(0).max(100000),
}).strict();

export const organizationChartSchema = z.object({
  version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1),
  title: z.string().trim().min(1).max(120),
  nodes: z.array(organizationNodeSchema).max(200),
}).strict().superRefine(({ nodes }, ctx) => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (byId.size !== nodes.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes"], message: "Knoten-IDs müssen eindeutig sein." });
  }
  nodes.forEach((node, index) => {
    if (node.parentId !== null && !byId.has(node.parentId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes", index, "parentId"], message: "Übergeordneter Knoten existiert nicht." });
    }
    const visited = new Set<string>([node.id]);
    let current = node.parentId;
    while (current !== null && byId.has(current)) {
      if (visited.has(current)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes", index, "parentId"], message: "Das Organigramm darf keine Kreise enthalten." });
        break;
      }
      visited.add(current);
      current = byId.get(current)!.parentId;
    }
  });
});

export type OrganizationNode = z.infer<typeof organizationNodeSchema>;
export type OrganizationChart = z.infer<typeof organizationChartSchema>;
