import { useEffect, useRef, useState } from "react";

export default function useSyncedTopScrollbar() {
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const listTopScrollRef = useRef<HTMLDivElement | null>(null);
  const listTopScrollInnerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [showTopScrollbar, setShowTopScrollbar] = useState(false);

  const syncTopScrollbarMetrics = () => {
    const listNode = listScrollRef.current;
    const topNode = listTopScrollRef.current;
    const topInnerNode = listTopScrollInnerRef.current;
    if (!listNode || !topNode || !topInnerNode) return;
    const requiredWidth = Math.max(listNode.scrollWidth, listNode.clientWidth);
    topInnerNode.style.width = `${requiredWidth}px`;
    const needsScrollbar = listNode.scrollWidth - listNode.clientWidth > 1;
    setShowTopScrollbar(needsScrollbar);
    if (!needsScrollbar) {
      topNode.scrollLeft = 0;
      return;
    }
    topNode.scrollLeft = listNode.scrollLeft;
  };

  useEffect(() => {
    const node = listScrollRef.current;
    if (!node) return;

    const measure = () => {
      setContainerWidth(Math.max(0, node.clientWidth));
      syncTopScrollbarMetrics();
    };
    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(() => measure());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const listNode = listScrollRef.current;
    const topNode = listTopScrollRef.current;
    if (!listNode || !topNode) return;
    let syncing = false;

    const syncToTop = () => {
      if (syncing) return;
      syncing = true;
      topNode.scrollLeft = listNode.scrollLeft;
      syncing = false;
    };

    const syncToList = () => {
      if (syncing) return;
      syncing = true;
      listNode.scrollLeft = topNode.scrollLeft;
      syncing = false;
    };

    listNode.addEventListener("scroll", syncToTop, { passive: true });
    topNode.addEventListener("scroll", syncToList, { passive: true });
    return () => {
      listNode.removeEventListener("scroll", syncToTop);
      topNode.removeEventListener("scroll", syncToList);
    };
  }, [showTopScrollbar]);

  return {
    listScrollRef,
    listTopScrollRef,
    listTopScrollInnerRef,
    containerWidth,
    showTopScrollbar,
    syncTopScrollbarMetrics,
  };
}
