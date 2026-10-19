import { useLocation, Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuBadge, SidebarMenuItem, SidebarHeader, SidebarFooter } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Package, Calendar, ClipboardList, ExternalLink, Settings, LogOut, CalendarDays, LayoutGrid, Download, ListChecks, PartyPopper, Network, Users, type LucideIcon } from "lucide-react";
import { hasPermission, portalJson, usePortalAuth } from "@/lib/portal-auth";
import type { Permission } from "@shared/permissions";
import tsvLogo from "@/TSV_Greding_logo_transparent.png";

type NavigationItem = { title: string; url: string; icon: LucideIcon; permission?: Permission };
const groups: { title: string; items: NavigationItem[] }[] = [
  { title: "Fußball-Planung", items: [
    { title: "Jahreskalender", url: "/admin/calendar", icon: CalendarDays, permission: "calendar.read" },
    { title: "Trainingszeiten", url: "/admin/training-times", icon: Calendar, permission: "calendar.read" },
    { title: "Platzbelegung", url: "/admin/fields", icon: LayoutGrid, permission: "calendar.read" },
    { title: "Vorschläge / Requests", url: "/admin/requests", icon: ListChecks, permission: "requests.read" },
    { title: "BFV-Import", url: "/admin/bfv-import", icon: Download, permission: "bfv.read" },
  ] },
  { title: "Bestellungen", items: [
    { title: "Produkte", url: "/admin/products", icon: Package, permission: "shop.read" },
    { title: "Kampagnen", url: "/admin/campaigns", icon: Calendar, permission: "shop.read" },
    { title: "Bestellungen", url: "/admin/orders", icon: ClipboardList, permission: "orders.read" },
  ] },
  { title: "Veranstaltungen", items: [{ title: "Feste & Helfer", url: "/admin/festivals", icon: PartyPopper, permission: "festivals.read" }] },
  { title: "Verein & Konto", items: [
    { title: "Organigramm", url: "/admin/organigramm", icon: Network, permission: "organization.manage" },
    { title: "Benutzer & Rechte", url: "/admin/users", icon: Users, permission: "users.manage" },
    { title: "Mein Konto", url: "/admin/settings", icon: Settings },
  ] },
];

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: auth } = usePortalAuth();
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["/api/admin/event-requests", "pending-count"],
    queryFn: async () => (await portalJson<unknown[]>("/api/admin/event-requests?status=pending")).length,
    enabled: hasPermission(auth, "requests.read"),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  const logout = useMutation({
    mutationFn: () => portalJson("/api/auth/logout", "POST", {}),
    onSuccess: async () => { await queryClient.cancelQueries(); queryClient.clear(); setLocation("/admin/login"); },
  });
  return <Sidebar>
    <SidebarHeader className="p-4"><div className="flex items-center gap-3"><img src={tsvLogo} alt="TSV Greding" className="h-10 w-10 object-contain" /><div><h2 className="text-base font-semibold leading-tight">TSV Greding</h2><p className="text-xs text-muted-foreground">Vereinsverwaltung</p></div></div></SidebarHeader>
    <SidebarContent>{groups.map((group) => {
      const items = group.items.filter((item) => !item.permission || hasPermission(auth, item.permission));
      if (!items.length) return null;
      return <SidebarGroup key={group.title}><SidebarGroupLabel>{group.title}</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{items.map((item) => <SidebarMenuItem key={item.url}><SidebarMenuButton asChild isActive={location === item.url || location.startsWith(`${item.url}/`)}><Link href={item.url} data-testid={`link-${item.url.split('/').pop()}`}><item.icon className="h-4 w-4" /><span>{item.title}</span></Link></SidebarMenuButton>{item.url === "/admin/requests" && pendingCount > 0 && <SidebarMenuBadge className="bg-amber-500 text-white">{pendingCount}</SidebarMenuBadge>}</SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup>;
    })}<SidebarGroup><SidebarGroupLabel>Schnellzugriff</SidebarGroupLabel><SidebarGroupContent><SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild><Link href="/" data-testid="link-public-form"><ExternalLink className="h-4 w-4" /><span>Startseite anzeigen</span></Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent>
    <SidebarFooter className="space-y-3 p-4"><div className="min-w-0 text-sm"><p className="truncate font-medium">{auth?.user?.name}</p><p className="truncate text-xs text-muted-foreground">{auth?.user?.email}</p></div>{logout.error && <p role="alert" className="text-xs text-destructive">{logout.error.message}</p>}<Button variant="outline" className="w-full justify-start" disabled={logout.isPending} onClick={() => logout.mutate()} data-testid="button-logout"><LogOut className="mr-2 h-4 w-4" />Abmelden</Button></SidebarFooter>
  </Sidebar>;
}
