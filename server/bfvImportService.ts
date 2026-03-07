/**
 * BFV Import run: upsert by source_id / stable_key, archive unseen,
 * reschedule detection (same pairing, different date -> warning + auto-update or ambiguous).
 */

import { dbStorage } from "./dbStorage";
import { fetchAndParse, fetchAndParseWithRaw, type NormalizedMatch } from "./bfvImporter";
import type { CalendarEvent, Team } from "@shared/schema";

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
  /** Pro Quelle: wie viele Spiele beim Abruf gefunden (z. B. "JFG Jura-Schwarzachtal: 12 Spiele") */
  sourceBreakdown?: { label: string; count: number; source: "pdf" | "html" | "ics" }[];
}

/** Mehrere BFV-URLs (z. B. TSV Greding + JFG Jura-Schwarzachtal) in einem Lauf importieren */
export async function runBfvImportFromMultipleUrls(bfvUrls: string[]): Promise<ImportResult> {
  if (bfvUrls.length === 0) {
    const run = await dbStorage.createImportRun();
    await dbStorage.finishImportRun(run.id, { createdCount: 0, updatedCount: 0, archivedCount: 0, errors: ["Keine BFV-URL konfiguriert."], warnings: [] });
    return { runId: run.id, createdCount: 0, updatedCount: 0, archivedCount: 0, errors: ["Keine BFV-URL konfiguriert."], warnings: [] };
  }
  if (bfvUrls.length === 1) {
    return runBfvImport(bfvUrls[0]);
  }
  const run = await dbStorage.createImportRun();
  const runId = run.id;
  const errors: string[] = [];
  const warnings: unknown[] = [];
  let createdCount = 0;
  let updatedCount = 0;
  let archivedCount = 0;
  const allMatches: NormalizedMatch[] = [];
  const sourceBreakdown: { label: string; count: number; source: "pdf" | "html" | "ics" }[] = [];
  try {
    for (let i = 0; i < bfvUrls.length; i++) {
      const url = bfvUrls[i].trim();
      if (!url) continue;
      if (i > 0) await new Promise((r) => setTimeout(r, 2500));
      try {
        const { matches, source } = await fetchAndParse(url, DEFAULT_DURATION_MINUTES);
        const label = url.includes("jfg-jura-schwarzachtal") ? "JFG Jura-Schwarzachtal" : url.replace(/^https?:\/\//, "").slice(0, 40);
        console.log(`[BFV Import] ${label}: ${matches.length} Spiele (${source})`);
        sourceBreakdown.push({ label, count: matches.length, source });
        for (const m of matches) {
          const existing = allMatches.find((x) => (x.sourceId != null && x.sourceId === m.sourceId) || x.stableKey === m.stableKey);
          if (!existing) allMatches.push(m);
        }
      } catch (e) {
        const errMsg = `[${url}]: ${String(e)}`;
        errors.push(errMsg);
        console.error("[BFV Import]", errMsg);
        sourceBreakdown.push({
          label: url.includes("jfg-jura-schwarzachtal") ? "JFG Jura-Schwarzachtal" : url.replace(/^https?:\/\//, "").slice(0, 40),
          count: 0,
          source: "pdf",
        });
      }
    }
    console.log(`[BFV Import] Gesamt: ${allMatches.length} Spiele aus ${bfvUrls.length} Quelle(n)`);
    const now = new Date();
    const feedMatches = allMatches;
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
        const isHome = isHomeGame(m.teamHome, m.teamAway);
        const onOurField = isAtOurField(m.teamHome);
        const inferredTeam = inferTeamFromMatch(m.teamHome, m.teamAway, m.competition, m.sectionHeaderFromPdf);

        if (existingByStableKey) {
          await dbStorage.updateCalendarEventBfv(existingByStableKey.id, {
            date: dateStr,
            startTime,
            endTime,
            title,
            location: m.locationText ?? undefined,
            competition: m.competition ?? undefined,
            field: onOurField ? m.pitch : null,
            team: inferredTeam ?? null,
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
            field: onOurField ? (m.pitch ?? undefined) : null,
            team: inferredTeam,
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
        const isHome = isHomeGame(fm.teamHome, fm.teamAway);
        const onOurField = isAtOurField(fm.teamHome);
        const inferredTeam = inferTeamFromMatch(fm.teamHome, fm.teamAway, fm.competition, fm.sectionHeaderFromPdf);
        await dbStorage.updateCalendarEventBfv(event.id, {
          date: toDateOnly(fm.startAt),
          startTime: toTimeString(fm.startAt),
          endTime: toTimeString(fm.endAt),
          title: fm.title,
          location: fm.locationText ?? undefined,
          competition: fm.competition ?? undefined,
          field: onOurField ? fm.pitch : null,
          team: inferredTeam ?? null,
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
    // Bei jedem Import: Platz bei allen Auswärtsspielen entfernen (Korrektur alter/fehlerhafter Daten)
    const cleared = await dbStorage.clearFieldForAwayGames();
    if (cleared > 0) console.log(`[BFV Import] Platz bei ${cleared} Auswärtsspiel(en) entfernt.`);
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
    sourceBreakdown: sourceBreakdown.length > 0 ? sourceBreakdown : undefined,
  };
}

/** Heimspiel: TSV Greding oder JFG Jura-Schwarzachtal (Jugendspielgemeinschaft D–A-Jugend) */
function isHomeGame(teamHome: string, teamAway: string): boolean {
  const t = (teamHome || "").toLowerCase();
  if (t.includes("greding") || t.includes("jura-schwarzachtal")) return true;
  return false;
}

/** Spiel findet auf unserem Platz statt: nur TSV Greding.
 *  JFG Jura-Schwarzachtal hat ihr Heimspielrecht in Haunstetten → kein Feldeintrag bei uns. */
function isAtOurField(teamHome: string): boolean {
  return (teamHome || "").toLowerCase().includes("greding");
}

/** Aus Teamnamen, Wettbewerb und ggf. PDF-Überschrift die Mannschaft ableiten. PDF: Überschrift = Altersklasse, I/II = Mannschaft 1/2 dieser Klasse. */
function inferTeamFromMatch(
  teamHome: string,
  teamAway: string,
  competition: string | null,
  sectionHeaderFromPdf?: string | null
): Team | undefined {
  const ourName = (teamHome || "").toLowerCase().includes("greding") || (teamHome || "").toLowerCase().includes("jura-schwarzachtal")
    ? (teamHome || "").trim()
    : (teamAway || "").trim();
  const lower = ourName.toLowerCase();
  const comp = (competition || "").toLowerCase();

  const header = (sectionHeaderFromPdf || "").toLowerCase();
  if (lower.includes("damen") || lower.includes("frauen") || comp.includes("damen") || header.includes("damen")) return "damen";
  if (lower.includes("alte herren") || lower.includes("alte herrn") || comp.includes("alte herren") || header.includes("alte herren")) return "alte-herren";

  const isJfg = lower.includes("jura-schwarzachtal") || lower.includes("jfg ");
  const isGreding = lower.includes("greding");

  if (isGreding) {
    if (/\bII\b| 2\b|\(2\)/.test(ourName)) return "herren2";
    return "herren";
  }

  if (isJfg) {
    if (sectionHeaderFromPdf) {
      const h = sectionHeaderFromPdf.toLowerCase();
      if (/\b(a|a-)\s*jugend\b|\b(a|a-)\s*junioren\b/.test(h)) return "a-jugend";
      if (/\b(b|b-)\s*jugend\b|\b(b|b-)\s*junioren\b/.test(h)) return "b-jugend";
      if (/\b(c|c-)\s*jugend\b|\b(c|c-)\s*junioren\b/.test(h)) return "c-jugend";
      if (/\b(d|d-)\s*jugend\b|\b(d|d-)\s*junioren\b/.test(h)) return "d-jugend";
      if (/\b(e|e-)\s*jugend\b|\b(e|e-)\s*junioren\b/.test(h)) return "e-jugend";
      if (/\b(f|f-)\s*jugend\b|\b(f|f-)\s*junioren\b/.test(h)) return "f-jugend";
      if (/\b(g|g-)\s*jugend\b|\b(g|g-)\s*junioren\b/.test(h)) return "g-jugend";
    }
    if (/\bIII\b/.test(ourName)) return "c-jugend";
    if (/\bII\b/.test(ourName)) return "b-jugend";
    if (/\bI\b/.test(ourName)) return "a-jugend";
    if (/\bIV\b/.test(ourName)) return "d-jugend";
    if (comp.includes("c-jugend") || comp.includes("c-junioren")) return "c-jugend";
    if (comp.includes("d-jugend") || comp.includes("d-junioren")) return "d-jugend";
    if (comp.includes("e-jugend") || comp.includes("e-junioren")) return "e-jugend";
    if (comp.includes("f-jugend") || comp.includes("f-junioren")) return "f-jugend";
    if (comp.includes("g-jugend") || comp.includes("g-junioren")) return "g-jugend";
    if (comp.includes("b-jugend") || comp.includes("b-junioren")) return "b-jugend";
    if (comp.includes("a-jugend") || comp.includes("a-junioren")) return "a-jugend";
    return "a-jugend";
  }

  return undefined;
}

export interface BfvPreviewMatch extends NormalizedMatch {
  inferredTeam: Team | undefined;
}

export interface BfvPreviewResult {
  source: "pdf" | "html" | "ics";
  rawBodyPreview: string;
  matches: BfvPreviewMatch[];
  mappingSummary: {
    sectionHeaders: string[];
    ownTeamNames: string[];
    competitions: string[];
  };
}

/** Abruf ohne DB-Schreiben: Rohdaten + geparste Matches + Zuordnungs-Übersicht für Admin-Vorschau. */
export async function getBfvPreview(bfvUrl: string): Promise<BfvPreviewResult> {
  const { matches, source, rawBodyPreview } = await fetchAndParseWithRaw(bfvUrl, DEFAULT_DURATION_MINUTES);
  const matchesWithTeam: BfvPreviewMatch[] = matches.map((m) => ({
    ...m,
    inferredTeam: inferTeamFromMatch(m.teamHome, m.teamAway, m.competition, m.sectionHeaderFromPdf),
  }));

  const sectionHeaders = Array.from(new Set(matches.map((m) => m.sectionHeaderFromPdf).filter((v): v is string => !!v)));
  const ownTeamNames = Array.from(new Set(matches.flatMap((m) => [m.teamHome, m.teamAway].filter((n) => /greding|jura-schwarzachtal/i.test(n)))));
  const competitions = Array.from(new Set(matches.map((m) => m.competition).filter((v): v is string => !!v)));

  return {
    source,
    rawBodyPreview,
    matches: matchesWithTeam,
    mappingSummary: { sectionHeaders, ownTeamNames, competitions },
  };
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
        const isHome = isHomeGame(m.teamHome, m.teamAway);
        const onOurField = isAtOurField(m.teamHome);
        const inferredTeam = inferTeamFromMatch(m.teamHome, m.teamAway, m.competition, m.sectionHeaderFromPdf);

        if (existingByStableKey) {
          await dbStorage.updateCalendarEventBfv(existingByStableKey.id, {
            date: dateStr,
            startTime,
            endTime,
            title,
            location: m.locationText ?? undefined,
            competition: m.competition ?? undefined,
            field: onOurField ? m.pitch : null,
            team: inferredTeam ?? null,
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
            field: onOurField ? (m.pitch ?? undefined) : null,
            team: inferredTeam,
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
        const isHome = isHomeGame(fm.teamHome, fm.teamAway);
        const onOurField = isAtOurField(fm.teamHome);
        const inferredTeam = inferTeamFromMatch(fm.teamHome, fm.teamAway, fm.competition, fm.sectionHeaderFromPdf);
        await dbStorage.updateCalendarEventBfv(event.id, {
          date: toDateOnly(fm.startAt),
          startTime: toTimeString(fm.startAt),
          endTime: toTimeString(fm.endAt),
          title: fm.title,
          location: fm.locationText ?? undefined,
          competition: fm.competition ?? undefined,
          field: onOurField ? fm.pitch : null,
          team: inferredTeam ?? null,
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

    // Bei jedem Import: Platz bei allen Auswärtsspielen entfernen (Korrektur alter/fehlerhafter Daten)
    const cleared = await dbStorage.clearFieldForAwayGames();
    if (cleared > 0) console.log(`[BFV Import] Platz bei ${cleared} Auswärtsspiel(en) entfernt.`);
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
