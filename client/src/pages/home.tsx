import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Campaign, CalendarEvent, Field } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, ArrowRight, Lock } from "lucide-react";
import { format, parseISO, isPast, isFuture, isWithinInterval } from "date-fns";
import { de } from "date-fns/locale";
import tsvLogo from "@/TSV_Greding_logo_transparent.png";
import { FieldSchedule } from "@/components/field-schedule";
import { TrainingRequestDialog } from "@/components/training-request-dialog";
import { FIELDS } from "@shared/schema";

export default function HomePage() {
  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns/active"],
  });

  const [fieldView, setFieldView] = useState<"a" | "b" | "both">("both");
  const [requestOpen, setRequestOpen] = useState(false);

  // Aktuelle Kalenderwoche als Default, Betreuer können zwischen Wochen wechseln
  const [currentDate, setCurrentDate] = useState(() => new Date());

  const weekDates = useMemo(() => {
    const date = currentDate;
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Montag als Wochenstart
    const monday = new Date(date);
    monday.setDate(diff);
    const dates: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dates.push(d);
    }
    return dates;
  }, [currentDate]);

  const startDateStr = format(weekDates[0], "yyyy-MM-dd");
  const endDateStr = format(weekDates[6], "yyyy-MM-dd");
  const days = 7;

  const { data: fieldEvents = [] } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/public/calendar/fields", startDateStr, endDateStr],
    queryFn: async () => {
      const res = await fetch(`/api/public/calendar/fields?startDate=${startDateStr}&endDate=${endDateStr}`);
      if (!res.ok) throw new Error("Failed to fetch field events");
      return res.json();
    },
  });

  const getCampaignStatus = (campaign: Campaign) => {
    const now = new Date();
    const start = parseISO(campaign.startDate);
    const end = parseISO(campaign.endDate);

    if (isPast(end)) {
      return { label: "Beendet", variant: "outline" as const, canOrder: false };
    }
    if (isFuture(start)) {
      return { label: "Geplant", variant: "secondary" as const, canOrder: false };
    }
    if (isWithinInterval(now, { start, end })) {
      return { label: "Aktiv", variant: "default" as const, canOrder: true };
    }
    return { label: "Unbekannt", variant: "outline" as const, canOrder: false };
  };

  const activeCampaigns = campaigns?.filter((c) => {
    const status = getCampaignStatus(c);
    return status.canOrder;
  }) || [];

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary text-primary-foreground py-16 px-4 relative">
        <Link 
          href="/admin/products" 
          className="absolute top-4 right-4 text-primary-foreground/60 hover:text-primary-foreground text-sm flex items-center gap-1"
          data-testid="link-header-admin"
        >
          <Lock className="h-4 w-4" />
          Admin
        </Link>
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center justify-center mb-6">
            <div className="h-20 w-20 rounded-xl bg-white flex items-center justify-center overflow-hidden shadow-lg">
              <img
                src={tsvLogo}
                alt="TSV Greding Logo"
                className="h-full w-full object-contain"
              />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-4">Vereinsportal TSV Greding</h1>
          <p className="text-lg text-primary-foreground/80 max-w-xl mx-auto">
            Willkommen im Vereinsportal für Trainings- und Präsentationsbekleidung.
            Hier kannst du an aktiven Sammelbestellungen teilnehmen.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-10">
        <h2 className="text-2xl font-semibold mb-6">
          Aktive Sammelbestellungen
        </h2>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : activeCampaigns.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {activeCampaigns.map((campaign) => {
              const status = getCampaignStatus(campaign);
              return (
                <Card key={campaign.id} className="hover-elevate">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle>{campaign.name}</CardTitle>
                        <CardDescription className="mt-1 flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          bis {format(parseISO(campaign.endDate), "dd. MMMM yyyy", { locale: de })}
                        </CardDescription>
                      </div>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{campaign.description}</p>
                  </CardContent>
                  <CardFooter>
                    <Link href={`/order/${campaign.id}`} className="w-full">
                      <Button className="w-full" data-testid={`button-order-${campaign.id}`}>
                        Zur Bestellung
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center py-16">
              <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Keine aktiven Sammelbestellungen</h3>
              <p className="text-muted-foreground text-center">
                Aktuell gibt es keine laufenden Sammelbestellungen. Schau später wieder vorbei!
              </p>
            </CardContent>
          </Card>
        )}

        <section className="pt-8 border-t">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div>
              <h2 className="text-2xl font-semibold">Platzbelegung (Betreuer-Ansicht)</h2>
              <p className="text-sm text-muted-foreground">
                Übersicht der aktuellen Kalenderwoche für A- und B-Platz. Spiele und bestätigte Trainings werden angezeigt.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Woche {format(weekDates[0], "II")} · {format(weekDates[0], "dd.MM.")} – {format(weekDates[6], "dd.MM.yyyy")}
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-3 md:items-end">
              <div className="inline-flex rounded-md shadow-sm border bg-background self-start md:self-end" role="group">
              <button
                type="button"
                className={`px-3 py-1.5 text-xs md:text-sm font-medium rounded-l-md ${
                  fieldView === "a" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
                onClick={() => setFieldView("a")}
              >
                Platz A
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 text-xs md:text-sm font-medium border-l ${
                  fieldView === "both" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
                onClick={() => setFieldView("both")}
              >
                Beide
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 text-xs md:text-sm font-medium rounded-r-md border-l ${
                  fieldView === "b" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
                onClick={() => setFieldView("b")}
              >
                Platz B
              </button>
            </div>
              <div className="inline-flex rounded-md shadow-sm border bg-background self-start md:self-end" role="group">
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs md:text-sm font-medium border-r text-muted-foreground hover:bg-muted"
                  onClick={() => setCurrentDate(new Date())}
                >
                  Diese Woche
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs md:text-sm font-medium border-r text-muted-foreground hover:bg-muted"
                  onClick={() => {
                    const d = new Date(currentDate);
                    d.setDate(d.getDate() - 7);
                    setCurrentDate(d);
                  }}
                >
                  &lt;
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs md:text-sm font-medium text-muted-foreground hover:bg-muted"
                  onClick={() => {
                    const d = new Date(currentDate);
                    d.setDate(d.getDate() + 7);
                    setCurrentDate(d);
                  }}
                >
                  &gt;
                </button>
              </div>
              <Button variant="default" size="sm" onClick={() => setRequestOpen(true)}>
                Training vorschlagen
              </Button>
            </div>
          </div>

          <FieldSchedule
            events={fieldEvents}
            startDate={startDateStr}
            days={days}
            fields={
              fieldView === "a"
                ? (["a-platz"] as Field[])
                : fieldView === "b"
                ? (["b-platz"] as Field[])
                : (FIELDS as Field[])
            }
          />

          <TrainingRequestDialog
            open={requestOpen}
            onOpenChange={setRequestOpen}
            defaultDate={startDateStr}
          />
        </section>

        <div className="pt-8 border-t">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Lock className="h-4 w-4" />
            <Link href="/admin/products" className="text-sm hover:underline">
              Admin-Bereich
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
