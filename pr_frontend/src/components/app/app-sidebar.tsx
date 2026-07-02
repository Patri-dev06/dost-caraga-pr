import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, FileText, ShieldCheck, Inbox,
  BookOpen, ClipboardList, Boxes, Wallet, BarChart3, Users, ScrollText, Settings,
  Landmark, FileStack,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail,
} from "@/components/ui/sidebar";

const groups = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", url: "/", icon: LayoutDashboard }],
  },
  {
    label: "Budget & Planning",
    items: [
      { title: "LIB (Budget)", url: "/lib", icon: Landmark },
      { title: "PPMP (Plans)", url: "/ppmp-documents", icon: FileStack },
    ],
  },
  {
    label: "Procurement",
    items: [
      { title: "Purchase Requests", url: "/purchase-requests", icon: FileText },
      { title: "Validation", url: "/validation", icon: ShieldCheck },
      { title: "Approval Inbox", url: "/approval-inbox", icon: Inbox },
    ],
  },
  {
    label: "References",
    items: [
      { title: "PPMP (Import)", url: "/references/ppmp", icon: BookOpen },
      { title: "APP-CSE", url: "/references/app-cse", icon: ClipboardList },
      { title: "APP-Non-CSE", url: "/references/app-non-cse", icon: Boxes },
      { title: "Budget Allocations", url: "/references/budget", icon: Wallet },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Reports", url: "/reports", icon: BarChart3 },
      { title: "User Management", url: "/users", icon: Users },
      { title: "Audit Logs", url: "/audit-logs", icon: ScrollText },
      { title: "Settings", url: "/settings", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (url: string) => {
    if (url === "/") return pathname === "/";
    if (url === "/purchase-requests") return pathname === "/purchase-requests" || /^\/purchase-requests\/(?!new$)[^/]+$/.test(pathname);

    return pathname === url || pathname.startsWith(url + "/");
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border px-4 py-0 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
        <Link
          to="/"
          aria-label="DOST Caraga Procurement System"
          className="flex min-w-0 items-center gap-3 group-data-[collapsible=icon]:justify-center"
        >
          <img
            src="/dost-seal.svg"
            alt="DOST logo"
            className="h-10 w-10 shrink-0 rounded-md object-contain group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8"
          />
          <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-bold leading-tight text-navy">DOST Caraga</span>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Procurement System</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-1">
        {groups.map((g) => (
          <SidebarGroup key={g.label} className="px-0 py-1 group-data-[collapsible=icon]:p-1">
            <SidebarGroupLabel className="label-eyebrow px-3">{g.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                      className="h-9 rounded-lg px-3 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
                    >
                      <Link to={item.url} className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
                        <item.icon className="h-4 w-4" strokeWidth={1.75} />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
