import { Resend } from "resend";
import type { Order } from "@shared/schema";

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
        <h1 style="color: white; margin: 0; font-size: 24px;">TSV Bestellportal</h1>
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
      from: "TSV Bestellportal <bestellung@resend.dev>",
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
