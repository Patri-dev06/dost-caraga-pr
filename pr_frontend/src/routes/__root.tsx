import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import appCss from "../styles.css?url";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { Toaster } from "@/components/ui/sonner";
import { AppQueryProvider } from "@/lib/query";
import { AUTH_EXPIRED_EVENT, getAuthIdleTimeoutMs, hasValidToken, recordAuthActivity } from "@/lib/api";

const themeInitializationScript = `
  (() => {
    try {
      const savedTheme = localStorage.getItem("dost-theme");
      const isDark = savedTheme === "dark"
        || (savedTheme === null && window.matchMedia("(prefers-color-scheme: dark)").matches);

      document.documentElement.classList.toggle("dark", isDark);
      document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    } catch {
      // Keep the default light theme when browser storage is unavailable.
    }
  })();
`;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="label-eyebrow mb-3">DOST Caraga · Procurement</p>
        <h1 className="text-7xl font-bold text-navy">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "DOST Caraga - Procurement System" },
      { name: "description", content: "Procurement Management and Pre-Validation Platform for DOST Caraga." },
      { name: "author", content: "DOST Caraga" },
      { property: "og:title", content: "DOST Caraga - Procurement System" },
      { property: "og:description", content: "Procurement Management and Pre-Validation Platform." },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/dost-seal.svg" },
      { rel: "shortcut icon", type: "image/svg+xml", href: "/dost-seal.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [authChecked, setAuthChecked] = useState(false);
  const isAuth = pathname === "/login";

  useEffect(() => {
    setAuthChecked(true);

    function redirectIfSignedOut() {
      if (window.location.pathname !== "/login" && !hasValidToken()) {
        router.navigate({ to: "/login", replace: true });
      }
    }

    let lastActivityRecordedAt = 0;

    function handleUserActivity() {
      if (window.location.pathname === "/login") return;

      if (!hasValidToken()) {
        redirectIfSignedOut();
        return;
      }

      const now = Date.now();

      if (now - lastActivityRecordedAt >= 15_000) {
        recordAuthActivity();
        lastActivityRecordedAt = now;
      }
    }

    const activityEvents = ["click", "keydown", "mousemove", "scroll", "touchstart", "visibilitychange"];
    const idleCheckInterval = window.setInterval(redirectIfSignedOut, Math.min(getAuthIdleTimeoutMs() || 60_000, 60_000));

    redirectIfSignedOut();
    activityEvents.forEach((event) => window.addEventListener(event, handleUserActivity, { passive: true }));
    window.addEventListener(AUTH_EXPIRED_EVENT, redirectIfSignedOut);
    window.addEventListener("storage", redirectIfSignedOut);

    return () => {
      window.clearInterval(idleCheckInterval);
      activityEvents.forEach((event) => window.removeEventListener(event, handleUserActivity));
      window.removeEventListener(AUTH_EXPIRED_EVENT, redirectIfSignedOut);
      window.removeEventListener("storage", redirectIfSignedOut);
    };
  }, [router]);

  if (isAuth) {
    return (
      <AppQueryProvider>
        <Outlet />
        <Toaster />
      </AppQueryProvider>
    );
  }

  if (authChecked && !hasValidToken()) {
    return (
      <AppQueryProvider>
        <div className="flex min-h-screen items-center justify-center bg-background px-4 text-sm text-muted-foreground">
          Redirecting to sign in...
        </div>
        <Toaster />
      </AppQueryProvider>
    );
  }

  return (
    <AppQueryProvider>
      <SidebarProvider>
        <div className="flex min-h-screen w-full min-w-0 overflow-x-hidden bg-background">
          <AppSidebar />
          <SidebarInset className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
            <AppTopbar />
            <main className="min-w-0 flex-1 overflow-x-hidden">
              <Outlet />
            </main>
          </SidebarInset>
        </div>
        <Toaster />
      </SidebarProvider>
    </AppQueryProvider>
  );
}
