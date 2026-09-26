import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  ShoppingCart,
  FileText,
  BookOpen,
  ScrollText,
  ShieldCheck,
  Inbox,
  BarChart3,
  LayoutDashboard,
  Users,
  History as HistoryIcon,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { apiGetPurchaseRequestMonitoringPage, apiGetRfqsPage, hasValidToken } from "@/lib/api";
import { listLibs } from "@/lib/lib-store";
import { listAllPpmps } from "@/lib/ppmp-store";
import { useCanAccess } from "@/lib/current-user";
import type { ModuleKey } from "@/lib/modules";

type Hit = {
  id: string;
  /** Concatenated searchable text — cmdk filters against this. */
  value: string;
  title: string;
  subtitle: string;
  onSelect: () => void;
};

const PAGES: { label: string; keywords: string; icon: typeof Search; to: string; module: ModuleKey }[] = [
  { label: "Dashboard", keywords: "home overview", icon: LayoutDashboard, to: "/", module: "dashboard" },
  { label: "Purchase Requests", keywords: "pr purchase request", icon: ShoppingCart, to: "/purchase-requests", module: "pr" },
  { label: "Line Item Budget", keywords: "lib reprogramming dost form 4", icon: FileText, to: "/planning/lib", module: "lib" },
  { label: "PPMP", keywords: "project procurement management plan", icon: BookOpen, to: "/planning/ppmp", module: "ppmp" },
  { label: "RFQ", keywords: "request for quotation canvass", icon: ScrollText, to: "/rfq", module: "rfq" },
  { label: "Validation", keywords: "validate checks", icon: ShieldCheck, to: "/validation", module: "validation" },
  { label: "Approval Inbox", keywords: "approve recommend", icon: Inbox, to: "/approval-inbox", module: "approvals" },
  { label: "Reports", keywords: "analytics export", icon: BarChart3, to: "/reports", module: "reports" },
  { label: "Users", keywords: "accounts roles", icon: Users, to: "/users", module: "users" },
  { label: "Audit Logs", keywords: "activity trail", icon: HistoryIcon, to: "/audit-logs", module: "audit" },
];

export function GlobalSearch() {
  const navigate = useNavigate();
  const canAccess = useCanAccess();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [local, setLocal] = useState<{
    libs: ReturnType<typeof listLibs>;
    ppmps: ReturnType<typeof listAllPpmps>;
  }>({ libs: [], ppmps: [] });

  // ⌘K / Ctrl+K to open from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Read the localStorage-backed modules fresh each time the palette opens.
  useEffect(() => {
    if (!open) return;
    setLocal({ libs: listLibs(), ppmps: listAllPpmps() });
  }, [open]);

  // PRs and RFQs are searched on the server as you type (all of them, not just a first page).
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);
  const searching = open && term.length >= 2 && hasValidToken();
  const { data: prPage } = useQuery({
    queryKey: ["global-search-prs", term],
    queryFn: () => apiGetPurchaseRequestMonitoringPage(1, 8, { search: term }),
    enabled: searching && canAccess("pr"),
    staleTime: 30_000,
  });
  const { data: rfqPage } = useQuery({
    queryKey: ["global-search-rfqs", term],
    queryFn: () => apiGetRfqsPage(1, 8, { search: term }),
    enabled: searching && canAccess("rfq"),
    staleTime: 30_000,
  });

  const go = (fn: () => void) => {
    setOpen(false);
    setQuery("");
    fn();
  };

  const prHits: Hit[] = (prPage?.items ?? []).map((p) => ({
    id: `pr-${p.prId}`,
    value: `pr ${p.prNo} ${p.endUserUnit ?? ""} ${p.purpose ?? ""} ${p.charging ?? ""} ${p.prStatus ?? ""}`,
    title: p.prNo ?? `PR #${p.prId}`,
    subtitle: [p.endUserUnit, p.prStatus].filter(Boolean).join(" · "),
    onSelect: () => go(() => navigate({ to: "/purchase-requests/$prId", params: { prId: p.prId } })),
  }));

  const libHits: Hit[] = local.libs.map((l) => ({
    id: `lib-${l.id}`,
    value: `lib ${l.projectTitle} ${l.programTitle} ${l.fiscalYear} ${l.status}`,
    title: l.projectTitle || "Untitled LIB",
    subtitle: `${l.programTitle} · CY ${l.fiscalYear} · ${l.status}`,
    onSelect: () => go(() => navigate({ to: "/planning/lib/new", search: { edit: l.id } })),
  }));

  const ppmpHits: Hit[] = local.ppmps.map((p) => ({
    id: `ppmp-${p.id}`,
    value: `ppmp ${p.ppmpNo} ${p.endUserUnit} ${p.fiscalYear} ${p.documentType}`,
    title: p.ppmpNo || "PPMP",
    subtitle: `${p.endUserUnit} · FY ${p.fiscalYear} · ${p.documentType}`,
    onSelect: () => go(() => navigate({ to: "/planning/ppmp" })),
  }));

  const rfqHits: Hit[] = (rfqPage?.items ?? []).map((r) => ({
    id: `rfq-${r.id}`,
    value: `rfq ${r.rfqNo} ${r.prNo} ${r.status}`,
    title: r.rfqNo || "RFQ",
    subtitle: `PR ${r.prNo} · ${r.status}`,
    onSelect: () => go(() => navigate({ to: "/rfq/$rfqId", params: { rfqId: r.id } })),
  }));

  const hasQuery = query.trim().length > 0;

  const group = (label: string, icon: typeof Search, hits: Hit[], module: ModuleKey) => {
    if (!hasQuery || hits.length === 0 || !canAccess(module)) return null;
    const Icon = icon;
    return (
      <CommandGroup heading={`${label} (${hits.length})`}>
        {hits.map((h) => (
          <CommandItem key={h.id} value={`${h.value} ${h.id}`} onSelect={h.onSelect} className="gap-3">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{h.title}</p>
              <p className="truncate text-xs text-muted-foreground">{h.subtitle}</p>
            </div>
          </CommandItem>
        ))}
      </CommandGroup>
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative mx-auto hidden h-10 w-full max-w-md items-center gap-2 rounded-lg border border-border bg-background pl-9 pr-3 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary/50 md:flex"
        aria-label="Search"
      >
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <span className="flex-1 truncate">Search PR, LIB, PPMP, RFQ…</span>
        <kbd className="pointer-events-none hidden items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground lg:inline-flex">
          ⌘K
        </kbd>
      </button>

      {/* Compact trigger for small screens */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-navy hover:bg-secondary md:hidden"
        aria-label="Search"
      >
        <Search className="h-[18px] w-[18px]" />
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search purchase requests, budgets, PPMP, RFQ…" value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>No matches found.</CommandEmpty>
          {group("Purchase Requests", ShoppingCart, prHits, "pr")}
          {group("Line Item Budgets", FileText, libHits, "lib")}
          {group("PPMP", BookOpen, ppmpHits, "ppmp")}
          {group("RFQ", ScrollText, rfqHits, "rfq")}
          {hasQuery && <CommandSeparator />}
          <CommandGroup heading="Go to">
            {PAGES.filter((p) => canAccess(p.module)).map((p) => {
              const Icon = p.icon;
              return (
                <CommandItem
                  key={p.to}
                  value={`page ${p.label} ${p.keywords}`}
                  onSelect={() => go(() => navigate({ to: p.to }))}
                  className="gap-3"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm">{p.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
