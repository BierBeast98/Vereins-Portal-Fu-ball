import {
  type User,
  type InsertUser,
  type Product,
  type InsertProduct,
  type Campaign,
  type InsertCampaign,
  type Order,
  type InsertOrder,
  type OrderItem,
  type CalendarEvent,
  type InsertCalendarEvent,
  type FieldMapping,
  type InsertFieldMapping,
  type BfvImportConfig,
  type InsertBfvImportConfig,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Admin password
  getAdminPassword(): Promise<string>;
  setAdminPassword(password: string): Promise<void>;

  // Products
  getAllProducts(): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<boolean>;

  // Campaigns
  getAllCampaigns(): Promise<Campaign[]>;
  getActiveCampaigns(): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign | undefined>;
  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  updateCampaign(id: string, campaign: Partial<InsertCampaign>): Promise<Campaign | undefined>;
  deleteCampaign(id: string): Promise<boolean>;

  // Orders
  getAllOrders(): Promise<Order[]>;
  getOrdersByCampaign(campaignId: string): Promise<Order[]>;
  getOrder(id: string): Promise<Order | undefined>;
  createOrder(order: InsertOrder): Promise<Order>;

  // Calendar Events
  getAllCalendarEvents(): Promise<CalendarEvent[]>;
  getCalendarEventsByDateRange(startDate: string, endDate: string): Promise<CalendarEvent[]>;
  getCalendarEventsByField(field: string, startDate: string, endDate: string): Promise<CalendarEvent[]>;
  getCalendarEvent(id: string): Promise<CalendarEvent | undefined>;
  getCalendarEventByBfvId(bfvMatchId: string): Promise<CalendarEvent | undefined>;
  createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent>;
  updateCalendarEvent(id: string, event: Partial<InsertCalendarEvent>): Promise<CalendarEvent | undefined>;
  deleteCalendarEvent(id: string): Promise<boolean>;

  // Field Mappings
  getAllFieldMappings(): Promise<FieldMapping[]>;
  createFieldMapping(mapping: InsertFieldMapping): Promise<FieldMapping>;
  updateFieldMapping(id: string, mapping: Partial<InsertFieldMapping>): Promise<FieldMapping | undefined>;
  deleteFieldMapping(id: string): Promise<boolean>;

  // BFV Import Config
  getAllBfvImportConfigs(): Promise<BfvImportConfig[]>;
  getBfvImportConfig(id: string): Promise<BfvImportConfig | undefined>;
  createBfvImportConfig(config: InsertBfvImportConfig): Promise<BfvImportConfig>;
  updateBfvImportConfig(id: string, config: Partial<InsertBfvImportConfig & { lastImport?: string }>): Promise<BfvImportConfig | undefined>;
  deleteBfvImportConfig(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private products: Map<string, Product>;
  private campaigns: Map<string, Campaign>;
  private orders: Map<string, Order>;
  private calendarEvents: Map<string, CalendarEvent>;
  private fieldMappings: Map<string, FieldMapping>;
  private bfvImportConfigs: Map<string, BfvImportConfig>;
  private adminPassword: string;

  constructor() {
    this.users = new Map();
    this.products = new Map();
    this.campaigns = new Map();
    this.orders = new Map();
    this.calendarEvents = new Map();
    this.fieldMappings = new Map();
    this.bfvImportConfigs = new Map();
    this.adminPassword = "12345"; // Default admin password

    // Add sample products for demonstration
    this.initializeSampleData();
    this.initializeDefaultFieldMappings();
    this.initializeSampleCalendarEvents();
  }

  // Admin password
  async getAdminPassword(): Promise<string> {
    return this.adminPassword;
  }

  async setAdminPassword(password: string): Promise<void> {
    this.adminPassword = password;
  }

  private initializeSampleData() {
    // Sample products
    const sampleProducts: Product[] = [
      {
        id: randomUUID(),
        name: "T-Shirt grün",
        category: "T-Shirts",
        basePrice: 24,
        imageUrl: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&h=400&fit=crop",
        additionalImages: [],
        active: true,
        shortDescription: "Trainingsshirt JAKO, atmungsaktiv",
        brand: "JAKO",
        season: "Sommer 2025",
        availableSizes: ["S", "M", "L", "XL", "XXL"],
        initialsEnabled: true,
        initialsPrice: 7,
        initialsLabel: "Initialienaufdruck",
      },
      {
        id: randomUUID(),
        name: "T-Shirt schwarz",
        category: "T-Shirts",
        basePrice: 24,
        imageUrl: "https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=400&h=400&fit=crop",
        additionalImages: [],
        active: true,
        shortDescription: "Trainingsshirt JAKO, atmungsaktiv",
        brand: "JAKO",
        season: "Sommer 2025",
        availableSizes: ["S", "M", "L", "XL", "XXL"],
        initialsEnabled: true,
        initialsPrice: 7,
        initialsLabel: "Initialienaufdruck",
      },
      {
        id: randomUUID(),
        name: "Pullover ZIPTOP Schwarz",
        category: "Pullover",
        basePrice: 45,
        imageUrl: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400&h=400&fit=crop",
        additionalImages: [],
        active: true,
        shortDescription: "Trainingsjacke mit Reißverschluss",
        brand: "JAKO",
        season: "Winter 25/26",
        availableSizes: ["S", "M", "L", "XL", "XXL"],
        initialsEnabled: true,
        initialsPrice: 10,
        initialsLabel: "Name + Nummer",
      },
    ];

    sampleProducts.forEach((p) => this.products.set(p.id, p));

    // Sample campaign
    const today = new Date();
    const nextMonth = new Date(today);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    const sampleCampaign: Campaign = {
      id: randomUUID(),
      name: "Sammelbestellung Sommer 2025",
      description: "Trainings-/Präsentationsbekleidung für aktive Spieler und Trainer/Betreuer.",
      startDate: today.toISOString().split("T")[0],
      endDate: nextMonth.toISOString().split("T")[0],
      active: true,
      productIds: Array.from(this.products.keys()),
    };

    this.campaigns.set(sampleCampaign.id, sampleCampaign);
  }

  private initializeDefaultFieldMappings() {
    const mappings: FieldMapping[] = [
      { id: randomUUID(), team: "herren", eventType: "spiel", defaultField: "a-platz" },
      { id: randomUUID(), team: "herren", eventType: "training", defaultField: "a-platz" },
      { id: randomUUID(), team: "herren2", eventType: "spiel", defaultField: "a-platz" },
      { id: randomUUID(), team: "a-jugend", eventType: "spiel", defaultField: "a-platz" },
      { id: randomUUID(), team: "b-jugend", eventType: "spiel", defaultField: "b-platz" },
      { id: randomUUID(), team: "c-jugend", eventType: "spiel", defaultField: "b-platz" },
      { id: randomUUID(), team: "d-jugend", eventType: "spiel", defaultField: "b-platz" },
      { id: randomUUID(), team: "e-jugend", eventType: "spiel", defaultField: "b-platz" },
      { id: randomUUID(), team: "f-jugend", eventType: "spiel", defaultField: "b-platz" },
      { id: randomUUID(), team: "g-jugend", eventType: "spiel", defaultField: "b-platz" },
    ];
    mappings.forEach((m) => this.fieldMappings.set(m.id, m));
  }

  private initializeSampleCalendarEvents() {
    const today = new Date();
    const events: CalendarEvent[] = [
      {
        id: randomUUID(),
        title: "Herren vs. FC Musterstadt",
        type: "spiel",
        team: "herren",
        field: "a-platz",
        date: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        startTime: "15:00",
        endTime: "17:00",
        isHomeGame: true,
        opponent: "FC Musterstadt",
        competition: "Kreisliga",
        bfvImported: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: randomUUID(),
        title: "Herren Training",
        type: "training",
        team: "herren",
        field: "a-platz",
        date: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        startTime: "19:00",
        endTime: "21:00",
        bfvImported: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: randomUUID(),
        title: "D-Jugend Training",
        type: "training",
        team: "d-jugend",
        field: "b-platz",
        date: new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        startTime: "17:00",
        endTime: "18:30",
        bfvImported: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: randomUUID(),
        title: "Platzsperrung - Rasenpflege",
        type: "platzsperrung",
        field: "a-platz",
        date: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        startTime: "08:00",
        endTime: "18:00",
        description: "Jährliche Rasenpflege",
        bfvImported: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    events.forEach((e) => this.calendarEvents.set(e.id, e));
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Products
  async getAllProducts(): Promise<Product[]> {
    return Array.from(this.products.values());
  }

  async getProduct(id: string): Promise<Product | undefined> {
    return this.products.get(id);
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const id = randomUUID();
    const product: Product = { ...insertProduct, id };
    this.products.set(id, product);
    return product;
  }

  async updateProduct(id: string, data: Partial<InsertProduct>): Promise<Product | undefined> {
    const existing = this.products.get(id);
    if (!existing) return undefined;
    const updated: Product = { ...existing, ...data };
    this.products.set(id, updated);
    return updated;
  }

  async deleteProduct(id: string): Promise<boolean> {
    return this.products.delete(id);
  }

  // Campaigns
  async getAllCampaigns(): Promise<Campaign[]> {
    return Array.from(this.campaigns.values());
  }

  async getActiveCampaigns(): Promise<Campaign[]> {
    return Array.from(this.campaigns.values()).filter((c) => c.active);
  }

  async getCampaign(id: string): Promise<Campaign | undefined> {
    return this.campaigns.get(id);
  }

  async createCampaign(insertCampaign: InsertCampaign): Promise<Campaign> {
    const id = randomUUID();
    const campaign: Campaign = { ...insertCampaign, id };
    this.campaigns.set(id, campaign);
    return campaign;
  }

  async updateCampaign(id: string, data: Partial<InsertCampaign>): Promise<Campaign | undefined> {
    const existing = this.campaigns.get(id);
    if (!existing) return undefined;
    const updated: Campaign = { ...existing, ...data };
    this.campaigns.set(id, updated);
    return updated;
  }

  async deleteCampaign(id: string): Promise<boolean> {
    return this.campaigns.delete(id);
  }

  // Orders
  async getAllOrders(): Promise<Order[]> {
    return Array.from(this.orders.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getOrdersByCampaign(campaignId: string): Promise<Order[]> {
    return Array.from(this.orders.values())
      .filter((o) => o.campaignId === campaignId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getOrder(id: string): Promise<Order | undefined> {
    return this.orders.get(id);
  }

  async createOrder(insertOrder: InsertOrder): Promise<Order> {
    const id = randomUUID();
    const campaign = await this.getCampaign(insertOrder.campaignId);
    const totalAmount = insertOrder.items.reduce((sum, item) => sum + item.totalPrice, 0);

    const order: Order = {
      id,
      campaignId: insertOrder.campaignId,
      campaignName: campaign?.name || "Unbekannt",
      email: insertOrder.email,
      firstName: insertOrder.firstName,
      lastName: insertOrder.lastName,
      items: insertOrder.items,
      totalAmount,
      createdAt: new Date().toISOString(),
    };

    this.orders.set(id, order);
    return order;
  }

  // Calendar Events
  async getAllCalendarEvents(): Promise<CalendarEvent[]> {
    return Array.from(this.calendarEvents.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }

  async getCalendarEventsByDateRange(startDate: string, endDate: string): Promise<CalendarEvent[]> {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Array.from(this.calendarEvents.values())
      .filter((e) => {
        const eventDate = new Date(e.date);
        return eventDate >= start && eventDate <= end;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  async getCalendarEventsByField(field: string, startDate: string, endDate: string): Promise<CalendarEvent[]> {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Array.from(this.calendarEvents.values())
      .filter((e) => {
        const eventDate = new Date(e.date);
        return e.field === field && eventDate >= start && eventDate <= end;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  async getCalendarEvent(id: string): Promise<CalendarEvent | undefined> {
    return this.calendarEvents.get(id);
  }

  async getCalendarEventByBfvId(bfvMatchId: string): Promise<CalendarEvent | undefined> {
    for (const event of this.calendarEvents.values()) {
      if (event.bfvMatchId === bfvMatchId) {
        return event;
      }
    }
    return undefined;
  }

  async createCalendarEvent(insertEvent: InsertCalendarEvent): Promise<CalendarEvent> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const event: CalendarEvent = {
      ...insertEvent,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.calendarEvents.set(id, event);
    return event;
  }

  async updateCalendarEvent(id: string, data: Partial<InsertCalendarEvent>): Promise<CalendarEvent | undefined> {
    const existing = this.calendarEvents.get(id);
    if (!existing) return undefined;
    const updated: CalendarEvent = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    this.calendarEvents.set(id, updated);
    return updated;
  }

  async deleteCalendarEvent(id: string): Promise<boolean> {
    return this.calendarEvents.delete(id);
  }

  // Field Mappings
  async getAllFieldMappings(): Promise<FieldMapping[]> {
    return Array.from(this.fieldMappings.values());
  }

  async createFieldMapping(insertMapping: InsertFieldMapping): Promise<FieldMapping> {
    const id = randomUUID();
    const mapping: FieldMapping = { ...insertMapping, id };
    this.fieldMappings.set(id, mapping);
    return mapping;
  }

  async updateFieldMapping(id: string, data: Partial<InsertFieldMapping>): Promise<FieldMapping | undefined> {
    const existing = this.fieldMappings.get(id);
    if (!existing) return undefined;
    const updated: FieldMapping = { ...existing, ...data };
    this.fieldMappings.set(id, updated);
    return updated;
  }

  async deleteFieldMapping(id: string): Promise<boolean> {
    return this.fieldMappings.delete(id);
  }

  // BFV Import Config
  async getAllBfvImportConfigs(): Promise<BfvImportConfig[]> {
    return Array.from(this.bfvImportConfigs.values());
  }

  async getBfvImportConfig(id: string): Promise<BfvImportConfig | undefined> {
    return this.bfvImportConfigs.get(id);
  }

  async createBfvImportConfig(insertConfig: InsertBfvImportConfig): Promise<BfvImportConfig> {
    const id = randomUUID();
    const config: BfvImportConfig = { ...insertConfig, id };
    this.bfvImportConfigs.set(id, config);
    return config;
  }

  async updateBfvImportConfig(id: string, data: Partial<InsertBfvImportConfig & { lastImport?: string }>): Promise<BfvImportConfig | undefined> {
    const existing = this.bfvImportConfigs.get(id);
    if (!existing) return undefined;
    const updated: BfvImportConfig = { ...existing, ...data };
    this.bfvImportConfigs.set(id, updated);
    return updated;
  }

  async deleteBfvImportConfig(id: string): Promise<boolean> {
    return this.bfvImportConfigs.delete(id);
  }
}

export const storage = new MemStorage();
