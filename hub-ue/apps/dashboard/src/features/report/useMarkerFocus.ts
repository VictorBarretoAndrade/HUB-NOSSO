import { useCallback, useState } from "react";

interface MarkerSelection {
  groupId: string | null;
  markerId: string | null;
}

const NO_SELECTION: MarkerSelection = { groupId: null, markerId: null };

/**
 * Foco dos markers no gráfico. O hover/foco do teclado destaca temporariamente;
 * clique ou Enter "fixa" o destaque, que continua visível ao tirar o mouse.
 */
export function useMarkerFocus() {
  const [hovered, setHovered] = useState<MarkerSelection>(NO_SELECTION);
  const [pinned, setPinned] = useState<MarkerSelection>(NO_SELECTION);

  const hoverGroup = useCallback((groupId: string) => setHovered({ groupId, markerId: null }), []);
  const hoverMarker = useCallback((groupId: string, markerId: string) => setHovered({ groupId, markerId }), []);
  const clearHover = useCallback(() => setHovered(NO_SELECTION), []);
  const clearPin = useCallback(() => setPinned(NO_SELECTION), []);

  /** Tira o hover de um marker específico, mantendo o grupo destacado. */
  const leaveMarker = useCallback((markerId: string) => {
    setHovered((current) => (current.markerId === markerId ? { ...current, markerId: null } : current));
  }, []);

  const togglePinnedGroup = useCallback((groupId: string) => {
    setPinned((current) =>
      current.groupId === groupId && current.markerId === null ? NO_SELECTION : { groupId, markerId: null },
    );
  }, []);

  const togglePinnedMarker = useCallback((groupId: string, markerId: string) => {
    setPinned((current) =>
      current.groupId === groupId && current.markerId === markerId ? NO_SELECTION : { groupId, markerId },
    );
  }, []);

  const dismiss = useCallback(() => {
    clearPin();
    clearHover();
  }, [clearHover, clearPin]);

  return {
    activeGroupId: hovered.groupId ?? pinned.groupId,
    activeMarkerId: hovered.markerId ?? pinned.markerId,
    hoverGroup,
    hoverMarker,
    leaveMarker,
    clearHover,
    clearPin,
    togglePinnedGroup,
    togglePinnedMarker,
    dismiss,
  };
}

export type MarkerFocus = ReturnType<typeof useMarkerFocus>;
