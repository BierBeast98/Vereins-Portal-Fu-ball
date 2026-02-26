/**
 * BFV import: run every 24h, single-run lock.
 */

const IMPORT_INTERVAL_MS =
  (parseInt(process.env.IMPORT_INTERVAL_HOURS ?? "24", 10) * 60 * 60 * 1000);
const BFV_URL = process.env.BFV_URL;

let lock = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

export function isImportRunning(): boolean {
  return lock;
}

export async function triggerBfvImportNow(): Promise<{ ok: boolean; message: string }> {
  if (lock) {
    return { ok: false, message: "Import läuft bereits." };
  }
  if (!BFV_URL) {
    return { ok: false, message: "BFV_URL ist nicht konfiguriert." };
  }
  lock = true;
  try {
    const { runBfvImport } = await import("./bfvImportService");
    const result = await runBfvImport(BFV_URL);
    return {
      ok: true,
      message: `Import abgeschlossen: ${result.createdCount} neu, ${result.updatedCount} aktualisiert, ${result.archivedCount} archiviert.`,
      runId: result.runId,
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
      archivedCount: result.archivedCount,
      errors: result.errors,
      warnings: result.warnings,
    } as any;
  } catch (e) {
    console.error("[BFV Scheduler] Import error:", e);
    return { ok: false, message: String(e) };
  } finally {
    lock = false;
  }
}

export function startBfvScheduler(): void {
  if (!BFV_URL) {
    console.warn("[BFV Scheduler] BFV_URL not set – auto-import disabled.");
    return;
  }
  if (intervalId) return;
  intervalId = setInterval(async () => {
    if (lock) return;
    console.log("[BFV Scheduler] Starting scheduled import.");
    await triggerBfvImportNow();
  }, IMPORT_INTERVAL_MS);
  console.log(`[BFV Scheduler] Started (interval: ${IMPORT_INTERVAL_MS / 3600000}h).`);
}

export function stopBfvScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[BFV Scheduler] Stopped.");
  }
}
