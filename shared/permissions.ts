export const PERMISSIONS = [
  "calendar.read", "calendar.write", "requests.read", "requests.write",
  "bfv.read", "bfv.write", "shop.read", "shop.write", "orders.read", "orders.write",
  "festivals.read", "festivals.write", "organization.manage", "users.manage",
] as const;

export type Permission = typeof PERMISSIONS[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "calendar.read": "Kalender ansehen",
  "calendar.write": "Kalender bearbeiten",
  "requests.read": "Terminanfragen ansehen",
  "requests.write": "Terminanfragen bearbeiten und freigeben",
  "bfv.read": "BFV-Import ansehen",
  "bfv.write": "BFV-Import ausführen",
  "shop.read": "Produkte und Bestellaktionen ansehen",
  "shop.write": "Produkte und Bestellaktionen bearbeiten",
  "orders.read": "Bestellungen ansehen und exportieren",
  "orders.write": "Bestellungen bearbeiten",
  "festivals.read": "Feste und Helfer ansehen",
  "festivals.write": "Feste und Helfer bearbeiten",
  "organization.manage": "Organigramm und Organigramm-Zugang verwalten",
  "users.manage": "Konten und Zugriffsrechte verwalten",
};

export interface PortalUser {
  id: string;
  name: string;
  email: string;
  fullAccess: boolean;
  permissions: Permission[];
  active: boolean;
  pending: boolean;
  createdAt: string;
}

export interface AuthState {
  authenticated: boolean;
  isAdmin: boolean;
  user: PortalUser | null;
  permissions: Permission[];
  setupRequired: boolean;
}
