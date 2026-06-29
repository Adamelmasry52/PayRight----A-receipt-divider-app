import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/*
  Minimal path-based router.

  Why not react-router: the spec reserves the URL *fragment* (#...) for the
  lz-string-compressed shared bill (Step 7), and the app only has a handful of
  linear screens. A tiny History-API router keeps the fragment ours and adds no
  dependency. Static hosts need an SPA fallback (Step 8); Vite dev provides one.
*/

interface RouterValue {
  path: string;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterValue | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback<RouterValue["navigate"]>((to, opts) => {
    if (opts?.replace) window.history.replaceState(null, "", to);
    else window.history.pushState(null, "", to);
    setPath(window.location.pathname);
    window.scrollTo(0, 0);
  }, []);

  const value = useMemo<RouterValue>(() => ({ path, navigate }), [path, navigate]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error("useRouter must be used within <RouterProvider>");
  return ctx;
}

/** Renders the child whose `path` matches, else the `path === "*"` fallback. */
export function Routes({
  routes,
}: {
  routes: { path: string; element: ReactNode }[];
}) {
  const { path } = useRouter();
  const match =
    routes.find((r) => r.path === path) ?? routes.find((r) => r.path === "*");
  return <>{match?.element ?? null}</>;
}
