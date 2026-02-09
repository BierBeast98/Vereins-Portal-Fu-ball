import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { dbStorage } from "./dbStorage";
import { importBfvMatches, type ParsedBfvMatch, parseTeamFromName } from "./bfvImportService";
import { 
  insertProductSchema, 
  insertCampaignSchema, 
  insertOrderSchema,
  insertCalendarEventSchema,
  insertFieldMappingSchema,
  insertBfvImportConfigSchema,
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

// Parse BFV HTML page to extract match data
function parseBfvMatches(html: string, team: Team): Array<{
  date: string;
  time: string;
  opponent: string;
  competition: string;
  isHome: boolean;
  location?: string;
  bfvMatchId: string;
}> {
  const matches: any[] = [];
  
  // BFV uses structured data in their pages
  // Look for match entries in the HTML
  const matchPattern = /data-match-id="([^"]+)"[\s\S]*?data-date="([^"]+)"[\s\S]*?data-time="([^"]+)"[\s\S]*?<span[^>]*class="[^"]*home-team[^"]*"[^>]*>([^<]+)<[\s\S]*?<span[^>]*class="[^"]*away-team[^"]*"[^>]*>([^<]+)</g;
  
  let match;
  while ((match = matchPattern.exec(html)) !== null) {
    const [, matchId, date, time, homeTeam, awayTeam] = match;
    const isHome = homeTeam.toLowerCase().includes("greding");
    
    matches.push({
      bfvMatchId: matchId,
      date: date,
      time: time,
      opponent: isHome ? awayTeam.trim() : homeTeam.trim(),
      isHome,
      competition: "Liga",
    });
  }
  
  return matches;
}

// Determine team from match text
function determineTeamFromMatch(homeTeam: string, awayTeam: string): Team | undefined {
  const gredingTeam = homeTeam.includes("TSV Greding") ? homeTeam : awayTeam;
  
  // Check for specific team identifiers
  if (gredingTeam.includes("TSV Greding II") || gredingTeam.includes("TSV Greding 2")) {
    return "herren2";
  }
  if (gredingTeam === "TSV Greding" || gredingTeam.trim() === "TSV Greding") {
    return "herren";
  }
  
  // Check age group sections from PDF context
  return undefined;
}

// Parse BFV PDF Vereinsspielplan
interface ParsedPdfMatch {
  type: string;
  league: string;
  date: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  location?: string;
  team: Team;
  isHome: boolean;
}

function parseBfvPdf(text: string): ParsedPdfMatch[] {
  const matches: ParsedPdfMatch[] = [];
  
  // The PDF text comes as continuous text with spaces
  // Pattern: TYPE LEAGUE DATE TIME HOMETEAM - AWAYTEAM LOCATION
  // Example: FS Freundschaftsspiele 20.02.2026 19:00 DJK Enkering - TSV Greding II Sportplatz...
  
  // Find all section markers to determine team context
  const sectionPattern = /\b(Herren|Damen|[A-G]-Jugend|[A-G]-Junioren|E-Junioren|F-Junioren|Alte Herren)\b/gi;
  const sections: { name: string; pos: number }[] = [];
  let sectionMatch;
  while ((sectionMatch = sectionPattern.exec(text)) !== null) {
    sections.push({ name: sectionMatch[1], pos: sectionMatch.index });
  }
  
  // Main pattern to find matches: TYPE LEAGUE DATE TIME TEAM1 - TEAM2
  // Match format: (FS|ME|HM|PO) (League) (DD.MM.YYYY) (HH:MM) (Team1) - (Team2)
  // Lookahead terminators include: venue names, next match type, section headers, page markers, next date, or newline
  const matchPattern = /\b(FS|ME|HM|PO)\s+([\w\s-]+?)\s+(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s+([^-]+?)\s+-\s+([A-Za-zÄÖÜäöüß0-9\s()/.]+?)(?=\s+(?:Sportanlage|Sportplatz|Sportpark|Sporthalle|Stadion|Arena|Gemeindehalle|Turnhalle|Bezirkssportanlage|Rasenplatz|Kunstrasen|Hartplatz|TSV Greding|FS|ME|HM|PO|Herren|Damen|[A-G]-Jugend|[A-G]-Junioren|E-Junioren|F-Junioren|G-Junioren|Alte Herren|Kursiv|Seite|Vereinsspielplan|Stand:|\d{2}\.\d{2}\.\d{4}|\n)|\s*$)/gi;
  
  let match;
  while ((match = matchPattern.exec(text)) !== null) {
    const [fullMatch, type, leagueRaw, dateStr, timeStr, homeTeamRaw, awayTeamRaw] = match;
    const matchPos = match.index;
    
    // Clean up team names
    let homeTeam = homeTeamRaw.trim();
    let awayTeam = awayTeamRaw.trim();
    
    // Skip SPIELFREI entries
    if (awayTeam === "SPIELFREI" || homeTeam === "SPIELFREI") {
      continue;
    }
    
    // Check if it's a TSV Greding match
    const isGredingMatch = homeTeam.includes("TSV Greding") || awayTeam.includes("TSV Greding");
    if (!isGredingMatch) {
      continue;
    }
    
    const isHome = homeTeam.includes("TSV Greding");
    
    // Determine which Greding team based on section context FIRST, then team name
    let team: Team = "herren";
    const gredingTeamStr = isHome ? homeTeam : awayTeam;
    
    // Find the section this match belongs to FIRST
    let currentSection = "";
    for (const section of sections) {
      if (section.pos < matchPos) {
        currentSection = section.name;
      } else {
        break;
      }
    }
    
    // Check section context first - youth teams take priority
    if (currentSection) {
      const sectionLower = currentSection.toLowerCase();
      if (sectionLower.includes("e-juni") || sectionLower.includes("e-jugend")) team = "e-jugend";
      else if (sectionLower.includes("f-juni") || sectionLower.includes("f-jugend")) team = "f-jugend";
      else if (sectionLower.includes("d-juni") || sectionLower.includes("d-jugend")) team = "d-jugend";
      else if (sectionLower.includes("c-juni") || sectionLower.includes("c-jugend")) team = "c-jugend";
      else if (sectionLower.includes("b-juni") || sectionLower.includes("b-jugend")) team = "b-jugend";
      else if (sectionLower.includes("a-juni") || sectionLower.includes("a-jugend")) team = "a-jugend";
      else if (sectionLower.includes("g-juni") || sectionLower.includes("g-jugend")) team = "g-jugend";
      else if (sectionLower.includes("damen")) team = "damen";
      else if (sectionLower.includes("alte")) team = "alte-herren";
      else if (sectionLower === "herren") {
        // Only for Herren section, check for II or 2 suffix
        if (gredingTeamStr.includes("II") || gredingTeamStr.match(/Greding\s*2/i)) {
          team = "herren2";
        }
      }
    } else {
      // No section context - fall back to checking team name for II/2
      if (gredingTeamStr.includes("II") || gredingTeamStr.match(/Greding\s*2/i)) {
        team = "herren2";
      }
    }
    
    // Convert date from DD.MM.YYYY to YYYY-MM-DD
    const [day, month, year] = dateStr.split('.');
    const isoDate = `${year}-${month}-${day}`;
    
    // Clean up league name
    let league = leagueRaw.trim();
    
    matches.push({
      type,
      league,
      date: isoDate,
      time: timeStr,
      homeTeam,
      awayTeam,
      location: undefined,
      team,
      isHome,
    });
  }
  
  return matches;
}

// Generate sample BFV matches for demonstration
function generateSampleBfvMatches(team: Team): InsertCalendarEvent[] {
  const opponents = [
    "FC Beilngries",
    "SV Thalmässing", 
    "TSV Hilpoltstein",
    "SC Feucht",
    "SV Allersberg",
    "SpVgg Roth",
    "ASV Neumarkt",
    "DJK Stopfenheim",
  ];
  
  const competitions = ["Kreisliga Süd", "Kreispokal"];
  const matches: InsertCalendarEvent[] = [];
  const today = new Date();
  
  // Generate upcoming matches for the next 3 months
  for (let i = 0; i < 8; i++) {
    const matchDate = new Date(today);
    matchDate.setDate(today.getDate() + (i * 14) + 7); // Every 2 weeks
    
    // Alternate home/away
    const isHome = i % 2 === 0;
    const opponent = opponents[i % opponents.length];
    const isSunday = matchDate.getDay() === 0;
    
    // Adjust to Sunday if not already
    if (!isSunday) {
      const daysUntilSunday = (7 - matchDate.getDay()) % 7;
      matchDate.setDate(matchDate.getDate() + daysUntilSunday);
    }
    
    const time = isHome ? "15:00" : "14:00";
    
    matches.push({
      title: isHome 
        ? `TSV Greding vs ${opponent}`
        : `${opponent} vs TSV Greding`,
      type: "spiel",
      team: team,
      field: isHome ? "a-platz" : undefined,
      date: matchDate.toISOString().split("T")[0],
      startTime: time,
      endTime: addHours(time, 2),
      isHomeGame: isHome,
      opponent: opponent,
      location: isHome ? undefined : `Sportplatz ${opponent.split(" ").pop()}`,
      competition: i === 3 ? competitions[1] : competitions[0],
      bfvImported: true,
      bfvMatchId: `bfv-${team}-${matchDate.toISOString().split("T")[0]}-${i}`,
    });
  }
  
  return matches;
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

  // BFV Import Config
  app.get("/api/calendar/bfv-configs", requireAdmin, async (req, res) => {
    try {
      const configs = await dbStorage.getAllBfvImportConfigs();
      res.json(configs);
    } catch (error) {
      res.status(500).json({ error: "BFV-Konfigurationen konnten nicht geladen werden" });
    }
  });

  app.post("/api/calendar/bfv-configs", requireAdmin, async (req, res) => {
    try {
      const data = insertBfvImportConfigSchema.parse(req.body);
      const config = await dbStorage.createBfvImportConfig(data);
      res.status(201).json(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "BFV-Konfiguration konnte nicht erstellt werden" });
    }
  });

  app.delete("/api/calendar/bfv-configs/:id", requireAdmin, async (req, res) => {
    try {
      const deleted = await dbStorage.deleteBfvImportConfig(req.params.id as string);
      if (!deleted) {
        return res.status(404).json({ error: "BFV-Konfiguration nicht gefunden" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "BFV-Konfiguration konnte nicht gelöscht werden" });
    }
  });
  
  // Import history
  app.get("/api/calendar/import-history", requireAdmin, async (req, res) => {
    try {
      const history = await dbStorage.getImportHistory();
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Import-Historie konnte nicht geladen werden" });
    }
  });

  // BFV Import - Fetch and import matches from BFV website using idempotent import service
  app.post("/api/calendar/bfv-import/:configId", requireAdmin, async (req, res) => {
    try {
      const configId = req.params.configId as string;
      const useSampleData = req.query.sample === "true";
      const config = await dbStorage.getBfvImportConfig(configId);
      
      if (!config) {
        return res.status(404).json({ error: "BFV-Konfiguration nicht gefunden" });
      }

      const bfvUrl = config.bfvTeamUrl;
      let bfvMatches: ParsedBfvMatch[] = [];
      let fetchFailed = false;
      let fetchError: string | null = null;
      
      if (!useSampleData) {
        try {
          const response = await fetch(bfvUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; TSV-Portal/1.0)",
              "Accept": "text/html,application/xhtml+xml",
            },
          });
          
          if (response.ok) {
            const html = await response.text();
            const matches = parseBfvMatches(html, config.team);
            
            // Convert to ParsedBfvMatch format for idempotent import
            bfvMatches = matches.map((match) => ({
              externalId: match.bfvMatchId || `html-${match.date}-${match.time}-${match.opponent.substring(0, 10)}`.replace(/\s/g, ""),
              date: match.date,
              startTime: match.time,
              endTime: addHours(match.time, 2),
              teamHome: match.isHome ? "TSV Greding" : match.opponent,
              teamAway: match.isHome ? match.opponent : "TSV Greding",
              team: config.team,
              isHomeGame: match.isHome,
              opponent: match.opponent,
              competition: match.competition || "",
              location: match.location,
              rawData: match,
            }));
          } else {
            fetchFailed = true;
            fetchError = `BFV-Server nicht erreichbar (Status: ${response.status})`;
          }
        } catch (err) {
          console.error("BFV fetch error:", err);
          fetchFailed = true;
          fetchError = "Verbindung zum BFV-Server fehlgeschlagen";
        }
      }

      // Only use sample data if explicitly requested or for demonstration purposes
      if (useSampleData || (fetchFailed && bfvMatches.length === 0)) {
        const sampleMatches = generateSampleBfvMatches(config.team);
        
        // Convert sample matches to ParsedBfvMatch format
        bfvMatches = sampleMatches.map((match) => ({
          externalId: match.bfvMatchId || `sample-${match.date}-${match.startTime}-${match.opponent?.substring(0, 10) || ""}`.replace(/\s/g, ""),
          date: match.date,
          startTime: match.startTime,
          endTime: match.endTime,
          teamHome: match.isHomeGame ? "TSV Greding" : (match.opponent || ""),
          teamAway: match.isHomeGame ? (match.opponent || "") : "TSV Greding",
          team: config.team,
          isHomeGame: match.isHomeGame || false,
          opponent: match.opponent || "",
          competition: match.competition || "",
          location: match.location,
          rawData: match,
        }));
      }

      // Use idempotent import service
      const summary = await importBfvMatches(bfvMatches, `bfv-html-${config.team}`);

      await dbStorage.updateBfvImportConfig(configId, {
        lastImport: new Date().toISOString(),
      });

      res.json({ 
        success: true, 
        imported: summary.createdCount,
        updated: summary.updatedCount,
        unchanged: summary.unchangedCount,
        archived: summary.archivedCount,
        usedSampleData: useSampleData || fetchFailed,
        fetchError: fetchError,
      });
    } catch (error) {
      console.error("BFV import error:", error);
      res.status(500).json({ error: "BFV-Import fehlgeschlagen" });
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

  // BFV PDF Import - Upload and parse PDF Vereinsspielplan with idempotent upsert
  app.post("/api/calendar/bfv-import-pdf", requireAdmin, upload.single("pdf"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Keine PDF-Datei hochgeladen" });
      }

      // Use pdfjs-dist directly for PDF parsing
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const doc = await pdfjs.getDocument({ data: new Uint8Array(req.file.buffer) }).promise;
      let text = "";
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        text += (content.items as any[]).map((item: any) => item.str).join(" ") + "\n";
      }
      
      const parsedMatches = parseBfvPdf(text);
      
      // Convert to ParsedBfvMatch format for idempotent import
      const bfvMatches: ParsedBfvMatch[] = parsedMatches.map((match) => {
        const externalId = `pdf-${match.date}-${match.time}-${match.homeTeam.substring(0, 10)}-${match.awayTeam.substring(0, 10)}`.replace(/\s/g, "");
        const opponent = match.isHome ? match.awayTeam : match.homeTeam;
        
        return {
          externalId,
          date: match.date,
          startTime: match.time,
          endTime: addHours(match.time, 2),
          teamHome: match.homeTeam,
          teamAway: match.awayTeam,
          team: match.team,
          isHomeGame: match.isHome,
          opponent,
          competition: match.league || "",
          location: match.isHome ? undefined : match.location,
          rawData: match,
        };
      });
      
      // Use idempotent import service
      const summary = await importBfvMatches(bfvMatches, req.file.originalname);
      
      res.json({ 
        success: true, 
        imported: summary.createdCount,
        updated: summary.updatedCount,
        unchanged: summary.unchangedCount,
        archived: summary.archivedCount,
        errors: summary.errorCount,
        total: parsedMatches.length,
        errorMessages: summary.errors,
      });
    } catch (error) {
      console.error("PDF import error:", error);
      res.status(500).json({ error: "PDF-Import fehlgeschlagen: " + (error as Error).message });
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

  return httpServer;
}
