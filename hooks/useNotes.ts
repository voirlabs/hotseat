"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The user's notes for a persona (deck text, a one-pager, deal notes), kept in
 * this browser only. The server never stores them; they travel with each
 * request. If storage is blocked (private mode), they last for the page.
 */
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

const keyFor = (personaId: string) => `hotseat:notes:${personaId}`;

function read(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? "";
  } catch {
    return memory.get(key) ?? "";
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useNotes(personaId: string) {
  const key = keyFor(personaId);
  const notes = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => "",
  );
  const setNotes = useCallback(
    (value: string) => {
      memory.set(key, value);
      try {
        if (value) window.localStorage.setItem(key, value);
        else window.localStorage.removeItem(key);
      } catch {
        // Storage blocked: the in-memory copy still serves this page.
      }
      listeners.forEach((l) => l());
    },
    [key],
  );
  return [notes, setNotes] as const;
}
