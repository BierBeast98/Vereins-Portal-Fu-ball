import type { NextFunction, Request, RequestHandler, Response } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";

export const SESSION_IDLE_LIMIT_MS = 30 * 60 * 1000;
export const SESSION_ABSOLUTE_LIMIT_MS = 24 * 60 * 60 * 1000;

declare module "express-session" {
  interface SessionData {
    authenticatedAt?: number;
    lastAuthenticatedActivityAt?: number;
  }
}

type SessionOptions = {
  isProduction: boolean;
  secret: string;
  store?: session.Store;
};

/** Call after successful authentication/regeneration and before session.save(). */
export function initializeSessionLifetime(req: Request): void {
  const now = Date.now();
  req.session.authenticatedAt = now;
  req.session.lastAuthenticatedActivityAt = now;
}

/** Run after express-session and before routes. A missing/expired lifetime fails closed. */
export function enforceSessionLifetime(req: Request, _res: Response, next: NextFunction): void {
  const current = req.session;
  if (!current || (!current.authUserId && !current.isAdmin && !current.orgAccessVersion)) {
    // No anonymous tracking timestamps: saveUninitialized remains effective.
    next();
    return;
  }
  const now = Date.now();
  const started = current.authenticatedAt;
  const active = current.lastAuthenticatedActivityAt;
  if (
    typeof started !== "number" || !Number.isFinite(started) ||
    typeof active !== "number" || !Number.isFinite(active) ||
    started > now || active > now || active < started ||
    now - started >= SESSION_ABSOLUTE_LIMIT_MS ||
    now - active >= SESSION_IDLE_LIMIT_MS
  ) {
    delete current.isAdmin;
    delete current.authUserId;
    delete current.authUserVersion;
    delete current.authPermissions;
    delete current.orgAccessVersion;
    delete current.authenticatedAt;
    delete current.lastAuthenticatedActivityAt;
  } else {
    current.lastAuthenticatedActivityAt = now;
  }
  next();
}

export function createPortalSession(options: SessionOptions): RequestHandler {
  function middleware(store: session.Store): RequestHandler {
    const handler = session({
      name: "tsv.sid",
      secret: options.secret,
      store,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        secure: options.isProduction,
        httpOnly: true,
        sameSite: "strict",
        maxAge: SESSION_ABSOLUTE_LIMIT_MS,
      },
    });
    return (req, res, next) => handler(req, res, (error) => {
      if (error) {
        console.error("Sitzungsspeicher: Anfrage konnte nicht verarbeitet werden.");
        return next(new Error("Sitzungsspeicher nicht verfügbar."));
      }
      next();
    });
  }
  if (options.store) return middleware(options.store);

  // Import the configured pool only when needed. Tests can inject a MemoryStore
  // without importing db.ts or creating connections to any real database.
  let pending: Promise<RequestHandler> | undefined;
  return (req, res, next) => {
    pending ??= import("./db").then(({ db }) => {
      const PostgreSQLStore = connectPgSimple(session);
      const store = new PostgreSQLStore({
        pool: db.$client,
        tableName: "portal_sessions",
        createTableIfMissing: true,
        // Omit schemaName deliberately: respect the configured connection search_path.
        errorLog: () => console.error("Sitzungsspeicher: Datenbankoperation fehlgeschlagen."),
      });
      return middleware(store);
    });
    pending.then((handler) => handler(req, res, next)).catch(() => {
      // Never pass connection strings, SQL, or driver errors to logs or clients.
      console.error("Sitzungsspeicher konnte nicht initialisiert werden.");
      next(new Error("Sitzungsspeicher nicht verfügbar."));
    });
  };
}
