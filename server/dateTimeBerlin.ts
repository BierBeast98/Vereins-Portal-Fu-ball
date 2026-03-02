/**
 * Parse and format date/time in Europe/Berlin to avoid UTC/server-TZ shifts.
 * Calendar events store date (YYYY-MM-DD) and startTime/endTime (HH:MM) in local Berlin time.
 */
const TZ = "Europe/Berlin";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Get date (YYYY-MM-DD) and time (HH:MM) in Europe/Berlin from an ISO string or Date.
 */
export function getBerlinDateAndTime(isoOrDate: string | Date): { date: string; time: string } {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${isoOrDate}`);
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(d)
    .reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {} as Record<string, string>);
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${pad2(parseInt(parts.hour, 10))}:${pad2(parseInt(parts.minute, 10))}`;
  return { date, time };
}

/**
 * Parse start/end ISO strings and return calendar fields in Europe/Berlin.
 * startTime/endTime are normalized to HH:MM (robust to H:MM or HH:m).
 */
export function parseStartEndInBerlin(
  startAt: string | Date,
  endAt: string | Date
): { date: string; startTime: string; endTime: string } {
  const start = getBerlinDateAndTime(startAt);
  const end = getBerlinDateAndTime(endAt);
  const startTime = normalizeTime(start.time);
  const endTime = normalizeTime(end.time);
  return {
    date: start.date,
    startTime,
    endTime,
  };
}

/** Normalize time string to HH:MM (e.g. "8:45" -> "08:45", "18:5" -> "18:05"). */
export function normalizeTime(time: string): string {
  const trimmed = (time || "").trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) {
    const [h, m] = trimmed.split(":").map((x) => parseInt(x, 10));
    if (Number.isInteger(h) && Number.isInteger(m)) {
      return `${pad2(h)}:${pad2(m)}`;
    }
    throw new Error(`Invalid time: ${time}`);
  }
  return `${pad2(parseInt(match[1], 10))}:${pad2(parseInt(match[2], 10))}`;
}
