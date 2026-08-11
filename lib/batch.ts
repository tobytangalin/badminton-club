/**
 * Coalesces push() calls into a single flush(ms after the first push in a
 * window), dropping duplicates within the window. Used to batch Firestore
 * re-fetches so burst changes cause one read per session per window.
 */
export function createDebouncedBatcher<T>(
  flush: (items: T[]) => void,
  delayMs: number
): { push: (item: T) => void; dispose: () => void } {
  const pending = new Set<T>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function fire() {
    timer = null;
    if (pending.size === 0) return;
    const items = [...pending];
    pending.clear();
    flush(items);
  }

  return {
    push(item) {
      pending.add(item);
      if (timer !== null) return;
      timer = setTimeout(fire, delayMs);
    },
    dispose() {
      clearTimer();
    },
  };
}
