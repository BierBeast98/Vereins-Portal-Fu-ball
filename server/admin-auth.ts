import type { Express, Request, RequestHandler, Response } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { verifyPassword } from "./passwords";
import { initializeSessionLifetime } from "./session-config";
import type { AuthState } from "../shared/permissions";
import {
  PortalUserError, changePortalUserPassword, createPortalUser, createPortalUserSchema,
  getPortalUserByEmail, getPortalUserById, hasPortalUsers, initializePortalUsers,
  listPortalUsers, portalLoginSchema, portalSetupSchema, requestHasPermission,
  portalRegistrationSchema, registerPendingPortalUser,
  setupFirstPortalUser, updatePortalUser, updatePortalUserSchema, type PortalUserRecord,
} from "./portal-users";

export { requestHasPermission } from "./portal-users";

interface AdminCredentials {
  getAdminPassword(): Promise<string | null>;
}

function clearAccount(req: Request): void {
  delete req.session.isAdmin;
  delete req.session.authUserId;
  delete req.session.authUserVersion;
  delete req.session.authPermissions;
  delete req.portalUser;
}

async function saveSession(req: Request): Promise<void> {
  await new Promise<void>((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
}

async function authenticate(req: Request, account: PortalUserRecord): Promise<void> {
  const orgAccessVersion = req.session.orgAccessVersion;
  await new Promise<void>((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
  req.session.authUserId = account.user.id;
  req.session.authUserVersion = account.version;
  req.session.authPermissions = account.user.permissions;
  req.session.isAdmin = account.user.fullAccess;
  req.portalUser = account.user;
  if (orgAccessVersion) req.session.orgAccessVersion = orgAccessVersion;
  initializeSessionLifetime(req);
  await saveSession(req);
}

function failure(res: Response, error: unknown, message: string): void {
  if (error instanceof PortalUserError) { res.status(error.status).json({ error: error.message }); return; }
  if (error instanceof z.ZodError) { res.status(400).json({ error: "Bitte Eingaben und Passwortlänge (12 bis 200 Zeichen) prüfen." }); return; }
  // Drizzle wraps PostgreSQL constraint errors; inspect only the bounded cause chain.
  let cause = error;
  for (let depth = 0; depth < 4 && typeof cause === "object" && cause !== null; depth++) {
    if ("code" in cause && cause.code === "23505") {
      res.status(409).json({ error: "Diese E-Mail-Adresse wird bereits verwendet." }); return;
    }
    cause = "cause" in cause ? cause.cause : null;
  }
  res.status(500).json({ error: message });
}

export function createAdminAuth(credentials: AdminCredentials) {
  const validateAdminSession: RequestHandler = async (req, _res, next) => {
    try {
      // Legacy password-only sessions deliberately do not survive account rollout.
      if (!req.session.authUserId) { clearAccount(req); return next(); }
      const account = await getPortalUserById(req.session.authUserId);
      if (!account || !account.user.active || account.user.pending || account.version !== req.session.authUserVersion) {
        clearAccount(req); return next();
      }
      req.session.isAdmin = account.user.fullAccess;
      req.session.authPermissions = account.user.permissions;
      req.portalUser = account.user;
      next();
    } catch (error) { next(error); }
  };

  // Legacy route wrapper means "signed in"; route-specific permissions are enforced separately.
  const requireAdmin: RequestHandler = (req, res, next) => {
    if (!req.portalUser || !req.session.authUserId) return void res.status(401).json({ error: "Bitte anmelden." });
    next();
  };

  const requireUserManagement: RequestHandler = (req, res, next) => {
    if (!requestHasPermission(req, "users.manage")) return void res.status(req.session.authUserId ? 403 : 401).json({ error: "Keine Berechtigung zur Kontoverwaltung." });
    next();
  };

  async function register(app: Express, loginLimiter: RequestHandler): Promise<void> {
    await initializePortalUsers();

    const registrationLimiter = rateLimit({
      windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false,
      message: { error: "Zu viele Registrierungen. Bitte später erneut versuchen." },
    });
    app.post("/api/auth/register", registrationLimiter, async (req, res) => {
      try {
        await registerPendingPortalUser(portalRegistrationSchema.parse(req.body));
        res.status(201).json({ success: true, pending: true });
      } catch (error) { failure(res, error, "Registrierung fehlgeschlagen."); }
    });

    app.post("/api/auth/setup", loginLimiter, async (req, res) => {
      try {
        const data = portalSetupSchema.parse(req.body);
        if (await hasPortalUsers()) return res.status(409).json({ error: "Die Ersteinrichtung wurde bereits abgeschlossen." });
        const legacy = await credentials.getAdminPassword();
        if (!await verifyPassword(data.bootstrapPassword, legacy)) return res.status(401).json({ error: "Einrichtungsberechtigung konnte nicht bestätigt werden." });
        const account = await setupFirstPortalUser({ name: data.name, email: data.email, password: data.password }, legacy!);
        await authenticate(req, account);
        res.status(201).json({ success: true, user: account.user });
      } catch (error) { failure(res, error, "Ersteinrichtung fehlgeschlagen."); }
    });

    app.post("/api/auth/login", loginLimiter, async (req, res) => {
      try {
        const data = portalLoginSchema.parse(req.body);
        const account = await getPortalUserByEmail(data.email);
        if (!account || !account.user.active || account.user.pending || !await verifyPassword(data.password, account.passwordHash)) {
          return res.status(401).json({ error: "E-Mail oder Passwort ist falsch." });
        }
        const current = await getPortalUserById(account.user.id);
        if (!current || !current.user.active || current.user.pending || current.version !== account.version) {
          return res.status(401).json({ error: "Der Zugang wurde geändert. Bitte erneut anmelden." });
        }
        await authenticate(req, current);
        res.json({ success: true });
      } catch (error) { failure(res, error, "Login fehlgeschlagen."); }
    });

    app.post("/api/auth/logout", (req, res) => {
      req.session.destroy((error) => {
        if (error) return void res.status(500).json({ error: "Logout fehlgeschlagen." });
        res.clearCookie("tsv.sid", { path: "/", httpOnly: true, sameSite: "strict" });
        res.json({ success: true });
      });
    });

    app.get("/api/auth/check", async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      const user = req.portalUser ?? null;
      const state: AuthState = { authenticated: !!user, isAdmin: user?.fullAccess === true,
        user, permissions: user?.permissions ?? [], setupRequired: !await hasPortalUsers() };
      res.json(state);
    });

    app.post("/api/auth/change-password", requireAdmin, loginLimiter, async (req, res) => {
      try {
        const data = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(12).max(200) }).strict().parse(req.body);
        const account = await getPortalUserById(req.session.authUserId!);
        if (!account || account.version !== req.session.authUserVersion || !await verifyPassword(data.currentPassword, account.passwordHash)) {
          return res.status(401).json({ error: "Aktuelles Passwort ist falsch oder der Zugang wurde geändert." });
        }
        const updated = await changePortalUserPassword(account.user.id, account.version, account.passwordHash, data.newPassword);
        if (!updated) return res.status(409).json({ error: "Der Zugang wurde inzwischen geändert. Bitte erneut anmelden." });
        await authenticate(req, updated);
        res.json({ success: true });
      } catch (error) { failure(res, error, "Passwortänderung fehlgeschlagen."); }
    });

    app.get("/api/admin/users", requireAdmin, requireUserManagement, async (_req, res) => {
      res.setHeader("Cache-Control", "no-store");
      try { res.json(await listPortalUsers()); }
      catch (error) { failure(res, error, "Konten konnten nicht geladen werden."); }
    });

    app.post("/api/admin/users", requireAdmin, requireUserManagement, async (req, res) => {
      try { res.status(201).json(await createPortalUser(createPortalUserSchema.parse(req.body))); }
      catch (error) { failure(res, error, "Konto konnte nicht angelegt werden."); }
    });

    app.patch("/api/admin/users/:id", requireAdmin, requireUserManagement, async (req, res) => {
      try {
        const id = z.string().uuid().parse(req.params.id);
        res.json(await updatePortalUser(id, updatePortalUserSchema.parse(req.body)));
      } catch (error) { failure(res, error, "Konto konnte nicht geändert werden."); }
    });
  }

  return { validateAdminSession, requireAdmin, register };
}
