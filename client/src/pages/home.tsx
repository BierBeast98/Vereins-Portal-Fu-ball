import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Campaign } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, ArrowRight, Lock } from "lucide-react";
import { format, parseISO, isPast, isFuture, isWithinInterval } from "date-fns";
import { de } from "date-fns/locale";
import tsvLogo from "@/TSV_Greding_logo_transparent.png";
import { TrainingRequestDialog } from "@/components/training-request-dialog";
import { MobileFieldCalendar } from "@/components/mobile-field-calendar";

export default function HomePage() {
  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns/active"],
  });

  const [fieldView, setFieldView] = useState<"a" | "b">("a");
  const [requestOpen, setRequestOpen] = useState(false);

  const startDateStr = format(new Date(), "yyyy-MM-dd");

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
            Spielplan und Platzbelegung – alles auf einen Blick.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-10">
        {(isLoading || activeCampaigns.length > 0) && (
          <>
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
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {activeCampaigns.map((campaign) => {
                  const status = getCampaignStatus(campaign);
                  return (
                    <Card key={campaign.id} className="hover-elevate">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              {campaign.name}
                              {campaign.hasPassword && (
                                <Lock className="h-4 w-4 text-muted-foreground" aria-label="Passwortgeschützt" />
                              )}
                            </CardTitle>
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
            )}
          </>
        )}

        <section className="pt-8 border-t">
          <h2 className="text-2xl font-semibold mb-1">Platzbelegung</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Spiele und Trainings auf {fieldView === "a" ? "A-Platz" : "B-Platz"}
          </p>
          <MobileFieldCalendar
            fieldView={fieldView}
            onFieldChange={setFieldView}
            onRequestTraining={() => setRequestOpen(true)}
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
