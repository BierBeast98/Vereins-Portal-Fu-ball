import { useQuery } from "@tanstack/react-query";
import type { AuthState, Permission } from "@shared/permissions";

export class PortalApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function portalJson<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method, credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : typeof data?.message === "string" ? data.message : "Die Anfrage konnte nicht abgeschlossen werden. Bitte versuche es erneut.";
    throw new PortalApiError(message, response.status);
  }
  return data as T;
}

export const portalAuthQuery = {
  queryKey: ["/api/auth/check"],
  queryFn: () => portalJson<AuthState>("/api/auth/check"),
  staleTime: 0,
  refetchOnWindowFocus: true,
  retry: false,
} as const;

export const usePortalAuth = () => useQuery(portalAuthQuery);
export function hasPermission(auth: AuthState | undefined, permission: Permission): boolean {
  return Boolean(auth?.authenticated && (auth.user?.fullAccess || auth.permissions.includes(permission)));
}

export const adminDestinations: { path: string; permission: Permission }[] = [
  { path: "/admin/fields", permission: "calendar.read" },
  { path: "/admin/calendar", permission: "calendar.read" },
  { path: "/admin/training-times", permission: "calendar.read" },
  { path: "/admin/requests", permission: "requests.read" },
  { path: "/admin/bfv-import", permission: "bfv.read" },
  { path: "/admin/products", permission: "shop.read" },
  { path: "/admin/campaigns", permission: "shop.read" },
  { path: "/admin/orders", permission: "orders.read" },
  { path: "/admin/festivals", permission: "festivals.read" },
  { path: "/admin/organigramm", permission: "organization.manage" },
  { path: "/admin/users", permission: "users.manage" },
];
export function permissionForPath(path: string): Permission | undefined {
  return adminDestinations.find((item) => path === item.path || path.startsWith(`${item.path}/`))?.permission;
}
export function firstAllowedPath(auth: AuthState): string {
  return adminDestinations.find((item) => hasPermission(auth, item.permission))?.path || "/admin/settings";
}
export function allowedDestination(auth: AuthState, candidate: string | null): string {
  if (candidate === "/admin/settings") return candidate;
  const permission = candidate && permissionForPath(candidate);
  return permission && hasPermission(auth, permission) && candidate && !candidate.includes("?") && !candidate.includes("#") ? candidate : firstAllowedPath(auth);
}
