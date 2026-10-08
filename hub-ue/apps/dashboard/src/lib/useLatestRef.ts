import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

/** Mantém uma ref sempre apontando para o valor do último render (para callbacks estáveis). */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
