import { useEffect, useMemo, useState, type ReactNode } from "react";

export interface ColumnDef<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  // Columns default to visible unless explicitly opted out - most tables
  // start with a handful of "extra" columns hidden so the default view
  // matches what the page looked like before customization existed.
  defaultVisible?: boolean;
  // Server-side sort field this column corresponds to, if any. Omitted for
  // columns that aren't sortable (e.g. derived/aggregate values) - DataTable
  // renders those headers as plain, non-interactive text.
  sortField?: string;
}

const STORAGE_PREFIX = "opshub.table-columns.";

function defaultKeys(columns: ColumnDef<unknown>[]): string[] {
  return columns.filter((c) => c.defaultVisible !== false).map((c) => c.key);
}

function loadVisibleKeys(storageKey: string, columns: ColumnDef<unknown>[]): string[] {
  const defaults = defaultKeys(columns);
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + storageKey);
    if (!raw) return defaults;
    const saved = JSON.parse(raw) as unknown;
    if (!Array.isArray(saved)) return defaults;
    const validKeys = new Set(columns.map((c) => c.key));
    const filtered = saved.filter((k): k is string => typeof k === "string" && validKeys.has(k));
    return filtered.length > 0 ? filtered : defaults;
  } catch {
    return defaults;
  }
}

// Persists which columns are visible for a given table (by storageKey) to
// localStorage, so the "table to expand all the way" / customizable-columns
// ask sticks per-browser without needing a backend preferences table.
export function useTableColumns<T>(storageKey: string, columns: ColumnDef<T>[]) {
  const untypedColumns = columns as unknown as ColumnDef<unknown>[];
  const [visibleKeys, setVisibleKeys] = useState<string[]>(() => loadVisibleKeys(storageKey, untypedColumns));

  useEffect(() => {
    setVisibleKeys(loadVisibleKeys(storageKey, untypedColumns));
    // Re-derive only when the table identity changes, not on every render
    // (columns is expected to be a stable array literal per page).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(visibleKeys));
  }, [storageKey, visibleKeys]);

  function toggle(key: string) {
    setVisibleKeys((keys) => {
      if (keys.includes(key)) {
        if (keys.length === 1) return keys; // always keep at least one column visible
        return keys.filter((k) => k !== key);
      }
      return [...keys, key];
    });
  }

  function reset() {
    setVisibleKeys(defaultKeys(untypedColumns));
  }

  const visibleColumns = useMemo(
    () => columns.filter((c) => visibleKeys.includes(c.key)),
    [columns, visibleKeys],
  );

  return { columns, visibleKeys, visibleColumns, toggle, reset };
}
