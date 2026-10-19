import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PERMISSION_LABELS, type AuthState, type Permission, type PortalUser } from "@shared/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, Plus, Pencil, Loader2, ShieldCheck } from "lucide-react";
import { PortalApiError, portalAuthQuery, portalJson, usePortalAuth } from "@/lib/portal-auth";

const modules: { name: string; read: Permission; write: Permission }[] = [
  { name: "Kalender & Platzbelegung", read: "calendar.read", write: "calendar.write" },
  { name: "Anfragen", read: "requests.read", write: "requests.write" },
  { name: "BFV-Import", read: "bfv.read", write: "bfv.write" },
  { name: "Produkte & Kampagnen", read: "shop.read", write: "shop.write" },
  { name: "Bestellungen", read: "orders.read", write: "orders.write" },
  { name: "Feste & Helfer", read: "festivals.read", write: "festivals.write" },
];
const specialPermissions: Permission[] = ["organization.manage", "users.manage"];
type Draft = { name: string; email: string; password: string; fullAccess: boolean; active: boolean; permissions: Permission[] };
const emptyDraft = (): Draft => ({ name: "", email: "", password: "", fullAccess: false, active: true, permissions: [] });

export default function UsersPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { data: auth } = usePortalAuth();
  const [editing, setEditing] = useState<PortalUser | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [notice, setNotice] = useState("");
  const [rejecting, setRejecting] = useState<PortalUser | null>(null);
  const users = useQuery({ queryKey: ["/api/admin/users"], queryFn: () => portalJson<PortalUser[]>("/api/admin/users"), staleTime: 0, refetchOnWindowFocus: true });
  const mutation = useMutation({
    mutationFn: () => {
      const body = { name: draft.name.trim(), email: draft.email.trim(), fullAccess: draft.fullAccess, permissions: draft.permissions, ...(editing ? { active: editing.pending ? true : draft.active } : {}), ...(!editing || draft.password ? { password: draft.password } : {}) };
      return portalJson<PortalUser>(editing ? `/api/admin/users/${encodeURIComponent(editing.id)}` : "/api/admin/users", editing ? "PATCH" : "POST", body);
    },
    onSuccess: async () => {
      const self = editing?.id === auth?.user?.id;
      setOpen(false); setDraft(emptyDraft()); setNotice(editing?.pending ? "Zugang freigegeben. Die Person kann sich jetzt mit ihrem persönlichen Passwort anmelden." : editing ? "Konto aktualisiert." : "Persönliches Konto angelegt. Teile die Zugangsdaten direkt mit der betreffenden Person; es wird keine E-Mail versendet.");
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      if (self) {
        // A credential or permission update may revoke the current session.
        const fresh = await queryClient.fetchQuery<AuthState>(portalAuthQuery).catch(() => null);
        if (!fresh?.authenticated) { await queryClient.cancelQueries(); queryClient.clear(); navigate("/admin/login"); }
      } else await queryClient.invalidateQueries({ queryKey: ["/api/auth/check"] });
    },
    onError: async (error) => {
      if (error instanceof PortalApiError && error.status === 401) { await queryClient.cancelQueries(); queryClient.clear(); navigate("/admin/login"); }
    },
  });
  const rejectMutation = useMutation({
    mutationFn: (user: PortalUser) => portalJson(`/api/admin/users/${encodeURIComponent(user.id)}`, "PATCH", { active: false, pending: false }),
    onSuccess: async () => { setRejecting(null); setNotice("Zugangsantrag abgelehnt. Das Konto bleibt deaktiviert."); await queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }); },
    onError: async (error) => { if (error instanceof PortalApiError && error.status === 401) { await queryClient.cancelQueries(); queryClient.clear(); navigate("/admin/login"); } },
  });
  function begin(user?: PortalUser) {
    mutation.reset(); setEditing(user || null); setDraft(user ? { name: user.name, email: user.email, password: "", fullAccess: user.fullAccess, active: user.active, permissions: [...user.permissions] } : emptyDraft()); setOpen(true);
  }
  function togglePermission(permission: Permission, checked: boolean) {
    setDraft((current) => {
      const values = new Set(current.permissions);
      if (checked) values.add(permission); else values.delete(permission);
      const module = modules.find((item) => item.read === permission || item.write === permission);
      if (module && permission === module.write && checked) values.add(module.read);
      if (module && permission === module.read && !checked) values.delete(module.write);
      return { ...current, permissions: Array.from(values) };
    });
  }
  const invalidPassword = (!editing || Boolean(draft.password)) && (draft.password.length < 12 || draft.password.length > 200);

  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-center gap-3"><Users className="h-8 w-8 text-primary" /><div><h1 className="text-2xl font-semibold">Benutzer & Rechte</h1><p className="text-sm text-muted-foreground">Zugangsanträge prüfen und persönliche Berechtigungen im Verein verwalten.</p></div></div><Button onClick={() => begin()} data-testid="button-create-user"><Plus className="mr-2 h-4 w-4" />Konto anlegen</Button></div>
    <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground"><ShieldCheck className="mr-2 inline h-4 w-4" />Mitglieder können ihren persönlichen Zugang auf der Anmeldeseite selbst beantragen. Prüfe die Person und vergib ihre Rechte vor der Freigabe. Nur zugewiesene Bereiche sind zugänglich. Vollzugriff umfasst alle Bereiche einschließlich Benutzerverwaltung.</div>
    {notice && <p role="status" className="rounded-lg border bg-primary/5 p-3 text-sm">{notice}</p>}
    {users.isLoading ? <p role="status">Konten werden geladen …</p> : users.error ? <div role="alert" className="space-y-3"><p className="text-sm text-destructive">{users.error.message}</p><Button variant="outline" onClick={() => void users.refetch()}>Erneut laden</Button></div> : <div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm"><thead className="bg-muted/50"><tr><th className="p-4">Person</th><th className="p-4">Zugriff</th><th className="p-4">Status</th><th className="p-4"><span className="sr-only">Aktionen</span></th></tr></thead><tbody>{users.data?.map((user) => <tr key={user.id} className="border-t"><td className="p-4"><p className="font-medium">{user.name}{user.id === auth?.user?.id && <span className="ml-2 text-xs text-muted-foreground">Dein Konto</span>}</p><p className="text-muted-foreground">{user.email}</p></td><td className="max-w-sm p-4">{user.fullAccess ? <Badge>Vollzugriff</Badge> : <p className="text-xs text-muted-foreground">{user.permissions.length ? user.permissions.map((permission) => PERMISSION_LABELS[permission]).join(" · ") : "Nur persönliches Konto"}</p>}</td><td className="p-4"><Badge variant={user.pending ? "default" : user.active ? "secondary" : "outline"}>{user.pending ? "Freigabe ausstehend" : user.active ? "Aktiv" : "Deaktiviert"}</Badge></td><td className="p-4"><Button size="sm" variant="outline" onClick={() => begin(user)} aria-label={`${user.name} ${user.pending ? "prüfen und freigeben" : "bearbeiten"}`}><Pencil className="mr-2 h-4 w-4" />{user.pending ? "Prüfen & freigeben" : "Bearbeiten"}</Button>{user.pending && <Button size="sm" variant="ghost" className="ml-2 text-destructive" onClick={() => { rejectMutation.reset(); setRejecting(user); }}>Ablehnen</Button>}</td></tr>)}{!users.data?.length && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Noch keine Konten vorhanden.</td></tr>}</tbody></table></div>}
    <Dialog open={open} onOpenChange={(value) => { if (!mutation.isPending) { setOpen(value); if (!value) setDraft(emptyDraft()); } }}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{editing?.pending ? "Zugangsantrag prüfen & freigeben" : editing ? "Persönliches Konto bearbeiten" : "Persönliches Konto anlegen"}</DialogTitle><DialogDescription>{editing?.pending ? "Prüfe die Person und wähle die benötigten Rechte. Erst mit der ausdrücklichen Freigabe erhält sie Zugriff. Vollzugriff wird nicht automatisch vergeben." : editing ? "Änderungen an Zugangsdaten oder Rechten können bestehende Sitzungen dieses Kontos beenden." : "Lege die Person und ihre Berechtigungen fest. Es wird keine E-Mail versendet."}</DialogDescription></DialogHeader>
      <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><fieldset disabled={mutation.isPending} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="user-name">Name</Label><Input id="user-name" value={draft.name} maxLength={120} required onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="user-email">E-Mail-Adresse</Label><Input id="user-email" type="email" autoComplete="off" value={draft.email} maxLength={254} required onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></div></div>
      <div className="space-y-2"><Label htmlFor="user-password">{editing ? "Neues Passwort (optional)" : "Initiales Passwort"}</Label><Input id="user-password" type="password" autoComplete="new-password" value={draft.password} required={!editing} minLength={draft.password || !editing ? 12 : undefined} maxLength={200} onChange={(event) => setDraft({ ...draft, password: event.target.value })} /><p className="text-xs text-muted-foreground">12 bis 200 Zeichen.{editing ? " Leer lassen, um das Passwort beizubehalten." : " Die Person kann es anschließend unter Mein Konto ändern."}</p></div>
      {editing && !editing.pending && <label className="flex items-start gap-3 rounded-lg border p-3"><Checkbox id="user-active" checked={draft.active} onCheckedChange={(value) => setDraft({ ...draft, active: value === true })} /><span><span className="text-sm font-medium">Konto aktiv</span><span className="mt-1 block text-xs text-muted-foreground">Deaktivierte Konten können sich nicht anmelden; bestehende Sitzungen werden widerrufen.</span></span></label>}
      <label className="flex items-start gap-3 rounded-lg border bg-primary/5 p-3"><Checkbox id="user-full-access" checked={draft.fullAccess} onCheckedChange={(value) => setDraft({ ...draft, fullAccess: value === true })} /><span><span className="text-sm font-medium">Vollzugriff auf das gesamte Portal</span><span className="mt-1 block text-xs text-muted-foreground">Umfasst alle aktuellen Berechtigungen und die Verwaltung anderer Konten.</span></span></label>
      {editing?.pending && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Dieser Zugang wartet auf Freigabe und ist aktuell gesperrt. Wähle die Rechte und bestätige anschließend „Zugang freigeben“.</p>}
      {!draft.fullAccess && <section className="space-y-3"><div><h3 className="text-sm font-semibold">Berechtigungen je Bereich</h3><p className="mt-1 text-xs text-muted-foreground">Bearbeiten schließt Lesen ein. Eigene Kontoeinstellungen sind immer zugänglich.</p></div><div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted/50"><tr><th className="p-3 text-left">Bereich</th><th className="p-3">Lesen</th><th className="p-3">Bearbeiten</th></tr></thead><tbody>{modules.map((module) => <tr key={module.read} className="border-t"><td className="p-3">{module.name}</td><td className="p-3 text-center"><Checkbox aria-label={`${module.name} lesen`} checked={draft.permissions.includes(module.read)} onCheckedChange={(value) => togglePermission(module.read, value === true)} /></td><td className="p-3 text-center"><Checkbox aria-label={`${module.name} bearbeiten`} checked={draft.permissions.includes(module.write)} onCheckedChange={(value) => togglePermission(module.write, value === true)} /></td></tr>)}</tbody></table></div><div className="space-y-3 rounded-lg border p-3">{specialPermissions.map((permission) => <label key={permission} className="flex items-center gap-3"><Checkbox checked={draft.permissions.includes(permission)} onCheckedChange={(value) => togglePermission(permission, value === true)} /><span className="text-sm">{PERMISSION_LABELS[permission]}</span></label>)}</div>{draft.permissions.includes("users.manage") && <p className="text-xs text-amber-700">Benutzerverwaltung erlaubt das Verwalten von Konten und deren Rechten. Vergib diese Berechtigung nur an verantwortliche Personen.</p>}</section>}
      {mutation.error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{mutation.error.message}</p>}
      <DialogFooter><Button type="button" variant="outline" onClick={() => { setOpen(false); setDraft(emptyDraft()); }}>Abbrechen</Button><Button type="submit" disabled={mutation.isPending || !draft.name.trim() || !draft.email.trim() || invalidPassword}>{mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing?.pending ? "Zugang freigeben" : "Konto speichern"}</Button></DialogFooter></fieldset></form>
    </DialogContent></Dialog>
    <Dialog open={Boolean(rejecting)} onOpenChange={(value) => { if (!value && !rejectMutation.isPending) setRejecting(null); }}><DialogContent><DialogHeader><DialogTitle>Zugangsantrag ablehnen?</DialogTitle><DialogDescription>Der Antrag von {rejecting?.name} ({rejecting?.email}) wird abgelehnt. Das Konto bleibt deaktiviert und erhält keinen Zugriff. Es wird keine E-Mail versendet.</DialogDescription></DialogHeader>{rejectMutation.error && <p role="alert" className="text-sm text-destructive">{rejectMutation.error.message}</p>}<DialogFooter><Button variant="outline" disabled={rejectMutation.isPending} onClick={() => setRejecting(null)}>Abbrechen</Button><Button variant="destructive" disabled={rejectMutation.isPending || !rejecting} onClick={() => { if (rejecting) rejectMutation.mutate(rejecting); }}>Antrag ablehnen</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
