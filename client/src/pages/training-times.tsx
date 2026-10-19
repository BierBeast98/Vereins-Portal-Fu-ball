import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { TEAMS, TEAM_LABELS, FIELD_LABELS, type Team } from "@shared/schema";
import type { TrainingSlot } from "@shared/training-schedule";
import { portalJson } from "@/lib/portal-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const weekdays = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("de-DE");

export default function TrainingTimesPage() {
  const [location] = useLocation();
  const admin = location.startsWith("/admin/");
  const [team, setTeam] = useState("all");
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/public/training-schedule"],
    queryFn: () => portalJson<{ start: string; end: string; slots: TrainingSlot[] }>("/api/public/training-schedule"),
    refetchInterval: 60_000,
  });
  const availableTeams = TEAMS.filter(item => data?.slots.some(slot => slot.team === item));
  const selectedTeam = availableTeams.some(item => item === team) ? team : "all";
  const teams = availableTeams.filter(item => selectedTeam === "all" || selectedTeam === item);
  return <div className={admin ? "space-y-6" : "mx-auto max-w-5xl space-y-6 p-4 py-8 sm:p-8"}>
    <Link href={admin ? "/admin/calendar" : "/"} className="text-sm text-primary underline">{admin ? "Zum Jahreskalender" : "Zur Startseite"}</Link>
    <div><h1 className="text-2xl font-bold sm:text-3xl">Trainingszeiten der Mannschaften</h1><p className="mt-2 text-muted-foreground">Regelmäßige Trainingszeiten aus dem Vereinskalender.</p></div>
    <div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-2">
      <p>Wir zeigen bestätigte Trainings, die in den kommenden vier Wochen mindestens zweimal am gleichen Wochentag, zur gleichen Zeit und am gleichen Ort eingetragen sind. Einzeltermine und offene Vorschläge zählen nicht dazu.</p>
      {data && <p className="font-medium">Kalenderzeitraum: {dateLabel(data.start)} bis {dateLabel(data.end)}</p>}
      <p>Die aufgeführten Termine zeigen auch Pausen und auslaufende Trainingszeiten. Kurzfristige Änderungen bitte im Kalender prüfen.</p>
    </div>
    {availableTeams.length > 0 && <Select value={selectedTeam} onValueChange={setTeam}><SelectTrigger className="w-full sm:w-64" aria-label="Mannschaft auswählen"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Alle Mannschaften mit Trainingszeiten</SelectItem>{availableTeams.map(item => <SelectItem key={item} value={item}>{TEAM_LABELS[item]}</SelectItem>)}</SelectContent></Select>}
    {isLoading && <p role="status">Trainingszeiten werden geladen …</p>}
    {error && <div role="alert" className="rounded-lg border border-destructive p-4">Trainingszeiten konnten nicht geladen werden. <Button variant="outline" onClick={() => void refetch()}>Erneut versuchen</Button></div>}
    {data && !error && availableTeams.length === 0 && <p role="status" className="rounded-lg border p-4 text-muted-foreground">Im angezeigten Zeitraum sind keine regelmäßigen Trainingszeiten im Kalender hinterlegt.</p>}
    {data && !error && <div className="grid gap-4 md:grid-cols-2">{teams.map(item => {
      const slots = data.slots.filter(slot => slot.team === item);
      return <Card key={item}><CardHeader><CardTitle className="text-lg">{TEAM_LABELS[item as Team]}</CardTitle></CardHeader><CardContent>
        <ul className="space-y-4">{slots.map((slot, index) => <li key={index} className="border-l-2 border-primary pl-3">
          <p className="font-semibold">{weekdays[slot.weekday]} · {slot.startTime}–{slot.endTime} Uhr</p>
          <p className="text-sm">{slot.field ? FIELD_LABELS[slot.field] : "Platz noch offen"}{slot.location && ` · ${slot.location}`}</p>
          <p className="mt-1 text-xs text-muted-foreground">Eingetragen am: {slot.dates.map(dateLabel).join(", ")}</p>
        </li>)}</ul>
      </CardContent></Card>;
    })}</div>}
  </div>;
}
