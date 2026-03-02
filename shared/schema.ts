import { z } from "zod";
import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, unique, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

// ============================================
// DATABASE TABLES (Drizzle ORM)
// ============================================

// Event source enum values
export const EVENT_SOURCES = ["BFV", "MANUAL"] as const;
export type EventSource = typeof EVENT_SOURCES[number];

// Event status enum values
export const EVENT_STATUSES = ["ACTIVE", "CANCELLED", "ARCHIVED"] as const;
export type EventStatus = typeof EVENT_STATUSES[number];

// Calendar Events table - persistent storage for all events
export const calendarEventsTable = pgTable("calendar_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  source: varchar("source", { length: 20 }).notNull().default("MANUAL"), // BFV or MANUAL
  externalId: varchar("external_id", { length: 255 }), // BFV-specific unique ID
  recurringGroupId: varchar("recurring_group_id", { length: 36 }), // Links recurring events together
  type: varchar("type", { length: 50 }).notNull(), // spiel, training, turnier, etc.
  title: varchar("title", { length: 500 }).notNull(),
  team: varchar("team", { length: 50 }), // internal team key (herren, c-jugend, etc.)
  teamHome: varchar("team_home", { length: 255 }), // Home team name
  teamAway: varchar("team_away", { length: 255 }), // Away team name
  field: varchar("field", { length: 20 }), // a-platz, b-platz
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  startTime: varchar("start_time", { length: 5 }).notNull(), // HH:MM
  endTime: varchar("end_time", { length: 5 }).notNull(), // HH:MM
  isHomeGame: boolean("is_home_game"),
  opponent: varchar("opponent", { length: 255 }),
  location: varchar("location", { length: 500 }),
  competition: varchar("competition", { length: 255 }), // Liga, Pokal, etc.
  description: text("description"),
  rawPayload: jsonb("raw_payload"), // Original BFV data for reference
  status: varchar("status", { length: 20 }).notNull().default("ACTIVE"), // ACTIVE, CANCELLED, ARCHIVED
  stableKey: varchar("stable_key", { length: 64 }), // Deterministic key for idempotent matching when no externalId
  lastSeenAt: timestamp("last_seen_at"), // Last time this event was seen in BFV feed
  archivedAt: timestamp("archived_at"), // When status was set to ARCHIVED
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  // Unique constraint for BFV imports: source + externalId (when set)
  unique("unique_bfv_external").on(table.source, table.externalId),
  index("idx_bfv_stable_key").on(table.source, table.stableKey),
  index("idx_date").on(table.date),
  index("idx_team").on(table.team),
  index("idx_source").on(table.source),
  index("idx_recurring_group").on(table.recurringGroupId),
]);

// Field mappings table - configurable rules for field assignment
export const fieldMappingsTable = pgTable("field_mappings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  team: varchar("team", { length: 50 }).notNull(),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  defaultField: varchar("default_field", { length: 20 }).notNull(),
}, (table) => [
  unique("unique_team_event_type").on(table.team, table.eventType),
]);

// BFV import runs (per-run summary)
export const importRunsTable = pgTable("import_runs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  source: varchar("source", { length: 20 }).notNull().default("bfv"),
  createdCount: integer("created_count").notNull().default(0),
  updatedCount: integer("updated_count").notNull().default(0),
  archivedCount: integer("archived_count").notNull().default(0),
  errors: jsonb("errors"), // string[]
  warnings: jsonb("warnings"), // string[] or object[]
});

// BFV import warnings / notifications (reschedule hints etc.)
export const importWarningsTable = pgTable("import_warnings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  importRunId: varchar("import_run_id", { length: 36 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // e.g. "reschedule", "ambiguous_reschedule"
  message: text("message").notNull(),
  eventRefs: jsonb("event_refs"), // [{ eventId, oldDate?, newDate? }]
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Training / event requests from coaches (pending approval by admin)
export const eventRequestsTable = pgTable("event_requests", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  createdBy: varchar("created_by", { length: 255 }), // free-text name of coach/betreuer
  type: varchar("type", { length: 50 }).notNull().default("training"),
  title: varchar("title", { length: 500 }).notNull(),
  pitch: varchar("pitch", { length: 20 }).notNull(), // a-platz, b-platz
  team: varchar("team", { length: 50 }), // optional: TEAMS key
  startAt: timestamp("start_at", { withTimezone: false }).notNull(),
  endAt: timestamp("end_at", { withTimezone: false }).notNull(),
  note: text("note"),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, approved, rejected
  adminNote: text("admin_note"),
  approvedEventId: varchar("approved_event_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_event_requests_status_start").on(table.status, table.startAt),
]);

// Admin settings table
export const adminSettingsTable = pgTable("admin_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
});

// Drizzle insert schemas
export const insertCalendarEventDbSchema = createInsertSchema(calendarEventsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFieldMappingDbSchema = createInsertSchema(fieldMappingsTable).omit({
  id: true,
});

// Type exports from Drizzle tables
export type CalendarEventDb = typeof calendarEventsTable.$inferSelect;
export type InsertCalendarEventDb = z.infer<typeof insertCalendarEventDbSchema>;
export type FieldMappingDb = typeof fieldMappingsTable.$inferSelect;
export type InsertFieldMappingDb = z.infer<typeof insertFieldMappingDbSchema>;
export type ImportRunDb = typeof importRunsTable.$inferSelect;
export type ImportWarningDb = typeof importWarningsTable.$inferSelect;
export type EventRequestDb = typeof eventRequestsTable.$inferSelect;

// Available sizes for products
export const AVAILABLE_SIZES = ["S", "M", "L", "XL", "XXL", "128", "140", "152", "164"] as const;
export type Size = typeof AVAILABLE_SIZES[number];

// Product schema
export interface Product {
  id: string;
  name: string;
  category: string;
  basePrice: number;
  imageUrl: string;
  additionalImages: string[];
  active: boolean;
  shortDescription?: string;
  longDescription?: string;
  brand?: string;
  season?: string;
  availableSizes: Size[];
  initialsEnabled: boolean;
  initialsPrice: number;
  initialsLabel: string;
}

export const insertProductSchema = z.object({
  name: z.string().min(1, "Produktname ist erforderlich"),
  category: z.string().min(1, "Kategorie ist erforderlich"),
  basePrice: z.number().min(0, "Preis muss positiv sein"),
  imageUrl: z.string().default(""),
  additionalImages: z.array(z.string()).default([]),
  active: z.boolean().default(true),
  shortDescription: z.string().optional(),
  longDescription: z.string().optional(),
  brand: z.string().optional(),
  season: z.string().optional(),
  availableSizes: z.array(z.enum(AVAILABLE_SIZES)).min(1, "Mindestens eine Größe auswählen"),
  initialsEnabled: z.boolean().default(false),
  initialsPrice: z.number().min(0).default(0),
  initialsLabel: z.string().default("Initialien"),
});

export type InsertProduct = z.infer<typeof insertProductSchema>;

// Campaign schema
export interface Campaign {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  active: boolean;
  productIds: string[];
}

export const insertCampaignSchema = z.object({
  name: z.string().min(1, "Kampagnenname ist erforderlich"),
  description: z.string().min(1, "Beschreibung ist erforderlich"),
  startDate: z.string().min(1, "Startdatum ist erforderlich"),
  endDate: z.string().min(1, "Enddatum ist erforderlich"),
  active: z.boolean().default(true),
  productIds: z.array(z.string()).default([]),
});

export type InsertCampaign = z.infer<typeof insertCampaignSchema>;

// Order item schema
export interface OrderItem {
  productId: string;
  productName: string;
  category: string;
  size: Size;
  quantity: number;
  withInitials: boolean;
  initialsText?: string;
  unitPrice: number;
  initialsPrice: number;
  totalPrice: number;
}

export const orderItemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  category: z.string(),
  size: z.enum(AVAILABLE_SIZES),
  quantity: z.number().min(1),
  withInitials: z.boolean(),
  initialsText: z.string().optional(),
  unitPrice: z.number(),
  initialsPrice: z.number(),
  totalPrice: z.number(),
});

// Order schema
export interface Order {
  id: string;
  campaignId: string;
  campaignName: string;
  email: string;
  firstName: string;
  lastName: string;
  items: OrderItem[];
  totalAmount: number;
  createdAt: string;
}

export const insertOrderSchema = z.object({
  campaignId: z.string().min(1),
  email: z.string().email("Gültige E-Mail-Adresse erforderlich"),
  firstName: z.string().min(1, "Vorname ist erforderlich"),
  lastName: z.string().min(1, "Nachname ist erforderlich"),
  items: z.array(orderItemSchema).min(1, "Mindestens ein Artikel erforderlich"),
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;

// Admin user - simple password protection for admin
export interface User {
  id: string;
  username: string;
  password: string;
}

export const insertUserSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export type InsertUser = z.infer<typeof insertUserSchema>;

// ============================================
// PLANNING MODULE - Football Calendar & Fields
// ============================================

// Event types for the calendar
export const EVENT_TYPES = [
  "spiel",        // Game (from BFV or manual)
  "training",     // Training session
  "turnier",      // Tournament
  "vereinsevent", // Club event
  "platzsperrung",// Field closure/maintenance
  "sonstiges"     // Other
] as const;
export type EventType = typeof EVENT_TYPES[number];

// Teams/Mannschaften
export const TEAMS = [
  "herren",
  "herren2",
  "a-jugend",
  "b-jugend",
  "c-jugend",
  "d-jugend",
  "e-jugend",
  "f-jugend",
  "g-jugend",
  "damen",
  "alte-herren"
] as const;
export type Team = typeof TEAMS[number];

export const TEAM_LABELS: Record<Team, string> = {
  "herren": "Herren",
  "herren2": "Herren II",
  "a-jugend": "A-Jugend",
  "b-jugend": "B-Jugend",
  "c-jugend": "C-Jugend",
  "d-jugend": "D-Jugend",
  "e-jugend": "E-Jugend",
  "f-jugend": "F-Jugend",
  "g-jugend": "G-Jugend",
  "damen": "Damen",
  "alte-herren": "Alte Herren"
};

// Fields/Plätze
export const FIELDS = ["a-platz", "b-platz"] as const;
export type Field = typeof FIELDS[number];

export const FIELD_LABELS: Record<Field, string> = {
  "a-platz": "A-Platz (Hauptplatz)",
  "b-platz": "B-Platz (Nebenplatz)"
};

// Calendar Event
export interface CalendarEvent {
  id: string;
  title: string;
  type: EventType;
  team?: Team;
  field?: Field;
  date: string;           // YYYY-MM-DD
  startTime: string;      // HH:MM
  endTime: string;        // HH:MM
  isHomeGame?: boolean;   // For games: home or away
  opponent?: string;      // For games: opponent name
  location?: string;      // Location (for away games)
  competition?: string;   // Liga, Pokal, etc.
  description?: string;
  bfvImported: boolean;
  bfvMatchId?: string;
  stableKey?: string;
  lastSeenAt?: string;
  archivedAt?: string;
  recurringGroupId?: string;
  /** Rohdaten vom BFV-Import (Parser-Output vor Weiterverarbeitung) */
  rawPayload?: unknown;
  createdAt: string;
  updatedAt: string;
}

export const insertCalendarEventSchema = z.object({
  title: z.string().min(1, "Titel ist erforderlich"),
  type: z.enum(EVENT_TYPES),
  team: z.enum(TEAMS).optional(),
  field: z.union([z.enum(FIELDS), z.literal(null)]).optional(),
  date: z.string().min(1, "Datum ist erforderlich"),
  startTime: z.string().min(1, "Startzeit ist erforderlich"),
  endTime: z.string().min(1, "Endzeit ist erforderlich"),
  isHomeGame: z.boolean().optional(),
  opponent: z.string().optional(),
  location: z.string().optional(),
  competition: z.string().optional(),
  description: z.string().optional(),
  bfvImported: z.boolean().default(false),
  bfvMatchId: z.string().optional(),
  stableKey: z.string().optional(),
  lastSeenAt: z.string().datetime().optional(),
  archivedAt: z.string().datetime().optional(),
  recurringGroupId: z.string().optional(),
});

export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;

// Field mapping rules (which team plays on which field by default)
export interface FieldMapping {
  id: string;
  team: Team;
  eventType: EventType;
  defaultField: Field;
}

export const insertFieldMappingSchema = z.object({
  team: z.enum(TEAMS),
  eventType: z.enum(EVENT_TYPES),
  defaultField: z.enum(FIELDS),
});

export type InsertFieldMapping = z.infer<typeof insertFieldMappingSchema>;

// Event colors for UI
export const EVENT_TYPE_COLORS: Record<EventType, string> = {
  "spiel": "bg-blue-500",
  "training": "bg-green-500",
  "turnier": "bg-purple-500",
  "vereinsevent": "bg-orange-500",
  "platzsperrung": "bg-red-500",
  "sonstiges": "bg-gray-500"
};

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  "spiel": "Spiel",
  "training": "Training",
  "turnier": "Turnier",
  "vereinsevent": "Vereinsveranstaltung",
  "platzsperrung": "Platzsperrung",
  "sonstiges": "Sonstiges"
};

// Mannschaftsfarben (Legende): Kräftig = Spiel, Hell mit Rand = Training
export const TEAM_COLORS_SPIEL: Record<Team, string> = {
  "herren": "bg-blue-600 text-white",
  "herren2": "bg-blue-500 text-white",
  "a-jugend": "bg-emerald-700 text-white",
  "b-jugend": "bg-emerald-600 text-white",
  "c-jugend": "bg-teal-600 text-white",
  "d-jugend": "bg-teal-500 text-white",
  "e-jugend": "bg-orange-500 text-white",
  "f-jugend": "bg-orange-400 text-white",
  "g-jugend": "bg-yellow-400 text-gray-900",
  "damen": "bg-pink-600 text-white",
  "alte-herren": "bg-slate-600 text-white",
};

export const TEAM_COLORS_TRAINING: Record<Team, string> = {
  "herren": "bg-blue-200 text-blue-900 ring-1 ring-blue-600 dark:bg-blue-900/50 dark:text-blue-100 dark:ring-blue-400",
  "herren2": "bg-blue-100 text-blue-800 ring-1 ring-blue-500 dark:bg-blue-800/40 dark:text-blue-200 dark:ring-blue-300",
  "a-jugend": "bg-emerald-200 text-emerald-900 ring-1 ring-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-100 dark:ring-emerald-400",
  "b-jugend": "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-500 dark:bg-emerald-800/40 dark:text-emerald-200 dark:ring-emerald-300",
  "c-jugend": "bg-teal-200 text-teal-900 ring-1 ring-teal-600 dark:bg-teal-900/50 dark:text-teal-100 dark:ring-teal-400",
  "d-jugend": "bg-teal-100 text-teal-800 ring-1 ring-teal-500 dark:bg-teal-800/40 dark:text-teal-200 dark:ring-teal-300",
  "e-jugend": "bg-orange-200 text-orange-900 ring-1 ring-orange-500 dark:bg-orange-900/50 dark:text-orange-100 dark:ring-orange-400",
  "f-jugend": "bg-orange-100 text-orange-800 ring-1 ring-orange-400 dark:bg-orange-800/40 dark:text-orange-200 dark:ring-orange-300",
  "g-jugend": "bg-yellow-200 text-yellow-900 ring-1 ring-yellow-500 dark:bg-yellow-900/50 dark:text-yellow-100 dark:ring-yellow-400",
  "damen": "bg-pink-200 text-pink-900 ring-1 ring-pink-600 dark:bg-pink-900/50 dark:text-pink-100 dark:ring-pink-400",
  "alte-herren": "bg-slate-200 text-slate-800 ring-1 ring-slate-600 dark:bg-slate-800/50 dark:text-slate-100 dark:ring-slate-400",
};

/** Farbe für Termin je nach Mannschaft und Typ (Spiel = kräftig, Training = hell mit Rand). */
export function getTeamEventColorClass(team: Team, type: EventType): string {
  if (type === "spiel") return TEAM_COLORS_SPIEL[team];
  if (type === "training") return TEAM_COLORS_TRAINING[team];
  return TEAM_COLORS_SPIEL[team];
}

// Team colors (Spiel) – für einfache Platzbelegung-Boxen, nur bg
export const TEAM_COLORS: Record<Team, string> = {
  "herren": "bg-blue-600",
  "herren2": "bg-blue-500",
  "a-jugend": "bg-emerald-700",
  "b-jugend": "bg-emerald-600",
  "c-jugend": "bg-teal-600",
  "d-jugend": "bg-teal-500",
  "e-jugend": "bg-orange-500",
  "f-jugend": "bg-orange-400",
  "g-jugend": "bg-yellow-400",
  "damen": "bg-pink-600",
  "alte-herren": "bg-slate-600",
};

export const TEAM_BORDER_COLORS: Record<Team, string> = {
  "herren": "border-blue-600",
  "herren2": "border-blue-500",
  "a-jugend": "border-emerald-600",
  "b-jugend": "border-emerald-500",
  "c-jugend": "border-teal-600",
  "d-jugend": "border-teal-500",
  "e-jugend": "border-orange-500",
  "f-jugend": "border-orange-400",
  "g-jugend": "border-yellow-500",
  "damen": "border-pink-600",
  "alte-herren": "border-slate-600",
};

// ======================================================
// Event Requests (training proposals from coaches)
// ======================================================

export const EVENT_REQUEST_STATUSES = ["pending", "approved", "rejected"] as const;
export type EventRequestStatus = typeof EVENT_REQUEST_STATUSES[number];

export const EVENT_REQUEST_TYPES = ["training"] as const;
export type EventRequestType = typeof EVENT_REQUEST_TYPES[number];

export interface EventRequest {
  id: string;
  createdBy?: string;
  type: EventRequestType;
  title: string;
  pitch: Field;
  team?: Team;
  startAt: string;
  endAt: string;
  note?: string;
  status: EventRequestStatus;
  adminNote?: string;
  approvedEventId?: string;
  createdAt: string;
  updatedAt: string;
}

export const insertEventRequestSchema = z.object({
  createdBy: z.string().min(1, "Name ist erforderlich").optional(),
  type: z.enum(EVENT_REQUEST_TYPES).default("training"),
  title: z.string().min(1, "Titel ist erforderlich").default("Training"),
  pitch: z.enum(FIELDS),
  team: z.enum(TEAMS).optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  note: z.string().optional(),
});

export type InsertEventRequest = z.infer<typeof insertEventRequestSchema>;

export const updateEventRequestStatusSchema = z.object({
  status: z.enum(EVENT_REQUEST_STATUSES),
  adminNote: z.string().optional(),
});
