import { eq, and, or, sql } from "drizzle-orm";
import { db } from "./db";
import {
  calendarEventsTable,
  type CalendarEvent,
  type Team,
  type Field,
  type BfvImportSummary,
  TEAMS,
} from "@shared/schema";
import { dbStorage } from "./dbStorage";
import { randomUUID } from "crypto";

export interface ParsedBfvMatch {
  externalId: string;
  date: string;
  startTime: string;
  endTime: string;
  teamHome: string;
  teamAway: string;
  team: Team;
  isHomeGame: boolean;
  opponent: string;
  competition: string;
  location?: string;
  rawData?: any;
}

function generateMatchKey(teamHome: string, teamAway: string, date: string, competition?: string): string {
  const normalizedHome = teamHome.toLowerCase().trim();
  const normalizedAway = teamAway.toLowerCase().trim();
  const key = `${normalizedHome}|${normalizedAway}|${date}`;
  if (competition) {
    return `${key}|${competition.toLowerCase().trim()}`;
  }
  return key;
}

function generateExternalId(match: ParsedBfvMatch): string {
  if (match.externalId && match.externalId.length > 0) {
    return match.externalId;
  }
  return generateMatchKey(match.teamHome, match.teamAway, match.date, match.competition);
}

async function getDefaultFieldForTeam(team: Team, isHomeGame: boolean): Promise<Field | undefined> {
  if (!isHomeGame) {
    return undefined;
  }
  const field = await dbStorage.getDefaultField(team, "spiel");
  return field;
}

function matchNeedsUpdate(
  existing: CalendarEvent,
  match: ParsedBfvMatch,
  newField?: Field
): { needsUpdate: boolean; changes: string[] } {
  const changes: string[] = [];

  if (existing.date !== match.date) {
    changes.push(`Datum: ${existing.date} -> ${match.date}`);
  }
  if (existing.startTime !== match.startTime) {
    changes.push(`Startzeit: ${existing.startTime} -> ${match.startTime}`);
  }
  if (existing.endTime !== match.endTime) {
    changes.push(`Endzeit: ${existing.endTime} -> ${match.endTime}`);
  }
  if (newField && existing.field !== newField) {
    changes.push(`Platz: ${existing.field || "keiner"} -> ${newField}`);
  }
  if (match.location && existing.location !== match.location) {
    changes.push(`Ort: ${existing.location || "keiner"} -> ${match.location}`);
  }
  if (match.competition && existing.competition !== match.competition) {
    changes.push(`Wettbewerb: ${existing.competition || "keiner"} -> ${match.competition}`);
  }

  return { needsUpdate: changes.length > 0, changes };
}

export async function importBfvMatches(
  matches: ParsedBfvMatch[],
  fileName?: string,
  archiveMissing: boolean = false
): Promise<BfvImportSummary> {
  const summary: BfvImportSummary = {
    createdCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    archivedCount: 0,
    errorCount: 0,
    errors: [],
  };

  const processedExternalIds: Set<string> = new Set();

  console.log(`[BFV Import] Starting import of ${matches.length} matches...`);

  for (const match of matches) {
    try {
      const externalId = generateExternalId(match);
      processedExternalIds.add(externalId);

      let existingEvent = await dbStorage.getCalendarEventByBfvId(externalId);

      if (!existingEvent) {
        const matchKey = generateMatchKey(match.teamHome, match.teamAway, match.date, match.competition);
        const [fallbackEvent] = await db
          .select()
          .from(calendarEventsTable)
          .where(
            and(
              eq(calendarEventsTable.source, "BFV"),
              eq(calendarEventsTable.teamHome, match.teamHome),
              eq(calendarEventsTable.teamAway, match.teamAway),
              eq(calendarEventsTable.status, "ACTIVE")
            )
          );
        if (fallbackEvent) {
          existingEvent = {
            id: fallbackEvent.id,
            title: fallbackEvent.title,
            type: fallbackEvent.type as any,
            team: fallbackEvent.team as Team | undefined,
            field: fallbackEvent.field as Field | undefined,
            date: fallbackEvent.date,
            startTime: fallbackEvent.startTime,
            endTime: fallbackEvent.endTime,
            isHomeGame: fallbackEvent.isHomeGame ?? undefined,
            opponent: fallbackEvent.opponent ?? undefined,
            location: fallbackEvent.location ?? undefined,
            competition: fallbackEvent.competition ?? undefined,
            description: fallbackEvent.description ?? undefined,
            bfvImported: true,
            bfvMatchId: fallbackEvent.externalId ?? undefined,
            createdAt: fallbackEvent.createdAt.toISOString(),
            updatedAt: fallbackEvent.updatedAt.toISOString(),
          };
        }
      }

      const defaultField = await getDefaultFieldForTeam(match.team, match.isHomeGame);

      if (existingEvent) {
        const { needsUpdate, changes } = matchNeedsUpdate(existingEvent, match, defaultField);

        if (needsUpdate) {
          const title = match.isHomeGame
            ? `${match.teamHome} vs ${match.teamAway}`
            : `${match.teamHome} vs ${match.teamAway}`;

          await db
            .update(calendarEventsTable)
            .set({
              externalId: externalId,
              title: title,
              date: match.date,
              startTime: match.startTime,
              endTime: match.endTime,
              field: match.isHomeGame ? defaultField : null,
              location: match.location || null,
              competition: match.competition || null,
              teamHome: match.teamHome,
              teamAway: match.teamAway,
              rawPayload: match.rawData || null,
              updatedAt: new Date(),
            })
            .where(eq(calendarEventsTable.id, existingEvent.id));

          summary.updatedCount++;
          console.log(`[BFV Import] Updated: ${title} (${changes.join(", ")})`);
        } else {
          summary.unchangedCount++;
        }
      } else {
        const title = match.isHomeGame
          ? `${match.teamHome} vs ${match.teamAway}`
          : `${match.teamHome} vs ${match.teamAway}`;

        const id = randomUUID();
        await db.insert(calendarEventsTable).values({
          id,
          source: "BFV",
          externalId: externalId,
          type: "spiel",
          title: title,
          team: match.team,
          teamHome: match.teamHome,
          teamAway: match.teamAway,
          field: match.isHomeGame ? defaultField : null,
          date: match.date,
          startTime: match.startTime,
          endTime: match.endTime,
          isHomeGame: match.isHomeGame,
          opponent: match.opponent,
          location: match.location || null,
          competition: match.competition || null,
          rawPayload: match.rawData || null,
          status: "ACTIVE",
        });

        summary.createdCount++;
        console.log(`[BFV Import] Created: ${title} (${match.date} ${match.startTime})`);
      }
    } catch (error) {
      summary.errorCount++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      summary.errors.push(`Fehler bei ${match.teamHome} vs ${match.teamAway}: ${errorMsg}`);
      console.error(`[BFV Import] Error:`, error);
    }
  }

  if (archiveMissing && processedExternalIds.size > 0) {
    try {
      const existingBfvIds = await dbStorage.getBfvEventIds();
      for (const existingId of existingBfvIds) {
        if (!processedExternalIds.has(existingId)) {
          const [event] = await db
            .select()
            .from(calendarEventsTable)
            .where(
              and(
                eq(calendarEventsTable.externalId, existingId),
                eq(calendarEventsTable.source, "BFV"),
                eq(calendarEventsTable.status, "ACTIVE")
              )
            );
          if (event) {
            await db
              .update(calendarEventsTable)
              .set({ status: "ARCHIVED", updatedAt: new Date() })
              .where(eq(calendarEventsTable.id, event.id));
            summary.archivedCount++;
            console.log(`[BFV Import] Archived: ${event.title}`);
          }
        }
      }
    } catch (error) {
      console.error(`[BFV Import] Error archiving missing events:`, error);
    }
  }

  await dbStorage.createImportHistory({
    createdCount: summary.createdCount,
    updatedCount: summary.updatedCount,
    unchangedCount: summary.unchangedCount,
    archivedCount: summary.archivedCount,
    errorCount: summary.errorCount,
    fileName: fileName || null,
    notes: summary.errors.length > 0 ? summary.errors.join("\n") : null,
  });

  console.log(`[BFV Import] Complete: ${summary.createdCount} created, ${summary.updatedCount} updated, ${summary.unchangedCount} unchanged, ${summary.archivedCount} archived, ${summary.errorCount} errors`);

  return summary;
}

export function parseTeamFromName(teamName: string, sectionTeam?: Team): Team {
  const normalized = teamName.toLowerCase();

  if (sectionTeam) {
    return sectionTeam;
  }

  if (normalized.includes("a-jugend") || normalized.includes("a-junioren")) return "a-jugend";
  if (normalized.includes("b-jugend") || normalized.includes("b-junioren")) return "b-jugend";
  if (normalized.includes("c-jugend") || normalized.includes("c-junioren")) return "c-jugend";
  if (normalized.includes("d-jugend") || normalized.includes("d-junioren")) return "d-jugend";
  if (normalized.includes("e-jugend") || normalized.includes("e-junioren")) return "e-jugend";
  if (normalized.includes("f-jugend") || normalized.includes("f-junioren")) return "f-jugend";
  if (normalized.includes("g-jugend") || normalized.includes("g-junioren")) return "g-jugend";
  if (normalized.includes("damen") || normalized.includes("frauen")) return "damen";
  if (normalized.includes("alte herren") || normalized.includes("ah")) return "alte-herren";

  if (normalized.includes("ii") || normalized.includes(" 2") || normalized.endsWith("2")) {
    return "herren2";
  }

  return "herren";
}
