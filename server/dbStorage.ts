import { eq, and, between, or, isNull, desc, inArray, asc } from "drizzle-orm";
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
  festivalsTable,
  festivalStationsTable,
  festivalShiftsTable,
  festivalSignupsTable,
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
  type Festival,
  type InsertFestival,
  type FestivalStation,
  type InsertFestivalStation,
  type FestivalShift,
  type InsertFestivalShift,
  type FestivalSignup,
  type InsertFestivalSignup,
  type BulkCreateShifts,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { hashPassword, isPasswordHash } from "./passwords";

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
  getAdminPassword(): Promise<string | null>;
  setAdminPassword(password: string): Promise<void>;
  changeAdminPassword(expectedHash: string, newPassword: string): Promise<string | null>;
  initializeDefaultFieldMappings(): Promise<void>;
  // Event requests (training proposals)
  createEventRequest(data: InsertEventRequest): Promise<EventRequest>;
  getEventRequestById(id: string): Promise<EventRequest | null>;
  listEventRequests(filter: { status?: EventRequestStatus; fromDate?: string; toDate?: string }): Promise<EventRequest[]>;
  updateEventRequest(
    id: string,
    patch: Partial<InsertEventRequest> & { status?: EventRequestStatus; adminNote?: string; rejectionReason?: string; approvedEventId?: string | null }
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
  getCampaignPassword(id: string): Promise<string | null>;
  // Orders
  getAllOrders(): Promise<Order[]>;
  getOrdersByCampaign(campaignId: string): Promise<Order[]>;
  getOrder(id: string): Promise<Order | undefined>;
  createOrder(order: InsertOrder): Promise<Order>;
  deleteOrder(id: string): Promise<boolean>;
  // Festivals (Helfer-Schichtplaner)
  getAllFestivals(): Promise<Festival[]>;
  getActiveFestivals(): Promise<Festival[]>;
  getFestival(id: string): Promise<Festival | undefined>;
  /** Liefert das Klartext-Passwort des Festes oder null. Nur server-intern verwenden! */
  getFestivalPassword(id: string): Promise<string | null>;
  createFestival(data: InsertFestival): Promise<Festival>;
  updateFestival(id: string, data: Partial<InsertFestival>): Promise<Festival | undefined>;
  deleteFestival(id: string): Promise<boolean>;
  // Stations
  getStationsByFestival(festivalId: string): Promise<FestivalStation[]>;
  createStation(festivalId: string, data: InsertFestivalStation): Promise<FestivalStation>;
  updateStation(id: string, data: Partial<InsertFestivalStation>): Promise<FestivalStation | undefined>;
  deleteStation(id: string): Promise<boolean>;
  // Shifts
  getShiftsByFestival(festivalId: string): Promise<FestivalShift[]>;
  createShift(festivalId: string, data: InsertFestivalShift): Promise<FestivalShift>;
  createShiftsBulk(festivalId: string, data: BulkCreateShifts): Promise<FestivalShift[]>;
  updateShift(id: string, data: Partial<InsertFestivalShift>): Promise<FestivalShift | undefined>;
  deleteShift(id: string): Promise<boolean>;
  // Signups
  getSignupsByFestival(festivalId: string): Promise<FestivalSignup[]>;
  getSignupsByShift(shiftId: string): Promise<FestivalSignup[]>;
  countSignupsForShift(shiftId: string): Promise<number>;
  createSignup(data: InsertFestivalSignup): Promise<FestivalSignup>;
  deleteSignup(id: string): Promise<boolean>;
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
    contactEmail: dbReq.contactEmail ?? undefined,
    contactPhone: dbReq.contactPhone ?? undefined,
    rejectionReason: dbReq.rejectionReason ?? undefined,
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
    // Nur BFV-Spiele: Bei manuell angelegten Spielen darf ein vom Admin
    // gesetzter Platz den Import überleben.
    const updated = await db
      .update(calendarEventsTable)
      .set({ field: null, updatedAt: new Date() })
      .where(
        and(
          eq(calendarEventsTable.type, "spiel"),
          eq(calendarEventsTable.source, "BFV"),
          or(eq(calendarEventsTable.isHomeGame, false), isNull(calendarEventsTable.isHomeGame))
        )
      )
      .returning({ id: calendarEventsTable.id });
    return updated.length;
  }

  async createImportRun(): Promise<ImportRunDb> {
    // startedAt explizit von der JS-Uhr, damit startedAt und finishedAt konsistent sind
    const [run] = await db.insert(importRunsTable).values({ startedAt: new Date() }).returning();
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

  async getAdminPassword(): Promise<string | null> {
    const [setting] = await db
      .select()
      .from(adminSettingsTable)
      .where(eq(adminSettingsTable.key, "admin_password"));
    return setting?.value || null;
  }

  async setAdminPassword(password: string): Promise<void> {
    const encoded = await hashPassword(password);
    await db
      .insert(adminSettingsTable)
      .values({ key: "admin_password", value: encoded })
      .onConflictDoUpdate({
        target: adminSettingsTable.key,
        set: { value: encoded },
      });
  }

  async changeAdminPassword(expectedHash: string, newPassword: string): Promise<string | null> {
    const encoded = await hashPassword(newPassword);
    const [updated] = await db.update(adminSettingsTable).set({ value: encoded }).where(and(
      eq(adminSettingsTable.key, "admin_password"), eq(adminSettingsTable.value, expectedHash),
    )).returning({ value: adminSettingsTable.value });
    return updated?.value ?? null;
  }

  async initializeDefaultFieldMappings(): Promise<void> {
    // Diff-basiert: nur fehlende team+eventType-Kombis anlegen, bestehende
    // (ggf. vom Admin angepasste) Zuordnungen nie überschreiben.
    const existing = await this.getAllFieldMappings();
    const have = new Set(existing.map((m) => `${m.team}|${m.eventType}`));

    const defaultMappings: InsertFieldMapping[] = [
      { team: "herren", eventType: "spiel", defaultField: "a-platz" },
      { team: "herren", eventType: "training", defaultField: "a-platz" },
      { team: "herren2", eventType: "spiel", defaultField: "a-platz" },
      { team: "a-jugend", eventType: "spiel", defaultField: "a-platz" },
      { team: "a-jugend-2", eventType: "spiel", defaultField: "a-platz" },
      { team: "b-jugend", eventType: "spiel", defaultField: "b-platz" },
      { team: "b-jugend-2", eventType: "spiel", defaultField: "b-platz" },
      { team: "c-jugend", eventType: "spiel", defaultField: "b-platz" },
      { team: "c-jugend-2", eventType: "spiel", defaultField: "b-platz" },
      { team: "d-jugend", eventType: "spiel", defaultField: "b-platz" },
      { team: "d-jugend-2", eventType: "spiel", defaultField: "b-platz" },
      { team: "e-jugend", eventType: "spiel", defaultField: "b-platz" },
      { team: "e-jugend-2", eventType: "spiel", defaultField: "b-platz" },
      { team: "f-jugend", eventType: "spiel", defaultField: "b-platz" },
      { team: "f-jugend-2", eventType: "spiel", defaultField: "b-platz" },
      { team: "g-jugend", eventType: "spiel", defaultField: "b-platz" },
      { team: "g-jugend-2", eventType: "spiel", defaultField: "b-platz" },
    ];

    const missing = defaultMappings.filter((m) => !have.has(`${m.team}|${m.eventType}`));
    for (const mapping of missing) {
      await this.createFieldMapping(mapping);
    }
    if (missing.length > 0) {
      console.log(`[field-mappings] ${missing.length} Standard-Platz-Zuordnung(en) ergänzt.`);
    }
  }

  async createEventRequest(data: InsertEventRequest): Promise<EventRequest> {
    const id = randomUUID();
    const now = new Date();
    const [row] = await db
      .insert(eventRequestsTable)
      .values({
        id,
        contactEmail: data.contactEmail ?? null,
        contactPhone: data.contactPhone ?? null,
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
    patch: Partial<InsertEventRequest> & { status?: EventRequestStatus; adminNote?: string; rejectionReason?: string; approvedEventId?: string | null }
  ): Promise<EventRequest | null> {
    const updateData: Partial<EventRequestDb> = {
      updatedAt: new Date(),
    };
    if (patch.rejectionReason !== undefined) updateData.rejectionReason = patch.rejectionReason;
    if (patch.contactPhone !== undefined) updateData.contactPhone = patch.contactPhone;
    if (patch.contactEmail !== undefined) updateData.contactEmail = patch.contactEmail;
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
      password: data.password ? await hashPassword(data.password) : null,
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
    if (data.password !== undefined) updateData.password = data.password ? await hashPassword(data.password) : null;
    const [row] = await db.update(campaignsTable).set(updateData as any).where(eq(campaignsTable.id, id)).returning();
    return row ? dbCampaignToCampaign(row) : undefined;
  }

  async deleteCampaign(id: string): Promise<boolean> {
    const result = await db.delete(campaignsTable).where(eq(campaignsTable.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getCampaignPassword(id: string): Promise<string | null> {
    const [row] = await db.select({ password: campaignsTable.password }).from(campaignsTable).where(eq(campaignsTable.id, id));
    return row?.password || null;
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

  async deleteOrder(id: string): Promise<boolean> {
    const result = await db.delete(ordersTable).where(eq(ordersTable.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ============ FESTIVALS (Schichtplaner) ============

  async getAllFestivals(): Promise<Festival[]> {
    const rows = await db.select().from(festivalsTable).orderBy(desc(festivalsTable.startDate));
    return rows.map(dbFestivalToFestival);
  }

  async getActiveFestivals(): Promise<Festival[]> {
    const rows = await db
      .select()
      .from(festivalsTable)
      .where(eq(festivalsTable.active, true))
      .orderBy(festivalsTable.startDate);
    return rows.map(dbFestivalToFestival);
  }

  async getFestival(id: string): Promise<Festival | undefined> {
    const [row] = await db.select().from(festivalsTable).where(eq(festivalsTable.id, id));
    return row ? dbFestivalToFestival(row) : undefined;
  }

  async getFestivalPassword(id: string): Promise<string | null> {
    const [row] = await db
      .select({ password: festivalsTable.password })
      .from(festivalsTable)
      .where(eq(festivalsTable.id, id));
    return row?.password || null;
  }

  async createFestival(data: InsertFestival): Promise<Festival> {
    const id = randomUUID();
    const [row] = await db
      .insert(festivalsTable)
      .values({
        id,
        name: data.name,
        description: data.description ?? "",
        location: data.location ?? "",
        startDate: data.startDate,
        endDate: data.endDate,
        active: data.active ?? true,
        password: data.password ? await hashPassword(data.password) : null,
      })
      .returning();
    return dbFestivalToFestival(row);
  }

  async updateFestival(id: string, data: Partial<InsertFestival>): Promise<Festival | undefined> {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.location !== undefined) updateData.location = data.location;
    if (data.startDate !== undefined) updateData.startDate = data.startDate;
    if (data.endDate !== undefined) updateData.endDate = data.endDate;
    if (data.active !== undefined) updateData.active = data.active;
    if (data.password !== undefined) {
      updateData.password = data.password ? await hashPassword(data.password) : null;
    }
    const [row] = await db
      .update(festivalsTable)
      .set(updateData as any)
      .where(eq(festivalsTable.id, id))
      .returning();
    return row ? dbFestivalToFestival(row) : undefined;
  }

  async deleteFestival(id: string): Promise<boolean> {
    // Kaskadierend: Signups → Shifts → Stations → Festival
    const stations = await db
      .select({ id: festivalStationsTable.id })
      .from(festivalStationsTable)
      .where(eq(festivalStationsTable.festivalId, id));
    const shifts = await db
      .select({ id: festivalShiftsTable.id })
      .from(festivalShiftsTable)
      .where(eq(festivalShiftsTable.festivalId, id));
    const shiftIds = shifts.map((s) => s.id);
    if (shiftIds.length > 0) {
      await db.delete(festivalSignupsTable).where(inArray(festivalSignupsTable.shiftId, shiftIds));
    }
    await db.delete(festivalShiftsTable).where(eq(festivalShiftsTable.festivalId, id));
    await db.delete(festivalStationsTable).where(eq(festivalStationsTable.festivalId, id));
    const result = await db.delete(festivalsTable).where(eq(festivalsTable.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ----- Stations -----

  async getStationsByFestival(festivalId: string): Promise<FestivalStation[]> {
    const rows = await db
      .select()
      .from(festivalStationsTable)
      .where(eq(festivalStationsTable.festivalId, festivalId))
      .orderBy(asc(festivalStationsTable.displayOrder), asc(festivalStationsTable.createdAt));
    return rows.map(dbStationToStation);
  }

  async createStation(festivalId: string, data: InsertFestivalStation): Promise<FestivalStation> {
    const id = randomUUID();
    const [row] = await db
      .insert(festivalStationsTable)
      .values({
        id,
        festivalId,
        name: data.name,
        description: data.description ?? null,
        displayOrder: data.displayOrder ?? 0,
      })
      .returning();
    return dbStationToStation(row);
  }

  async updateStation(id: string, data: Partial<InsertFestivalStation>): Promise<FestivalStation | undefined> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description ?? null;
    if (data.displayOrder !== undefined) updateData.displayOrder = data.displayOrder;
    const [row] = await db
      .update(festivalStationsTable)
      .set(updateData as any)
      .where(eq(festivalStationsTable.id, id))
      .returning();
    return row ? dbStationToStation(row) : undefined;
  }

  async deleteStation(id: string): Promise<boolean> {
    // Kaskadierend: Signups der Shifts → Shifts → Station
    const shifts = await db
      .select({ id: festivalShiftsTable.id })
      .from(festivalShiftsTable)
      .where(eq(festivalShiftsTable.stationId, id));
    const shiftIds = shifts.map((s) => s.id);
    if (shiftIds.length > 0) {
      await db.delete(festivalSignupsTable).where(inArray(festivalSignupsTable.shiftId, shiftIds));
    }
    await db.delete(festivalShiftsTable).where(eq(festivalShiftsTable.stationId, id));
    const result = await db.delete(festivalStationsTable).where(eq(festivalStationsTable.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ----- Shifts -----

  async getShiftsByFestival(festivalId: string): Promise<FestivalShift[]> {
    const rows = await db
      .select()
      .from(festivalShiftsTable)
      .where(eq(festivalShiftsTable.festivalId, festivalId))
      .orderBy(asc(festivalShiftsTable.startTime));
    return rows.map(dbShiftToShift);
  }

  async createShift(festivalId: string, data: InsertFestivalShift): Promise<FestivalShift> {
    const id = randomUUID();
    const [row] = await db
      .insert(festivalShiftsTable)
      .values({
        id,
        festivalId,
        stationId: data.stationId,
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        requiredHelpers: data.requiredHelpers ?? 1,
      })
      .returning();
    return dbShiftToShift(row);
  }

  async createShiftsBulk(festivalId: string, data: BulkCreateShifts): Promise<FestivalShift[]> {
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);
    if (!(start.getTime() < end.getTime())) {
      throw new Error("Endzeit muss nach der Startzeit liegen.");
    }
    const slotMs = data.slotDurationMinutes * 60 * 1000;
    const inserts: Array<{
      id: string;
      festivalId: string;
      stationId: string;
      startTime: Date;
      endTime: Date;
      requiredHelpers: number;
    }> = [];
    for (const stationId of data.stationIds) {
      let cursor = start.getTime();
      while (cursor + slotMs <= end.getTime() + 1) {
        const slotStart = new Date(cursor);
        const slotEnd = new Date(cursor + slotMs);
        // Schutz: slot darf nicht über end hinausgehen
        if (slotEnd.getTime() > end.getTime()) break;
        inserts.push({
          id: randomUUID(),
          festivalId,
          stationId,
          startTime: slotStart,
          endTime: slotEnd,
          requiredHelpers: data.requiredHelpers ?? 1,
        });
        cursor += slotMs;
      }
    }
    if (inserts.length === 0) return [];
    const rows = await db.insert(festivalShiftsTable).values(inserts).returning();
    return rows.map(dbShiftToShift);
  }

  async updateShift(id: string, data: Partial<InsertFestivalShift>): Promise<FestivalShift | undefined> {
    const updateData: Record<string, unknown> = {};
    if (data.stationId !== undefined) updateData.stationId = data.stationId;
    if (data.startTime !== undefined) updateData.startTime = new Date(data.startTime);
    if (data.endTime !== undefined) updateData.endTime = new Date(data.endTime);
    if (data.requiredHelpers !== undefined) updateData.requiredHelpers = data.requiredHelpers;
    const [row] = await db
      .update(festivalShiftsTable)
      .set(updateData as any)
      .where(eq(festivalShiftsTable.id, id))
      .returning();
    return row ? dbShiftToShift(row) : undefined;
  }

  async deleteShift(id: string): Promise<boolean> {
    await db.delete(festivalSignupsTable).where(eq(festivalSignupsTable.shiftId, id));
    const result = await db.delete(festivalShiftsTable).where(eq(festivalShiftsTable.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ----- Signups -----

  async getSignupsByFestival(festivalId: string): Promise<FestivalSignup[]> {
    const shifts = await db
      .select({ id: festivalShiftsTable.id })
      .from(festivalShiftsTable)
      .where(eq(festivalShiftsTable.festivalId, festivalId));
    const shiftIds = shifts.map((s) => s.id);
    if (shiftIds.length === 0) return [];
    const rows = await db
      .select()
      .from(festivalSignupsTable)
      .where(inArray(festivalSignupsTable.shiftId, shiftIds))
      .orderBy(asc(festivalSignupsTable.createdAt));
    return rows.map(dbSignupToSignup);
  }

  async getSignupsByShift(shiftId: string): Promise<FestivalSignup[]> {
    const rows = await db
      .select()
      .from(festivalSignupsTable)
      .where(eq(festivalSignupsTable.shiftId, shiftId))
      .orderBy(asc(festivalSignupsTable.createdAt));
    return rows.map(dbSignupToSignup);
  }

  async countSignupsForShift(shiftId: string): Promise<number> {
    const rows = await db
      .select({ id: festivalSignupsTable.id })
      .from(festivalSignupsTable)
      .where(eq(festivalSignupsTable.shiftId, shiftId));
    return rows.length;
  }

  async createSignup(data: InsertFestivalSignup): Promise<FestivalSignup> {
    const id = randomUUID();
    const [row] = await db
      .insert(festivalSignupsTable)
      .values({
        id,
        shiftId: data.shiftId,
        helperName: data.helperName,
        helperPhone: data.helperPhone ?? null,
        notes: data.notes ?? null,
      })
      .returning();
    return dbSignupToSignup(row);
  }

  async deleteSignup(id: string): Promise<boolean> {
    const result = await db.delete(festivalSignupsTable).where(eq(festivalSignupsTable.id, id));
    return (result.rowCount ?? 0) > 0;
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
    hasPassword: !!row.password,
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

// ----- Festival-Mapper (Passwort wird NIE durchgereicht) -----

function dbFestivalToFestival(row: typeof festivalsTable.$inferSelect): Festival {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    location: row.location,
    startDate: row.startDate,
    endDate: row.endDate,
    active: row.active,
    hasPassword: !!row.password,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function dbStationToStation(row: typeof festivalStationsTable.$inferSelect): FestivalStation {
  return {
    id: row.id,
    festivalId: row.festivalId,
    name: row.name,
    description: row.description ?? undefined,
    displayOrder: row.displayOrder,
    createdAt: row.createdAt.toISOString(),
  };
}

function dbShiftToShift(row: typeof festivalShiftsTable.$inferSelect): FestivalShift {
  return {
    id: row.id,
    festivalId: row.festivalId,
    stationId: row.stationId,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    requiredHelpers: row.requiredHelpers,
    createdAt: row.createdAt.toISOString(),
  };
}

function dbSignupToSignup(row: typeof festivalSignupsTable.$inferSelect): FestivalSignup {
  return {
    id: row.id,
    shiftId: row.shiftId,
    helperName: row.helperName,
    helperPhone: row.helperPhone ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

export const dbStorage = new DbStorage();

/** Upgrade existing values before registering authentication routes. No new defaults. */
export async function migrateStoredPasswords(): Promise<void> {
  const [admin] = await db.select().from(adminSettingsTable).where(eq(adminSettingsTable.key, "admin_password"));
  if (admin?.value && !isPasswordHash(admin.value)) {
    const encoded = await hashPassword(admin.value);
    await db.update(adminSettingsTable).set({ value: encoded }).where(and(
      eq(adminSettingsTable.key, "admin_password"), eq(adminSettingsTable.value, admin.value),
    ));
  }
  const campaigns = await db.select({ id: campaignsTable.id, password: campaignsTable.password }).from(campaignsTable);
  for (const campaign of campaigns) {
    if (campaign.password === "") {
      await db.update(campaignsTable).set({ password: null }).where(and(
        eq(campaignsTable.id, campaign.id), eq(campaignsTable.password, ""),
      ));
      continue;
    }
    if (!campaign.password || isPasswordHash(campaign.password)) continue;
    const encoded = await hashPassword(campaign.password);
    await db.update(campaignsTable).set({ password: encoded }).where(and(
      eq(campaignsTable.id, campaign.id), eq(campaignsTable.password, campaign.password),
    ));
  }
  const festivals = await db.select({ id: festivalsTable.id, password: festivalsTable.password }).from(festivalsTable);
  for (const festival of festivals) {
    if (festival.password === "") {
      await db.update(festivalsTable).set({ password: null }).where(and(
        eq(festivalsTable.id, festival.id), eq(festivalsTable.password, ""),
      ));
      continue;
    }
    if (!festival.password || isPasswordHash(festival.password)) continue;
    const encoded = await hashPassword(festival.password);
    await db.update(festivalsTable).set({ password: encoded }).where(and(
      eq(festivalsTable.id, festival.id), eq(festivalsTable.password, festival.password),
    ));
  }
}
