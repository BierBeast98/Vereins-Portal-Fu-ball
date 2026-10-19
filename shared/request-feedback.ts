import { FIELD_LABELS, TEAM_LABELS, type EventRequest } from "./schema";

const actionLabel = (request: EventRequest) => request.type === "delete_request" ? "Löschanfrage" : request.type === "change_request" ? "Änderungsanfrage" : request.type === "spiel" ? "Spielanfrage" : "Trainingsanfrage";
const decisionLabel = (request: EventRequest) => request.status === "approved" ? "angenommen" : request.status === "rejected" ? "abgelehnt" : "noch offen";

/** One draft for a request or a series, using the actual saved decisions and dates. */
export type FeedbackDelivery = "sent" | "failed" | "manual" | "not-requested" | "unchanged";
export interface FeedbackResult { request: EventRequest; delivery: FeedbackDelivery; }

export function requestFeedback(requests: EventRequest[], options: { automatic?: boolean } = {}) {
  if (!requests.length) return { subject: "Rückmeldung – TSV Greding", text: "" };
  const ordered = [...requests].sort((a, b) => a.startAt.localeCompare(b.startAt));
  const head = ordered[0];
  const format = (value: string) => new Date(value).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "short" });
  const uniform = ordered.every(request => request.status === head.status && request.type === head.type);
  const subject = uniform ? `${actionLabel(head)} ${decisionLabel(head)} – TSV Greding` : "Rückmeldung zu deinen Anträgen – TSV Greding";
  const details = ordered.map(request => [
    `${actionLabel(request)} ${decisionLabel(request)}: ${request.title}`,
    request.team ? `Mannschaft: ${TEAM_LABELS[request.team]}` : "",
    `Platz: ${FIELD_LABELS[request.pitch]}`,
    `Von: ${format(request.startAt)} Uhr`,
    `Bis: ${format(request.endAt)} Uhr`,
    request.status === "rejected" && request.rejectionReason ? `Grund der Ablehnung: ${request.rejectionReason}` : "",
    request.status === "approved" && request.adminNote ? `Rückmeldung: ${request.adminNote}` : "",
  ].filter(Boolean).join("\n"));
  const text = [
    `Hallo ${head.createdBy || "zusammen"},`,
    uniform ? `deine ${actionLabel(head)}${ordered.length > 1 ? ` mit ${ordered.length} Terminen` : ""} wurde ${decisionLabel(head)}.` : "hier findest du die Rückmeldung zu deinen beantragten Terminen:",
    details.join("\n\n"),
    options.automatic ? "Bei Rückfragen wende dich bitte an die Vereinsverwaltung." : "Bei Rückfragen kannst du dich direkt bei mir melden.",
    options.automatic ? "Mit sportlichen Grüßen\nTSV Greding" : "Mit sportlichen Grüßen",
  ].join("\n\n");
  return { subject, text };
}

/** German local numbers default to +49; explicit country codes remain unchanged. */
export function whatsappNumber(phone: string): string | null {
  const compact = phone.trim().replace(/\(0\)/g, "").replace(/[ ()/.-]/g, "");
  let digits: string;
  if (compact.startsWith("+")) digits = compact.slice(1);
  else if (compact.startsWith("00")) digits = compact.slice(2);
  else if (compact.startsWith("0")) digits = `49${compact.slice(1)}`;
  else return null;
  return /^[1-9]\d{6,14}$/.test(digits) ? digits : null;
}

export function requestFeedbackLinks(requests: EventRequest[], draft: { subject: string; text: string }) {
  const head = requests[0];
  // A series must share its recipient; never send another coach's details by accident.
  if (!head || !requests.every(request => request.contactEmail === head.contactEmail && request.contactPhone === head.contactPhone)) return {};
  const phone = head.contactPhone && whatsappNumber(head.contactPhone);
  return {
    mailto: head.contactEmail ? `mailto:${encodeURIComponent(head.contactEmail)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.text.replace(/\r?\n/g, "\r\n"))}` : undefined,
    whatsapp: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(draft.text)}` : undefined,
  };
}
