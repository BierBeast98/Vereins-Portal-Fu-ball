/**
 * BFV import: run every 24h, single-run lock.
 */

const IMPORT_INTERVAL_MS =
  (parseInt(process.env.IMPORT_INTERVAL_HOURS ?? "24", 10) * 60 * 60 * 1000);
const BFV_URL = process.env.BFV_URL;

/** Eine oder mehrere URLs (kommagetrennt), z. B. TSV Greding + JFG Jura-Schwarzachtal */
function getBfvUrls(): string[] {
  if (!BFV_URL || !BFV_URL.trim()) return [];
  return BFV_URL.split(",").map((u) => u.trim()).filter(Boolean);
}

let lock = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

export function isImportRunning(): boolean {
  return lock;
}

export async function triggerBfvImportNow(): Promise<{
  ok: boolean;
  message: string;
  runId?: string;
  sourceBreakdown?: { label: string; count: number; source: string }[];
}> {
  if (lock) {
    return { ok: false, message: "Import läuft bereits." };
  }
  const urls = getBfvUrls();
  if (urls.length === 0) {
    return { ok: false, message: "BFV_URL ist nicht konfiguriert." };
  }
  if (urls.length > 1) {
    console.log("[BFV Scheduler] Import aus", urls.length, "Quellen:", urls.map((u) => u.includes("jfg") ? "JFG Jura-Schwarzachtal" : "TSV Greding").join(", "));
  }
  lock = true;
  try {
    const { runBfvImport, runBfvImportFromMultipleUrls } = await import("./bfvImportService");
    const result = urls.length === 1
      ? await runBfvImport(urls[0])
      : await runBfvImportFromMultipleUrls(urls);
    const summary = `${result.createdCount} neu, ${result.updatedCount} aktualisiert, ${result.archivedCount} archiviert.`;
    const breakdownText =
      result.sourceBreakdown && result.sourceBreakdown.length > 0
        ? result.sourceBreakdown.map((s) => `${s.label}: ${s.count} Spiele (${s.source})`).join(" · ")
        : "";
    const message = breakdownText
      ? `Import abgeschlossen: ${summary} Abruf: ${breakdownText}`
      : `Import abgeschlossen: ${summary}`;
    return {
      ok: true,
      message,
      runId: result.runId,
      sourceBreakdown: result.sourceBreakdown,
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
      archivedCount: result.archivedCount,
      errors: result.errors,
      warnings: result.warnings,
    };
  } catch (e) {
    console.error("[BFV Scheduler] Import error:", e);
    return { ok: false, message: String(e) };
  } finally {
    lock = false;
  }
}

export function startBfvScheduler(): void {
  if (getBfvUrls().length === 0) {
    console.warn("[BFV Scheduler] BFV_URL not set – auto-import disabled.");
    return;
  }
  if (intervalId) return;
  intervalId = setInterval(async () => {
    if (lock) return;
    console.log("[BFV Scheduler] Starting scheduled import.");
    await triggerBfvImportNow();
  }, IMPORT_INTERVAL_MS);
  console.log(`[BFV Scheduler] Started (${getBfvUrls().length} Quelle(n), interval: ${IMPORT_INTERVAL_MS / 3600000}h).`);
}

export function stopBfvScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[BFV Scheduler] Stopped.");
  }
}
