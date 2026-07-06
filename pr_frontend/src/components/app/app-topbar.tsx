import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, Mail, Settings, LogOut, Moon, Search, Sun } from "lucide-react";
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

export function AppTopbar() {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [isDark, setIsDark] = useState(false);

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

      {/* Search */}
      <div className="relative mx-auto hidden w-full max-w-md md:block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search…" className="h-10 w-full rounded-lg border-border bg-background pl-9" />
      </div>

      <div className="ml-auto flex min-w-0 items-center gap-0.5 sm:gap-1">
        <IconButton label="Notifications" badge>
          <Bell className="h-[18px] w-[18px]" />
        </IconButton>
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
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">MD</AvatarFallback>
              </Avatar>
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
