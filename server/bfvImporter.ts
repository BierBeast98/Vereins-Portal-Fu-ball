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
  /** Aus PDF: letzte Überschriftenzeile vor dem Spiel (z. B. "A-Jugend", "Herren") – I/II = Mannschaft 1/2 dieser Altersklasse */
  sectionHeaderFromPdf?: string | null;
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
/** Parse BFV Vereinsseite HTML for game rows (TSV Greding + JFG Jura-Schwarzachtal) */
export function parseHTML(html: string, defaultDurationMinutes: number): NormalizedMatch[] {
  const matches: NormalizedMatch[] = [];
  try {
    // BFV: "27.02.2026 /19:00 Uhr  TSV Greding  -  :  -  SV Töging" oder JFG-Seite mit " \-  :  \- " (Backslash) und Namen mit Bindestrich: "JFG Jura-Schwarzachtal I  \-  :  \-  JFG Region Dietfurt"
    const dateTimeTeamPattern = /(\d{2}\.\d{2}\.\d{4})\s*\/\s*(\d{2}:\d{2})\s*[^\d]*?(.+?)\s+(-|\\-)\s+:\s+(-|\\-)\s+([\s\S]*?)(?=\s*Zum Spiel|<\s*\/?a|\d{2}\.\d{2}\.\d{4}\s*\/|$)/gi;
    // Alternative: "08.03.2026 /10:00 Uhr  JFG Jura-Schwarzachtal I  Abgesetzt  (SG) TV 21 Büchenbach II" (zwei Leerzeichen als Trenner)
    const dateTimeTeamPattern2 = /(\d{2}\.\d{2}\.\d{4})\s*\/\s*(\d{2}:\d{2})\s*[^\d]*?([^\n]+?)\s{2,}([^\n]+?)(?=\s*Zum Spiel|<\s*\/?a|\d{2}\.\d{2}\.\d{4}\s*\/|$)/gi;
    const locationPattern = /Sportanlage[^<]*?(Platz\s*[12]|[^|<]+)/gi;

    const blocks: { date: string; time: string; home: string; away: string }[] = [];
    let m: RegExpExecArray | null;
    const seenKeys = new Set<string>();
    const addBlock = (dateStr: string, timeStr: string, home: string, away: string) => {
      const awayTrim = (away || "").replace(/\s*Zum Spiel\s*$/i, "").trim().replace(/\s+/g, " ").trim();
      if (awayTrim.toLowerCase().includes("abgesetzt") || awayTrim.toLowerCase().includes("spielfrei")) return;
      if (!dateStr || !timeStr || !awayTrim) return;
      const homeTrim = (home || "").trim().replace(/\s+/g, " ").trim();
      if (!homeTrim || homeTrim.length < 2) return;
      const key = `${dateStr}-${timeStr}-${homeTrim}-${awayTrim}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      blocks.push({ date: dateStr.trim(), time: timeStr.trim(), home: homeTrim, away: awayTrim });
    };
    while ((m = dateTimeTeamPattern.exec(html)) !== null) {
      addBlock(m[1], m[2], (m[3] || "").trim(), (m[6] || "").trim());
    }
    while ((m = dateTimeTeamPattern2.exec(html)) !== null) {
      const home = (m[3] || "").trim();
      const away = (m[4] || "").trim();
      if (home.includes(" - ") && away.includes(" - ")) continue;
      addBlock(m[1], m[2], home, away);
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

/** Club-ID aus HTML holen (z. B. PDF-Link oder Vereins-Link), für JFG wenn URL keine ID im Pfad hat */
function extractClubIdFromHtml(html: string): string | null {
  const pdfMatch = html.match(/pdfexport\/vereinsspiele\?id=([A-Za-z0-9]+)/i);
  if (pdfMatch) return pdfMatch[1];
  const vereinMatch = html.match(/bfv\.de\/vereine\/[^/]+\/([A-Za-z0-9]{8,})/i);
  return vereinMatch ? vereinMatch[1] : null;
}

/** Club-ID für PDF-Abruf: zuerst aus URL, bei JFG/Jura-URLs ohne ID aus der HTML-Seite. */
async function getClubIdForPdf(bfvUrl: string): Promise<string | null> {
  const fromUrl = extractClubIdFromVereinsUrl(bfvUrl);
  if (fromUrl) return fromUrl;
  if (!/jfg|jura-schwarzachtal/i.test(bfvUrl)) return null;
  try {
    const res = await rateLimitedFetch(bfvUrl);
    if (!res.ok) return null;
    const html = await res.text();
    const fromHtml = extractClubIdFromHtml(html);
    if (fromHtml) console.log("[BFV] Club-ID für JFG aus HTML ermittelt, verwende PDF.");
    return fromHtml;
  } catch {
    return null;
  }
}

/** Letzte Zeile vor position, die wie eine PDF-Überschrift (Altersklasse) aussieht: A-Jugend, Herren, Damen, … */
function getSectionHeaderBeforePosition(normalized: string, position: number): string | null {
  const before = normalized.slice(0, Math.max(0, position));
  const lines = before.split(/\n/);
  const headerPattern = /(A|B|C|D|E|F|G)\s*[-]?\s*Jugend|(A|B|C|D|E|F|G)\s*[-]?\s*Junioren|^Herren\b|^Damen\b|Alte\s+Herren|^1\.\s*Mannschaft|^2\.\s*Mannschaft/i;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.length < 3) continue;
    if (headerPattern.test(line)) return line;
    if (/\b(A|B|C|D|E|F|G)[-\s]*Jugend\b/i.test(line)) return line;
    if (/\b(A|B|C|D|E|F|G)[-\s]*Junioren\b/i.test(line)) return line;
    if (/\bHerren\b/i.test(line) && !/Alte\s+Herren/i.test(line)) return line;
    if (/\bDamen\b/i.test(line)) return line;
    if (/Alte\s*Herren/i.test(line)) return line;
  }
  return null;
}

function pushPdfMatch(
  matches: NormalizedMatch[],
  dateStr: string,
  timeStr: string,
  homeTrim: string,
  awayTrim: string,
  normalized: string,
  matchStartIndex: number,
  matchEndIndex: number,
  durationMs: number
): void {
  if (!homeTrim || !awayTrim || homeTrim.length < 2) return;
  const awayLower = awayTrim.toLowerCase();
  const homeLower = homeTrim.toLowerCase();
  if (awayLower.includes("abgesetzt") || awayLower.includes("spielfrei")) return;
  if (homeLower.includes("spielfrei")) return;
  const parts = dateStr.trim().split(".");
  if (parts.length !== 3) return;
  const [d, mo, y] = parts;
  const dateOnly = `${y}-${mo}-${d}`;
  const startAt = new Date(`${dateOnly}T${timeStr.trim()}:00`);
  if (isNaN(startAt.getTime())) return;
  const endAt = new Date(startAt.getTime() + durationMs);
  const stableKey = buildStableKey(null, homeTrim, awayTrim, dateOnly);
  if (matches.some((x) => x.stableKey === stableKey)) return;
  const after = normalized.slice(matchEndIndex, matchEndIndex + 300);
  const locationMatch = after.match(/Sportanlage[^\n]*?(Platz\s*[12])/i);
  const locationText = locationMatch ? locationMatch[0] : null;
  const sectionHeaderFromPdf = getSectionHeaderBeforePosition(normalized, matchStartIndex);
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
    sectionHeaderFromPdf: sectionHeaderFromPdf ?? undefined,
    raw: { dateStr, timeStr, home: homeTrim, away: awayTrim },
  });
}

/** Parse BFV Vereinsspielplan PDF/Text (TSV Greding + JFG Jura-Schwarzachtal etc.) */
export function parsePDFText(pdfText: string, defaultDurationMinutes: number): NormalizedMatch[] {
  const matches: NormalizedMatch[] = [];
  const durationMs = defaultDurationMinutes * 60 * 1000;
  const normalized = pdfText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Format 1: "27.02.2026 19:00 TSV Greding - SV Töging"; Trennzeichen nur " - " / " – ", Heim darf Bindestrich haben (z. B. "1. FC-VfL Pleinfeld I")
  let m: RegExpExecArray | null;
  const pattern1 = /\b(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s*(?:Uhr\s*)?\s+([^\n]*?)\s+[-–]\s+([^\n]*?)(?=\n|Sportanlage|\d{2}\.\d{2}\.\d{4}|$)/g;
  while ((m = pattern1.exec(normalized)) !== null) {
    const [, dateStr, timeStr, home, away] = m;
    const awayTrim = (away || "").trim().replace(/\s+/g, " ").replace(/\s*Sportanlage.*$/i, "").trim();
    if (!awayTrim || awayTrim.toLowerCase().includes("spielfrei")) continue;
    pushPdfMatch(
      matches,
      dateStr.trim(),
      timeStr.trim(),
      (home || "").trim().replace(/\s+/g, " "),
      awayTrim,
      normalized,
      m.index,
      m.index + m[0].length,
      durationMs
    );
  }
  // Format 2: "08.03.2026 14:30  JFG Jura-Schwarzachtal I  (SG) TV XY" oder "08.03.2026 14:30 Uhr  JFG ..." (zwei oder mehr Leerzeichen als Trenner)
  const pattern2 = /\b(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s*(?:Uhr\s*)?\s+([^\n]+?)\s{2,}([^\n]+?)(?=\n|Sportanlage|\d{2}\.\d{2}\.\d{4}|$)/g;
  while ((m = pattern2.exec(normalized)) !== null) {
    const homeTrim = (m[3] || "").trim().replace(/\s+/g, " ");
    const awayTrim = (m[4] || "").trim().replace(/\s+/g, " ").replace(/\s*Sportanlage.*$/i, "").trim();
    if (homeTrim.includes(" - ") || awayTrim.length < 2) continue;
    pushPdfMatch(
      matches,
      m[1].trim(),
      m[2].trim(),
      homeTrim,
      awayTrim,
      normalized,
      m.index,
      m.index + m[0].length,
      durationMs
    );
  }
  // Format 3: "FS Freundschaftsspiele 03.03.2026 19:00 TSV Berching I - JFG ..."; Trennzeichen " - " / " – ", Heim darf Bindestrich (z. B. FC-VfL)
  const pattern3 = /\b(?:FS|ME)\s+\S+\s+(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s*(?:Uhr\s*)?\s+([^\n]*?)\s+[-–]\s+([^\n]*?)(?=\n|Sportanlage|\d{2}\.\d{2}\.\d{4}|$)/g;
  while ((m = pattern3.exec(normalized)) !== null) {
    const awayTrim = (m[4] || "").trim().replace(/\s+/g, " ").replace(/\s*Sportanlage.*$/i, "").trim();
    if (awayTrim.toLowerCase().includes("spielfrei")) continue;
    pushPdfMatch(
      matches,
      m[1].trim(),
      m[2].trim(),
      (m[3] || "").trim().replace(/\s+/g, " "),
      awayTrim,
      normalized,
      m.index,
      m.index + m[0].length,
      durationMs
    );
  }
  const pattern4 = /\b(?:FS|ME)\s+\S+\s+(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s*(?:Uhr\s*)?\s+([^\n]+?)\s{2,}([^\n]+?)(?=\n|Sportanlage|\d{2}\.\d{2}\.\d{4}|$)/g;
  while ((m = pattern4.exec(normalized)) !== null) {
    const homeTrim = (m[3] || "").trim().replace(/\s+/g, " ");
    const awayTrim = (m[4] || "").trim().replace(/\s+/g, " ").replace(/\s*Sportanlage.*$/i, "").trim();
    if (homeTrim.includes(" - ") || awayTrim.length < 2) continue;
    pushPdfMatch(
      matches,
      m[1].trim(),
      m[2].trim(),
      homeTrim,
      awayTrim,
      normalized,
      m.index,
      m.index + m[0].length,
      durationMs
    );
  }
  // Format 5: Datum/Uhrzeit und in der nächsten Zeile "Heim - Gast" (zeilenweiser PDF-Export); Heim darf Bindestrich
  const pattern5 = /\b(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s*(?:Uhr\s*)?\s*\n\s*([^\n]*?)\s+[-–]\s+([^\n]*?)(?=\n|Sportanlage|\d{2}\.\d{2}\.\d{4}|$)/g;
  while ((m = pattern5.exec(normalized)) !== null) {
    const awayTrim = (m[4] || "").trim().replace(/\s+/g, " ").replace(/\s*Sportanlage.*$/i, "").trim();
    if (awayTrim.toLowerCase().includes("spielfrei")) continue;
    pushPdfMatch(
      matches,
      m[1].trim(),
      m[2].trim(),
      (m[3] || "").trim().replace(/\s+/g, " "),
      awayTrim,
      normalized,
      m.index,
      m.index + m[0].length,
      durationMs
    );
  }
  // Fallback: Zeile für Zeile – jede Zeile mit (FS|ME) + KLASSE + DD.MM.YYYY + HH:MM, dann " - " als Trenner (BFV-Tabelle)
  const lineByLine = /\b(?:FS|ME)\s+\S+\s+(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s+(.+)/g;
  while ((m = lineByLine.exec(normalized)) !== null) {
    const partie = (m[3] || "").trim();
    const sep = partie.match(/\s+[-–]\s+/);
    if (!sep) continue;
    const idx = partie.indexOf(sep[0]);
    const homeTrim = partie.slice(0, idx).trim().replace(/\s+/g, " ");
    const awayTrim = partie.slice(idx + sep[0].length).trim().replace(/\s+/g, " ").replace(/\s*Sportanlage.*$/i, "").trim();
    if (awayTrim.toLowerCase().includes("spielfrei") || awayTrim.length < 2) continue;
    pushPdfMatch(
      matches,
      m[1].trim(),
      m[2].trim(),
      homeTrim,
      awayTrim,
      normalized,
      m.index,
      m.index + m[0].length,
      durationMs
    );
  }
  return matches;
}

/** Fetch and parse: PDF (Vereinsspielplan) first if Vereins-URL, then ICS, else HTML */
export async function fetchAndParse(
  bfvUrl: string,
  defaultDurationMinutes: number = 120
): Promise<{ matches: NormalizedMatch[]; source: "ics" | "html" | "pdf" }> {
  const isIcs = bfvUrl.toLowerCase().includes(".ics") || bfvUrl.toLowerCase().includes("ical");

  // 1) Vereinsseite / JFG: try PDF first (PDF enthält alle Spiele; HTML oft nur wenige)
  const clubId = await getClubIdForPdf(bfvUrl);
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
          // PDF-Text da, aber keine Spiele erkannt: PDF behalten (kein Fallback auf HTML – PDF enthält mehr Spiele)
          console.warn("[BFV] PDF-Text erhalten, aber keine Spiele erkannt – Quelle bleibt PDF.");
          return { matches: [], source: "pdf" };
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

const RAW_PREVIEW_MAX_CHARS = 8000;

/** Wie fetchAndParse, liefert zusätzlich rawBodyPreview (Auszug der Rohantwort) für Admin-Vorschau. */
export async function fetchAndParseWithRaw(
  bfvUrl: string,
  defaultDurationMinutes: number = 120
): Promise<{ matches: NormalizedMatch[]; source: "ics" | "html" | "pdf"; rawBodyPreview: string }> {
  const isIcs = bfvUrl.toLowerCase().includes(".ics") || bfvUrl.toLowerCase().includes("ical");
  const clubId = await getClubIdForPdf(bfvUrl);

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
            return { matches, source: "pdf", rawBodyPreview: text.slice(0, RAW_PREVIEW_MAX_CHARS) };
          }
          return { matches: [], source: "pdf", rawBodyPreview: text.slice(0, RAW_PREVIEW_MAX_CHARS) };
        }
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
    return { matches, source: "ics", rawBodyPreview: text.slice(0, RAW_PREVIEW_MAX_CHARS) };
  }
  const matches = parseHTML(text, defaultDurationMinutes);
  return { matches, source: "html", rawBodyPreview: text.slice(0, RAW_PREVIEW_MAX_CHARS) };
}
