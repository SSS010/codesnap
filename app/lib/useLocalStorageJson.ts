"use client";

import { useEffect, useRef, useState } from "react";

export function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * LocalStorage-backed JSON state with basic hydration safety.
 * - Reads once on mount
 * - Writes on changes (after mount)
 */
export function useLocalStorageJsonState<T>(args: {
  key: string;
  initialValue: T;
  validate?: (value: unknown) => value is T;
  migrate?: (value: unknown) => T | null;
}) {
  const { key, initialValue, validate, migrate } = args;
  const [value, setValue] = useState<T>(initialValue);
  const didHydrate = useRef(false);

  useEffect(() => {
    const parsed = safeJsonParse<unknown>(window.localStorage.getItem(key));
    if (parsed) {
      const migrated = migrate ? migrate(parsed) : null;
      if (migrated) {
        setValue(migrated);
      } else if (!validate || validate(parsed)) {
        setValue(parsed as T);
      }
    }
    didHydrate.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!didHydrate.current) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore quota / blocked storage errors.
    }
  }, [key, value]);

  return [value, setValue] as const;
}

