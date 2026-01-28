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
