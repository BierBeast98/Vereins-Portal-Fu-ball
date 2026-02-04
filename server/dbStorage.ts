import { eq, and, between, sql, or, isNull } from "drizzle-orm";
import { db } from "./db";
import {
  calendarEventsTable,
  fieldMappingsTable,
  bfvImportConfigsTable,
  bfvImportHistoryTable,
  adminSettingsTable,
  type CalendarEventDb,
  type InsertCalendarEventDb,
  type FieldMappingDb,
  type InsertFieldMappingDb,
  type BfvImportConfigDb,
  type InsertBfvImportConfigDb,
  type BfvImportHistoryDb,
  type InsertBfvImportHistoryDb,
  type CalendarEvent,
  type InsertCalendarEvent,
  type FieldMapping,
  type InsertFieldMapping,
  type BfvImportConfig,
  type InsertBfvImportConfig,
  type Team,
  type Field,
  type EventType,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IDbStorage {
  getAllCalendarEvents(): Promise<CalendarEvent[]>;
  getCalendarEventsByDateRange(startDate: string, endDate: string): Promise<CalendarEvent[]>;
  getCalendarEventsByField(field: string, startDate: string, endDate: string): Promise<CalendarEvent[]>;
  getCalendarEvent(id: string): Promise<CalendarEvent | undefined>;
  getCalendarEventByBfvId(bfvMatchId: string): Promise<CalendarEvent | undefined>;
  getCalendarEventByMatchKey(teamHome: string, teamAway: string, date: string): Promise<CalendarEvent | undefined>;
  getCalendarEventsByRecurringGroup(recurringGroupId: string): Promise<CalendarEvent[]>;
  createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent>;
  updateCalendarEvent(id: string, event: Partial<InsertCalendarEvent>): Promise<CalendarEvent | undefined>;
  updateCalendarEventsByRecurringGroup(recurringGroupId: string, data: Partial<InsertCalendarEvent>): Promise<number>;
  deleteCalendarEvent(id: string): Promise<boolean>;
  deleteCalendarEventsByRecurringGroup(recurringGroupId: string): Promise<number>;
  archiveCalendarEvent(id: string): Promise<boolean>;
  getBfvEventIds(): Promise<string[]>;
  getAllFieldMappings(): Promise<FieldMapping[]>;
  createFieldMapping(mapping: InsertFieldMapping): Promise<FieldMapping>;
  updateFieldMapping(id: string, mapping: Partial<InsertFieldMapping>): Promise<FieldMapping | undefined>;
  deleteFieldMapping(id: string): Promise<boolean>;
  getDefaultField(team: Team, eventType: EventType): Promise<Field | undefined>;
  getAllBfvImportConfigs(): Promise<BfvImportConfig[]>;
  getBfvImportConfig(id: string): Promise<BfvImportConfig | undefined>;
  createBfvImportConfig(config: InsertBfvImportConfig): Promise<BfvImportConfig>;
  updateBfvImportConfig(id: string, config: Partial<InsertBfvImportConfig & { lastImport?: string }>): Promise<BfvImportConfig | undefined>;
  deleteBfvImportConfig(id: string): Promise<boolean>;
  createImportHistory(history: InsertBfvImportHistoryDb): Promise<BfvImportHistoryDb>;
  getImportHistory(): Promise<BfvImportHistoryDb[]>;
  getAdminPassword(): Promise<string>;
  setAdminPassword(password: string): Promise<void>;
  initializeDefaultFieldMappings(): Promise<void>;
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
    recurringGroupId: dbEvent.recurringGroupId ?? undefined,
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

function dbBfvConfigToBfvConfig(dbConfig: BfvImportConfigDb): BfvImportConfig {
  return {
    id: dbConfig.id,
    team: dbConfig.team as Team,
    bfvTeamUrl: dbConfig.bfvTeamUrl,
    season: dbConfig.season,
    lastImport: dbConfig.lastImport?.toISOString(),
    active: dbConfig.active,
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

  async getCalendarEventByBfvId(bfvMatchId: string): Promise<CalendarEvent | undefined> {
    const [event] = await db
      .select()
      .from(calendarEventsTable)
      .where(
        and(
          eq(calendarEventsTable.source, "BFV"),
          eq(calendarEventsTable.externalId, bfvMatchId)
        )
      );
    return event ? dbEventToCalendarEvent(event) : undefined;
  }

  async getCalendarEventByMatchKey(teamHome: string, teamAway: string, date: string): Promise<CalendarEvent | undefined> {
    const [event] = await db
      .select()
      .from(calendarEventsTable)
      .where(
        and(
          eq(calendarEventsTable.source, "BFV"),
          eq(calendarEventsTable.teamHome, teamHome),
          eq(calendarEventsTable.teamAway, teamAway),
          eq(calendarEventsTable.date, date),
          eq(calendarEventsTable.status, "ACTIVE")
        )
      );
    return event ? dbEventToCalendarEvent(event) : undefined;
  }

  async createCalendarEvent(insertEvent: InsertCalendarEvent): Promise<CalendarEvent> {
    const id = randomUUID();
    const now = new Date();
    
    const dbEvent: InsertCalendarEventDb = {
      source: insertEvent.bfvImported ? "BFV" : "MANUAL",
      externalId: insertEvent.bfvMatchId || null,
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
      .set({ status: "ARCHIVED", updatedAt: new Date() })
      .where(eq(calendarEventsTable.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getBfvEventIds(): Promise<string[]> {
    const events = await db
      .select({ externalId: calendarEventsTable.externalId })
      .from(calendarEventsTable)
      .where(
        and(
          eq(calendarEventsTable.source, "BFV"),
          eq(calendarEventsTable.status, "ACTIVE")
        )
      );
    return events
      .filter((e) => e.externalId !== null)
      .map((e) => e.externalId as string);
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

  async getAllBfvImportConfigs(): Promise<BfvImportConfig[]> {
    const configs = await db.select().from(bfvImportConfigsTable);
    return configs.map(dbBfvConfigToBfvConfig);
  }

  async getBfvImportConfig(id: string): Promise<BfvImportConfig | undefined> {
    const [config] = await db
      .select()
      .from(bfvImportConfigsTable)
      .where(eq(bfvImportConfigsTable.id, id));
    return config ? dbBfvConfigToBfvConfig(config) : undefined;
  }

  async createBfvImportConfig(insertConfig: InsertBfvImportConfig): Promise<BfvImportConfig> {
    const id = randomUUID();
    const [created] = await db
      .insert(bfvImportConfigsTable)
      .values({ id, ...insertConfig })
      .returning();
    return dbBfvConfigToBfvConfig(created);
  }

  async updateBfvImportConfig(
    id: string,
    data: Partial<InsertBfvImportConfig & { lastImport?: string }>
  ): Promise<BfvImportConfig | undefined> {
    const updateData: any = { ...data };
    if (data.lastImport) {
      updateData.lastImport = new Date(data.lastImport);
    }
    const [updated] = await db
      .update(bfvImportConfigsTable)
      .set(updateData)
      .where(eq(bfvImportConfigsTable.id, id))
      .returning();
    return updated ? dbBfvConfigToBfvConfig(updated) : undefined;
  }

  async deleteBfvImportConfig(id: string): Promise<boolean> {
    const result = await db
      .delete(bfvImportConfigsTable)
      .where(eq(bfvImportConfigsTable.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async createImportHistory(history: InsertBfvImportHistoryDb): Promise<BfvImportHistoryDb> {
    const id = randomUUID();
    const [created] = await db
      .insert(bfvImportHistoryTable)
      .values({ id, ...history })
      .returning();
    return created;
  }

  async getImportHistory(): Promise<BfvImportHistoryDb[]> {
    return db
      .select()
      .from(bfvImportHistoryTable)
      .orderBy(sql`${bfvImportHistoryTable.importedAt} DESC`)
      .limit(50);
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
}

export const dbStorage = new DbStorage();
