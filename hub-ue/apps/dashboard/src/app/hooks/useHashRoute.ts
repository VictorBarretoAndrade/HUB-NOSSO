import { useCallback, useEffect, useState } from "react";
import { formatRoute, parseRoute } from "../navigation";
import type { Route } from "../navigation";

/**
 * Navegação pelo hash da URL: voltar/avançar do navegador funcionam, a tela
 * sobrevive a um recarregamento e cada tela pode ser compartilhada por link.
 */
export function useHashRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const syncFromLocation = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", syncFromLocation);
    return () => window.removeEventListener("hashchange", syncFromLocation);
  }, []);

  const navigate = useCallback((next: Route) => {
    const hash = formatRoute(next);
    if (window.location.hash === hash) {
      setRoute(next);
    } else {
      window.location.hash = hash;
    }
  }, []);

  return [route, navigate];
}
