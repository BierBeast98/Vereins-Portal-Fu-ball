import { Resend } from "resend";
import type { Order, EventRequest } from "@shared/schema";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function sendOrderConfirmation(order: Order): Promise<boolean> {
  if (!resend) {
    console.log("E-Mail-Versand deaktiviert: RESEND_API_KEY nicht konfiguriert");
    return false;
  }

  const itemsHtml = order.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e5e5;">${item.productName}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e5e5;">${item.size}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e5e5;">${item.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e5e5;">${item.withInitials ? item.initialsText || "Ja" : "-"}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e5e5; text-align: right;">${item.totalPrice.toFixed(2).replace(".", ",")} €</td>
      </tr>
    `
    )
    .join("");

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Bestellbestätigung</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Vereinsportal TSV Greding</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Bestellbestätigung</p>
      </div>
      
      <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 8px 8px;">
        <p>Hallo ${order.firstName} ${order.lastName},</p>
        
        <p>vielen Dank für Ihre Bestellung! Hier ist eine Übersicht Ihrer Bestellung:</p>
        
        <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e5e5e5;">
          <h3 style="margin: 0 0 15px; color: #16a34a;">Bestelldetails</h3>
          <p style="margin: 5px 0;"><strong>Bestellnummer:</strong> ${order.id.slice(0, 8).toUpperCase()}</p>
          <p style="margin: 5px 0;"><strong>Kampagne:</strong> ${order.campaignName}</p>
          <p style="margin: 5px 0;"><strong>Datum:</strong> ${new Date(order.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; border: 1px solid #e5e5e5;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="padding: 12px 8px; text-align: left; font-weight: 600;">Produkt</th>
              <th style="padding: 12px 8px; text-align: left; font-weight: 600;">Größe</th>
              <th style="padding: 12px 8px; text-align: left; font-weight: 600;">Anzahl</th>
              <th style="padding: 12px 8px; text-align: left; font-weight: 600;">Initialien</th>
              <th style="padding: 12px 8px; text-align: right; font-weight: 600;">Preis</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <tr style="background: #f3f4f6;">
              <td colspan="4" style="padding: 12px 8px; font-weight: 600;">Gesamtbetrag</td>
              <td style="padding: 12px 8px; text-align: right; font-weight: 600; color: #16a34a; font-size: 18px;">${order.totalAmount.toFixed(2).replace(".", ",")} €</td>
            </tr>
          </tfoot>
        </table>
        
        <div style="margin-top: 30px; padding: 20px; background: #ecfdf5; border-radius: 8px; border: 1px solid #a7f3d0;">
          <p style="margin: 0; color: #166534;">
            <strong>Wichtig:</strong> Die Bezahlung erfolgt bei Abholung der Bestellung. 
            Sie werden benachrichtigt, sobald die Artikel eingetroffen sind.
          </p>
        </div>
        
        <p style="margin-top: 30px; color: #666;">
          Bei Fragen wenden Sie sich bitte an Ihren Vereinsvorstand.
        </p>
        
        <p style="margin-top: 20px;">
          Mit sportlichen Grüßen,<br>
          <strong>Ihr TSV Team</strong>
        </p>
      </div>
      
      <p style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
        Diese E-Mail wurde automatisch generiert. Bitte antworten Sie nicht auf diese Nachricht.
      </p>
    </body>
    </html>
  `;

  try {
    const result = await resend.emails.send({
      from: "Vereinsportal TSV Greding <bestellung@vereinsportal-tsv-greding.de>",
      to: order.email,
      subject: `Bestellbestätigung - ${order.campaignName}`,
      html: emailHtml,
    });

    console.log("E-Mail gesendet:", result);
    return true;
  } catch (error) {
    console.error("Fehler beim E-Mail-Versand:", error);
    return false;
  }
}

// ============================================
// ADMIN-BENACHRICHTIGUNG: Neuer Platzvorschlag
// ============================================

const PITCH_LABELS: Record<string, string> = {
  "a-platz": "A-Platz (Hauptplatz)",
  "b-platz": "B-Platz (Nebenplatz)",
  "kunstrasen": "Kunstrasen",
  "halle": "Halle",
};

const TEAM_LABELS: Record<string, string> = {
  herren: "Herren",
  herren2: "Herren 2",
  "a-jugend": "A-Jugend",
  "b-jugend": "B-Jugend",
  "c-jugend": "C-Jugend",
  "d-jugend": "D-Jugend",
  "e-jugend": "E-Jugend",
  "f-jugend": "F-Jugend",
  "g-jugend": "G-Jugend",
};

export async function sendEventRequestNotification(request: EventRequest): Promise<boolean> {
  if (!resend) {
    console.log("E-Mail-Benachrichtigung deaktiviert: RESEND_API_KEY nicht konfiguriert");
    return false;
  }

  const adminEmail = process.env.ADMIN_EMAIL || "moe.greding@gmail.com";

  const startDate = new Date(request.startAt);
  const endDate = new Date(request.endAt);

  const formatDe = (d: Date) =>
    d.toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Berlin",
    });

  const pitchLabel = PITCH_LABELS[request.pitch] ?? request.pitch;
  const teamLabel = request.team ? (TEAM_LABELS[request.team] ?? request.team) : "–";
  const adminUrl = "https://vereinsportal-tsv-greding.de/admin/requests";

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>Neuer Platzvorschlag</title></head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">

      <div style="background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 22px;">⚽ Neuer Platzvorschlag</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Vereinsportal TSV Greding</p>
      </div>

      <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 8px 8px;">
        <p>Es wurde ein neuer Vorschlag eingereicht und wartet auf deine Genehmigung:</p>

        <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e5e5e5;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; width: 40%;">Titel</td>
              <td style="padding: 8px 0; font-weight: 600;">${request.title}</td>
            </tr>
            <tr style="border-top: 1px solid #f3f4f6;">
              <td style="padding: 8px 0; color: #666;">Platz</td>
              <td style="padding: 8px 0; font-weight: 600;">${pitchLabel}</td>
            </tr>
            <tr style="border-top: 1px solid #f3f4f6;">
              <td style="padding: 8px 0; color: #666;">Mannschaft</td>
              <td style="padding: 8px 0; font-weight: 600;">${teamLabel}</td>
            </tr>
            <tr style="border-top: 1px solid #f3f4f6;">
              <td style="padding: 8px 0; color: #666;">Von</td>
              <td style="padding: 8px 0; font-weight: 600;">${formatDe(startDate)} Uhr</td>
            </tr>
            <tr style="border-top: 1px solid #f3f4f6;">
              <td style="padding: 8px 0; color: #666;">Bis</td>
              <td style="padding: 8px 0; font-weight: 600;">${formatDe(endDate)} Uhr</td>
            </tr>
            ${request.createdBy ? `
            <tr style="border-top: 1px solid #f3f4f6;">
              <td style="padding: 8px 0; color: #666;">Eingereicht von</td>
              <td style="padding: 8px 0; font-weight: 600;">${request.createdBy}</td>
            </tr>` : ""}
            ${request.note ? `
            <tr style="border-top: 1px solid #f3f4f6;">
              <td style="padding: 8px 0; color: #666;">Anmerkung</td>
              <td style="padding: 8px 0;">${request.note}</td>
            </tr>` : ""}
          </table>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${adminUrl}" style="background: #16a34a; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
            → Jetzt im Admin-Bereich ansehen
          </a>
        </div>

        <p style="color: #666; font-size: 14px;">
          Du kannst den Vorschlag im Admin-Bereich unter <strong>Anfragen</strong> genehmigen oder ablehnen.
        </p>
      </div>

      <p style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
        Diese E-Mail wurde automatisch generiert · Vereinsportal TSV Greding
      </p>
    </body>
    </html>
  `;

  try {
    const result = await resend.emails.send({
      from: "Vereinsportal TSV Greding <bestellung@vereinsportal-tsv-greding.de>",
      to: adminEmail,
      subject: `⚽ Neuer Platzvorschlag: ${request.title} – ${new Date(request.startAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" })}`,
      html: emailHtml,
    });
    console.log("Admin-Benachrichtigung gesendet:", result);
    return true;
  } catch (error) {
    console.error("Fehler beim Senden der Admin-Benachrichtigung:", error);
    return false;
  }
}
