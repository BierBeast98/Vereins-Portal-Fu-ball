/**
 * BFV Import run: upsert by source_id / stable_key, archive unseen,
 * reschedule detection (same pairing, different date -> warning + auto-update or ambiguous).
 */

import { dbStorage } from "./dbStorage";
import { fetchAndParse, type NormalizedMatch } from "./bfvImporter";
import type { CalendarEvent } from "@shared/schema";

const DEFAULT_DURATION_MINUTES = parseInt(process.env.DEFAULT_MATCH_DURATION_MINUTES ?? "120", 10);
const TIMEZONE = process.env.TIMEZONE ?? "Europe/Berlin";

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function toTimeString(d: Date): string {
  return d.toTimeString().slice(0, 5);
}

export interface ImportResult {
  runId: string;
  createdCount: number;
  updatedCount: number;
  archivedCount: number;
  errors: string[];
  warnings: unknown[];
}

export async function runBfvImport(bfvUrl: string): Promise<ImportResult> {
  const run = await dbStorage.createImportRun();
  const runId = run.id;
  const errors: string[] = [];
  const warnings: unknown[] = [];
  let createdCount = 0;
  let updatedCount = 0;
  let archivedCount = 0;

  try {
    const { matches: feedMatches, source } = await fetchAndParse(bfvUrl, DEFAULT_DURATION_MINUTES);
    const now = new Date();

    for (const m of feedMatches) {
      try {
        const existingBySourceId = m.sourceId
          ? await dbStorage.getBfvCalendarEventBySourceId(m.sourceId)
          : undefined;
        const existingByStableKey =
          existingBySourceId ?? (await dbStorage.getBfvCalendarEventByStableKey(m.stableKey));

        const dateStr = toDateOnly(m.startAt);
        const startTime = toTimeString(m.startAt);
        const endTime = toTimeString(m.endAt);
        const title = m.title || `${m.teamHome} - ${m.teamAway}`;
        const isHome = (m.teamHome || "").toLowerCase().includes("greding");

        if (existingByStableKey) {
          await dbStorage.updateCalendarEventBfv(existingByStableKey.id, {
            date: dateStr,
            startTime,
            endTime,
            title,
            location: m.locationText ?? undefined,
            competition: m.competition ?? undefined,
            field: m.pitch,
            lastSeenAt: now,
            rawPayload: m.raw,
          });
          updatedCount++;
        } else {
          await dbStorage.createCalendarEvent({
            type: "spiel",
            title,
            date: dateStr,
            startTime,
            endTime,
            isHomeGame: isHome,
            opponent: isHome ? m.teamAway : m.teamHome,
            location: m.locationText ?? undefined,
            competition: m.competition ?? undefined,
            field: m.pitch ?? undefined,
            bfvImported: true,
            bfvMatchId: m.sourceId ?? undefined,
            stableKey: m.stableKey,
          });
          const created = await dbStorage.getBfvCalendarEventByStableKey(m.stableKey);
          if (created) {
            await dbStorage.updateCalendarEventBfv(created.id, { lastSeenAt: now, rawPayload: m.raw });
          }
          createdCount++;
        }
      } catch (e) {
        errors.push(String(e));
      }
    }

    const activeBfv = await dbStorage.getActiveBfvCalendarEvents();
    const seenKeys = new Set(feedMatches.map((x) => x.sourceId ?? x.stableKey));
    const seenStableKeys = new Set(feedMatches.map((x) => x.stableKey));

    for (const event of activeBfv) {
      const key = event.bfvMatchId ?? event.stableKey;
      if (!key) continue;
      if (seenKeys.has(key) || (event.stableKey && seenStableKeys.has(event.stableKey))) continue;

      const pairing = {
        home: (event.title?.split(" - ")[0] || "").trim(),
        away: (event.title?.split(" - ")[1] || "").trim(),
        competition: event.competition ?? "",
      };
      const possibleReschedule = feedMatches.filter((fm) => {
        const samePairing =
          (normalizeTeam(fm.teamHome) === normalizeTeam(pairing.home) &&
            normalizeTeam(fm.teamAway) === normalizeTeam(pairing.away)) ||
          (normalizeTeam(fm.teamHome) === normalizeTeam(pairing.away) &&
            normalizeTeam(fm.teamAway) === normalizeTeam(pairing.home));
        const sameComp = !pairing.competition || (fm.competition ?? "") === pairing.competition;
        const otherDate = toDateOnly(fm.startAt) !== event.date;
        return samePairing && sameComp && otherDate;
      });

      if (possibleReschedule.length === 1) {
        const fm = possibleReschedule[0];
        await dbStorage.updateCalendarEventBfv(event.id, {
          date: toDateOnly(fm.startAt),
          startTime: toTimeString(fm.startAt),
          endTime: toTimeString(fm.endAt),
          title: fm.title,
          location: fm.locationText ?? undefined,
          competition: fm.competition ?? undefined,
          field: fm.pitch,
          lastSeenAt: now,
          rawPayload: fm.raw,
        });
        updatedCount++;
        const msg = `Spiel ${event.title} wurde vom ${event.date} auf ${toDateOnly(fm.startAt)} verschoben (automatisch übernommen).`;
        warnings.push({ type: "reschedule", message: msg, eventId: event.id });
        await dbStorage.createImportWarning(runId, "reschedule", msg, [
          { eventId: event.id, oldDate: event.date, newDate: toDateOnly(fm.startAt) },
        ]);
      } else if (possibleReschedule.length > 1) {
        await dbStorage.archiveCalendarEvent(event.id);
        archivedCount++;
        const msg = `Spiel ${event.title} (${event.date}) fehlt im Feed; mehrere mögliche Verlegungen gefunden – bitte manuell prüfen.`;
        warnings.push({ type: "ambiguous_reschedule", message: msg, eventId: event.id });
        await dbStorage.createImportWarning(runId, "ambiguous_reschedule", msg, [{ eventId: event.id }]);
      } else {
        await dbStorage.archiveCalendarEvent(event.id);
        archivedCount++;
      }
    }

    await dbStorage.finishImportRun(runId, {
      createdCount,
      updatedCount,
      archivedCount,
      errors,
      warnings,
    });
  } catch (err) {
    errors.push(String(err));
    await dbStorage.finishImportRun(runId, {
      createdCount,
      updatedCount,
      archivedCount,
      errors,
      warnings,
    });
  }

  return {
    runId,
    createdCount,
    updatedCount,
    archivedCount,
    errors,
    warnings,
  };
}

function normalizeTeam(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
