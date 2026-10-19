import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Check, ChevronDown, ChevronUp, GitBranch, GripHorizontal, KeyRound, LayoutGrid, LockKeyhole, LogOut, Pencil, Plus, Save, Trash2, Users, ZoomIn, ZoomOut } from "lucide-react";
import type { OrganizationChart, OrganizationNode } from "@shared/organization";
import { canConnectRoles, connectRoles, removeRole } from "@shared/organization-editing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OrganizationRoleFields } from "@/components/organization-role-fields";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";

type Access = { authenticated: boolean; configured: boolean; isAdmin: boolean; canManage?: boolean };
type Connection = { sourceId: string; x: number; y: number; targetId: string | null; pointerId: number; dragging: boolean };
const colors = {
  green: { label: "Vereinsgrün", card: "border-green-300 bg-green-50", dot: "bg-green-600" },
  blue: { label: "Blau", card: "border-blue-300 bg-blue-50", dot: "bg-blue-600" },
  orange: { label: "Orange", card: "border-orange-300 bg-orange-50", dot: "bg-orange-500" },
  purple: { label: "Violett", card: "border-purple-300 bg-purple-50", dot: "bg-purple-600" },
  slate: { label: "Grau", card: "border-slate-300 bg-slate-50", dot: "bg-slate-600" },
};
const nativeSelect = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const serialized = (chart: OrganizationChart) => JSON.stringify({ title: chart.title, nodes: chart.nodes });
const clamp = (n: number) => Math.max(0, Math.min(100000, Math.round(n)));

class OrganizationRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(url: string, method = "GET", data?: unknown): Promise<T> {
  const response = await fetch(url, { method, credentials: "include", headers: data === undefined ? undefined : { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data) });
  if (!response.ok) {
    if (response.status === 409) throw new Error("Inzwischen wurde das Organigramm an anderer Stelle geändert. Deine Änderungen bleiben hier erhalten. Lade den aktuellen Stand erst neu, wenn du deine Änderungen übernommen oder notiert hast.");
    const body = await response.json().catch(() => null);
    throw new OrganizationRequestError(body?.message || body?.error || (response.status === 401 ? "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an." : "Die Anfrage konnte nicht abgeschlossen werden. Bitte versuche es erneut."), response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

function descendants(id: string, nodes: OrganizationNode[]): Set<string> {
  const result = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) if (node.parentId && result.has(node.parentId) && !result.has(node.id)) { result.add(node.id); changed = true; }
  }
  return result;
}

function arrange(nodes: OrganizationNode[]): OrganizationNode[] {
  const positions = new Map<string, { x: number; y: number }>();
  let nextColumn = 0;
  const place = (node: OrganizationNode, depth: number): number => {
    const children = nodes.filter((child) => child.parentId === node.id);
    const columns = children.map((child) => place(child, depth + 1));
    const column = columns.length ? (columns[0] + columns[columns.length - 1]) / 2 : nextColumn++;
    positions.set(node.id, { x: clamp(40 + column * 285), y: clamp(40 + depth * 235) });
    return column;
  };
  nodes.filter((node) => !node.parentId).forEach((node) => { place(node, 0); nextColumn += 0.4; });
  return nodes.map((node) => ({ ...node, ...positions.get(node.id) }));
}

function openPosition(nodes: OrganizationNode[], preferredX: number, preferredY: number) {
  let x = clamp(preferredX), y = clamp(preferredY);
  for (let attempt = 0; attempt <= nodes.length; attempt++) {
    const overlaps = nodes.some((node) => Math.abs(node.x - x) < 275 && Math.abs(node.y - y) < 220);
    if (!overlaps) return { x, y };
    x += 285;
    if (x > 100000) { x = 40; y = y + 235 <= 100000 ? y + 235 : 40; }
  }
  return { x, y };
}

export default function OrganizationPage() {
  const [location] = useLocation();
  const [access, setAccess] = useState<Access | null>(null);
  const [chart, setChart] = useState<OrganizationChart | null>(null);
  const [baseline, setBaseline] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [fieldResetKey, setFieldResetKey] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmAction, setConfirmAction] = useState<"delete" | "reload" | "sample" | "arrange" | null>(null);
  const [zoom, setZoom] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const connectionRef = useRef<Connection | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; x: number; y: number; originX: number; originY: number; scrollX: number; scrollY: number; pointerId: number } | null>(null);
  const dirty = Boolean(chart && serialized(chart) !== baseline);
  const detailsNode = chart?.nodes.find((node) => node.id === detailsId);
  const forbiddenParents = detailsNode && chart ? descendants(detailsNode.id, chart.nodes) : new Set<string>();
  const canManageAccess = location === "/admin/organigramm" && (access?.canManage === true || access?.isAdmin === true);
  const roleToDelete = chart?.nodes.find((node) => node.id === deleteId);

  function cancelConnection() { connectionRef.current = null; setConnection(null); }
  useEffect(() => {
    if (busy || !access?.authenticated) { cancelConnection(); drag.current = null; }
  }, [busy, access?.authenticated]);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape") cancelConnection(); };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, []);

  function editRole(id: string) {
    setSelectedId(id); setDetailsId(null);
    window.setTimeout(() => {
      const input = document.getElementById(`org-inline-people-${id}`);
      input?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      input?.focus({ preventScroll: true });
    }, 0);
  }
  function openDetails(id: string) {
    setSelectedId(id); setDetailsId(id); cancelConnection();
    window.setTimeout(() => document.getElementById("organization-details")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 0);
  }
  function confirmDelete(id: string) { setSelectedId(id); setDeleteId(id); setConfirmAction("delete"); }
  function canvasPoint(clientX: number, clientY: number) {
    const viewport = canvas.current!;
    const rect = viewport.getBoundingClientRect();
    return { x: clamp((clientX - rect.left - viewport.clientLeft + viewport.scrollLeft) / zoom), y: clamp((clientY - rect.top - viewport.clientTop + viewport.scrollTop) / zoom) };
  }
  function targetAt(clientX: number, clientY: number): string | null {
    const viewport = canvas.current;
    if (!viewport) return null;
    const rect = viewport.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    const target = document.elementFromPoint(clientX, clientY)?.closest("[data-org-node-id]");
    return target && viewport.contains(target) ? target.getAttribute("data-org-node-id") : null;
  }
  function connectTo(targetId: string) {
    const sourceId = connectionRef.current?.sourceId;
    if (!sourceId || !chart || busy) return;
    if (!canConnectRoles(chart.nodes, sourceId, targetId)) {
      setError("Diese Verbindung würde einen Kreis erzeugen. Wähle eine andere Rolle.");
      cancelConnection(); return;
    }
    setChart((current) => current && ({ ...current, nodes: connectRoles(current.nodes, sourceId, targetId) }));
    setNotice("Rollen verbunden. Mit Speichern übernehmen."); setError(""); cancelConnection();
  }
  function beginConnection(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    if (busy || event.button !== 0 || connectionRef.current?.dragging || drag.current) return;
    event.stopPropagation();
    drag.current = null;
    const next: Connection = { sourceId: id, ...canvasPoint(event.clientX, event.clientY), targetId: null, pointerId: event.pointerId, dragging: true };
    connectionRef.current = next; setConnection(next); setSelectedId(id);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveConnection(event: ReactPointerEvent) {
    const current = connectionRef.current;
    if (!current || (current.dragging && current.pointerId !== event.pointerId)) return;
    const next = { ...current, ...canvasPoint(event.clientX, event.clientY), targetId: targetAt(event.clientX, event.clientY) };
    connectionRef.current = next; setConnection(next);
  }
  function finishConnection(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = connectionRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const target = targetAt(event.clientX, event.clientY);
    if (target && target !== current.sourceId) connectTo(target);
    else if (target === current.sourceId) {
      const next = { ...current, dragging: false, targetId: null };
      connectionRef.current = next; setConnection(next);
    } else cancelConnection();
  }

  async function loadChart() {
    const data = await request<OrganizationChart>("/api/organization/chart");
    setChart(data); setBaseline(serialized(data)); setSelectedId(null); setDetailsId(null); setFieldResetKey((key) => key + 1);
  }
  useEffect(() => {
    request<Access>("/api/organization/access").then(setAccess).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (access?.authenticated && !chart) loadChart().catch((e) => setError(e.message));
  }, [access?.authenticated]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    const leavePage = (event: MouseEvent) => {
      if (!dirty || event.defaultPrevented || event.button !== 0) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.href === window.location.href) return;
      if (!window.confirm("Ungespeicherte Änderungen verwerfen und diese Seite verlassen?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", leavePage, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", leavePage, true);
    };
  }, [dirty]);

  function patchNode(id: string, patch: Partial<OrganizationNode>) {
    if (busy) return;
    setNotice("");
    setChart((current) => current && ({ ...current, nodes: current.nodes.map((node) => node.id === id ? { ...node, ...patch } : node) }));
  }
  function addNode(parentId: string | null = null, point?: { x: number; y: number }) {
    if (!chart || chart.nodes.length >= 200 || busy) return;
    const parent = chart.nodes.find((node) => node.id === parentId);
    const id = crypto.randomUUID();
    const position = point ?? openPosition(chart.nodes, parent?.x ?? ((canvas.current?.scrollLeft ?? 0) / zoom + 40), parent ? parent.y + 235 : (canvas.current?.scrollTop ?? 0) / zoom + 40);
    const node: OrganizationNode = { id, title: "Neue Rolle", people: [], description: "", color: parent?.color || "green", parentId, ...position };
    setChart({ ...chart, nodes: [...chart.nodes, node] }); editRole(id); setNotice("");
  }
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (e) {
      if (e instanceof OrganizationRequestError && e.status === 401 && access?.authenticated) {
        setAccess((current) => current && ({ ...current, authenticated: false, isAdmin: false }));
        setError("Bitte melde dich erneut an. Deine ungespeicherten Änderungen bleiben hier erhalten.");
      } else {
        setError(e instanceof Error ? e.message : "Ein Fehler ist aufgetreten.");
      }
    } finally { setBusy(false); }
  }
  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, node: OrganizationNode) {
    if (busy || event.button !== 0 || connectionRef.current?.dragging || (drag.current && drag.current.pointerId !== event.pointerId)) return;
    if (connectionRef.current) { connectTo(node.id); return; }
    setSelectedId(node.id);
    drag.current = { id: node.id, x: event.clientX, y: event.clientY, originX: node.x, originY: node.y, scrollX: canvas.current?.scrollLeft ?? 0, scrollY: canvas.current?.scrollTop ?? 0, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const currentDrag = drag.current;
    if (!currentDrag || busy || currentDrag.pointerId !== event.pointerId) return;
    const x = clamp(currentDrag.originX + (event.clientX - currentDrag.x + (canvas.current?.scrollLeft ?? 0) - currentDrag.scrollX) / zoom);
    const y = clamp(currentDrag.originY + (event.clientY - currentDrag.y + (canvas.current?.scrollTop ?? 0) - currentDrag.scrollY) / zoom);
    setChart((current) => current && ({ ...current, nodes: current.nodes.map((node) => node.id === currentDrag.id ? { ...node, x, y } : node) }));
    setNotice("");
  }
  function stopDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }
  function runConfirmedAction() {
    if (!chart) return;
    if (confirmAction === "delete" && roleToDelete) {
      setChart({ ...chart, nodes: removeRole(chart.nodes, roleToDelete.id) });
      setSelectedId(null); setDetailsId(null);
      setDeleteId(null); cancelConnection();
    }
    if (confirmAction === "arrange") setChart({ ...chart, nodes: arrange(chart.nodes) });
    if (confirmAction === "sample") {
      const root = crypto.randomUUID();
      const sample: OrganizationNode[] = [
        { id: root, title: "Gemeinsame Vereinsleitung", people: ["Person A (Beispiel)", "Person B (Beispiel)", "Person C (Beispiel)"], description: "Fiktives Beispiel – durch eure Vereinsstruktur ersetzen.", color: "green", parentId: null, x: 0, y: 0 },
        ...["Fußball", "Finanzen", "Vereinsleben"].map((title, index): OrganizationNode => ({ id: crypto.randomUUID(), title, people: [], description: "", color: (["blue", "orange", "purple"] as const)[index], parentId: root, x: 0, y: 0 })),
      ];
      setChart({ ...chart, nodes: arrange(sample) }); setSelectedId(root); setDetailsId(null);
    }
    if (confirmAction === "reload") void perform(async () => { await loadChart(); setNotice("Aktueller Stand geladen."); });
    setNotice(""); setConfirmAction(null);
  }

  const width = Math.max(1000, ...(chart?.nodes.map((node) => node.x + 320) || []));
  const height = Math.max(580, ...(chart?.nodes.map((node) => node.y + 240) || []));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-4 py-5 md:px-8">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-3 text-primary"><GitBranch className="h-6 w-6" /></div><div><p className="text-xs font-medium uppercase tracking-wider text-primary">TSV Greding · Vereinsorganisation</p><h1 className="text-xl font-semibold md:text-2xl">Unser Organigramm</h1></div></div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" asChild><Link href="/"><ArrowLeft className="mr-2 h-4 w-4" />Zum Portal</Link></Button>
            {canManageAccess && <Button variant="outline" onClick={() => setPasswordOpen(true)}><KeyRound className="mr-2 h-4 w-4" />Zugang verwalten</Button>}
            {access?.authenticated && !access.isAdmin && !access.canManage && <Button variant="outline" disabled={busy} onClick={() => { if (dirty && !window.confirm("Ungespeicherte Änderungen verwerfen und abmelden?")) return; void perform(async () => { await request("/api/organization/logout", "POST"); setChart(null); setBaseline(""); setAccess(await request<Access>("/api/organization/access")); }); }}><LogOut className="mr-2 h-4 w-4" />Abmelden</Button>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] space-y-4 p-4 md:p-8">
        {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}{access?.authenticated && chart && <Button variant="outline" size="sm" className="ml-3" onClick={() => setConfirmAction("reload")}>Aktuellen Stand neu laden</Button>}</div>}
        {notice && <div role="status" className="flex items-center gap-2 rounded-lg border bg-primary/5 p-3 text-sm text-primary"><Check className="h-4 w-4" />{notice}</div>}
        {canManageAccess && !access?.configured && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-primary/5 p-4"><p className="text-sm">Lege ein eigenes Organigramm-Passwort fest, damit andere die Vereinsstruktur mitbearbeiten können.</p><Button onClick={() => setPasswordOpen(true)}>Passwort festlegen</Button></div>}
        {!access && <div className="py-20 text-center text-muted-foreground">{error ? <Button variant="outline" onClick={() => void perform(async () => setAccess(await request<Access>("/api/organization/access")))}>Erneut versuchen</Button> : "Zugang wird geprüft …"}</div>}

        {access && !access.authenticated && <section className="mx-auto my-12 max-w-md rounded-xl border bg-card p-6 shadow-sm">
          <LockKeyhole className="mb-4 h-9 w-9 text-primary" /><h2 className="text-xl font-semibold">Gemeinsam den Verein gestalten</h2>
          <p className="mt-2 text-sm text-muted-foreground">Mit dem Organigramm-Passwort kannst du die Vereinsstruktur ansehen und bearbeiten.</p>
          {!access.configured ? <div className="mt-5 space-y-3"><p className="text-sm">Das Passwort muss zuerst im Adminbereich eingerichtet werden.</p><Button asChild><Link href="/admin/login?next=/admin/organigramm">Zum Admin-Login</Link></Button></div> : <form className="mt-5 space-y-4" onSubmit={(event: FormEvent) => { event.preventDefault(); void perform(async () => { await request("/api/organization/login", "POST", { password }); setPassword(""); setAccess(await request<Access>("/api/organization/access")); }); }}>
            <div className="space-y-2"><Label htmlFor="organization-password">Organigramm-Passwort</Label><Input id="organization-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
            <Button className="w-full" type="submit" disabled={busy}>{busy ? "Anmeldung läuft …" : "Organigramm öffnen"}</Button>
            <p className="text-xs text-muted-foreground">Dieser Zugang gilt ausschließlich für das Organigramm. Alle mit diesem Passwort können es bearbeiten.</p>
          </form>}
        </section>}

        {access?.authenticated && !chart && <div className="py-20 text-center"><p className="text-muted-foreground">{error ? "Das Organigramm konnte nicht geladen werden." : "Organigramm wird geladen …"}</p>{error && <Button className="mt-4" onClick={() => void perform(loadChart)} disabled={busy}>Erneut laden</Button>}</div>}

        {access?.authenticated && chart && <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="w-full max-w-lg space-y-2"><Label htmlFor="organization-title">Titel des Organigramms</Label><Input id="organization-title" value={chart.title} maxLength={120} disabled={busy} onChange={(event) => { setChart({ ...chart, title: event.target.value }); setNotice(""); }} /></div>
            <div className="flex flex-wrap items-center gap-3"><span aria-live="polite" className={`text-sm ${dirty ? "text-amber-700" : "text-muted-foreground"}`}>{dirty ? "Ungespeicherte Änderungen" : "Alle Änderungen gespeichert"}</span><Button disabled={busy || !dirty || !chart.title.trim() || chart.nodes.some((node) => !node.title.trim() || node.people.length > 20 || node.people.some((name) => name.trim().length > 100))} onClick={() => void perform(async () => { const saved = await request<OrganizationChart>("/api/organization/chart", "PUT", chart); setChart(saved); setBaseline(serialized(saved)); setFieldResetKey((key) => key + 1); setNotice("Organigramm gespeichert."); })}><Save className="mr-2 h-4 w-4" />{busy ? "Bitte warten …" : "Speichern"}</Button></div>
          </div>

          <div className="space-y-4">
            <section className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm" aria-label="Organigramm-Arbeitsfläche">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
                <div className="flex flex-wrap gap-2"><Button size="sm" draggable={!busy && chart.nodes.length < 200} onDragStart={(event) => { event.dataTransfer.setData("application/x-tsv-role", "new"); event.dataTransfer.effectAllowed = "copy"; }} disabled={busy || chart.nodes.length >= 200} onClick={() => addNode()} title="Anklicken oder auf die Arbeitsfläche ziehen"><Plus className="mr-2 h-4 w-4" />Neue Rolle</Button><Button size="sm" variant="outline" disabled={busy || !chart.nodes.length} onClick={() => setConfirmAction("arrange")}><LayoutGrid className="mr-2 h-4 w-4" />Anordnen</Button></div>
                <div className="flex items-center gap-1"><Button size="icon" variant="ghost" aria-label="Verkleinern" onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.1).toFixed(2)))}><ZoomOut className="h-4 w-4" /></Button><span className="min-w-10 text-center text-xs">{Math.round(zoom * 100)} %</span><Button size="icon" variant="ghost" aria-label="Vergrößern" onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))}><ZoomIn className="h-4 w-4" /></Button><Button size="sm" variant="ghost" onClick={() => { setZoom(Math.max(0.25, Math.min(1, (canvas.current?.clientWidth || 1000) / width))); canvas.current?.scrollTo({ left: 0, top: 0 }); }}>Einpassen</Button></div>
              </div>
              <p className="border-b px-4 py-2 text-xs text-muted-foreground">Oben die Person, darunter Funktion und Aufgaben – direkt in der Kachel bearbeiten. Am Griff verschieben, über die Anschlüsse verbinden. Weitere Einstellungen findest du unter „Details“.</p>
              {connection && <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b bg-primary/5 px-4 py-2 text-sm"><span>Auf die Zielrolle ziehen oder ihren oberen Anschluss anklicken. Escape bricht ab.</span><Button size="sm" variant="ghost" onClick={cancelConnection}>Verbindung abbrechen</Button></div>}
              <div ref={canvas}
                onPointerMove={(event) => { if (connectionRef.current && !connectionRef.current.dragging) moveConnection(event); }}
                onDragOver={(event) => { if (!busy && event.dataTransfer.types.includes("application/x-tsv-role")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
                onDrop={(event) => { if (event.dataTransfer.getData("application/x-tsv-role") !== "new") return; event.preventDefault(); const point = canvasPoint(event.clientX, event.clientY); addNode(null, { x: clamp(point.x - 125), y: clamp(point.y - 40) }); }}
                className="relative h-[520px] overflow-auto bg-slate-50 md:h-[640px]" style={{ backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)", backgroundSize: "20px 20px" }}>
                {!chart.nodes.length ? <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center"><Users className="h-12 w-12 text-primary/50" /><h2 className="text-lg font-semibold">Platz für eure Vereinsstruktur</h2><p className="max-w-sm text-sm text-muted-foreground">Beginne mit einer Leitung oder mehreren gleichberechtigten Spitzen. Ergänze danach Bereiche, Rollen und Personen.</p><Button disabled={busy} onClick={() => addNode()}><Plus className="mr-2 h-4 w-4" />Erste Rolle anlegen</Button><Button variant="ghost" disabled={busy} onClick={() => setConfirmAction("sample")}>Fiktives Beispiel laden</Button></div> : <div style={{ width: width * zoom, height: height * zoom }}><div className="relative origin-top-left" style={{ width, height, transform: `scale(${zoom})` }}>
                  <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden="true">{chart.nodes.map((node) => { const parent = chart.nodes.find((item) => item.id === node.parentId); if (!parent) return null; const x1 = parent.x + 125, y1 = parent.y + 200, x2 = node.x + 125, y2 = node.y; const mid = (y1 + y2) / 2; return <path key={node.id} d={`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`} stroke="#94a3b8" strokeWidth="2" fill="none" />; })}</svg>
                  {connection && (() => {
                    const source = chart.nodes.find((node) => node.id === connection.sourceId);
                    if (!source) return null;
                    const x = source.x + 125, y = source.y + 200;
                    return <svg className="pointer-events-none absolute inset-0 text-primary" width={width} height={height} aria-hidden="true"><path d={`M ${x} ${y} C ${x} ${(y + connection.y) / 2}, ${connection.x} ${(y + connection.y) / 2}, ${connection.x} ${connection.y}`} stroke="currentColor" strokeWidth="3" strokeDasharray="7 5" fill="none" /></svg>;
                  })()}
                  {chart.nodes.map((node) => {
                    const validTarget = connection && canConnectRoles(chart.nodes, connection.sourceId, node.id);
                    return <ContextMenu key={node.id} onOpenChange={(open) => { if (open) { setSelectedId(node.id); cancelConnection(); } }}>
                      <ContextMenuTrigger asChild>
                        <div data-org-node-id={node.id}
                          className={`absolute flex h-[200px] w-[250px] flex-col rounded-xl border-2 shadow-sm ${colors[node.color].card} ${connection?.targetId === node.id && validTarget ? "ring-4 ring-primary" : selectedId === node.id ? "ring-2 ring-primary ring-offset-2" : ""}`}
                          style={{ left: node.x, top: node.y }}>
                          <button type="button" aria-label={`Mit ${node.title} verbinden`} title="Ziel einer Verbindung" disabled={busy || !connection || !validTarget}
                            className="absolute -top-3 left-1/2 z-10 flex h-6 w-8 -translate-x-1/2 items-center justify-center rounded-full border-2 border-green-600 bg-white text-green-700 disabled:opacity-50"
                            onClick={() => connectTo(node.id)}><span className="h-2 w-2 rounded-full bg-current" /></button>
                          <div className="flex h-8 shrink-0 items-center justify-between rounded-t-[10px] border-b border-black/5 bg-white/40 px-1 text-slate-600">
                            <button type="button" aria-label={`${node.title} bearbeiten`} title="Bearbeiten" disabled={busy} className="rounded p-1 hover:bg-black/5" onClick={() => editRole(node.id)}><Pencil className="h-4 w-4" /></button>
                            <button type="button" aria-label={`${node.title} verschieben`} title="Kachel verschieben" disabled={busy}
                              className="flex h-full flex-1 touch-none cursor-grab items-center justify-center active:cursor-grabbing"
                              onPointerDown={(event) => beginDrag(event, node)} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag}><GripHorizontal className="h-4 w-4" /></button>
                            <button type="button" aria-label={`${node.title} löschen`} title="Löschen" disabled={busy} className="rounded p-1 text-red-700 hover:bg-red-100" onClick={() => confirmDelete(node.id)}><Trash2 className="h-4 w-4" /></button>
                          </div>
                          <div className="flex min-h-0 flex-1 flex-col gap-1 px-2 pb-2 pt-1">
                            <OrganizationRoleFields node={node} disabled={busy} resetKey={fieldResetKey}
                              onSelect={() => { setSelectedId(node.id); if (detailsId !== node.id) setDetailsId(null); cancelConnection(); }}
                              onPatch={(patch) => patchNode(node.id, patch)} />
                            <button type="button" disabled={busy} aria-expanded={detailsId === node.id} aria-controls={detailsId === node.id ? "organization-details" : undefined}
                              className="mt-auto flex shrink-0 items-center justify-between rounded px-1 py-1 text-xs text-slate-700 hover:bg-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                              onClick={() => { if (detailsId === node.id) setDetailsId(null); else openDetails(node.id); }}>
                              <span>Weitere Details</span>{detailsId === node.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </button>
                          </div>
                          <button type="button" aria-label={`Verbindung von ${node.title} ziehen`} title="Auf eine andere Rolle ziehen oder anklicken und anschließend das Ziel wählen" disabled={busy}
                            className="absolute -bottom-3 left-1/2 z-10 flex h-6 w-8 -translate-x-1/2 touch-none cursor-crosshair items-center justify-center rounded-full border-2 border-green-600 bg-white text-green-700"
                            onClick={(event) => {
                              if (event.detail !== 0) return;
                              const next: Connection = { sourceId: node.id, x: node.x + 125, y: node.y + 200, targetId: null, pointerId: -1, dragging: false };
                              connectionRef.current = next; setConnection(next); setSelectedId(node.id);
                            }}
                            onPointerDown={(event) => beginConnection(event, node.id)} onPointerMove={moveConnection} onPointerUp={finishConnection}
                            onPointerCancel={cancelConnection} onLostPointerCapture={() => { if (connectionRef.current?.dragging) cancelConnection(); }}><Plus className="h-4 w-4" /></button>
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
                        <ContextMenuItem disabled={busy} onSelect={() => editRole(node.id)}><Pencil className="mr-2 h-4 w-4" />Bearbeiten</ContextMenuItem>
                        <ContextMenuItem disabled={busy} onSelect={() => openDetails(node.id)}><ChevronDown className="mr-2 h-4 w-4" />Details & Aufgaben</ContextMenuItem>
                        <ContextMenuItem disabled={busy || chart.nodes.length >= 200} onSelect={() => addNode(node.id)}><Plus className="mr-2 h-4 w-4" />Unterrolle hinzufügen</ContextMenuItem>
                        <ContextMenuItem disabled={busy || !node.parentId} onSelect={() => { setChart((current) => current && ({ ...current, nodes: current.nodes.map((item) => item.id === node.id ? { ...item, parentId: null } : item) })); setNotice("Verbindung gelöst. Mit Speichern übernehmen."); }}>Verbindung zur übergeordneten Rolle lösen</ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem disabled={busy} className="text-destructive focus:text-destructive" onSelect={() => confirmDelete(node.id)}><Trash2 className="mr-2 h-4 w-4" />Löschen</ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>;
                  })}
                </div></div>}
              </div>
              <div className="flex flex-wrap justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground"><span>{chart.nodes.length} / 200 Rollen · {chart.nodes.filter((node) => !node.parentId).length} oberste Rollen</span><span>Positionen und Inhalte werden erst mit „Speichern“ übernommen.</span></div>
            </section>

            {detailsNode && <section id="organization-details" className="rounded-xl border bg-card p-4 shadow-sm md:p-6" aria-label="Erweiterte Rollendetails">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="font-semibold">Details · {detailsNode.title || "Unbenannte Rolle"}</h2><p className="mt-1 text-sm text-muted-foreground">Aufgaben, Zuordnung und Darstellung dieser Rolle.</p></div>
                <Button variant="ghost" size="sm" onClick={() => setDetailsId(null)}><ChevronUp className="mr-2 h-4 w-4" />Details schließen</Button>
              </div>
              <fieldset disabled={busy} className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="org-role-parent">Übergeordnete Rolle</Label><select id="org-role-parent" className={nativeSelect} value={detailsNode.parentId || ""} onChange={(event) => patchNode(detailsNode.id, { parentId: event.target.value || null })}><option value="">Keine · oberste Ebene</option>{chart.nodes.filter((node) => !forbiddenParents.has(node.id)).map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}</select><p className="text-xs text-muted-foreground">Eigene Unterrollen sind ausgeschlossen, damit kein Kreis entsteht.</p></div>
                <div className="space-y-2"><Label htmlFor="org-role-description">Aufgaben & Notizen</Label><Textarea id="org-role-description" rows={3} value={detailsNode.description} maxLength={2000} onChange={(event) => patchNode(detailsNode.id, { description: event.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="org-role-color">Kartenfarbe</Label><select id="org-role-color" className={nativeSelect} value={detailsNode.color} onChange={(event) => patchNode(detailsNode.id, { color: event.target.value as OrganizationNode["color"] })}>{Object.entries(colors).map(([key, color]) => <option key={key} value={key}>{color.label}</option>)}</select></div>
                <div><p className="mb-2 text-sm font-medium">Position auf der Arbeitsfläche</p><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="org-role-x">Horizontal (X)</Label><Input id="org-role-x" type="number" min={0} max={100000} value={detailsNode.x} onChange={(event) => patchNode(detailsNode.id, { x: clamp(Number(event.target.value)) })} /></div><div className="space-y-2"><Label htmlFor="org-role-y">Vertikal (Y)</Label><Input id="org-role-y" type="number" min={0} max={100000} value={detailsNode.y} onChange={(event) => patchNode(detailsNode.id, { y: clamp(Number(event.target.value)) })} /></div></div></div>
                <Button className="w-full" variant="outline" disabled={chart.nodes.length >= 200} onClick={() => addNode(detailsNode.id)}><Plus className="mr-2 h-4 w-4" />Unterrolle hinzufügen</Button><Button className="w-full text-destructive" variant="outline" onClick={() => confirmDelete(detailsNode.id)}><Trash2 className="mr-2 h-4 w-4" />Rolle entfernen</Button>
              </fieldset>
            </section>}

          </div>
        </>}
      </main>

      <Dialog open={canManageAccess && passwordOpen} onOpenChange={(open) => { if (!busy) { setPasswordOpen(open); setNewPassword(""); } }}><DialogContent><DialogHeader><DialogTitle>Organigramm-Zugang verwalten</DialogTitle><DialogDescription>Ein separates gemeinsames Passwort gibt Zugriff auf das Organigramm. Es gewährt keinen Zugang zu anderen Adminfunktionen. Teile es nur mit Personen, die alles im Organigramm bearbeiten dürfen.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void perform(async () => { await request("/api/admin/organization/password", "PUT", { password: newPassword }); setPasswordOpen(false); setNewPassword(""); setAccess(await request<Access>("/api/organization/access")); setNotice("Organigramm-Passwort gespeichert."); }); }}><div className="space-y-2"><Label htmlFor="org-new-password">Neues gemeinsames Passwort</Label><Input id="org-new-password" autoComplete="new-password" type="password" minLength={8} maxLength={200} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /><p className="text-xs text-muted-foreground">Mindestens 8 Zeichen.</p></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button type="submit" disabled={busy || newPassword.length < 8}>Passwort speichern</Button></DialogFooter></form></DialogContent></Dialog>
      <Dialog open={confirmAction !== null} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}><DialogContent><DialogHeader><DialogTitle>{confirmAction === "delete" ? `„${roleToDelete?.title || "Rolle"}“ entfernen?` : confirmAction === "reload" ? "Aktuellen Stand neu laden?" : confirmAction === "arrange" ? "Automatisch anordnen?" : "Fiktives Beispiel laden?"}</DialogTitle><DialogDescription>{confirmAction === "delete" ? "Die Personen und Angaben dieser Rolle werden entfernt. Ihre Unterrollen bleiben erhalten und rücken an die übergeordnete Rolle, bei einer obersten Rolle an die Spitze." : confirmAction === "reload" ? "Deine ungespeicherten Änderungen werden verworfen und durch den zuletzt gespeicherten Stand ersetzt." : confirmAction === "arrange" ? "Die Rollen werden als Pyramide von oben nach unten angeordnet. Mehrere Spitzen bleiben gleichberechtigt. Deine individuellen Kartenpositionen werden ersetzt." : "Die aktuelle Struktur wird durch vier fiktive Beispielrollen mit einer dreiköpfigen Leitung ersetzt. Das Beispiel wird erst mit Speichern dauerhaft übernommen."}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirmAction(null)}>Abbrechen</Button><Button variant={confirmAction === "delete" || confirmAction === "reload" ? "destructive" : "default"} onClick={runConfirmedAction}> {confirmAction === "delete" ? "Rolle entfernen" : confirmAction === "reload" ? "Neu laden und verwerfen" : confirmAction === "arrange" ? "Jetzt anordnen" : "Beispiel übernehmen"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
