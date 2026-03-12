import { useCallback, useEffect, useRef, useState } from "react";

export default function useDeselectionFlash(durationMs: number) {
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set());
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const clearDeselectionFlash = useCallback((id: string) => {
    const timer = timersRef.current[id];
    if (timer) {
      clearTimeout(timer);
      delete timersRef.current[id];
    }
    setFlashingIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const triggerDeselectionFlash = useCallback(
    (id: string) => {
      clearDeselectionFlash(id);
      setFlashingIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      timersRef.current[id] = setTimeout(() => {
        setFlashingIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        delete timersRef.current[id];
      }, durationMs);
    },
    [clearDeselectionFlash, durationMs]
  );

  useEffect(
    () => () => {
      Object.values(timersRef.current).forEach((timer) => clearTimeout(timer));
      timersRef.current = {};
    },
    []
  );

  return {
    flashingIds,
    clearDeselectionFlash,
    triggerDeselectionFlash,
  };
}
