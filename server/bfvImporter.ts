/**
 * BFV Import: ICS first, then polite HTML scraping.
 * Rate limit, User-Agent, stable_key for idempotency.
 */

import { createHash } from "crypto";

const USER_AGENT = "TSV-Greding-Vereinsportal/1.0 (BFV-Import; +https://tsv-greding.de)";
const RATE_LIMIT_MS = 8000; // 1 request per 8s

export type Pitch = "a-platz" | "b-platz" | null;

export interface NormalizedMatch {
  sourceId: string | null;
  stableKey: string;
  title: string;
  teamHome: string;
  teamAway: string;
  startAt: Date; // Europe/Berlin
  endAt: Date;
  locationText: string | null;
  pitch: Pitch;
  competition: string | null;
  raw?: unknown;
}

function normalizeForHash(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s-]/g, "")
    .trim();
}

export function buildStableKey(competition: string | null, teamHome: string, teamAway: string, dateOnly: string): string {
  const c = normalizeForHash(competition ?? "");
  const h = normalizeForHash(teamHome);
  const a = normalizeForHash(teamAway);
  const key = `${c}|${h}|${a}|${dateOnly}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

/** Map location text to pitch (A/B) or null */
export function pitchFromLocationText(locationText: string | null): Pitch {
  if (!locationText || typeof locationText !== "string") return null;
  const t = locationText.toLowerCase();
  if (/\bplatz\s*1\b/.test(t) || /platz 1/i.test(t)) return "a-platz";
  if (/\bplatz\s*2\b/.test(t) || /platz 2/i.test(t)) return "b-platz";
  return null;
}

let lastFetchAt = 0;
async function rateLimitedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastFetchAt;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastFetchAt = Date.now();
  const res = await fetch(url, {
    ...options,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/calendar, text/html, application/ics, */*",
      ...options.headers,
    },
  });
  return res;
}

// ---------- ICS ----------
export function parseICS(icsText: string, defaultDurationMinutes: number): NormalizedMatch[] {
  const matches: NormalizedMatch[] = [];
  const lines = icsText.split(/\r?\n/);
  let inEvent = false;
  let uid: string | null = null;
  let summary = "";
  let dtStart: string | null = null;
  let dtEnd: string | null = null;
  let location = "";

  const flush = () => {
    if (!dtStart) return;
    const start = parseICSTime(dtStart);
    if (!start) return;
    let end: Date;
    if (dtEnd) {
      const e = parseICSTime(dtEnd);
      end = e || new Date(start.getTime() + defaultDurationMinutes * 60 * 1000);
    } else {
      end = new Date(start.getTime() + defaultDurationMinutes * 60 * 1000);
    }
    const title = unescapeICS(summary);
    const teamHome = "";
    const teamAway = "";
    const dateOnly = start.toISOString().slice(0, 10);
    const stableKey = buildStableKey(null, title, "", dateOnly);
    matches.push({
      sourceId: uid,
      stableKey,
      title,
      teamHome,
      teamAway,
      startAt: start,
      endAt: end,
      locationText: location || null,
      pitch: pitchFromLocationText(location || null),
      competition: null,
      raw: { summary, dtStart, dtEnd, location },
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fold = line.startsWith(" ") ? line.slice(1) : line;
    if (line.startsWith("BEGIN:VEVENT")) {
      inEvent = true;
      uid = null;
      summary = "";
      dtStart = null;
      dtEnd = null;
      location = "";
    } else if (line.startsWith("END:VEVENT")) {
      flush();
      inEvent = false;
    } else if (inEvent) {
      if (fold.startsWith("UID:")) uid = fold.slice(4).trim();
      else if (fold.startsWith("SUMMARY:")) summary = fold.slice(8).trim();
      else if (fold.startsWith("DTSTART")) {
        const v = fold.includes(":") ? fold.split(":")[1] : "";
        dtStart = v.trim();
      } else if (fold.startsWith("DTEND")) {
        const v = fold.includes(":") ? fold.split(":")[1] : "";
        dtEnd = v.trim();
      } else if (fold.startsWith("LOCATION:")) location = fold.slice(9).trim();
    }
  }
  flush();
  return matches;
}

function parseICSTime(value: string): Date | null {
  try {
    const v = value.trim();
    if (v.length >= 15) {
      const y = v.slice(0, 4);
      const m = v.slice(4, 6);
      const d = v.slice(6, 8);
      const h = v.slice(9, 11);
      const min = v.slice(11, 13);
      const z = v.endsWith("Z") ? "Z" : "";
      const iso = `${y}-${m}-${d}T${h}:${min}:00.000${z || ""}`;
      const date = new Date(iso);
      if (!isNaN(date.getTime())) return date;
    }
  } catch {
    // ignore
  }
  return null;
}

function unescapeICS(s: string): string {
  return s.replace(/\\n/g, "\n").replace(/\\,/g, ",").trim();
}

// ---------- HTML (Vereinsseite) ----------
/** Parse BFV Vereinsseite HTML for game rows (robust markers) */
export function parseHTML(html: string, defaultDurationMinutes: number): NormalizedMatch[] {
  const matches: NormalizedMatch[] = [];
  try {
    // BFV: "Fr.. 27.02.2026 /19:00 Uhr  TSV Greding  -  :  -  SV Töging Zum Spiel" – capture away only until "Zum Spiel" or next date so we get one block per game
    const dateTimeTeamPattern = /(\d{2}\.\d{2}\.\d{4})\s*\/\s*(\d{2}:\d{2})\s*[^\d]*?([^-]+?)\s+-\s+:\s+-\s+([\s\S]*?)(?=\s*Zum Spiel|<\s*\/?a|\d{2}\.\d{2}\.\d{4}\s*\/|$)/gi;
    const locationPattern = /Sportanlage[^<]*?(Platz\s*[12]|[^|<]+)/gi;

    const blocks: { date: string; time: string; home: string; away: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = dateTimeTeamPattern.exec(html)) !== null) {
      const [, dateStr, timeStr, home, away] = m;
      const awayTrim = (away || "").replace(/\s*Zum Spiel\s*$/i, "").trim().replace(/\s+/g, " ").trim();
      if (awayTrim.toLowerCase().includes("abgesetzt")) continue;
      if (!dateStr || !timeStr || !awayTrim) continue;
      const homeTrim = (home || "").trim().replace(/\s+/g, " ").trim();
      if (!homeTrim) continue;
      blocks.push({
        date: dateStr.trim(),
        time: timeStr.trim(),
        home: homeTrim,
        away: awayTrim,
      });
    }

    const locationStrs: string[] = [];
    let locM: RegExpExecArray | null;
    while ((locM = locationPattern.exec(html)) !== null) {
      locationStrs.push((locM[1] || "").trim());
    }

    const durationMs = defaultDurationMinutes * 60 * 1000;
    blocks.forEach((b, i) => {
      const parts = b.date.split(".");
      if (parts.length !== 3) return;
      const [d, mo, y] = parts;
      const dateOnly = `${y}-${mo}-${d}`;
      const startAt = new Date(`${dateOnly}T${b.time}:00`);
      if (isNaN(startAt.getTime())) return;
      const endAt = new Date(startAt.getTime() + durationMs);
      const title = `${b.home} - ${b.away}`;
      const locationText = locationStrs[i] ?? null;
      const pitch = pitchFromLocationText(locationText);
      const stableKey = buildStableKey(null, b.home, b.away, dateOnly);
      matches.push({
        sourceId: null,
        stableKey,
        title,
        teamHome: b.home,
        teamAway: b.away,
        startAt,
        endAt,
        locationText,
        pitch,
        competition: null,
        raw: b,
      });
    });
  } catch (err) {
    console.error("[BFV] HTML parse error:", err);
  }
  return matches;
}

/** Extract club ID from BFV Vereinsseite URL (e.g. .../vereine/tsv-greding/00ES8GNKJO...) */
export function extractClubIdFromVereinsUrl(url: string): string | null {
  const m = url.match(/bfv\.de\/vereine\/[^/]+\/([A-Za-z0-9]+)/i);
  return m ? m[1] : null;
}

/** Parse BFV Vereinsspielplan PDF/Text (exact BFV layout: "FS Freundschaftsspiele 27.02.2026 19:00 TSV Greding - SV Töging" then "Sportanlage... Platz 1") */
export function parsePDFText(pdfText: string, defaultDurationMinutes: number): NormalizedMatch[] {
  const matches: NormalizedMatch[] = [];
  const durationMs = defaultDurationMinutes * 60 * 1000;
  const normalized = pdfText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // BFV: "FS Freundschaftsspiele 27.02.2026 19:00 TSV Greding - SV Töging" or "ME A Klasse 08.03.2026 12:00 TSV Greding II - DJK Untermässing"
  const pattern = /\b(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s+([^-]+?)\s+-\s+([^\n]+?)(?=\n|$)/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(normalized)) !== null) {
    const [, dateStr, timeStr, home, away] = m;
    const homeTrim = (home || "").trim().replace(/\s+/g, " ");
    const awayTrim = (away || "").trim().replace(/\s+/g, " ");
    if (!homeTrim || !awayTrim || homeTrim.length < 3) continue;
    const awayLower = awayTrim.toLowerCase();
    if (awayLower.includes("abgesetzt") || awayLower.includes("spielfrei")) continue;
    const parts = dateStr.trim().split(".");
    if (parts.length !== 3) continue;
    const [d, mo, y] = parts;
    const dateOnly = `${y}-${mo}-${d}`;
    const startAt = new Date(`${dateOnly}T${timeStr.trim()}:00`);
    if (isNaN(startAt.getTime())) continue;
    const endAt = new Date(startAt.getTime() + durationMs);
    const stableKey = buildStableKey(null, homeTrim, awayTrim, dateOnly);
    const after = normalized.slice(m.index + m[0].length, m.index + m[0].length + 300);
    const locationMatch = after.match(/Sportanlage[^\n]*?(Platz\s*[12])/i);
    const locationText = locationMatch ? locationMatch[0] : null;
    matches.push({
      sourceId: null,
      stableKey,
      title: `${homeTrim} - ${awayTrim}`,
      teamHome: homeTrim,
      teamAway: awayTrim,
      startAt,
      endAt,
      locationText,
      pitch: pitchFromLocationText(locationText),
      competition: null,
      raw: { dateStr, timeStr, home: homeTrim, away: awayTrim },
    });
  }
  return matches;
}

/** Fetch and parse: PDF (Vereinsspielplan) first if Vereins-URL, then ICS, else HTML */
export async function fetchAndParse(
  bfvUrl: string,
  defaultDurationMinutes: number = 120
): Promise<{ matches: NormalizedMatch[]; source: "ics" | "html" | "pdf" }> {
  const isIcs = bfvUrl.toLowerCase().includes(".ics") || bfvUrl.toLowerCase().includes("ical");

  // 1) Vereinsseite: try PDF/Vereinsspielplan first (contains all games; HTML often only first via JS)
  const clubId = extractClubIdFromVereinsUrl(bfvUrl);
  if (clubId) {
    const pdfUrl = `https://service.bfv.de/rest/pdfexport/vereinsspiele?id=${clubId}`;
    try {
      const pdfRes = await rateLimitedFetch(pdfUrl, {
        headers: { Accept: "application/pdf, text/plain, */*" },
      });
      if (pdfRes.ok) {
        const contentType = (pdfRes.headers.get("content-type") || "").toLowerCase();
        const buffer = Buffer.from(await pdfRes.arrayBuffer());
        let text = "";
        const startsWithPdf = buffer.length >= 5 && buffer.slice(0, 5).toString() === "%PDF-";
        if (!startsWithPdf && (contentType.includes("text") || buffer.length < 50000)) {
          text = buffer.toString("utf-8");
        } else {
          try {
            const { PDFParse } = await import("pdf-parse");
            const parser = new PDFParse({ data: buffer });
            const result = await parser.getText();
            text = result?.text ?? "";
            await parser.destroy();
          } catch (pdfErr) {
            try {
              const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
              const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
              const parts: string[] = [];
              for (let i = 1; i <= doc.numPages; i++) {
                const page = await doc.getPage(i);
                const content = await page.getTextContent();
                parts.push((content.items as { str?: string }[]).map((it) => it.str || "").join(" "));
              }
              text = parts.join("\n");
            } catch (pdfjsErr) {
              console.warn("[BFV] PDFParse error:", (pdfErr as Error).message, "pdfjs fallback:", (pdfjsErr as Error).message);
            }
          }
        }
        if (text.length > 100) {
          const matches = parsePDFText(text, defaultDurationMinutes);
          if (matches.length > 0) {
            console.log(`[BFV] PDF/Vereinsspielplan: ${matches.length} Spiele gefunden`);
            return { matches, source: "pdf" };
          }
        }
      } else {
        console.warn("[BFV] PDF-URL Status:", pdfRes.status);
      }
    } catch (e) {
      console.warn("[BFV] PDF fetch/parse failed, falling back to HTML:", (e as Error).message);
    }
  }

  const res = await rateLimitedFetch(bfvUrl);
  if (!res.ok) {
    throw new Error(`BFV fetch failed: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  if (isIcs || text.trimStart().startsWith("BEGIN:VCALENDAR")) {
    const matches = parseICS(text, defaultDurationMinutes);
    return { matches, source: "ics" };
  }
  const matches = parseHTML(text, defaultDurationMinutes);
  return { matches, source: "html" };
}
