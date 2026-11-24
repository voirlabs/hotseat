"use client";

import { useCallback, useSyncExternalStore } from "react";
import { addEntry, parseHistory, type HistoryEntry } from "@/lib/history";

const KEY = "hotseat:history";
const listeners = new Set<() => void>();
/** Used when storage is blocked, so history still works for the page. */
let memory: string | null = null;
let cache: { raw: string | null; list: HistoryEntry[] } = { raw: null, list: [] };

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

/** A stable array per stored value, as useSyncExternalStore requires. */
function snapshot(): HistoryEntry[] {
  const raw = readRaw();
  if (raw !== cache.raw) cache = { raw, list: parseHistory(raw) };
  return cache.list;
}

const EMPTY: HistoryEntry[] = [];

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function write(list: HistoryEntry[]) {
  const raw = list.length ? JSON.stringify(list) : null;
  memory = raw;
  try {
    if (raw) window.localStorage.setItem(KEY, raw);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage blocked or full: the in-memory copy still serves this page.
  }
  listeners.forEach((l) => l());
}

/** Read history outside React (newest first). */
export function readHistory(): HistoryEntry[] {
  return snapshot();
}

/** Add a scorecard to history outside React. */
export function recordHistory(entry: HistoryEntry) {
  write(addEntry(snapshot(), entry));
}

/** Your past scorecards in this browser, newest first. */
export function useHistory() {
  const list = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  const clear = useCallback(() => write([]), []);
  return { list, clear };
}
