import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, Mail, Settings, LogOut, Moon, Sun, CheckCheck, ShieldCheck, Undo2, FileText, PenLine } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "@/components/app/global-search";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { logout, hasValidToken, apiGetNotifications, apiMarkNotificationRead, apiMarkAllNotificationsRead, type AppNotification } from "@/lib/api";
import { useCurrentUser, useCanAccess } from "@/lib/current-user";
import { SignatureDialog } from "@/components/app/signature-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function AppTopbar() {
  const navigate = useNavigate();
  const { user, refresh } = useCurrentUser();
  const canAccess = useCanAccess();
  const [signingOut, setSigningOut] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [sigOpen, setSigOpen] = useState(false);

  const initials = (user?.name ?? "")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "•";

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleTheme() {
    const nextIsDark = !isDark;

    document.documentElement.classList.toggle("dark", nextIsDark);
    document.documentElement.style.colorScheme = nextIsDark ? "dark" : "light";
    localStorage.setItem("dost-theme", nextIsDark ? "dark" : "light");
    setIsDark(nextIsDark);
  }

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
    <header className="sticky top-0 z-30 flex h-16 min-w-0 items-center gap-2 border-b border-border bg-card/95 px-3 backdrop-blur sm:gap-3 sm:px-4">
      <SidebarTrigger className="text-navy" />
      <Link to="/" className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-bold text-[var(--brand-blue)] sm:text-[15px]">Procurement</span>
        <span className="truncate text-sm font-bold text-[var(--brand-blue)] sm:text-[15px]">Management System</span>
      </Link>

      {/* Global search (⌘K) */}
      <GlobalSearch />

      <div className="ml-auto flex min-w-0 items-center gap-0.5 sm:gap-1">
        <NotificationsBell />
        <IconButton label="Messages">
          <Mail className="h-[18px] w-[18px]" />
        </IconButton>
        <IconButton label="Settings" onClick={() => navigate({ to: "/settings" })}>
          <Settings className="h-[18px] w-[18px]" />
        </IconButton>
        <IconButton
          label={isDark ? "Light mode" : "Night mode"}
          onClick={toggleTheme}
        >
          {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </IconButton>
        <IconButton
          label="Sign out"
          onClick={() => void handleLogout()}
          disabled={signingOut}
        >
          <LogOut className="h-[18px] w-[18px]" />
        </IconButton>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="ml-1 flex items-center gap-2 px-1.5">
              <Avatar className="h-8 w-8 border border-border">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Signed in as</DropdownMenuLabel>
            <DropdownMenuItem className="flex flex-col items-start">
              <span className="font-semibold">{user?.name ?? "—"}</span>
              <span className="text-xs text-muted-foreground">{user?.email ?? ""}</span>
              {user && (
                <span className="mt-1 rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-navy">
                  {user.tier}
                </span>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setSigOpen(true); }}>
              <PenLine className="h-4 w-4" /> My E-Signature
              {user && !user.hasSignature && <span className="ml-auto text-[10px] font-semibold text-destructive">Required</span>}
            </DropdownMenuItem>
            {/* Settings is admin-only — don't show a link a regular user can't open. */}
            {canAccess("settings") && (
              <DropdownMenuItem asChild><Link to="/settings">Settings</Link></DropdownMenuItem>
            )}
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
      <SignatureDialog open={sigOpen} onOpenChange={setSigOpen} onChanged={refresh} />
    </header>
  );
}

function notificationIcon(type: string) {
  if (type === "ppmp_approved") return <ShieldCheck className="h-4 w-4 text-success" />;
  if (type === "ppmp_returned") return <Undo2 className="h-4 w-4 text-amber-500" />;
  return <FileText className="h-4 w-4 text-primary" />;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function NotificationsBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: apiGetNotifications,
    enabled: hasValidToken(),
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });
  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  const markRead = useMutation({
    mutationFn: (id: number) => apiMarkNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markAll = useMutation({
    mutationFn: apiMarkAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const open = (n: AppNotification) => {
    if (!n.read) markRead.mutate(n.id);
    if (!n.link) return;
    const [path, qs] = n.link.split("?");
    const search = qs ? Object.fromEntries(new URLSearchParams(qs).entries()) : undefined;
    navigate({ to: path, search } as Parameters<typeof navigate>[0]);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full text-navy hover:bg-secondary"
          aria-label="Notifications"
          title="Notifications"
        >
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white ring-2 ring-card">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markAll.mutate()}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">You're all caught up.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {items.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onSelect={(e) => { e.preventDefault(); open(n); }}
                className={cn("flex items-start gap-2.5 whitespace-normal px-3 py-2.5", !n.read && "bg-primary/5")}
              >
                <span className="mt-0.5 shrink-0">{notificationIcon(n.type)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                    <span className="text-sm font-medium text-navy">{n.title}</span>
                  </span>
                  {n.body && <span className="mt-0.5 block text-xs text-muted-foreground">{n.body}</span>}
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function IconButton({
  children, label, badge, onClick, disabled,
}: {
  children: React.ReactNode;
  label: string;
  badge?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      className="relative rounded-full text-navy hover:bg-secondary"
      aria-label={label}
      title={label}
    >
      {children}
      {badge && (
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-card" />
      )}
    </Button>
  );
}
