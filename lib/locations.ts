const STORAGE_KEY = "savedLocations";

/** Saved session locations, stored locally in the browser. */
export function getSavedLocations(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export function persistSavedLocations(locations: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(locations));
  } catch {
    // Ignore quota / private-mode failures.
  }
}
