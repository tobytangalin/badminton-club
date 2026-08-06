import { useEffect, useState } from "react";

/**
 * Runs `subscribe` (which must return an unsubscribe function, e.g. the one
 * returned by `onSnapshot`) only while the browser tab is visible. The
 * subscription is torn down when the tab is hidden and re-established (with a
 * fresh read) when it becomes visible again, or whenever `subscribe` changes.
 *
 * `subscribe` should be memoized with `useCallback` keyed on the data it
 * captures, so the subscription is re-created only when that data changes.
 */
export function useWhenVisible(subscribe: () => (() => void) | undefined) {
  const [visible, setVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible"
  );

  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!visible) return;
    return subscribe();
  }, [visible, subscribe]);
}
