import { eq, and, between, or, isNull, desc } from "drizzle-orm";
import { db } from "./db";
import {
  calendarEventsTable,
  fieldMappingsTable,
  importRunsTable,
  importWarningsTable,
  adminSettingsTable,
  eventRequestsTable,
  productsTable,
  campaignsTable,
  ordersTable,
  type CalendarEventDb,
  type InsertCalendarEventDb,
  type FieldMappingDb,
  type InsertFieldMappingDb,
  type ImportRunDb,
  type ImportWarningDb,
  type EventRequestDb,
  type CalendarEvent,
  type InsertCalendarEvent,
  type FieldMapping,
  type InsertFieldMapping,
  type EventRequest,
  type InsertEventRequest,
  type Team,
  type Field,
  type EventType,
  type EventRequestStatus,
  type Product,
  type InsertProduct,
  type Campaign,
  type InsertCampaign,
  type Order,
  type InsertOrder,
  type OrderItem,
  type Size,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IDbStorage {
  getAllCalendarEvents(): Promise<CalendarEvent[]>;
  getCalendarEventsByDateRange(startDate: string, endDate: string): Promise<CalendarEvent[]>;
  getCalendarEventsByField(field: string, startDate: string, endDate: string): Promise<CalendarEvent[]>;
  getCalendarEvent(id: string): Promise<CalendarEvent | undefined>;
  getCalendarEventsByRecurringGroup(recurringGroupId: string): Promise<CalendarEvent[]>;
  createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent>;
  updateCalendarEvent(id: string, event: Partial<InsertCalendarEvent>): Promise<CalendarEvent | undefined>;
  updateCalendarEventsByRecurringGroup(recurringGroupId: string, data: Partial<InsertCalendarEvent>): Promise<number>;
  deleteCalendarEvent(id: string): Promise<boolean>;
  deleteCalendarEventsByRecurringGroup(recurringGroupId: string): Promise<number>;
  archiveCalendarEvent(id: string): Promise<boolean>;
  getBfvCalendarEventBySourceId(externalId: string): Promise<CalendarEvent | undefined>;
  getBfvCalendarEventByStableKey(stableKey: string): Promise<CalendarEvent | undefined>;
  getActiveBfvCalendarEvents(): Promise<CalendarEvent[]>;
  updateCalendarEventBfv(id: string, data: { lastSeenAt?: Date; archivedAt?: Date; date?: string; startTime?: string; endTime?: string; title?: string; location?: string; competition?: string; field?: string | null; team?: string | null; rawPayload?: unknown }): Promise<CalendarEvent | undefined>;
  /** Set field to null for all events where type=spiel and isHomeGame=false (one-time cleanup). Returns count updated. */
  clearFieldForAwayGames(): Promise<number>;
  createImportRun(): Promise<ImportRunDb>;
  finishImportRun(id: string, data: { createdCount: number; updatedCount: number; archivedCount: number; errors: string[]; warnings: unknown[] }): Promise<void>;
  createImportWarning(runId: string, type: string, message: string, eventRefs?: unknown): Promise<void>;
  getImportRuns(limit?: number): Promise<ImportRunDb[]>;
  getImportWarnings(runId?: string): Promise<ImportWarningDb[]>;
  getAllFieldMappings(): Promise<FieldMapping[]>;
  createFieldMapping(mapping: InsertFieldMapping): Promise<FieldMapping>;
  updateFieldMapping(id: string, mapping: Partial<InsertFieldMapping>): Promise<FieldMapping | undefined>;
  deleteFieldMapping(id: string): Promise<boolean>;
  getDefaultField(team: Team, eventType: EventType): Promise<Field | undefined>;
  getAdminPassword(): Promise<string>;
  setAdminPassword(password: string): Promise<void>;
  initializeDefaultFieldMappings(): Promise<void>;
  // Event requests (training proposals)
  createEventRequest(data: InsertEventRequest): Promise<EventRequest>;
  getEventRequestById(id: string): Promise<EventRequest | null>;
  listEventRequests(filter: { status?: EventRequestStatus; fromDate?: string; toDate?: string }): Promise<EventRequest[]>;
  updateEventRequest(
    id: string,
    patch: Partial<InsertEventRequest> & { status?: EventRequestStatus; adminNote?: string; approvedEventId?: string | null }
  ): Promise<EventRequest | null>;
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

function dbEventToCalendarEvent(dbEvent: CalendarEventDb): CalendarEvent {
  return {
    id: dbEvent.id,
    title: dbEvent.title,
    type: dbEvent.type as EventType,
    team: dbEvent.team as Team | undefined,
    field: dbEvent.field as Field | undefined,
    date: dbEvent.date,
    startTime: dbEvent.startTime,
    endTime: dbEvent.endTime,
    isHomeGame: dbEvent.isHomeGame ?? undefined,
    opponent: dbEvent.opponent ?? undefined,
    location: dbEvent.location ?? undefined,
    competition: dbEvent.competition ?? undefined,
    description: dbEvent.description ?? undefined,
    bfvImported: dbEvent.source === "BFV",
    bfvMatchId: dbEvent.externalId ?? undefined,
    stableKey: dbEvent.stableKey ?? undefined,
    lastSeenAt: dbEvent.lastSeenAt?.toISOString(),
    archivedAt: dbEvent.archivedAt?.toISOString(),
    recurringGroupId: dbEvent.recurringGroupId ?? undefined,
    rawPayload: dbEvent.rawPayload ?? undefined,
    createdAt: dbEvent.createdAt.toISOString(),
    updatedAt: dbEvent.updatedAt.toISOString(),
  };
}

function dbFieldMappingToFieldMapping(dbMapping: FieldMappingDb): FieldMapping {
  return {
    id: dbMapping.id,
    team: dbMapping.team as Team,
    eventType: dbMapping.eventType as EventType,
    defaultField: dbMapping.defaultField as Field,
  };
}

function dbEventRequestToEventRequest(dbReq: EventRequestDb): EventRequest {
  return {
    id: dbReq.id,
    createdBy: dbReq.createdBy ?? undefined,
    type: (dbReq.type as EventRequest["type"]) ?? "training",
    title: dbReq.title,
    pitch: dbReq.pitch as Field,
    team: dbReq.team as Team | undefined,
    startAt: dbReq.startAt.toISOString(),
    endAt: dbReq.endAt.toISOString(),
    note: dbReq.note ?? undefined,
    status: dbReq.status as EventRequestStatus,
    adminNote: dbReq.adminNote ?? undefined,
    approvedEventId: dbReq.approvedEventId ?? undefined,
    targetEventId: (dbReq as any).targetEventId ?? undefined,
    createdAt: dbReq.createdAt.toISOString(),
    updatedAt: dbReq.updatedAt.toISOString(),
  };
}

export class DbStorage implements IDbStorage {
  async getAllCalendarEvents(): Promise<CalendarEvent[]> {
    const events = await db
      .select()
      .from(calendarEventsTable)
      .where(eq(calendarEventsTable.status, "ACTIVE"))
      .orderBy(calendarEventsTable.date);
    return events.map(dbEventToCalendarEvent);
  }

  async getCalendarEventsByDateRange(startDate: string, endDate: string): Promise<CalendarEvent[]> {
    const events = await db
      .select()
      .from(calendarEventsTable)
      .where(
        and(
          eq(calendarEventsTable.status, "ACTIVE"),
          between(calendarEventsTable.date, startDate, endDate)
        )
      )
      .orderBy(calendarEventsTable.date);
    return events.map(dbEventToCalendarEvent);
  }

  async getCalendarEventsByField(field: string, startDate: string, endDate: string): Promise<CalendarEvent[]> {
    const events = await db
      .select()
      .from(calendarEventsTable)
      .where(
        and(
          eq(calendarEventsTable.status, "ACTIVE"),
          eq(calendarEventsTable.field, field),
          between(calendarEventsTable.date, startDate, endDate)
        )
      )
      .orderBy(calendarEventsTable.date);
    return events.map(dbEventToCalendarEvent);
  }

  async getCalendarEvent(id: string): Promise<CalendarEvent | undefined> {
    const [event] = await db
      .select()
      .from(calendarEventsTable)
      .where(eq(calendarEventsTable.id, id));
    return event ? dbEventToCalendarEvent(event) : undefined;
  }

  async createCalendarEvent(insertEvent: InsertCalendarEvent): Promise<CalendarEvent> {
    const id = randomUUID();
    const now = new Date();
    
    const dbEvent: InsertCalendarEventDb = {
      source: insertEvent.bfvImported ? "BFV" : "MANUAL",
      externalId: insertEvent.bfvMatchId || null,
      stableKey: insertEvent.stableKey || null,
      recurringGroupId: insertEvent.recurringGroupId || null,
      type: insertEvent.type,
      title: insertEvent.title,
      team: insertEvent.team || null,
      teamHome: null,
      teamAway: null,
      field: insertEvent.field || null,
      date: insertEvent.date,
      startTime: insertEvent.startTime,
      endTime: insertEvent.endTime,
      isHomeGame: insertEvent.isHomeGame ?? null,
      opponent: insertEvent.opponent || null,
      location: insertEvent.location || null,
      competition: insertEvent.competition || null,
      description: insertEvent.description || null,
      rawPayload: null,
      status: "ACTIVE",
    };

    const [created] = await db
      .insert(calendarEventsTable)
      .values({ id, ...dbEvent })
      .returning();

    return dbEventToCalendarEvent(created);
  }

  async updateCalendarEvent(id: string, data: Partial<InsertCalendarEvent>): Promise<CalendarEvent | undefined> {
    const updateData: Partial<InsertCalendarEventDb> = {};
    
    if (data.title !== undefined) updateData.title = data.title;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.team !== undefined) updateData.team = data.team || null;
    if (data.field !== undefined) updateData.field = data.field || null;
    if (data.date !== undefined) updateData.date = data.date;
    if (data.startTime !== undefined) updateData.startTime = data.startTime;
    if (data.endTime !== undefined) updateData.endTime = data.endTime;
    if (data.isHomeGame !== undefined) updateData.isHomeGame = data.isHomeGame ?? null;
    if (data.opponent !== undefined) updateData.opponent = data.opponent || null;
    if (data.location !== undefined) updateData.location = data.location || null;
    if (data.competition !== undefined) updateData.competition = data.competition || null;
    if (data.description !== undefined) updateData.description = data.description || null;
    if (data.bfvMatchId !== undefined) updateData.externalId = data.bfvMatchId || null;
    if (data.bfvImported !== undefined) updateData.source = data.bfvImported ? "BFV" : "MANUAL";
    if (data.stableKey !== undefined) updateData.stableKey = data.stableKey || null;
    if (data.lastSeenAt !== undefined) updateData.lastSeenAt = data.lastSeenAt ? new Date(data.lastSeenAt) : null;
    if (data.archivedAt !== undefined) updateData.archivedAt = data.archivedAt ? new Date(data.archivedAt) : null;

    const [updated] = await db
      .update(calendarEventsTable)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(calendarEventsTable.id, id))
      .returning();

    return updated ? dbEventToCalendarEvent(updated) : undefined;
  }

  async deleteCalendarEvent(id: string): Promise<boolean> {
    const result = await db
      .delete(calendarEventsTable)
      .where(eq(calendarEventsTable.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getCalendarEventsByRecurringGroup(recurringGroupId: string): Promise<CalendarEvent[]> {
    const events = await db
      .select()
      .from(calendarEventsTable)
      .where(
        and(
          eq(calendarEventsTable.recurringGroupId, recurringGroupId),
          eq(calendarEventsTable.status, "ACTIVE")
        )
      )
      .orderBy(calendarEventsTable.date);
    return events.map(dbEventToCalendarEvent);
  }

  async updateCalendarEventsByRecurringGroup(recurringGroupId: string, data: Partial<InsertCalendarEvent>): Promise<number> {
    const updateData: Partial<InsertCalendarEventDb> = {};
    
    if (data.title !== undefined) updateData.title = data.title;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.team !== undefined) updateData.team = data.team || null;
    if (data.field !== undefined) updateData.field = data.field || null;
    if (data.startTime !== undefined) updateData.startTime = data.startTime;
    if (data.endTime !== undefined) updateData.endTime = data.endTime;
    if (data.isHomeGame !== undefined) updateData.isHomeGame = data.isHomeGame ?? null;
    if (data.opponent !== undefined) updateData.opponent = data.opponent || null;
    if (data.location !== undefined) updateData.location = data.location || null;
    if (data.competition !== undefined) updateData.competition = data.competition || null;
    if (data.description !== undefined) updateData.description = data.description || null;
    // Note: We don't update date for recurring events - each has its own date

    const result = await db
      .update(calendarEventsTable)
      .set({ ...updateData, updatedAt: new Date() })
      .where(
        and(
          eq(calendarEventsTable.recurringGroupId, recurringGroupId),
          eq(calendarEventsTable.status, "ACTIVE")
        )
      );
    return result.rowCount ?? 0;
  }

  async deleteCalendarEventsByRecurringGroup(recurringGroupId: string): Promise<number> {
    const result = await db
      .delete(calendarEventsTable)
      .where(eq(calendarEventsTable.recurringGroupId, recurringGroupId));
    return result.rowCount ?? 0;
  }

  async archiveCalendarEvent(id: string): Promise<boolean> {
    const result = await db
      .update(calendarEventsTable)
      .set({ status: "ARCHIVED", archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(calendarEventsTable.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getBfvCalendarEventBySourceId(externalId: string): Promise<CalendarEvent | undefined> {
    const [event] = await db
      .select()
      .from(calendarEventsTable)
      .where(
        and(
          eq(calendarEventsTable.source, "BFV"),
          eq(calendarEventsTable.externalId, externalId)
        )
      );
    return event ? dbEventToCalendarEvent(event) : undefined;
  }

  async getBfvCalendarEventByStableKey(stableKey: string): Promise<CalendarEvent | undefined> {
    const [event] = await db
      .select()
      .from(calendarEventsTable)
      .where(
        and(
          eq(calendarEventsTable.source, "BFV"),
          eq(calendarEventsTable.stableKey, stableKey)
        )
      );
    return event ? dbEventToCalendarEvent(event) : undefined;
  }

  async getActiveBfvCalendarEvents(): Promise<CalendarEvent[]> {
    const events = await db
      .select()
      .from(calendarEventsTable)
      .where(
        and(
          eq(calendarEventsTable.source, "BFV"),
          eq(calendarEventsTable.status, "ACTIVE")
        )
      );
    return events.map(dbEventToCalendarEvent);
  }

  async updateCalendarEventBfv(
    id: string,
    data: {
      lastSeenAt?: Date;
      archivedAt?: Date;
      date?: string;
      startTime?: string;
      endTime?: string;
      title?: string;
      location?: string;
      competition?: string;
      field?: string | null;
      team?: string | null;
      rawPayload?: unknown;
    }
  ): Promise<CalendarEvent | undefined> {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.lastSeenAt !== undefined) updateData.lastSeenAt = data.lastSeenAt;
    if (data.archivedAt !== undefined) updateData.archivedAt = data.archivedAt;
    if (data.date !== undefined) updateData.date = data.date;
    if (data.startTime !== undefined) updateData.startTime = data.startTime;
    if (data.endTime !== undefined) updateData.endTime = data.endTime;
    if (data.title !== undefined) updateData.title = data.title;
    if (data.location !== undefined) updateData.location = data.location;
    if (data.competition !== undefined) updateData.competition = data.competition;
    if (data.field !== undefined) updateData.field = data.field;
    if (data.team !== undefined) updateData.team = data.team ?? null;
    if (data.rawPayload !== undefined) updateData.rawPayload = data.rawPayload;
    const [updated] = await db
      .update(calendarEventsTable)
      .set(updateData as Partial<CalendarEventDb>)
      .where(eq(calendarEventsTable.id, id))
      .returning();
    return updated ? dbEventToCalendarEvent(updated) : undefined;
  }

  async clearFieldForAwayGames(): Promise<number> {
    // Einmaliges UPDATE: Bei allen Spielen, die kein Heimspiel sind, Platz auf NULL setzen
    const updated = await db
      .update(calendarEventsTable)
      .set({ field: null, updatedAt: new Date() })
      .where(
        and(
          eq(calendarEventsTable.type, "spiel"),
          or(eq(calendarEventsTable.isHomeGame, false), isNull(calendarEventsTable.isHomeGame))
        )
      )
      .returning({ id: calendarEventsTable.id });
    return updated.length;
  }

  async createImportRun(): Promise<ImportRunDb> {
    const [run] = await db.insert(importRunsTable).values({}).returning();
    return run;
  }

  async finishImportRun(
    id: string,
    data: { createdCount: number; updatedCount: number; archivedCount: number; errors: string[]; warnings: unknown[] }
  ): Promise<void> {
    await db
      .update(importRunsTable)
      .set({
        finishedAt: new Date(),
        createdCount: data.createdCount,
        updatedCount: data.updatedCount,
        archivedCount: data.archivedCount,
        errors: data.errors,
        warnings: data.warnings,
      })
      .where(eq(importRunsTable.id, id));
  }

  async createImportWarning(runId: string, type: string, message: string, eventRefs?: unknown): Promise<void> {
    await db.insert(importWarningsTable).values({ importRunId: runId, type, message, eventRefs: eventRefs ?? null });
  }

  async getImportRuns(limit = 20): Promise<ImportRunDb[]> {
    const runs = await db
      .select()
      .from(importRunsTable)
      .orderBy(desc(importRunsTable.startedAt))
      .limit(limit);
    return runs;
  }

  async getImportWarnings(runId?: string): Promise<ImportWarningDb[]> {
    if (runId) {
      return await db
        .select()
        .from(importWarningsTable)
        .where(eq(importWarningsTable.importRunId, runId))
        .orderBy(importWarningsTable.createdAt);
    }
    const rows = await db
      .select()
      .from(importWarningsTable)
      .orderBy(desc(importWarningsTable.createdAt))
      .limit(100);
    return rows;
  }

  async getAllFieldMappings(): Promise<FieldMapping[]> {
    const mappings = await db.select().from(fieldMappingsTable);
    return mappings.map(dbFieldMappingToFieldMapping);
  }

  async createFieldMapping(insertMapping: InsertFieldMapping): Promise<FieldMapping> {
    const id = randomUUID();
    const [created] = await db
      .insert(fieldMappingsTable)
      .values({ id, ...insertMapping })
      .returning();
    return dbFieldMappingToFieldMapping(created);
  }

  async updateFieldMapping(id: string, data: Partial<InsertFieldMapping>): Promise<FieldMapping | undefined> {
    const [updated] = await db
      .update(fieldMappingsTable)
      .set(data)
      .where(eq(fieldMappingsTable.id, id))
      .returning();
    return updated ? dbFieldMappingToFieldMapping(updated) : undefined;
  }

  async deleteFieldMapping(id: string): Promise<boolean> {
    const result = await db
      .delete(fieldMappingsTable)
      .where(eq(fieldMappingsTable.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getDefaultField(team: Team, eventType: EventType): Promise<Field | undefined> {
    const [mapping] = await db
      .select()
      .from(fieldMappingsTable)
      .where(
        and(
          eq(fieldMappingsTable.team, team),
          eq(fieldMappingsTable.eventType, eventType)
        )
      );
    return mapping ? (mapping.defaultField as Field) : undefined;
  }

  async getAdminPassword(): Promise<string> {
    const [setting] = await db
      .select()
      .from(adminSettingsTable)
      .where(eq(adminSettingsTable.key, "admin_password"));
    return setting?.value || "12345";
  }

  async setAdminPassword(password: string): Promise<void> {
    await db
      .insert(adminSettingsTable)
      .values({ key: "admin_password", value: password })
      .onConflictDoUpdate({
        target: adminSettingsTable.key,
        set: { value: password },
      });
  }

  async initializeDefaultFieldMappings(): Promise<void> {
    const existing = await this.getAllFieldMappings();
    if (existing.length > 0) return;

    const defaultMappings: InsertFieldMapping[] = [
      { team: "herren", eventType: "spiel", defaultField: "a-platz" },
      { team: "herren", eventType: "training", defaultField: "a-platz" },
      { team: "herren2", eventType: "spiel", defaultField: "a-platz" },
      { team: "a-jugend", eventType: "spiel", defaultField: "a-platz" },
      { team: "b-jugend", eventType: "spiel", defaultField: "b-platz" },
      { team: "c-jugend", eventType: "spiel", defaultField: "b-platz" },
      { team: "d-jugend", eventType: "spiel", defaultField: "b-platz" },
      { team: "e-jugend", eventType: "spiel", defaultField: "b-platz" },
      { team: "f-jugend", eventType: "spiel", defaultField: "b-platz" },
      { team: "g-jugend", eventType: "spiel", defaultField: "b-platz" },
    ];

    for (const mapping of defaultMappings) {
      await this.createFieldMapping(mapping);
    }
  }

  async createEventRequest(data: InsertEventRequest): Promise<EventRequest> {
    const id = randomUUID();
    const now = new Date();
    const [row] = await db
      .insert(eventRequestsTable)
      .values({
        id,
        createdBy: data.createdBy ?? null,
        type: data.type ?? "training",
        title: data.title || "Training",
        pitch: data.pitch,
        team: data.team ?? null,
        startAt: new Date(data.startAt),
        endAt: new Date(data.endAt),
        note: data.note ?? null,
        status: "pending",
        adminNote: null,
        approvedEventId: null,
        targetEventId: data.targetEventId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    console.log("[createEventRequest] stored:", { id, type: row.type, targetEventId: row.targetEventId });
    return dbEventRequestToEventRequest(row);
  }

  async getEventRequestById(id: string): Promise<EventRequest | null> {
    const [row] = await db.select().from(eventRequestsTable).where(eq(eventRequestsTable.id, id));
    return row ? dbEventRequestToEventRequest(row) : null;
  }

  async listEventRequests(filter: { status?: EventRequestStatus; fromDate?: string; toDate?: string }): Promise<EventRequest[]> {
    const conditions = [];
    if (filter.status) {
      conditions.push(eq(eventRequestsTable.status, filter.status));
    }
    if (filter.fromDate && filter.toDate) {
      conditions.push(
        between(
          eventRequestsTable.startAt,
          new Date(filter.fromDate),
          new Date(filter.toDate)
        )
      );
    }
    const whereClause = conditions.length ? and(...conditions) : undefined;
    const rows = await db
      .select()
      .from(eventRequestsTable)
      .where(whereClause ?? undefined)
      .orderBy(eventRequestsTable.startAt, desc(eventRequestsTable.createdAt));
    return rows.map(dbEventRequestToEventRequest);
  }

  async updateEventRequest(
    id: string,
    patch: Partial<InsertEventRequest> & { status?: EventRequestStatus; adminNote?: string; approvedEventId?: string | null }
  ): Promise<EventRequest | null> {
    const updateData: Partial<EventRequestDb> = {
      updatedAt: new Date(),
    };
    if (patch.createdBy !== undefined) updateData.createdBy = patch.createdBy ?? null;
    if (patch.type !== undefined) updateData.type = patch.type;
    if (patch.title !== undefined) updateData.title = patch.title;
    if (patch.pitch !== undefined) updateData.pitch = patch.pitch;
    if (patch.team !== undefined) updateData.team = patch.team ?? null;
    if (patch.startAt !== undefined) updateData.startAt = new Date(patch.startAt);
    if (patch.endAt !== undefined) updateData.endAt = new Date(patch.endAt);
    if (patch.note !== undefined) updateData.note = patch.note ?? null;
    if (patch.status !== undefined) updateData.status = patch.status;
    if (patch.adminNote !== undefined) updateData.adminNote = patch.adminNote ?? null;
    if (patch.approvedEventId !== undefined) updateData.approvedEventId = patch.approvedEventId ?? null;
    if ((patch as any).targetEventId !== undefined) (updateData as any).targetEventId = (patch as any).targetEventId ?? null;

    const [row] = await db
      .update(eventRequestsTable)
      .set(updateData)
      .where(eq(eventRequestsTable.id, id))
      .returning();
    return row ? dbEventRequestToEventRequest(row) : null;
  }

  // ============ PRODUCTS ============

  async getAllProducts(): Promise<Product[]> {
    const rows = await db.select().from(productsTable).orderBy(productsTable.createdAt);
    return rows.map(dbProductToProduct);
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const [row] = await db.select().from(productsTable).where(eq(productsTable.id, id));
    return row ? dbProductToProduct(row) : undefined;
  }

  async createProduct(data: InsertProduct): Promise<Product> {
    const id = randomUUID();
    const [row] = await db.insert(productsTable).values({
      id,
      name: data.name,
      category: data.category,
      basePrice: data.basePrice,
      imageUrl: data.imageUrl ?? "",
      additionalImages: data.additionalImages ?? [],
      active: data.active ?? true,
      shortDescription: data.shortDescription ?? null,
      longDescription: data.longDescription ?? null,
      brand: data.brand ?? null,
      season: data.season ?? null,
      availableSizes: data.availableSizes,
      initialsEnabled: data.initialsEnabled ?? false,
      initialsPrice: data.initialsPrice ?? 0,
      initialsLabel: data.initialsLabel ?? "Initialien",
    }).returning();
    return dbProductToProduct(row);
  }

  async updateProduct(id: string, data: Partial<InsertProduct>): Promise<Product | undefined> {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.basePrice !== undefined) updateData.basePrice = data.basePrice;
    if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl;
    if (data.additionalImages !== undefined) updateData.additionalImages = data.additionalImages;
    if (data.active !== undefined) updateData.active = data.active;
    if (data.shortDescription !== undefined) updateData.shortDescription = data.shortDescription ?? null;
    if (data.longDescription !== undefined) updateData.longDescription = data.longDescription ?? null;
    if (data.brand !== undefined) updateData.brand = data.brand ?? null;
    if (data.season !== undefined) updateData.season = data.season ?? null;
    if (data.availableSizes !== undefined) updateData.availableSizes = data.availableSizes;
    if (data.initialsEnabled !== undefined) updateData.initialsEnabled = data.initialsEnabled;
    if (data.initialsPrice !== undefined) updateData.initialsPrice = data.initialsPrice;
    if (data.initialsLabel !== undefined) updateData.initialsLabel = data.initialsLabel;
    const [row] = await db.update(productsTable).set(updateData as any).where(eq(productsTable.id, id)).returning();
    return row ? dbProductToProduct(row) : undefined;
  }

  async deleteProduct(id: string): Promise<boolean> {
    const result = await db.delete(productsTable).where(eq(productsTable.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ============ CAMPAIGNS ============

  async getAllCampaigns(): Promise<Campaign[]> {
    const rows = await db.select().from(campaignsTable).orderBy(desc(campaignsTable.createdAt));
    return rows.map(dbCampaignToCampaign);
  }

  async getActiveCampaigns(): Promise<Campaign[]> {
    const rows = await db.select().from(campaignsTable).where(eq(campaignsTable.active, true)).orderBy(campaignsTable.startDate);
    return rows.map(dbCampaignToCampaign);
  }

  async getCampaign(id: string): Promise<Campaign | undefined> {
    const [row] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
    return row ? dbCampaignToCampaign(row) : undefined;
  }

  async createCampaign(data: InsertCampaign): Promise<Campaign> {
    const id = randomUUID();
    const [row] = await db.insert(campaignsTable).values({
      id,
      name: data.name,
      description: data.description,
      startDate: data.startDate,
      endDate: data.endDate,
      active: data.active ?? true,
      productIds: data.productIds ?? [],
    }).returning();
    return dbCampaignToCampaign(row);
  }

  async updateCampaign(id: string, data: Partial<InsertCampaign>): Promise<Campaign | undefined> {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.startDate !== undefined) updateData.startDate = data.startDate;
    if (data.endDate !== undefined) updateData.endDate = data.endDate;
    if (data.active !== undefined) updateData.active = data.active;
    if (data.productIds !== undefined) updateData.productIds = data.productIds;
    const [row] = await db.update(campaignsTable).set(updateData as any).where(eq(campaignsTable.id, id)).returning();
    return row ? dbCampaignToCampaign(row) : undefined;
  }

  async deleteCampaign(id: string): Promise<boolean> {
    const result = await db.delete(campaignsTable).where(eq(campaignsTable.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ============ ORDERS ============

  async getAllOrders(): Promise<Order[]> {
    const rows = await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt));
    return rows.map(dbOrderToOrder);
  }

  async getOrdersByCampaign(campaignId: string): Promise<Order[]> {
    const rows = await db.select().from(ordersTable).where(eq(ordersTable.campaignId, campaignId)).orderBy(desc(ordersTable.createdAt));
    return rows.map(dbOrderToOrder);
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const [row] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
    return row ? dbOrderToOrder(row) : undefined;
  }

  async createOrder(data: InsertOrder): Promise<Order> {
    const id = randomUUID();
    const campaign = await this.getCampaign(data.campaignId);
    const campaignName = campaign?.name ?? "";
    const totalAmount = (data.items as any[]).reduce((sum: number, item: any) => sum + (item.totalPrice ?? 0), 0);
    const [row] = await db.insert(ordersTable).values({
      id,
      campaignId: data.campaignId,
      campaignName,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      items: data.items as any,
      totalAmount,
    }).returning();
    return dbOrderToOrder(row);
  }
}

// ============ DB → Domain helpers ============

function dbProductToProduct(row: typeof productsTable.$inferSelect): Product {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    basePrice: row.basePrice,
    imageUrl: row.imageUrl,
    additionalImages: (row.additionalImages as string[]) ?? [],
    active: row.active,
    shortDescription: row.shortDescription ?? undefined,
    longDescription: row.longDescription ?? undefined,
    brand: row.brand ?? undefined,
    season: row.season ?? undefined,
    availableSizes: (row.availableSizes as Size[]) ?? [],
    initialsEnabled: row.initialsEnabled,
    initialsPrice: row.initialsPrice,
    initialsLabel: row.initialsLabel,
  };
}

function dbCampaignToCampaign(row: typeof campaignsTable.$inferSelect): Campaign {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    startDate: row.startDate,
    endDate: row.endDate,
    active: row.active,
    productIds: (row.productIds as string[]) ?? [],
  };
}

function dbOrderToOrder(row: typeof ordersTable.$inferSelect): Order {
  return {
    id: row.id,
    campaignId: row.campaignId,
    campaignName: row.campaignName,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    items: (row.items as OrderItem[]) ?? [],
    totalAmount: row.totalAmount,
    createdAt: row.createdAt.toISOString(),
  };
}

export const dbStorage = new DbStorage();
