import test from "node:test";
import assert from "node:assert/strict";
import { requestFeedback, requestFeedbackLinks, whatsappNumber } from "./request-feedback";
import { insertEventRequestSchema, type EventRequest } from "./schema";

const request: EventRequest = { id: "test", type: "training", title: "Training & Taktik?", createdBy: "Max", pitch: "a-platz", team: "c-jugend-2", contactEmail: "coach@example.invalid", contactPhone: "+49 (0)171 1234567", startAt: "2026-10-26T17:00:00Z", endAt: "2026-10-26T18:30:00Z", status: "rejected", rejectionReason: "Platz belegt & gesperrt", adminNote: "Interne Notiz", createdAt: "", updatedAt: "" };

test("manual rejection draft includes the saved reason, team, edited details and Berlin time", () => {
  const draft = requestFeedback([request]);
  assert.match(draft.subject, /Trainingsanfrage abgelehnt/);
  assert.match(draft.text, /18:00/);
  assert.match(draft.text, /C-Jugend/);
  assert.match(draft.text, /Grund der Ablehnung: Platz belegt & gesperrt/);
  assert.ok(!draft.text.includes("Interne Notiz"));
  assert.match(requestFeedback([{ ...request, type: "spiel", status: "approved", adminNote: "B-Platz" }]).subject, /Spielanfrage angenommen/);
});

test("email and WhatsApp links contain the recipient and the full encoded draft", () => {
  const draft = requestFeedback([request]);
  const links = requestFeedbackLinks([request], draft);
  assert.ok(links.mailto?.startsWith("mailto:coach%40example.invalid?"));
  const mail = new URL(links.mailto!);
  assert.equal(mail.searchParams.get("subject"), draft.subject);
  assert.equal(mail.searchParams.get("body")?.replace(/\r\n/g, "\n"), draft.text);
  const whatsapp = new URL(links.whatsapp!);
  assert.equal(whatsapp.origin, "https://wa.me");
  assert.equal(whatsapp.pathname, "/491711234567");
  assert.equal(whatsapp.searchParams.get("text"), draft.text);
  const custom = requestFeedbackLinks([request], { subject: "Mein Betreff", text: "Persönlicher Text & Grüße?" });
  assert.equal(new URL(custom.whatsapp!).searchParams.get("text"), "Persönlicher Text & Grüße?");
});

test("series use all saved occurrences and individual decisions without mixing recipients", () => {
  const accepted = { ...request, id: "accepted", startAt: "2026-11-02T17:00:00Z", endAt: "2026-11-02T18:30:00Z", status: "approved" as const };
  const draft = requestFeedback([accepted, request]);
  assert.match(draft.text, /angenommen/);
  assert.match(draft.text, /abgelehnt/);
  assert.match(draft.text, /26\.10\.2026/);
  assert.match(draft.text, /02\.11\.2026/);
  assert.deepEqual(requestFeedbackLinks([request, { ...accepted, contactEmail: "other@example.invalid" }], draft), {});
  assert.deepEqual(requestFeedbackLinks([], draft), {});
});

test("phone normalization supports explicit country codes and German domestic numbers", () => {
  assert.equal(whatsappNumber("0171 / 1234567"), "491711234567");
  assert.equal(whatsappNumber("0049 (0)171-1234567"), "491711234567");
  assert.equal(whatsappNumber("+43 664 1234567"), "436641234567");
  for (const input of ["1711234567", "123", "http://example.com", "+" + "1".repeat(16)]) assert.equal(whatsappNumber(input), null);
  assert.equal(requestFeedbackLinks([{ ...request, contactEmail: undefined, contactPhone: undefined }], requestFeedback([request])).mailto, undefined);
});

test("contact details remain optional and are validated when supplied", () => {
  assert.equal(insertEventRequestSchema.safeParse({ ...request, contactEmail: undefined, contactPhone: undefined }).success, true);
  assert.equal(insertEventRequestSchema.parse({ ...request, contactEmail: " coach@example.invalid " }).contactEmail, "coach@example.invalid");
  assert.equal(insertEventRequestSchema.safeParse({ ...request, contactEmail: "invalid" }).success, false);
  for (const phone of ["---()", "hello", "<script>", "12", "1".repeat(41)]) assert.equal(insertEventRequestSchema.safeParse({ ...request, contactPhone: phone }).success, false);
});


test("automatic email uses the same saved reason with a club signature", () => {
  const draft = requestFeedback([request], { automatic: true });
  assert.match(draft.text, /Grund der Ablehnung: Platz belegt/);
  assert.match(draft.text, /Vereinsverwaltung/);
  assert.match(draft.text, /TSV Greding/);
  assert.ok(!draft.text.includes("direkt bei mir"));
});
