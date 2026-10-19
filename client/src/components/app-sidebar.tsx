import { useLocation, Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Package, Calendar, ClipboardList, ExternalLink, Settings, LogOut, CalendarDays, LayoutGrid, Download, ListChecks, PartyPopper, Network } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import tsvLogo from "@/TSV_Greding_logo_transparent.png";

const planningItems = [
  {
    title: "Jahreskalender",
    url: "/admin/calendar",
    icon: CalendarDays,
  },
  {
    title: "Platzbelegung",
    url: "/admin/fields",
    icon: LayoutGrid,
  },
  {
    title: "Vorschläge / Requests",
    url: "/admin/requests",
    icon: ListChecks,
  },
  {
    title: "BFV-Import",
    url: "/admin/bfv-import",
    icon: Download,
  },
];

const shopItems = [
  {
    title: "Produkte",
    url: "/admin/products",
    icon: Package,
  },
  {
    title: "Kampagnen",
    url: "/admin/campaigns",
    icon: Calendar,
  },
  {
    title: "Bestellungen",
    url: "/admin/orders",
    icon: ClipboardList,
  },
];

const festivalItems = [
  {
    title: "Feste & Helfer",
    url: "/admin/festivals",
    icon: PartyPopper,
  },
];

const settingsItems = [
  {
    title: "Organigramm",
    url: "/admin/organigramm",
    icon: Network,
  },
  {
    title: "Einstellungen",
    url: "/admin/settings",
    icon: Settings,
  },
];

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Anzahl offener Vorschläge — Query-Key teilt das Präfix der Requests-Seite,
  // damit Freigeben/Ablehnen den Zähler sofort aktualisiert.
  const { data: pendingCount = 0 } = useQuery<number>({
    queryKey: ["/api/admin/event-requests", "pending-count"],
    queryFn: async () => {
      const res = await fetch("/api/admin/event-requests?status=pending", {
        credentials: "include",
      });
      if (!res.ok) return 0; // z. B. 401 → still bleiben
      const data = (await res.json()) as unknown[];
      return Array.isArray(data) ? data.length : 0;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/check"] });
      setLocation("/admin/login");
    },
  });

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <img src={tsvLogo} alt="TSV Greding" className="h-10 w-10 object-contain" />
          <div>
            <h2 className="text-base font-semibold leading-tight">TSV Greding</h2>
            <p className="text-xs text-muted-foreground">Admin-Bereich</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {/* Fußball-Planung zuerst */}
        <SidebarGroup>
          <SidebarGroupLabel>Fußball-Planung</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {planningItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                  >
                    <Link href={item.url} data-testid={`link-${item.url.split('/').pop()}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                  {item.url === "/admin/requests" && pendingCount > 0 && (
                    <SidebarMenuBadge className="bg-amber-500 text-white">
                      {pendingCount}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Bestellungen danach */}
        <SidebarGroup>
          <SidebarGroupLabel>Bestellungen</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {shopItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                  >
                    <Link href={item.url} data-testid={`link-${item.url.split('/').pop()}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Feste / Helfer-Schichtplaner */}
        <SidebarGroup>
          <SidebarGroupLabel>Veranstaltungen</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {festivalItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.startsWith(item.url)}
                  >
                    <Link href={item.url} data-testid={`link-${item.url.split('/').pop()}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                  >
                    <Link href={item.url} data-testid={`link-${item.url.split('/').pop()}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Schnellzugriff</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href="/" data-testid="link-public-form">
                    <ExternalLink className="h-4 w-4" />
                    <span>Startseite anzeigen</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-3">
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          data-testid="button-logout"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Abmelden
        </Button>
        <div className="text-xs text-muted-foreground">
          Vereinsportal TSV Greding v1.0
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
