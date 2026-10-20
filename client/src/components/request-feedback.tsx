import { useState } from "react";
import type { EventRequest } from "@shared/schema";
import { requestFeedback, requestFeedbackLinks } from "@shared/request-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, MessageCircle, Copy } from "lucide-react";

export function RequestFeedback({ requests, emailFailed = false }: { requests: EventRequest[]; emailFailed?: boolean }) {
  const [draft, setDraft] = useState(() => requestFeedback(requests));
  const links = requestFeedbackLinks(requests, draft);
  const head = requests[0];
  const { toast } = useToast();
  return <section className="space-y-3" aria-label="Persönliche Rückmeldung">
    <p className="text-sm text-muted-foreground">{emailFailed ? "Die automatische E-Mail konnte nicht versendet werden. Hier kannst du die Nachricht ersatzweise manuell versenden." : head?.contactEmail ? "E-Mail-Rückmeldungen werden beim Entscheiden automatisch versendet. Hier kannst du bei Bedarf eine zusätzliche persönliche Nachricht vorbereiten." : "Die Entscheidung ist gespeichert. Öffne WhatsApp, prüfe den vorbereiteten Text und sende ihn selbst ab."}</p>
    <p className="text-sm wrap-break-word"><strong>Kontakt:</strong> {[head?.contactEmail, head?.contactPhone].filter(Boolean).join(" · ") || "Keine Kontaktdaten hinterlegt"}</p>
    <div className="space-y-1.5"><Label>Betreff<Input aria-label="Betreff der Rückmeldung" className="mt-1.5" value={draft.subject} onChange={event => setDraft({ ...draft, subject: event.target.value })} /></Label></div>
    <div className="space-y-1.5"><Label>Nachricht<Textarea aria-label="Nachricht zur Entscheidung" className="mt-1.5" rows={10} value={draft.text} onChange={event => setDraft({ ...draft, text: event.target.value })} /></Label></div>
    <div className="flex flex-wrap gap-2">
      {links.mailto && <Button asChild><a href={links.mailto}><Mail className="h-4 w-4" />E-Mail öffnen</a></Button>}
      {links.whatsapp && <Button asChild variant="outline"><a href={links.whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" />WhatsApp öffnen</a></Button>}
      <Button variant="outline" onClick={async () => {
        try { await navigator.clipboard.writeText(draft.text); toast({ title: "Nachricht kopiert" }); }
        catch { toast({ title: "Kopieren nicht möglich", description: "Bitte markiere und kopiere den Nachrichtentext direkt.", variant: "destructive" }); }
      }}><Copy className="h-4 w-4" />Text kopieren</Button>
    </div>
    {head?.contactPhone && !links.whatsapp && <p className="text-xs text-muted-foreground">Für den WhatsApp-Link wird eine vollständige Nummer mit Ländervorwahl (z. B. +49) oder eine deutsche Nummer mit führender 0 benötigt.</p>}
    <p className="text-xs text-muted-foreground">E-Mail öffnet dein eingerichtetes Mailprogramm; dort wählst du den Absender. WhatsApp nutzt deinen angemeldeten Account. Deutsche Telefonnummern mit führender 0 werden für WhatsApp in +49 umgewandelt.</p>
  </section>;
}
