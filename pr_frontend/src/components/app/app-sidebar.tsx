import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, CalendarRange, ShoppingCart, BarChart3, ShieldCheck,
  FileText, ShieldCheck as ValidateIcon, Inbox, BookOpen, ClipboardList,
  Boxes, Wallet, Users, ScrollText, Settings, HelpCircle, Headset, ChevronRight,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem,
  SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarRail,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useCanAccess } from "@/lib/current-user";
import type { ModuleKey } from "@/lib/modules";

type Leaf = { title: string; url: string; icon?: LucideIcon; badge?: string; module: ModuleKey };
type Item =
  | { type: "link"; title: string; url: string; icon: LucideIcon; module: ModuleKey }
  | { type: "group"; title: string; icon: LucideIcon; children: Leaf[] };

const NAV: Item[] = [
  { type: "link", title: "Dashboard", url: "/", icon: LayoutDashboard, module: "dashboard" },
  {
    type: "group", title: "Planning", icon: CalendarRange, children: [
      { title: "Line Item Budget", url: "/planning/lib", icon: FileText, badge: "NEW", module: "lib" },
      { title: "PPMP", url: "/planning/ppmp", icon: BookOpen, badge: "NEW", module: "ppmp" },
      { title: "APP-CSE", url: "/references/app-cse", icon: ClipboardList, module: "references" },
      { title: "APP-Non-CSE", url: "/references/app-non-cse", icon: Boxes, module: "references" },
      { title: "Budget Allocations", url: "/references/budget", icon: Wallet, module: "references" },
    ],
  },
  {
    type: "group", title: "Procurement", icon: ShoppingCart, children: [
      { title: "Purchase Requests", url: "/purchase-requests", icon: FileText, module: "pr" },
      { title: "RFQ", url: "/rfq", icon: ClipboardList, badge: "NEW", module: "rfq" },
      { title: "Validation", url: "/validation", icon: ValidateIcon, module: "validation" },
      { title: "Approval Inbox", url: "/approval-inbox", icon: Inbox, module: "approvals" },
    ],
  },
  { type: "link", title: "Reports", url: "/reports", icon: BarChart3, module: "reports" },
  {
    type: "group", title: "Administration", icon: ShieldCheck, children: [
      { title: "User Management", url: "/users", icon: Users, module: "users" },
      { title: "Audit Logs", url: "/audit-logs", icon: ScrollText, module: "audit" },
      { title: "Settings", url: "/settings", icon: Settings, module: "settings" },
    ],
  },
];

const FOOTER: { title: string; url: string; icon: LucideIcon }[] = [
  { title: "Help Center", url: "/settings", icon: HelpCircle },
  { title: "Contact MIS Unit", url: "/settings", icon: Headset },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const canAccess = useCanAccess();

  // Hide any module the current user can't reach; drop groups left empty.
  const nav = NAV.flatMap((item): Item[] => {
    if (item.type === "link") return canAccess(item.module) ? [item] : [];
    const children = item.children.filter((c) => canAccess(c.module));
    return children.length > 0 ? [{ ...item, children }] : [];
  });

  const isActive = (url: string) => {
    if (url === "/") return pathname === "/";
    if (url === "/purchase-requests")
      return pathname === "/purchase-requests" || /^\/purchase-requests\/(?!new$)[^/]+$/.test(pathname);

    return pathname === url || pathname.startsWith(url + "/");
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="h-16 justify-center border-b border-sidebar-border px-4 py-0 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
        <Link
          to="/"
          aria-label="DOST Caraga Procurement System"
          className="flex min-w-0 items-center gap-3 group-data-[collapsible=icon]:justify-center"
        >
          <img
            src="/dost-seal.svg"
            alt="DOST logo"
            className="h-9 w-9 shrink-0 rounded-md object-contain group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8"
          />
          <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-bold leading-tight text-navy">DOST Caraga</span>
            <span className="truncate text-xs text-muted-foreground">Supply Unit</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-1">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {nav.map((item) =>
                item.type === "link" ? (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                      className="h-9 rounded-lg px-3 font-medium"
                    >
                      <Link to={item.url} className="flex items-center gap-2.5">
                        <item.icon className="h-4 w-4" strokeWidth={1.75} />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : (
                  <NavGroup key={item.title} item={item} isActive={isActive} />
                ),
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2 group-data-[collapsible=icon]:items-center">
        <SidebarMenu className="gap-0.5">
          {FOOTER.filter((f) => f.url !== "/settings" || canAccess("settings")).map((f) => (
            <SidebarMenuItem key={f.title}>
              <SidebarMenuButton asChild tooltip={f.title} className="h-9 rounded-lg px-3 text-muted-foreground">
                <Link to={f.url} className="flex items-center gap-2.5">
                  {f.icon && <f.icon className="h-4 w-4" strokeWidth={1.75} />}
                  <span>{f.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function NavGroup({ item, isActive }: { item: Extract<Item, { type: "group" }>; isActive: (url: string) => boolean }) {
  const hasActiveChild = item.children.some((c) => isActive(c.url));

  return (
    <Collapsible defaultOpen={hasActiveChild} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            tooltip={item.title}
            className="h-9 rounded-lg px-3 font-medium data-[state=open]:text-navy"
          >
            <item.icon className="h-4 w-4" strokeWidth={1.75} />
            <span>{item.title}</span>
            <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="mr-0 pr-0">
            {item.children.map((child) => (
              <SidebarMenuSubItem key={child.url}>
                <SidebarMenuSubButton asChild isActive={isActive(child.url)}>
                  <Link to={child.url}>
                    <span>{child.title}</span>
                    {child.badge && <SidebarMenuBadge className="bg-primary/10 text-primary">{child.badge}</SidebarMenuBadge>}
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
