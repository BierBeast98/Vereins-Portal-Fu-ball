import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { dbStorage, migrateStoredPasswords } from "./dbStorage";
import { createAdminAuth } from "./admin-auth";
import { enforceApiPermissions } from "./api-permissions";
import { verifyPassword } from "./passwords";
import rateLimit from "express-rate-limit";
import { parseStartEndInBerlin } from "./dateTimeBerlin";
import {
  insertProductSchema,
  insertCampaignSchema,
  insertOrderSchema,
  insertCalendarEventSchema,
  insertFieldMappingSchema,
  insertEventRequestSchema,
  EVENT_REQUEST_STATUSES,
  FIELDS,
  insertFestivalSchema,
  insertFestivalStationSchema,
  insertFestivalShiftSchema,
  insertFestivalSignupSchema,
  bulkCreateShiftsSchema,
  verifyFestivalPasswordSchema,
} from "@shared/schema";
import { z } from "zod";
import { sendOrderConfirmation, sendEventRequestNotification } from "./email";
import type { Team, InsertCalendarEvent, Field, EventRequestStatus } from "@shared/schema";
import multer from "multer";
import { processAndUploadImage, serveImage } from "./imageUpload";
import { createEventRequestWithValidation, approveEventRequest, rejectEventRequest, checkEventRequestConflicts } from "./eventRequestService";
import { registerOrganizationRoutes } from "./organization";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Helper to add hours to a time string
function addHours(time: string, hours: number): string {
  const [h, m] = time.split(":").map(Number);
  const newHour = (h + hours) % 24;
  return `${newHour.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

const adminAuth = createAdminAuth(dbStorage);
const { requireAdmin } = adminAuth;

// ============================================
// RATE LIMITING
// ============================================

// Login: max 10 Versuche pro 15 Minuten pro IP → Brute-Force-Schutz
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Minuten
  max: 10,
  message: { error: "Zu viele Login-Versuche. Bitte warte 15 Minuten." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Erfolgreiche Logins zählen nicht mit
});

// API allgemein: max 200 Anfragen pro Minute pro IP → DoS-Schutz
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 Minute
  max: 200,
  message: { error: "Zu viele Anfragen. Bitte warte kurz." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Kampagnen-Passwort: max 20 Versuche pro 15 Minuten pro IP → Brute-Force-Schutz
const campaignPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Zu viele Versuche. Bitte warte 15 Minuten." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Allgemeines Rate Limiting für alle API-Endpunkte
  app.use("/api/", apiLimiter);
  await migrateStoredPasswords();
  app.use("/api/", adminAuth.validateAdminSession);
  app.use("/api/", enforceApiPermissions);
  await adminAuth.register(app, loginLimiter);
  await registerOrganizationRoutes(app);

  // Products CRUD (protected)
  app.get("/api/products", async (req, res) => {
    try {
      const products = await dbStorage.getAllProducts();
      res.json(products);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.get("/api/products/:id", async (req, res) => {
    try {
      const product = await dbStorage.getProduct(req.params.id);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch product" });
    }
  });

  app.post("/api/products", requireAdmin, async (req, res) => {
    try {
      const data = insertProductSchema.parse(req.body);
      const product = await dbStorage.createProduct(data);
      res.status(201).json(product);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error("[POST /api/products] failed:", error);
      res.status(500).json({ error: "Failed to create product", detail: message });
    }
  });

  app.patch("/api/products/:id", requireAdmin, async (req, res) => {
    try {
      const data = insertProductSchema.partial().parse(req.body);
      const product = await dbStorage.updateProduct(req.params.id as string, data);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update product" });
    }
  });

  app.delete("/api/products/:id", requireAdmin, async (req, res) => {
    try {
      const deleted = await dbStorage.deleteProduct(req.params.id as string);
      if (!deleted) {
        return res.status(404).json({ error: "Product not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete product" });
    }
  });

  // Campaigns CRUD
  app.get("/api/campaigns", async (req, res) => {
    try {
      const campaigns = await dbStorage.getAllCampaigns();
      res.json(campaigns);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch campaigns" });
    }
  });

  app.get("/api/campaigns/active", async (req, res) => {
    try {
      const campaigns = await dbStorage.getActiveCampaigns();
      res.json(campaigns);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch active campaigns" });
    }
  });

  // ============================================
  // PUBLIC CALENDAR / EVENT REQUESTS (no admin auth)
  // ============================================

  // Read-only calendar events for public landing page (fields widget)
  app.get("/api/public/calendar/fields", async (req, res) => {
    try {
      const { startDate, endDate, field } = req.query;
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "Start- und Enddatum erforderlich" });
      }

      let events;
      if (field) {
        events = await dbStorage.getCalendarEventsByField(field as string, startDate as string, endDate as string);
      } else {
        events = await dbStorage.getCalendarEventsByDateRange(startDate as string, endDate as string);
      }

      // Pending event requests als ausgegraut anzeigen
      const pendingRequests = await dbStorage.listEventRequests({
        status: "pending",
        fromDate: (startDate as string) + "T00:00:00",
        toDate: (endDate as string) + "T23:59:59",
      });

      const pendingEvents = pendingRequests
        .filter((r) => !field || r.pitch === field)
        .map((r) => {
          const { date, startTime, endTime } = parseStartEndInBerlin(r.startAt, r.endAt);
          return {
            id: r.id,
            title: r.title,
            type: "training" as const,
            team: r.team,
            field: r.pitch,
            date,
            startTime,
            endTime,
            bfvImported: false,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            isPending: true,
          };
        });

      res.json([...events, ...pendingEvents]);
    } catch (error) {
      console.error("Error loading public calendar events:", error);
      res.status(500).json({ error: "Termine konnten nicht geladen werden" });
    }
  });

  // Create training request from landing page
  app.post("/api/public/event-requests", async (req, res) => {
    try {
      const data = insertEventRequestSchema.parse(req.body);
      const { request } = await createEventRequestWithValidation(data);

      // Admin per E-Mail benachrichtigen (nur beim ersten Termin einer Serie)
      sendEventRequestNotification(request).catch((err) => {
        console.error("Admin-Benachrichtigung fehlgeschlagen:", err);
      });

      res.status(201).json(request);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating event request:", error);
      res.status(500).json({ error: "Vorschlag konnte nicht erstellt werden" });
    }
  });

  app.get("/api/campaigns/:id", async (req, res) => {
    try {
      const campaign = await dbStorage.getCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      res.json(campaign);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch campaign" });
    }
  });

  // Kampagnen-Passwort prüfen (für Bestell-Gate vor dem Formular)
  app.post("/api/campaigns/:id/verify-password", campaignPasswordLimiter, async (req, res) => {
    try {
      const { password } = req.body ?? {};
      if (typeof password !== "string" || password.length === 0) {
        return res.status(400).json({ error: "Passwort erforderlich" });
      }
      const stored = await dbStorage.getCampaignPassword(req.params.id as string);
      if (stored === null) {
        return res.status(400).json({ error: "Diese Kampagne ist nicht passwortgeschützt" });
      }
      if (await verifyPassword(password, stored)) {
        return res.json({ success: true });
      }
      // Kleine Verzögerung bei falschem Passwort (Timing-Angriff)
      await new Promise((r) => setTimeout(r, 300));
      return res.status(401).json({ error: "Falsches Passwort" });
    } catch (error) {
      console.error("[POST /api/campaigns/:id/verify-password] failed:", error);
      res.status(500).json({ error: "Prüfung fehlgeschlagen" });
    }
  });

  app.post("/api/campaigns", requireAdmin, async (req, res) => {
    try {
      const data = insertCampaignSchema.parse(req.body);
      const campaign = await dbStorage.createCampaign(data);
      res.status(201).json(campaign);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create campaign" });
    }
  });

  app.patch("/api/campaigns/:id", requireAdmin, async (req, res) => {
    try {
      const data = insertCampaignSchema.partial().parse(req.body);
      const campaign = await dbStorage.updateCampaign(req.params.id as string, data);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      res.json(campaign);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update campaign" });
    }
  });

  app.delete("/api/campaigns/:id", requireAdmin, async (req, res) => {
    try {
      const deleted = await dbStorage.deleteCampaign(req.params.id as string);
      if (!deleted) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete campaign" });
    }
  });

  // Orders (admin only for viewing)
  app.get("/api/orders", requireAdmin, async (req, res) => {
    try {
      const orders = await dbStorage.getAllOrders();
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.get("/api/orders/campaign/:campaignId", requireAdmin, async (req, res) => {
    try {
      const orders = await dbStorage.getOrdersByCampaign(req.params.campaignId as string);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.post("/api/orders", campaignPasswordLimiter, async (req, res) => {
    try {
      const data = insertOrderSchema.parse(req.body);

      // Passwortschutz: Wenn die Kampagne ein Passwort hat, muss es bei der Bestellung mitkommen und stimmen
      const campaignPassword = await dbStorage.getCampaignPassword(data.campaignId);
      if (campaignPassword !== null) {
        if (!data.campaignPassword || !await verifyPassword(data.campaignPassword, campaignPassword)) {
          return res.status(401).json({ error: "Bestellungs-Passwort fehlt oder ist falsch" });
        }
      }

      const order = await dbStorage.createOrder(data);

      // Send confirmation email (don't wait for it, don't fail if it fails)
      sendOrderConfirmation(order).catch((err) => {
        console.error("E-Mail-Versand fehlgeschlagen:", err);
      });

      res.status(201).json(order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("[POST /api/orders] failed:", error);
      res.status(500).json({ error: "Failed to create order" });
    }
  });

  app.delete("/api/orders/:id", requireAdmin, async (req, res) => {
    try {
      const deleted = await dbStorage.deleteOrder(req.params.id as string);
      if (!deleted) {
        return res.status(404).json({ error: "Order not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("[DELETE /api/orders/:id] failed:", error);
      res.status(500).json({ error: "Failed to delete order" });
    }
  });

  // Excel Export (admin only)
  app.get("/api/orders/export/:campaignId", requireAdmin, async (req, res) => {
    try {
      const campaignId = req.params.campaignId as string;
      const orders = await dbStorage.getOrdersByCampaign(campaignId);
      const campaign = await dbStorage.getCampaign(campaignId);

      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Create CSV content (Excel-compatible)
      const headers = [
        "Bestellnr",
        "Vorname",
        "Nachname",
        "E-Mail",
        "Produkt",
        "Kategorie",
        "Größe",
        "Initialien",
        "Anzahl",
        "Einzelpreis",
        "Gesamtpreis",
        "Bestelldatum",
      ];

      const rows: string[][] = [];

      orders.forEach((order) => {
        order.items.forEach((item) => {
          rows.push([
            order.id.slice(0, 8),
            order.firstName,
            order.lastName,
            order.email,
            item.productName,
            item.category,
            item.size,
            item.withInitials ? item.initialsText || "" : "-",
            item.quantity.toString(),
            item.unitPrice.toFixed(2).replace(".", ","),
            item.totalPrice.toFixed(2).replace(".", ","),
            new Date(order.createdAt).toLocaleDateString("de-DE"),
          ]);
        });
      });

      // BOM for Excel UTF-8 compatibility
      const BOM = "\uFEFF";
      const csvContent =
        BOM +
        headers.join(";") +
        "\n" +
        rows.map((row) => row.map((cell) => `"${cell}"`).join(";")).join("\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="bestellungen-${campaign.name.replace(/[^a-zA-Z0-9]/g, "_")}.csv"`
      );
      res.send(csvContent);
    } catch (error) {
      res.status(500).json({ error: "Failed to export orders" });
    }
  });

  // ============================================
  // PLANNING MODULE - Calendar Events (Admin only)
  // ============================================

  // Initialize default field mappings on startup
  dbStorage.initializeDefaultFieldMappings().catch(console.error);

  // Get all calendar events (from database)
  app.get("/api/calendar/events", requireAdmin, async (req, res) => {
    try {
      const { startDate, endDate, field, team, type } = req.query;
      let events;

      if (startDate && endDate) {
        if (field) {
          events = await dbStorage.getCalendarEventsByField(
            field as string,
            startDate as string,
            endDate as string
          );
        } else {
          events = await dbStorage.getCalendarEventsByDateRange(
            startDate as string,
            endDate as string
          );
        }
      } else {
        events = await dbStorage.getAllCalendarEvents();
      }

      // Additional filtering
      if (team) {
        events = events.filter((e) => e.team === team);
      }
      if (type) {
        events = events.filter((e) => e.type === type);
      }

      res.json(events);
    } catch (error) {
      console.error("Error loading calendar events:", error);
      res.status(500).json({ error: "Termine konnten nicht geladen werden" });
    }
  });

  // Get single calendar event
  app.get("/api/calendar/events/:id", requireAdmin, async (req, res) => {
    try {
      const event = await dbStorage.getCalendarEvent(req.params.id as string);
      if (!event) {
        return res.status(404).json({ error: "Termin nicht gefunden" });
      }
      res.json(event);
    } catch (error) {
      res.status(500).json({ error: "Termin konnte nicht geladen werden" });
    }
  });

  // Create calendar event
  app.post("/api/calendar/events", requireAdmin, async (req, res) => {
    try {
      const data = insertCalendarEventSchema.parse(req.body);
      const event = await dbStorage.createCalendarEvent(data);
      res.status(201).json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating calendar event:", error);
      res.status(500).json({ error: "Termin konnte nicht erstellt werden" });
    }
  });

  // Update calendar event
  app.patch("/api/calendar/events/:id", requireAdmin, async (req, res) => {
    try {
      const data = insertCalendarEventSchema.partial().parse(req.body);
      const event = await dbStorage.updateCalendarEvent(req.params.id as string, data);
      if (!event) {
        return res.status(404).json({ error: "Termin nicht gefunden" });
      }
      res.json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Termin konnte nicht aktualisiert werden" });
    }
  });

  // Delete calendar event
  app.delete("/api/calendar/events/:id", requireAdmin, async (req, res) => {
    try {
      const deleted = await dbStorage.deleteCalendarEvent(req.params.id as string);
      if (!deleted) {
        return res.status(404).json({ error: "Termin nicht gefunden" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Termin konnte nicht gelöscht werden" });
    }
  });

  // Get events by recurring group
  app.get("/api/calendar/events/recurring/:groupId", requireAdmin, async (req, res) => {
    try {
      const events = await dbStorage.getCalendarEventsByRecurringGroup(req.params.groupId as string);
      res.json(events);
    } catch (error) {
      res.status(500).json({ error: "Wiederkehrende Termine konnten nicht geladen werden" });
    }
  });

  // Update all events in recurring group
  app.patch("/api/calendar/events/recurring/:groupId", requireAdmin, async (req, res) => {
    try {
      const data = insertCalendarEventSchema.partial().parse(req.body);
      const count = await dbStorage.updateCalendarEventsByRecurringGroup(req.params.groupId as string, data);
      res.json({ updated: count });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Wiederkehrende Termine konnten nicht aktualisiert werden" });
    }
  });

  // Delete all events in recurring group
  app.delete("/api/calendar/events/recurring/:groupId", requireAdmin, async (req, res) => {
    try {
      const count = await dbStorage.deleteCalendarEventsByRecurringGroup(req.params.groupId as string);
      res.json({ deleted: count });
    } catch (error) {
      res.status(500).json({ error: "Wiederkehrende Termine konnten nicht gelöscht werden" });
    }
  });

  // Check for conflicts
  app.get("/api/calendar/conflicts", requireAdmin, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "Start- und Enddatum erforderlich" });
      }

      const events = await dbStorage.getCalendarEventsByDateRange(
        startDate as string,
        endDate as string
      );

      // Konflikt nur, wenn zwei Termine auf demselben Platz (Heimspiel/Belegung) zeitlich kollidieren. Auswärtsspiele zählen nicht.
      const conflicts: Array<{ event1: any; event2: any; reason: string }> = [];

      const isOnOurPitch = (e: { type?: string; isHomeGame?: boolean; field?: string | null }) =>
        (e.type !== "spiel" || e.isHomeGame === true) && e.field;

      for (let i = 0; i < events.length; i++) {
        for (let j = i + 1; j < events.length; j++) {
          const e1 = events[i];
          const e2 = events[j];
          if (!isOnOurPitch(e1) || !isOnOurPitch(e2)) continue;

          // Gleicher Tag, gleicher Platz, überlappende Zeiten
          if (e1.date === e2.date && e1.field === e2.field) {
            const start1 = parseInt(e1.startTime.replace(":", ""));
            const end1 = parseInt(e1.endTime.replace(":", ""));
            const start2 = parseInt(e2.startTime.replace(":", ""));
            const end2 = parseInt(e2.endTime.replace(":", ""));

            if (start1 < end2 && start2 < end1) {
              conflicts.push({
                event1: e1,
                event2: e2,
                reason: `Zeitüberschneidung auf ${e1.field}`,
              });
            }
          }
        }
      }

      res.json(conflicts);
    } catch (error) {
      res.status(500).json({ error: "Konflikte konnten nicht ermittelt werden" });
    }
  });

  // Einmalige Bereinigung: Platz bei allen Auswärtsspielen entfernen (behebt alte Import-Daten)
  app.post("/api/calendar/fix-away-game-fields", requireAdmin, async (_req, res) => {
    try {
      const updated = await dbStorage.clearFieldForAwayGames();
      res.json({ updated });
    } catch (error) {
      res.status(500).json({ error: "Bereinigung fehlgeschlagen" });
    }
  });

  // Field Mappings
  app.get("/api/calendar/field-mappings", requireAdmin, async (req, res) => {
    try {
      const mappings = await dbStorage.getAllFieldMappings();
      res.json(mappings);
    } catch (error) {
      res.status(500).json({ error: "Platzzuordnungen konnten nicht geladen werden" });
    }
  });

  app.post("/api/calendar/field-mappings", requireAdmin, async (req, res) => {
    try {
      const data = insertFieldMappingSchema.parse(req.body);
      const mapping = await dbStorage.createFieldMapping(data);
      res.status(201).json(mapping);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Platzzuordnung konnte nicht erstellt werden" });
    }
  });

  app.delete("/api/calendar/field-mappings/:id", requireAdmin, async (req, res) => {
    try {
      const deleted = await dbStorage.deleteFieldMapping(req.params.id as string);
      if (!deleted) {
        return res.status(404).json({ error: "Platzzuordnung nicht gefunden" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Platzzuordnung konnte nicht gelöscht werden" });
    }
  });

  // Calendar Export (PDF placeholder - would need a PDF library for full implementation)
  app.get("/api/calendar/export", requireAdmin, async (req, res) => {
    try {
      const { startDate, endDate, format } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "Start- und Enddatum erforderlich" });
      }

      const events = await dbStorage.getCalendarEventsByDateRange(
        startDate as string,
        endDate as string
      );

      if (format === "csv") {
        const headers = [
          "Datum",
          "Start",
          "Ende",
          "Titel",
          "Typ",
          "Mannschaft",
          "Platz",
          "Heim/Auswärts",
          "Gegner",
          "Wettbewerb",
        ];

        const rows = events.map((event) => [
          event.date,
          event.startTime,
          event.endTime,
          event.title,
          event.type,
          event.team || "",
          event.field || "",
          event.isHomeGame ? "Heim" : event.isHomeGame === false ? "Auswärts" : "",
          event.opponent || "",
          event.competition || "",
        ]);

        const BOM = "\uFEFF";
        const csvContent =
          BOM +
          headers.join(";") +
          "\n" +
          rows.map((row) => row.map((cell) => `"${cell}"`).join(";")).join("\n");

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="kalender-${startDate}-${endDate}.csv"`
        );
        res.send(csvContent);
      } else {
        res.json(events);
      }
    } catch (error) {
      res.status(500).json({ error: "Export fehlgeschlagen" });
    }
  });

  // ============================================
  // EVENT REQUESTS (Admin)
  // ============================================

  app.get("/api/admin/event-requests", requireAdmin, async (req, res) => {
    try {
      const { status, fromDate, toDate } = req.query;
      let statusFilter: EventRequestStatus | undefined;
      if (status && EVENT_REQUEST_STATUSES.includes(status as EventRequestStatus)) {
        statusFilter = status as EventRequestStatus;
      }
      const requests = await dbStorage.listEventRequests({
        status: statusFilter,
        fromDate: (fromDate as string) || undefined,
        toDate: (toDate as string) || undefined,
      });
      res.json(requests);
    } catch (error) {
      console.error("Error loading event requests:", error);
      res.status(500).json({ error: "Vorschläge konnten nicht geladen werden" });
    }
  });

  app.get("/api/admin/event-requests/:id", requireAdmin, async (req, res) => {
    try {
      const request = await dbStorage.getEventRequestById(req.params.id as string);
      if (!request) {
        return res.status(404).json({ error: "Vorschlag nicht gefunden" });
      }
      res.json(request);
    } catch (error) {
      res.status(500).json({ error: "Vorschlag konnte nicht geladen werden" });
    }
  });

  app.patch("/api/admin/event-requests/:id", requireAdmin, async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const { team: _team, ...rest } = body;
      const base = insertEventRequestSchema.partial().parse(rest);
      const patch: any = { ...base };
      if ("team" in body) patch.team = body.team === null ? null : body.team;
      if ("status" in body) {
        if (typeof body.status === "string" && !EVENT_REQUEST_STATUSES.includes(body.status as any)) {
          return res.status(400).json({ error: "Ungültiger Status" });
        }
        patch.status = body.status;
      }
      if ("adminNote" in body) {
        patch.adminNote = body.adminNote;
      }
      const updated = await dbStorage.updateEventRequest(req.params.id as string, patch);
      if (!updated) {
        return res.status(404).json({ error: "Vorschlag nicht gefunden" });
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Vorschlag konnte nicht aktualisiert werden" });
    }
  });

  app.post("/api/admin/event-requests/:id/approve", requireAdmin, async (req, res) => {
    try {
      const base = insertEventRequestSchema.partial().parse(req.body);
      const body = req.body as Record<string, unknown>;
      const { request, event } = await approveEventRequest(req.params.id as string, {
        ...base,
        adminNote: typeof body?.adminNote === "string" ? body.adminNote : undefined,
        recurringGroupId: typeof body?.recurringGroupId === "string" ? body.recurringGroupId : undefined,
        force: body?.force === true,
      });
      res.json({ request, event });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      if ((error as any).code === "CONFLICT") {
        return res.status(409).json({
          code: "CONFLICT",
          message: (error as Error).message,
          conflicts: (error as any).conflicts ?? [],
        });
      }
      console.error("Error approving event request:", error);
      res.status(500).json({ error: "Vorschlag konnte nicht freigegeben werden" });
    }
  });

  app.post("/api/admin/event-requests/:id/reject", requireAdmin, async (req, res) => {
    try {
      const status: EventRequestStatus = (req.body?.status as EventRequestStatus) ?? "rejected";
      if (!EVENT_REQUEST_STATUSES.includes(status)) {
        return res.status(400).json({ error: "Ungültiger Status" });
      }
      const updated = await rejectEventRequest(req.params.id as string, status, req.body?.adminNote);
      res.json(updated);
    } catch (error) {
      console.error("Error rejecting event request:", error);
      res.status(500).json({ error: "Vorschlag konnte nicht abgelehnt werden" });
    }
  });

  // Konflikt-Vorprüfung für Serien-Termine (Admin-Dialog), ohne etwas zu schreiben
  app.post("/api/admin/event-requests/check-conflicts", requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        items: z
          .array(
            z.object({
              id: z.string(),
              pitch: z.enum(FIELDS),
              startAt: z.string(),
              endAt: z.string(),
            })
          )
          .max(200),
      });
      const { items } = schema.parse(req.body);
      const results = await checkEventRequestConflicts(items);
      res.json({ results });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error checking event request conflicts:", error);
      res.status(500).json({ error: "Konfliktprüfung fehlgeschlagen" });
    }
  });

  // ============================================
  // IMAGE UPLOAD & SERVING
  // ============================================

  app.post("/api/images/upload", requireAdmin, upload.single("image"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Keine Bilddatei hochgeladen" });
      }

      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "image/tiff", "image/bmp"];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ error: "Ungültiges Bildformat. Erlaubt: JPG, PNG, WebP, GIF, HEIC, TIFF, BMP" });
      }

      const result = await processAndUploadImage(req.file.buffer, req.file.originalname);
      res.json(result);
    } catch (error) {
      console.error("Image upload error:", error);
      res.status(500).json({ error: "Bildupload fehlgeschlagen: " + (error as Error).message });
    }
  });

  app.get("/api/images/:filename", async (req, res) => {
    try {
      await serveImage(req.params.filename, res);
    } catch (error) {
      console.error("Image serve error:", error);
      res.status(500).json({ error: "Bild konnte nicht geladen werden" });
    }
  });

  // ============================================
  // BFV IMPORT (ICS / Scraping, 24h job + manual)
  // ============================================

  const { triggerBfvImportNow, isImportRunning, startBfvScheduler } = await import("./bfvScheduler");

  app.get("/api/calendar/bfv-import/runs", requireAdmin, async (_req, res) => {
    try {
      const runs = await dbStorage.getImportRuns(30);
      res.json(runs.map((r) => ({
        id: r.id,
        startedAt: r.startedAt?.toISOString(),
        finishedAt: r.finishedAt?.toISOString(),
        source: r.source,
        createdCount: r.createdCount,
        updatedCount: r.updatedCount,
        archivedCount: r.archivedCount,
        errors: r.errors ?? [],
        warnings: r.warnings ?? [],
      })));
    } catch (e) {
      res.status(500).json({ error: "Import-Läufe konnten nicht geladen werden" });
    }
  });

  app.get("/api/calendar/bfv-import/warnings", requireAdmin, async (req, res) => {
    try {
      const runId = req.query.runId as string | undefined;
      const list = await dbStorage.getImportWarnings(runId);
      res.json(list.map((w) => ({
        id: w.id,
        importRunId: w.importRunId,
        type: w.type,
        message: w.message,
        eventRefs: w.eventRefs,
        createdAt: w.createdAt?.toISOString(),
      })));
    } catch (e) {
      res.status(500).json({ error: "Hinweise konnten nicht geladen werden" });
    }
  });

  app.post("/api/calendar/bfv-import/run", requireAdmin, async (_req, res) => {
    try {
      const result = await triggerBfvImportNow();
      if (result.ok) {
        res.json(result);
      } else {
        res.status(400).json({ ok: false, error: result.message });
      }
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/api/calendar/bfv-import/status", requireAdmin, async (_req, res) => {
    const urls = process.env.BFV_URL ? process.env.BFV_URL.split(",").map((u: string) => u.trim()).filter(Boolean) : [];
    res.json({ running: isImportRunning(), bfvUrlConfigured: urls.length > 0, bfvUrlCount: urls.length });
  });

  app.get("/api/calendar/bfv-import/preview", requireAdmin, async (req, res) => {
    try {
      const urlParam = req.query.url as string | undefined;
      const urls = process.env.BFV_URL ? process.env.BFV_URL.split(",").map((u: string) => u.trim()).filter(Boolean) : [];
      const url = urlParam?.trim() || urls[0];
      if (!url) {
        return res.status(400).json({ error: "Keine BFV-URL angegeben oder konfiguriert." });
      }
      const { getBfvPreview } = await import("./bfvImportService");
      const result = await getBfvPreview(url);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  startBfvScheduler();

  // ============================================================
  // FESTIVALS / HELFER-SCHICHTPLANER
  // ============================================================

  /** Hilfsfunktion: Lädt Fest + Stände + Shifts + Belegungszahlen + Namen pro Shift. */
  async function loadFestivalWithDetails(festivalId: string) {
    const festival = await dbStorage.getFestival(festivalId);
    if (!festival) return null;
    const [stations, shifts, signups] = await Promise.all([
      dbStorage.getStationsByFestival(festivalId),
      dbStorage.getShiftsByFestival(festivalId),
      dbStorage.getSignupsByFestival(festivalId),
    ]);
    const namesByShift = new Map<string, string[]>();
    for (const s of signups) {
      const arr = namesByShift.get(s.shiftId) ?? [];
      arr.push(s.helperName);
      namesByShift.set(s.shiftId, arr);
    }
    return {
      festival,
      stations,
      shifts: shifts.map((shift) => {
        const names = namesByShift.get(shift.id) ?? [];
        return {
          ...shift,
          signedUpCount: names.length,
          signedUpNames: names,
        };
      }),
    };
  }

  // ---- Public: aktive Feste für Startseite ----
  app.get("/api/festivals/active", async (_req, res) => {
    try {
      const festivals = await dbStorage.getActiveFestivals();
      res.json(festivals);
    } catch (err) {
      console.error("[festivals/active]", err);
      res.status(500).json({ error: "Aktive Feste konnten nicht geladen werden" });
    }
  });

  // ---- Public: Fest-Details mit Belegungszahlen ----
  app.get("/api/festivals/:id", async (req, res) => {
    try {
      const details = await loadFestivalWithDetails(req.params.id as string);
      if (!details) {
        return res.status(404).json({ error: "Fest nicht gefunden" });
      }
      const { festival, stations, shifts } = details;
      res.json({
        ...festival,
        stations,
        shifts,
      });
    } catch (err) {
      console.error("[festivals/:id]", err);
      res.status(500).json({ error: "Fest konnte nicht geladen werden" });
    }
  });

  // ---- Public: Passwort prüfen (Rate-Limit) ----
  app.post("/api/festivals/verify-password", campaignPasswordLimiter, async (req, res) => {
    try {
      const data = verifyFestivalPasswordSchema.parse(req.body);
      const stored = await dbStorage.getFestivalPassword(data.festivalId);
      if (!stored) {
        // Kein Passwort gesetzt → immer als korrekt durchwinken
        return res.json({ success: true });
      }
      if (await verifyPassword(data.password, stored)) {
        return res.json({ success: true });
      }
      await new Promise((r) => setTimeout(r, 300));
      return res.status(401).json({ error: "Falsches Passwort" });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      console.error("[festivals/verify-password]", err);
      res.status(500).json({ error: "Passwortprüfung fehlgeschlagen" });
    }
  });

  // ---- Public: neue Helfer-Eintragung ----
  app.post("/api/festivals/:id/signups", campaignPasswordLimiter, async (req, res) => {
    try {
      const festivalId = req.params.id as string;
      const data = insertFestivalSignupSchema.parse(req.body);
      const festival = await dbStorage.getFestival(festivalId);
      if (!festival || !festival.active) {
        return res.status(404).json({ error: "Fest nicht verfügbar" });
      }
      // Passwort-Check als 2. Verteidigungslinie (Frontend-Gate ist nicht genug)
      const storedPassword = await dbStorage.getFestivalPassword(festivalId);
      if (storedPassword && !await verifyPassword(data.festivalPassword ?? "", storedPassword)) {
        return res.status(401).json({ error: "Passwort erforderlich" });
      }
      // Shift validieren: existiert, gehört zum Fest, ist nicht voll
      const shifts = await dbStorage.getShiftsByFestival(festivalId);
      const shift = shifts.find((s) => s.id === data.shiftId);
      if (!shift) {
        return res.status(404).json({ error: "Schicht nicht gefunden" });
      }
      const count = await dbStorage.countSignupsForShift(shift.id);
      if (count >= shift.requiredHelpers) {
        return res.status(409).json({ error: "Diese Schicht ist bereits voll besetzt." });
      }
      const signup = await dbStorage.createSignup({
        shiftId: data.shiftId,
        helperName: data.helperName.trim(),
        helperPhone: data.helperPhone?.trim() || undefined,
        notes: data.notes?.trim() || undefined,
      });
      res.status(201).json(signup);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      console.error("[festivals/:id/signups]", err);
      res.status(500).json({ error: "Eintragung fehlgeschlagen" });
    }
  });

  // ---- Admin: alle Feste ----
  app.get("/api/admin/festivals", requireAdmin, async (_req, res) => {
    try {
      const festivals = await dbStorage.getAllFestivals();
      res.json(festivals);
    } catch (err) {
      console.error("[admin/festivals]", err);
      res.status(500).json({ error: "Feste konnten nicht geladen werden" });
    }
  });

  // ---- Admin: Fest anlegen ----
  app.post("/api/admin/festivals", requireAdmin, async (req, res) => {
    try {
      const data = insertFestivalSchema.parse(req.body);
      const festival = await dbStorage.createFestival(data);
      res.status(201).json(festival);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      console.error("[admin/festivals POST]", err);
      res.status(500).json({ error: "Fest konnte nicht angelegt werden" });
    }
  });

  // ---- Admin: Fest aktualisieren ----
  app.patch("/api/admin/festivals/:id", requireAdmin, async (req, res) => {
    try {
      const data = insertFestivalSchema.partial().parse(req.body);
      const festival = await dbStorage.updateFestival(req.params.id as string, data);
      if (!festival) return res.status(404).json({ error: "Fest nicht gefunden" });
      res.json(festival);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      console.error("[admin/festivals PATCH]", err);
      res.status(500).json({ error: "Fest konnte nicht aktualisiert werden" });
    }
  });

  // ---- Admin: Fest löschen (kaskadierend) ----
  app.delete("/api/admin/festivals/:id", requireAdmin, async (req, res) => {
    try {
      const ok = await dbStorage.deleteFestival(req.params.id as string);
      if (!ok) return res.status(404).json({ error: "Fest nicht gefunden" });
      res.status(204).send();
    } catch (err) {
      console.error("[admin/festivals DELETE]", err);
      res.status(500).json({ error: "Fest konnte nicht gelöscht werden" });
    }
  });

  // ---- Admin: Detailansicht inkl. Signups ----
  app.get("/api/admin/festivals/:id/full", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const festival = await dbStorage.getFestival(id);
      if (!festival) return res.status(404).json({ error: "Fest nicht gefunden" });
      const [stations, shifts, signups] = await Promise.all([
        dbStorage.getStationsByFestival(id),
        dbStorage.getShiftsByFestival(id),
        dbStorage.getSignupsByFestival(id),
      ]);
      res.json({ ...festival, stations, shifts, signups });
    } catch (err) {
      console.error("[admin/festivals/:id/full]", err);
      res.status(500).json({ error: "Detaildaten konnten nicht geladen werden" });
    }
  });

  // ---- Admin: Stand hinzufügen ----
  app.post("/api/admin/festivals/:id/stations", requireAdmin, async (req, res) => {
    try {
      const festivalId = req.params.id as string;
      const festival = await dbStorage.getFestival(festivalId);
      if (!festival) return res.status(404).json({ error: "Fest nicht gefunden" });
      const data = insertFestivalStationSchema.parse(req.body);
      const station = await dbStorage.createStation(festivalId, data);
      res.status(201).json(station);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      console.error("[admin/festivals/:id/stations POST]", err);
      res.status(500).json({ error: "Stand konnte nicht angelegt werden" });
    }
  });

  // ---- Admin: Stand aktualisieren ----
  app.patch("/api/admin/festival-stations/:id", requireAdmin, async (req, res) => {
    try {
      const data = insertFestivalStationSchema.partial().parse(req.body);
      const station = await dbStorage.updateStation(req.params.id as string, data);
      if (!station) return res.status(404).json({ error: "Stand nicht gefunden" });
      res.json(station);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      console.error("[admin/festival-stations PATCH]", err);
      res.status(500).json({ error: "Stand konnte nicht aktualisiert werden" });
    }
  });

  // ---- Admin: Stand löschen ----
  app.delete("/api/admin/festival-stations/:id", requireAdmin, async (req, res) => {
    try {
      const ok = await dbStorage.deleteStation(req.params.id as string);
      if (!ok) return res.status(404).json({ error: "Stand nicht gefunden" });
      res.status(204).send();
    } catch (err) {
      console.error("[admin/festival-stations DELETE]", err);
      res.status(500).json({ error: "Stand konnte nicht gelöscht werden" });
    }
  });

  // ---- Admin: Bulk-Slots erzeugen ----
  app.post("/api/admin/festivals/:id/shifts/bulk", requireAdmin, async (req, res) => {
    try {
      const festivalId = req.params.id as string;
      const festival = await dbStorage.getFestival(festivalId);
      if (!festival) return res.status(404).json({ error: "Fest nicht gefunden" });
      const data = bulkCreateShiftsSchema.parse(req.body);
      // stationIds müssen alle zu diesem Fest gehören
      const stations = await dbStorage.getStationsByFestival(festivalId);
      const validIds = new Set(stations.map((s) => s.id));
      const allValid = data.stationIds.every((id) => validIds.has(id));
      if (!allValid) {
        return res.status(400).json({ error: "Mindestens ein Stand gehört nicht zu diesem Fest" });
      }
      const shifts = await dbStorage.createShiftsBulk(festivalId, data);
      res.status(201).json(shifts);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      console.error("[admin/festivals/:id/shifts/bulk]", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Slots konnten nicht erzeugt werden" });
    }
  });

  // ---- Admin: einzelnen Slot anlegen ----
  app.post("/api/admin/festivals/:id/shifts", requireAdmin, async (req, res) => {
    try {
      const festivalId = req.params.id as string;
      const festival = await dbStorage.getFestival(festivalId);
      if (!festival) return res.status(404).json({ error: "Fest nicht gefunden" });
      const data = insertFestivalShiftSchema.parse(req.body);
      const shift = await dbStorage.createShift(festivalId, data);
      res.status(201).json(shift);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      console.error("[admin/festivals/:id/shifts POST]", err);
      res.status(500).json({ error: "Slot konnte nicht angelegt werden" });
    }
  });

  // ---- Admin: Slot aktualisieren ----
  app.patch("/api/admin/festival-shifts/:id", requireAdmin, async (req, res) => {
    try {
      const data = insertFestivalShiftSchema.partial().parse(req.body);
      const shift = await dbStorage.updateShift(req.params.id as string, data);
      if (!shift) return res.status(404).json({ error: "Slot nicht gefunden" });
      res.json(shift);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      console.error("[admin/festival-shifts PATCH]", err);
      res.status(500).json({ error: "Slot konnte nicht aktualisiert werden" });
    }
  });

  // ---- Admin: Slot löschen ----
  app.delete("/api/admin/festival-shifts/:id", requireAdmin, async (req, res) => {
    try {
      const ok = await dbStorage.deleteShift(req.params.id as string);
      if (!ok) return res.status(404).json({ error: "Slot nicht gefunden" });
      res.status(204).send();
    } catch (err) {
      console.error("[admin/festival-shifts DELETE]", err);
      res.status(500).json({ error: "Slot konnte nicht gelöscht werden" });
    }
  });

  // ---- Admin: Eintragung löschen ----
  app.delete("/api/admin/festival-signups/:id", requireAdmin, async (req, res) => {
    try {
      const ok = await dbStorage.deleteSignup(req.params.id as string);
      if (!ok) return res.status(404).json({ error: "Eintragung nicht gefunden" });
      res.status(204).send();
    } catch (err) {
      console.error("[admin/festival-signups DELETE]", err);
      res.status(500).json({ error: "Eintragung konnte nicht gelöscht werden" });
    }
  });

  // ---- Admin: CSV-Export aller Eintragungen ----
  app.get("/api/admin/festivals/:id/export.csv", requireAdmin, async (req, res) => {
    try {
      const festivalId = req.params.id as string;
      const festival = await dbStorage.getFestival(festivalId);
      if (!festival) return res.status(404).json({ error: "Fest nicht gefunden" });
      const [stations, shifts, signups] = await Promise.all([
        dbStorage.getStationsByFestival(festivalId),
        dbStorage.getShiftsByFestival(festivalId),
        dbStorage.getSignupsByFestival(festivalId),
      ]);
      const stationById = new Map(stations.map((s) => [s.id, s]));
      const shiftById = new Map(shifts.map((s) => [s.id, s]));
      // Helfer-freundliches CSV: Stand, Slot-Start, Slot-Ende, Name, Notiz
      const rows: string[] = [];
      rows.push(["Stand", "Beginn", "Ende", "Name", "Notiz"].join(";"));
      const sortedSignups = [...signups].sort((a, b) => {
        const sa = shiftById.get(a.shiftId);
        const sb = shiftById.get(b.shiftId);
        if (!sa || !sb) return 0;
        return new Date(sa.startTime).getTime() - new Date(sb.startTime).getTime();
      });
      const csvEscape = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
      const fmt = (iso: string) =>
        new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
      for (const su of sortedSignups) {
        const shift = shiftById.get(su.shiftId);
        const station = shift ? stationById.get(shift.stationId) : undefined;
        rows.push(
          [
            csvEscape(station?.name ?? ""),
            csvEscape(shift ? fmt(shift.startTime) : ""),
            csvEscape(shift ? fmt(shift.endTime) : ""),
            csvEscape(su.helperName),
            csvEscape(su.notes ?? ""),
          ].join(";"),
        );
      }
      const csv = "﻿" + rows.join("\r\n"); // BOM für Excel-UTF-8
      const safeName = festival.name.replace(/[^a-zA-Z0-9-_]+/g, "_");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="helfer_${safeName}.csv"`);
      res.send(csv);
    } catch (err) {
      console.error("[admin/festivals/:id/export.csv]", err);
      res.status(500).json({ error: "Export fehlgeschlagen" });
    }
  });

  return httpServer;
}
