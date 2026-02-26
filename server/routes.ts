import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { dbStorage } from "./dbStorage";
import { 
  insertProductSchema, 
  insertCampaignSchema, 
  insertOrderSchema,
  insertCalendarEventSchema,
  insertFieldMappingSchema,
} from "@shared/schema";
import { z } from "zod";
import { sendOrderConfirmation } from "./email";
import type { Team, InsertCalendarEvent, Field } from "@shared/schema";
import multer from "multer";
import { processAndUploadImage, serveImage } from "./imageUpload";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Helper to add hours to a time string
function addHours(time: string, hours: number): string {
  const [h, m] = time.split(":").map(Number);
  const newHour = (h + hours) % 24;
  return `${newHour.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

// Middleware to protect admin routes
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.isAdmin) {
    return res.status(401).json({ error: "Nicht autorisiert" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth endpoints
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { password } = req.body;
      const adminPassword = await storage.getAdminPassword();
      
      if (password === adminPassword) {
        req.session.isAdmin = true;
        res.json({ success: true });
      } else {
        res.status(401).json({ error: "Falsches Passwort" });
      }
    } catch (error) {
      res.status(500).json({ error: "Login fehlgeschlagen" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout fehlgeschlagen" });
      }
      res.json({ success: true });
    });
  });

  app.get("/api/auth/check", (req, res) => {
    res.json({ isAdmin: !!req.session.isAdmin });
  });

  app.post("/api/auth/change-password", requireAdmin, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const adminPassword = await storage.getAdminPassword();
      
      if (currentPassword !== adminPassword) {
        return res.status(401).json({ error: "Aktuelles Passwort ist falsch" });
      }
      
      if (!newPassword || newPassword.length < 1) {
        return res.status(400).json({ error: "Neues Passwort ist erforderlich" });
      }
      
      await storage.setAdminPassword(newPassword);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Passwortänderung fehlgeschlagen" });
    }
  });

  // Products CRUD (protected)
  app.get("/api/products", async (req, res) => {
    try {
      const products = await storage.getAllProducts();
      res.json(products);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.get("/api/products/:id", async (req, res) => {
    try {
      const product = await storage.getProduct(req.params.id);
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
      const product = await storage.createProduct(data);
      res.status(201).json(product);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create product" });
    }
  });

  app.patch("/api/products/:id", requireAdmin, async (req, res) => {
    try {
      const data = insertProductSchema.partial().parse(req.body);
      const product = await storage.updateProduct(req.params.id as string, data);
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
      const deleted = await storage.deleteProduct(req.params.id as string);
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
      const campaigns = await storage.getAllCampaigns();
      res.json(campaigns);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch campaigns" });
    }
  });

  app.get("/api/campaigns/active", async (req, res) => {
    try {
      const campaigns = await storage.getActiveCampaigns();
      res.json(campaigns);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch active campaigns" });
    }
  });

  app.get("/api/campaigns/:id", async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      res.json(campaign);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch campaign" });
    }
  });

  app.post("/api/campaigns", requireAdmin, async (req, res) => {
    try {
      const data = insertCampaignSchema.parse(req.body);
      const campaign = await storage.createCampaign(data);
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
      const campaign = await storage.updateCampaign(req.params.id as string, data);
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
      const deleted = await storage.deleteCampaign(req.params.id as string);
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
      const orders = await storage.getAllOrders();
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.get("/api/orders/campaign/:campaignId", requireAdmin, async (req, res) => {
    try {
      const orders = await storage.getOrdersByCampaign(req.params.campaignId as string);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.post("/api/orders", async (req, res) => {
    try {
      const data = insertOrderSchema.parse(req.body);
      const order = await storage.createOrder(data);
      
      // Send confirmation email (don't wait for it, don't fail if it fails)
      sendOrderConfirmation(order).catch((err) => {
        console.error("E-Mail-Versand fehlgeschlagen:", err);
      });
      
      res.status(201).json(order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create order" });
    }
  });

  // Excel Export (admin only)
  app.get("/api/orders/export/:campaignId", requireAdmin, async (req, res) => {
    try {
      const campaignId = req.params.campaignId as string;
      const orders = await storage.getOrdersByCampaign(campaignId);
      const campaign = await storage.getCampaign(campaignId);

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

      // Find overlapping events on the same field
      const conflicts: Array<{ event1: any; event2: any; reason: string }> = [];

      for (let i = 0; i < events.length; i++) {
        for (let j = i + 1; j < events.length; j++) {
          const e1 = events[i];
          const e2 = events[j];

          // Same date and same field?
          if (e1.date === e2.date && e1.field && e2.field && e1.field === e2.field) {
            // Check time overlap
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
    res.json({ running: isImportRunning(), bfvUrlConfigured: !!process.env.BFV_URL });
  });

  startBfvScheduler();

  return httpServer;
}
