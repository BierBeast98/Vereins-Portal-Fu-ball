import { dbStorage } from "./dbStorage";
import type { EventRequest, InsertEventRequest, EventRequestStatus, InsertCalendarEvent, Field, Team } from "@shared/schema";
import { parseStartEndInBerlin } from "./dateTimeBerlin";

const TZ_DEBUG = "Europe/Berlin";

function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTimeStr(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export async function checkFieldConflicts(
  pitch: Field,
  startAt: Date,
  endAt: Date
): Promise<{ hasConflict: boolean; conflicts: { id: string; title: string; date: string; startTime: string; endTime: string }[] }> {
  const startDate = toDateOnly(startAt);
  const endDate = toDateOnly(endAt);
  const events = await dbStorage.getCalendarEventsByField(pitch, startDate, endDate);

  const start = startAt.getTime();
  const end = endAt.getTime();

  const conflicts = events.filter((e) => {
    const eStartParts = e.startTime.split(":").map(Number);
    const eEndParts = e.endTime.split(":").map(Number);
    const d = new Date(e.date + "T00:00:00");
    const eStart = new Date(d);
    eStart.setHours(eStartParts[0], eStartParts[1], 0, 0);
    const eEnd = new Date(d);
    eEnd.setHours(eEndParts[0], eEndParts[1], 0, 0);
    return start < eEnd.getTime() && eStart.getTime() < end;
  });

  return {
    hasConflict: conflicts.length > 0,
    conflicts: conflicts.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      startTime: e.startTime,
      endTime: e.endTime,
    })),
  };
}

export async function createEventRequestWithValidation(data: InsertEventRequest): Promise<{ request: EventRequest }> {
  const request = await dbStorage.createEventRequest(data);
  return { request };
}

export async function approveEventRequest(
  id: string,
  patch: Partial<InsertEventRequest> & { adminNote?: string; recurringGroupId?: string }
): Promise<{ request: EventRequest; event: InsertCalendarEvent & { id: string } }> {
  const existing = await dbStorage.getEventRequestById(id);
  if (!existing) {
    throw new Error("Request not found");
  }

  const startAt = new Date(patch.startAt ?? existing.startAt);
  const endAt = new Date(patch.endAt ?? existing.endAt);
  const pitch = (patch.pitch ?? existing.pitch) as Field;
  const title = patch.title ?? existing.title;

  // Parse start/end in Europe/Berlin so stored times are correct (no UTC shift)
  const { date, startTime, endTime } = parseStartEndInBerlin(startAt, endAt);

  // Debug: Kalender-Sync parsed values + RRULE/Serie
  const rruleOrSeries = patch.recurringGroupId ? `recurringGroupId=${patch.recurringGroupId} (Terminserie)` : "Einzeltermin";
  console.debug("[Kalender-Sync]", {
    tz: TZ_DEBUG,
    parsed: { date, startTime, endTime },
    rawStartAt: String(patch.startAt ?? existing.startAt),
    rawEndAt: String(patch.endAt ?? existing.endAt),
    rruleOrSeries,
  });

  const { hasConflict, conflicts } = await checkFieldConflicts(pitch, startAt, endAt);
  if (hasConflict) {
    const error: any = new Error("Konflikt mit bestehenden Terminen");
    error.code = "CONFLICT";
    error.conflicts = conflicts;
    throw error;
  }

  const team = patch.team ?? existing.team ?? undefined;
  const insertEvent: InsertCalendarEvent = {
    title,
    type: "training",
    team: team as Team | undefined,
    field: pitch,
    date,
    startTime,
    endTime,
    description: existing.note,
    bfvImported: false,
    recurringGroupId: patch.recurringGroupId,
  };

  // Update existing calendar event instead of creating duplicate (e.g. re-approval)
  let created: InsertCalendarEvent & { id: string };
  if (existing.approvedEventId) {
    const updated = await dbStorage.updateCalendarEvent(existing.approvedEventId, insertEvent);
    if (!updated) {
      const newEvent = await dbStorage.createCalendarEvent(insertEvent);
      created = { ...insertEvent, id: newEvent.id };
      console.debug("[Kalender-Sync] re-created event (previous was missing)", { eventId: created.id });
    } else {
      created = { ...insertEvent, id: updated.id };
      console.debug("[Kalender-Sync] updated existing event", { eventId: created.id });
    }
  } else {
    const newEvent = await dbStorage.createCalendarEvent(insertEvent);
    created = { ...insertEvent, id: newEvent.id };
  }

  const updatedRequest = await dbStorage.updateEventRequest(id, {
    ...patch,
    status: "approved",
    approvedEventId: created.id,
  });

  if (!updatedRequest) {
    throw new Error("Failed to update request after approval");
  }

  return { request: updatedRequest, event: created };
}

export async function rejectEventRequest(
  id: string,
  status: EventRequestStatus = "rejected",
  adminNote?: string
): Promise<EventRequest> {
  const updated = await dbStorage.updateEventRequest(id, {
    status,
    adminNote,
  });
  if (!updated) {
    throw new Error("Request not found");
  }
  return updated;
}

