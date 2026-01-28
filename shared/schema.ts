import { z } from "zod";

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
  imageUrl: z.string().min(1, "Bild ist erforderlich"),
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
  bfvImported: boolean;   // Was this imported from BFV?
  bfvMatchId?: string;    // BFV match ID for reference
  createdAt: string;
  updatedAt: string;
}

export const insertCalendarEventSchema = z.object({
  title: z.string().min(1, "Titel ist erforderlich"),
  type: z.enum(EVENT_TYPES),
  team: z.enum(TEAMS).optional(),
  field: z.enum(FIELDS).optional(),
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

// BFV Import configuration
export interface BfvImportConfig {
  id: string;
  team: Team;
  bfvTeamUrl: string;    // URL or identifier for BFV team page
  season: string;        // e.g., "2025/2026"
  lastImport?: string;   // Last import timestamp
  active: boolean;
}

export const insertBfvImportConfigSchema = z.object({
  team: z.enum(TEAMS),
  bfvTeamUrl: z.string().min(1, "BFV-URL ist erforderlich"),
  season: z.string().min(1, "Saison ist erforderlich"),
  active: z.boolean().default(true),
});

export type InsertBfvImportConfig = z.infer<typeof insertBfvImportConfigSchema>;

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
