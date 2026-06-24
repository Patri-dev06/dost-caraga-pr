import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Bell, LogOut, Search } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { logout } from "@/lib/api";
import { toast } from "sonner";

const titles: Record<string, string> = {
  "/": "Dashboard",
  "/purchase-requests": "Purchase Requests",
  "/purchase-requests/new": "Create Purchase Request",
  "/validation": "Item Pre-Validation",
  "/approval-inbox": "Approval Inbox",
  "/references/ppmp": "PPMP",
  "/references/app-cse": "APP-CSE",
  "/references/app-non-cse": "APP-Non-CSE",
  "/references/budget": "Budget Allocations",
  "/reports": "Reports",
  "/users": "User Management",
  "/audit-logs": "Audit Logs",
  "/settings": "Settings",
};

export function AppTopbar() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [signingOut, setSigningOut] = useState(false);
  const title = titles[pathname] ?? (pathname.startsWith("/purchase-requests/") ? "Purchase Request Detail" : "DOST Procurement");

  async function handleLogout() {
    if (signingOut) return;

    setSigningOut(true);

    try {
      await logout();
      toast.success("Signed out successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign out cleanly.");
    } finally {
      navigate({ to: "/login", replace: true });
      setSigningOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 min-w-0 items-center gap-2 border-b border-border bg-card/95 px-3 backdrop-blur sm:gap-3 sm:px-4">
      <SidebarTrigger className="text-navy" />
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="text-muted-foreground">DOST Caraga</span>
        <span className="hidden text-muted-foreground sm:inline">/</span>
        <span className="hidden truncate font-semibold text-navy sm:inline">{title}</span>
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
        <div className="relative hidden xl:block">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search PRs, items, references…" className="h-9 w-64 border-border bg-background pl-8 2xl:w-72" />
        </div>
        <Button variant="ghost" size="icon" className="text-navy">
          <Bell className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <Avatar className="h-8 w-8 border border-border">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">MD</AvatarFallback>
              </Avatar>
              <div className="hidden text-left md:block">
                <p className="text-xs font-semibold text-navy leading-tight">M. Dela Cruz</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Requester</p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Signed in as</DropdownMenuLabel>
            <DropdownMenuItem className="flex flex-col items-start">
              <span className="font-semibold">M. Dela Cruz</span>
              <span className="text-xs text-muted-foreground">mdelacruz@dost.gov.ph</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link to="/settings">Settings</Link></DropdownMenuItem>
            <DropdownMenuItem
              disabled={signingOut}
              onSelect={(event) => {
                event.preventDefault();
                void handleLogout();
              }}
            >
              <LogOut className="h-4 w-4" />
              {signingOut ? "Signing out..." : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
