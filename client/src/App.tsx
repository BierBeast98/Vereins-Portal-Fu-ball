import { Switch, Route, useLocation, Redirect, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home";
import OrderFormPage from "@/pages/order-form";
import FestivalSignupPage from "@/pages/festival-signup";
import AdminLoginPage from "@/pages/admin/login";
import ProductsPage from "@/pages/admin/products";
import CampaignsPage from "@/pages/admin/campaigns";
import OrdersPage from "@/pages/admin/orders";
import SettingsPage from "@/pages/admin/settings";
import CalendarPage from "@/pages/admin/calendar";
import FieldsPage from "@/pages/admin/fields";
import BfvImportPage from "@/pages/admin/bfv-import";
import RequestsPage from "@/pages/admin/requests";
import FestivalsPage from "@/pages/admin/festivals";
import FestivalDetailPage from "@/pages/admin/festival-detail";
import OrganizationPage from "@/pages/organization";
import UsersPage from "@/pages/admin/users";
import { firstAllowedPath, hasPermission, permissionForPath, usePortalAuth } from "@/lib/portal-auth";
import { Button } from "@/components/ui/button";
import type { Permission } from "@shared/permissions";
import { Loader2 } from "lucide-react";

function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: auth } = usePortalAuth();
  const permission = permissionForPath(location);
  const readOnly = permission?.endsWith(".read") && !hasPermission(auth, permission.replace(/\.read$/, ".write") as Permission);
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between gap-2 p-3 border-b bg-background">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto p-6">
            {readOnly && <p role="status" className="mb-4 rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">Du kannst diesen Bereich ansehen. Für Änderungen fehlen dir die Bearbeitungsrechte.</p>}
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function ProtectedAdminRoute({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data, isLoading, error, refetch } = usePortalAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) return <div className="mx-auto max-w-lg space-y-4 p-8"><h1 className="text-xl font-semibold">Zugang konnte nicht geprüft werden</h1><p>Bitte versuche es erneut.</p><Button onClick={() => void refetch()}>Erneut versuchen</Button></div>;
  if (!data?.authenticated) return <Redirect to={`/admin/login?next=${encodeURIComponent(location)}`} />;
  if (location === "/admin") return <Redirect to={firstAllowedPath(data)} />;
  const permission = permissionForPath(location);
  if (permission && !hasPermission(data, permission)) return <AdminLayout><section className="mx-auto max-w-lg space-y-4 py-12"><h1 className="text-2xl font-semibold">Kein Zugriff auf diesen Bereich</h1><p className="text-muted-foreground">Deinem persönlichen Konto fehlt die Berechtigung für diese Seite. Wende dich bei Bedarf an die zuständige Person im Verein.</p><Link href={firstAllowedPath(data)}><Button>Zu meinem Bereich</Button></Link></section></AdminLayout>;

  return <AdminLayout>{children}</AdminLayout>;
}

function Router() {
  const [location] = useLocation();
  const isAdminRoute = location.startsWith("/admin");
  const isLoginRoute = location === "/admin/login";

  if (isLoginRoute) {
    return <AdminLoginPage />;
  }

  if (isAdminRoute) {
    return (
      <ProtectedAdminRoute>
        <Switch>
          <Route path="/admin" component={() => <Redirect to="/admin/calendar" />} />
          <Route path="/admin/products" component={ProductsPage} />
          <Route path="/admin/campaigns" component={CampaignsPage} />
          <Route path="/admin/orders" component={OrdersPage} />
          <Route path="/admin/calendar" component={CalendarPage} />
          <Route path="/admin/fields" component={FieldsPage} />
          <Route path="/admin/requests" component={RequestsPage} />
          <Route path="/admin/bfv-import" component={BfvImportPage} />
          <Route path="/admin/festivals" component={FestivalsPage} />
          <Route path="/admin/festivals/:festivalId" component={FestivalDetailPage} />
          <Route path="/admin/settings" component={SettingsPage} />
          <Route path="/admin/users" component={UsersPage} />
          <Route path="/admin/organigramm" component={OrganizationPage} />
          <Route component={NotFound} />
        </Switch>
      </ProtectedAdminRoute>
    );
  }

  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/organigramm" component={OrganizationPage} />
      <Route path="/order/:campaignId" component={OrderFormPage} />
      <Route path="/festival/:festivalId" component={FestivalSignupPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
