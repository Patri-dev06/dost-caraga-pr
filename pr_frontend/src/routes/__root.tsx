import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import appCss from "../styles.css?url";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { Toaster } from "@/components/ui/sonner";
import { AppQueryProvider } from "@/lib/query";
import { AUTH_EXPIRED_EVENT, getAuthIdleTimeoutMs, hasValidToken, recordAuthActivity } from "@/lib/api";
import { CurrentUserProvider, useCanAccess, useCurrentUser } from "@/lib/current-user";
import { moduleForPath } from "@/lib/modules";

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

/** Pages anyone can open without signing in: the login page and the Supplier Portal. */
function isPublicPath(path: string) {
  return path === "/login" || path === "/portal" || path.startsWith("/portal/");
}

const authRedirectScript = `
  (() => {
    try {
      const path = window.location.pathname;
      if (path === "/login" || path === "/portal" || path.startsWith("/portal/")) return;

      const token = localStorage.getItem("pr_backend_token");
      const expiresAt = Number(localStorage.getItem("pr_backend_token_expires_at") || 0);
      const lastActivityAt = Number(localStorage.getItem("pr_backend_token_last_activity_at") || 0);
      const idleTimeoutMs = ${Number(import.meta.env.VITE_AUTH_IDLE_TIMEOUT_MINUTES ?? 30) * 60 * 1000};
      const expired = expiresAt && Date.now() >= expiresAt;
      const idleExpired = idleTimeoutMs > 0 && lastActivityAt && Date.now() - lastActivityAt >= idleTimeoutMs;

      if (!token || expired || idleExpired) {
        localStorage.removeItem("pr_backend_token");
        localStorage.removeItem("pr_backend_token_expires_at");
        localStorage.removeItem("pr_backend_token_last_activity_at");
        localStorage.removeItem("pr_backend_current_user");
        window.location.replace("/login");
      }
    } catch {
      const path = window.location.pathname;
      if (path !== "/login" && path !== "/portal" && !path.startsWith("/portal/")) window.location.replace("/login");
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
        <script dangerouslySetInnerHTML={{ __html: authRedirectScript }} />
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
  const isAuth = isPublicPath(pathname);

  useEffect(() => {
    setAuthChecked(true);

    function redirectIfSignedOut() {
      if (!isPublicPath(window.location.pathname) && !hasValidToken()) {
        router.navigate({ to: "/login", replace: true });
      }
    }

    let lastActivityRecordedAt = 0;

    function handleUserActivity() {
      if (isPublicPath(window.location.pathname)) return;

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

  if (!authChecked) {
    return null;
  }

  if (authChecked && !hasValidToken()) {
    return null;
  }

  return (
    <AppQueryProvider>
      <CurrentUserProvider>
        <SidebarProvider>
          <div className="flex min-h-screen w-full min-w-0 overflow-x-hidden bg-background print:block print:min-h-0 print:overflow-visible print:bg-white">
            <div className="contents print:hidden">
              <AppSidebar />
            </div>
            <SidebarInset className="flex min-w-0 flex-1 flex-col overflow-x-hidden print:overflow-visible print:bg-white">
              <div className="contents print:hidden">
                <AppTopbar />
              </div>
              <main className="min-w-0 flex-1 overflow-x-hidden print:overflow-visible print:bg-white">
                <ModuleGuard>
                  <Outlet />
                </ModuleGuard>
              </main>
            </SidebarInset>
          </div>
          <Toaster />
        </SidebarProvider>
      </CurrentUserProvider>
    </AppQueryProvider>
  );
}

/** Redirects to the dashboard if the current route's module is not permitted for this user. */
function ModuleGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const canAccess = useCanAccess();
  const { ready } = useCurrentUser();
  const moduleKey = moduleForPath(pathname);
  const allowed = !moduleKey || canAccess(moduleKey);

  useEffect(() => {
    if (ready && !allowed) {
      router.navigate({ to: "/", replace: true });
    }
  }, [ready, allowed, router, pathname]);

  if (ready && !allowed) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <p className="label-eyebrow mb-2">Access restricted</p>
        <h2 className="text-xl font-semibold text-navy">You don't have access to this module</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Ask your Superadmin to grant access, or head back to the dashboard.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
