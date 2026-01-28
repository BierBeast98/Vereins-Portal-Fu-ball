import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home";
import OrderFormPage from "@/pages/order-form";
import AdminLoginPage from "@/pages/admin/login";
import ProductsPage from "@/pages/admin/products";
import CampaignsPage from "@/pages/admin/campaigns";
import OrdersPage from "@/pages/admin/orders";
import SettingsPage from "@/pages/admin/settings";
import CalendarPage from "@/pages/admin/calendar";
import FieldsPage from "@/pages/admin/fields";
import BfvImportPage from "@/pages/admin/bfv-import";
import { Loader2 } from "lucide-react";

function AdminLayout({ children }: { children: React.ReactNode }) {
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
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function ProtectedAdminRoute({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/auth/check"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data?.isAdmin) {
    return <Redirect to="/admin/login" />;
  }

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
          <Route path="/admin/products" component={ProductsPage} />
          <Route path="/admin/campaigns" component={CampaignsPage} />
          <Route path="/admin/orders" component={OrdersPage} />
          <Route path="/admin/calendar" component={CalendarPage} />
          <Route path="/admin/fields" component={FieldsPage} />
          <Route path="/admin/bfv-import" component={BfvImportPage} />
          <Route path="/admin/settings" component={SettingsPage} />
          <Route component={NotFound} />
        </Switch>
      </ProtectedAdminRoute>
    );
  }

  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/order/:campaignId" component={OrderFormPage} />
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
