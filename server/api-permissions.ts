import type { RequestHandler } from "express";
import type { Permission } from "../shared/permissions";
import { requestHasPermission } from "./admin-auth";

/** Catalogs, public forms and the separate organization password gate stay public. */
export function requiredApiPermission(method: string, path: string): Permission | null {
  // Express routes accept mixed case and trailing slashes by default.
  path = path.toLowerCase().replace(/\/+$/, "");
  method = method.toUpperCase();
  const read = method === "GET" || method === "HEAD";
  if (/^\/api\/admin\/users(?:\/|$)/.test(path)) return "users.manage";
  if (/^\/api\/admin\/organization(?:\/|$)/.test(path)) return "organization.manage";
  if (/^\/api\/admin\/event-requests(?:\/|$)/.test(path)) return read ? "requests.read" : "requests.write";
  if (/^\/api\/admin\/festival(?:s|-[^/]+)(?:\/|$)/.test(path)) return read ? "festivals.read" : "festivals.write";
  if (/^\/api\/calendar\/(?:bfv-import|field-mappings|fix-away-game-fields)(?:\/|$)/.test(path)) return read ? "bfv.read" : "bfv.write";
  if (/^\/api\/calendar(?:\/|$)/.test(path)) return read ? "calendar.read" : "calendar.write";
  if (/^\/api\/(?:products|campaigns)(?:\/|$)/.test(path) && !read) {
    // Campaign password checks belong to the public ordering flow.
    if (method === "POST" && /^\/api\/campaigns\/[^/]+\/verify-password$/.test(path)) return null;
    return "shop.write";
  }
  if (/^\/api\/orders(?:\/|$)/.test(path)) {
    if (method === "POST" && path === "/api/orders") return null;
    return read ? "orders.read" : "orders.write";
  }
  if (path === "/api/images/upload") return "shop.write";
  // Fail closed for new administration endpoints until explicitly classified.
  if (/^\/api\/admin(?:\/|$)/.test(path)) return "users.manage";
  return null;
}

export const enforceApiPermissions: RequestHandler = (req, res, next) => {
  if (req.method === "OPTIONS") return next();
  const permission = requiredApiPermission(req.method, req.originalUrl.split("?")[0]);
  if (permission && !requestHasPermission(req, permission)) {
    return void res.status(req.session.authUserId ? 403 : 401).json({ error: req.session.authUserId ? "Für diesen Bereich fehlen dir die erforderlichen Rechte." : "Bitte anmelden." });
  }
  next();
};
