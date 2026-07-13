import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiMe, CURRENT_USER_EVENT, getCurrentUser, hasValidToken, type CurrentUser } from "@/lib/api";
import type { ModuleKey } from "@/lib/modules";

type CurrentUserContextValue = {
  user: CurrentUser | null;
  /** True once we've read/refreshed the user on the client (avoids gating flicker on SSR). */
  ready: boolean;
  refresh: () => void;
};

const CurrentUserContext = createContext<CurrentUserContextValue>({ user: null, ready: false, refresh: () => {} });

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => setUser(getCurrentUser()), []);

  useEffect(() => {
    // Hydrate from localStorage immediately, then refresh from the backend.
    setUser(getCurrentUser());
    setReady(true);
    if (hasValidToken()) {
      apiMe()
        .then(setUser)
        .catch(() => {});
    }

    const onChange = () => setUser(getCurrentUser());
    window.addEventListener(CURRENT_USER_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(CURRENT_USER_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return <CurrentUserContext.Provider value={{ user, ready, refresh }}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser() {
  return useContext(CurrentUserContext);
}

/**
 * Returns a predicate for module access. While the user is still loading
 * (`ready === false`) everything is permitted to avoid hiding the UI on first
 * paint; once loaded, access follows the user's effective module list.
 */
export function useCanAccess() {
  const { user, ready } = useContext(CurrentUserContext);
  return useCallback(
    (module: ModuleKey) => {
      if (!ready || !user) return true;
      return user.modules.includes(module);
    },
    [user, ready],
  );
}
