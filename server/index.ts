import { config } from "dotenv";
import { join } from "path";

config({ path: join(process.cwd(), ".env") });

import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { db } from "./db";
import { sql } from "drizzle-orm";

const app = express();
const httpServer = createServer(app);
const isProduction = process.env.NODE_ENV === "production";

// Hostinger läuft hinter einem Reverse-Proxy (HTTPS → HTTP intern).
// trust proxy = 1 sorgt dafür, dass Express req.secure korrekt erkennt,
// damit Session-Cookies mit secure:true gesetzt werden.
if (isProduction) {
  app.set("trust proxy", 1);
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

declare module "express-session" {
  interface SessionData {
    isAdmin: boolean;
  }
}

// ============================================
// SECURITY HEADERS (Helmet)
// ============================================
app.use(
  helmet({
    // Content Security Policy – erlaubt nur eigene Ressourcen + Google Fonts
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Vite/React benötigt dies in dev
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https://storage.googleapis.com"],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    // Verhindert Clickjacking (Website kann nicht in iFrame eingebettet werden)
    frameguard: { action: "deny" },
    // Erzwingt HTTPS (6 Monate)
    hsts: isProduction ? { maxAge: 15552000, includeSubDomains: true } : false,
    // Versteckt "X-Powered-By: Express" Header
    hidePoweredBy: true,
    // Verhindert MIME-Type Sniffing
    noSniff: true,
    // XSS-Filter im Browser aktivieren
    xssFilter: true,
    // Referrer nur an gleiche Domain
    referrerPolicy: { policy: "same-origin" },
  })
);

// ============================================
// SESSION
// ============================================
const sessionSecret = process.env.SESSION_SECRET;
if (isProduction && !sessionSecret) {
  console.error("FATAL: SESSION_SECRET muss in der Produktionsumgebung gesetzt sein!");
  process.exit(1);
}

app.use(
  session({
    secret: sessionSecret || "tsv-dev-secret-not-for-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      // Nur über HTTPS in Produktion – verhindert Cookie-Diebstahl über HTTP
      secure: isProduction,
      // JavaScript kann das Cookie nicht lesen – schützt vor XSS
      httpOnly: true,
      // Cookie gilt nur für gleiche Domain
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 24 Stunden
    },
  })
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
    // Maximal 1MB JSON-Body – verhindert DoS durch riesige Payloads
    limit: "1mb",
  }),
);

app.use(express.urlencoded({ extended: false, limit: "1mb" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      // In Produktion keine Response-Daten loggen (Datenschutz)
      if (!isProduction && capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // DB migration: add target_event_id column if not present
  try {
    await db.execute(sql`ALTER TABLE event_requests ADD COLUMN IF NOT EXISTS target_event_id VARCHAR(36)`);
    log("DB migration: target_event_id column ensured", "migration");
  } catch (err) {
    console.error("[migration] Failed to add target_event_id column:", err);
  }

  // DB migration: create product_images table for in-database image storage
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS product_images (
        id VARCHAR(36) NOT NULL,
        variant VARCHAR(20) NOT NULL,
        content_type VARCHAR(100) NOT NULL,
        data BYTEA NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        CONSTRAINT unique_product_image_variant UNIQUE (id, variant)
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_product_image_id ON product_images (id)`);
    log("DB migration: product_images table ensured", "migration");
  } catch (err) {
    console.error("[migration] Failed to ensure product_images table:", err);
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    // In Produktion keine internen Fehlermeldungen nach außen geben
    const message = isProduction
      ? (status < 500 ? err.message : "Internal Server Error")
      : (err.message || "Internal Server Error");

    if (!isProduction) {
      console.error("Internal Server Error:", err);
    } else {
      console.error(`[${status}] ${req?.path ?? ""}: ${err.message}`);
    }

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  if (isProduction) {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
    if (isProduction) {
      log("🔒 Security: Helmet, Secure Cookies, Rate Limiting aktiv");
    }
  });
})();
