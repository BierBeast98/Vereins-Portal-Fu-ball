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
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

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
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private products: Map<string, Product>;
  private campaigns: Map<string, Campaign>;
  private orders: Map<string, Order>;

  constructor() {
    this.users = new Map();
    this.products = new Map();
    this.campaigns = new Map();
    this.orders = new Map();

    // Add sample products for demonstration
    this.initializeSampleData();
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
}

export const storage = new MemStorage();
