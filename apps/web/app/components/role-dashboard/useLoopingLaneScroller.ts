import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import { LOOP_SEGMENT_COUNT, type ColumnVariant } from "./lane-utils";

type LaneDragState = {
  laneIndex: number;
  pointerId: number;
  startPointerAxis: number;
  startScrollAxis: number;
};

type UseLoopingLaneScrollerArgs = {
  variant: ColumnVariant;
};

export default function useLoopingLaneScroller({ variant }: UseLoopingLaneScrollerArgs) {
  const [hoveredLaneIndex, setHoveredLaneIndex] = useState<number | null>(null);
  const [draggingLaneIndex, setDraggingLaneIndex] = useState<number | null>(null);
  const laneViewportRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const laneDragRef = useRef<LaneDragState | null>(null);

  const readLaneScrollAxis = useCallback(
    (viewport: HTMLDivElement): number =>
      variant === "row" ? viewport.scrollLeft : viewport.scrollTop,
    [variant]
  );

  const writeLaneScrollAxis = useCallback(
    (viewport: HTMLDivElement, value: number) => {
      if (variant === "row") {
        viewport.scrollLeft = value;
        return;
      }
      viewport.scrollTop = value;
    },
    [variant]
  );

  const laneLoopSegmentSize = useCallback(
    (viewport: HTMLDivElement): number => {
      const fullSize = variant === "row" ? viewport.scrollWidth : viewport.scrollHeight;
      if (!Number.isFinite(fullSize) || fullSize <= 0) return 0;
      return fullSize / LOOP_SEGMENT_COUNT;
    },
    [variant]
  );

  const wrapLaneScroll = useCallback(
    (viewport: HTMLDivElement) => {
      const segmentSize = laneLoopSegmentSize(viewport);
      if (!Number.isFinite(segmentSize) || segmentSize <= 0) return;
      const min = segmentSize * 0.5;
      const max = segmentSize * 1.5;
      let axis = readLaneScrollAxis(viewport);
      let wrapped = false;
      while (axis < min) {
        axis += segmentSize;
        wrapped = true;
      }
      while (axis > max) {
        axis -= segmentSize;
        wrapped = true;
      }
      if (wrapped) writeLaneScrollAxis(viewport, axis);
    },
    [laneLoopSegmentSize, readLaneScrollAxis, writeLaneScrollAxis]
  );

  const pointerAxis = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): number =>
      variant === "row" ? event.clientX : event.clientY,
    [variant]
  );

  const isInteractiveDragTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("button, a, input, select, textarea, [role='button']"));
  };

  const stopLaneDrag = useCallback((laneIndex: number, pointerId?: number) => {
    const drag = laneDragRef.current;
    if (!drag || drag.laneIndex !== laneIndex) return;
    if (typeof pointerId === "number" && drag.pointerId !== pointerId) return;
    const viewport = laneViewportRefs.current[laneIndex];
    if (
      viewport &&
      typeof pointerId === "number" &&
      typeof viewport.releasePointerCapture === "function"
    ) {
      try {
        viewport.releasePointerCapture(pointerId);
      } catch {
        // no-op: capture might already be released
      }
    }
    laneDragRef.current = null;
    setDraggingLaneIndex((prev) => (prev === laneIndex ? null : prev));
  }, []);

  const handleLaneWheel =
    (laneIndex: number) => (event: ReactWheelEvent<HTMLDivElement>) => {
      const viewport = laneViewportRefs.current[laneIndex];
      if (!viewport) return;
      const delta =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (!Number.isFinite(delta) || delta === 0) return;
      writeLaneScrollAxis(viewport, readLaneScrollAxis(viewport) + delta);
      wrapLaneScroll(viewport);
      setHoveredLaneIndex(laneIndex);
      event.preventDefault();
    };

  const handleLanePointerDown =
    (laneIndex: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if (isInteractiveDragTarget(event.target)) return;
      const viewport = laneViewportRefs.current[laneIndex];
      if (!viewport) return;
      laneDragRef.current = {
        laneIndex,
        pointerId: event.pointerId,
        startPointerAxis: pointerAxis(event),
        startScrollAxis: readLaneScrollAxis(viewport),
      };
      setDraggingLaneIndex(laneIndex);
      setHoveredLaneIndex(laneIndex);
      if (typeof viewport.setPointerCapture === "function") {
        try {
          viewport.setPointerCapture(event.pointerId);
        } catch {
          // no-op: capture can fail on unsupported targets
        }
      }
      event.preventDefault();
    };

  const handleLanePointerMove =
    (laneIndex: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = laneDragRef.current;
      if (!drag || drag.laneIndex !== laneIndex || drag.pointerId !== event.pointerId) return;
      const viewport = laneViewportRefs.current[laneIndex];
      if (!viewport) return;
      const delta = pointerAxis(event) - drag.startPointerAxis;
      writeLaneScrollAxis(viewport, drag.startScrollAxis - delta);
      wrapLaneScroll(viewport);
      event.preventDefault();
    };

  const handleLanePointerUp =
    (laneIndex: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
      stopLaneDrag(laneIndex, event.pointerId);
    };

  const handleLanePointerCancel =
    (laneIndex: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
      stopLaneDrag(laneIndex, event.pointerId);
    };

  const handleLaneScroll = (laneIndex: number) => () => {
    const viewport = laneViewportRefs.current[laneIndex];
    if (!viewport) return;
    wrapLaneScroll(viewport);
  };

  const handleLaneMouseEnter = (laneIndex: number) => () => {
    setHoveredLaneIndex(laneIndex);
  };

  const handleLaneMouseLeave = (laneIndex: number) => () => {
    setHoveredLaneIndex((prev) =>
      draggingLaneIndex === laneIndex ? laneIndex : prev === laneIndex ? null : prev
    );
  };

  const setLaneViewportRef = (laneIndex: number) => (node: HTMLDivElement | null) => {
    laneViewportRefs.current[laneIndex] = node;
  };

  const alignLaneViewportsToMiddleSegment = useCallback(
    (laneCount: number) => {
      const raf = requestAnimationFrame(() => {
        for (let laneIndex = 0; laneIndex < laneCount; laneIndex += 1) {
          const viewport = laneViewportRefs.current[laneIndex];
          if (!viewport) continue;
          const segmentSize = laneLoopSegmentSize(viewport);
          if (segmentSize <= 0) continue;
          writeLaneScrollAxis(viewport, Math.floor(segmentSize));
        }
      });
      return () => cancelAnimationFrame(raf);
    },
    [laneLoopSegmentSize, writeLaneScrollAxis]
  );

  useEffect(
    () => () => {
      laneDragRef.current = null;
    },
    []
  );

  return {
    hoveredLaneIndex,
    draggingLaneIndex,
    setLaneViewportRef,
    handleLaneWheel,
    handleLanePointerDown,
    handleLanePointerMove,
    handleLanePointerUp,
    handleLanePointerCancel,
    handleLaneScroll,
    handleLaneMouseEnter,
    handleLaneMouseLeave,
    alignLaneViewportsToMiddleSegment,
  };
}
