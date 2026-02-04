import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Campaign } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, Calendar, ArrowRight, Lock } from "lucide-react";
import { format, parseISO, isPast, isFuture, isWithinInterval } from "date-fns";
import { de } from "date-fns/locale";

export default function HomePage() {
  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns/active"],
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
            <div className="h-16 w-16 rounded-xl bg-primary-foreground/10 flex items-center justify-center">
              <Package className="h-8 w-8" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-4">TSV Bestellportal</h1>
          <p className="text-lg text-primary-foreground/80 max-w-xl mx-auto">
            Willkommen im Bestellportal für Trainings- und Präsentationsbekleidung.
            Hier kannst du an aktiven Sammelbestellungen teilnehmen.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 md:p-8">
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

        <div className="mt-12 pt-8 border-t">
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
