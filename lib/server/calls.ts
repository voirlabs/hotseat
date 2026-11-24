/**
 * Server-side limits on voice calls: how many run at once and how long each
 * lasts. The browser ends a call at CALL_MAX_MINUTES too, but it can't be
 * trusted to, so the server hangs the call up itself through OpenAI's API.
 *
 * Both are kept in this process's memory. A long-running server (`pnpm
 * start`, a container, a VM) enforces them. On serverless hosts an instance
 * can be frozen or recycled once the response is sent, so the hangup timer may
 * never fire and each instance counts only its own calls: there, the cap and
 * the time limit are best effort and OpenAI's own session limit is the backstop.
 */

/** At most this many voice calls at once per server. */
export const MAX_ACTIVE_CALLS = 2;

/** Extra time before the server hangs up, so the browser's own timer normally ends the call first. */
export const HANGUP_GRACE_MS = 30_000;

/**
 * The call id from the Location header of POST /v1/realtime/calls
 * (e.g. "/v1/realtime/calls/rtc_abc123"), or null when there isn't a usable one.
 */
export function callIdFromLocation(location: string | null): string | null {
  if (!location) return null;
  let path: string;
  try {
    path = new URL(location, "https://api.openai.com").pathname;
  } catch {
    return null;
  }
  const id = path.split("/").filter(Boolean).at(-1) ?? "";
  return /^[A-Za-z0-9_-]{1,128}$/.test(id) && id !== "calls" ? id : null;
}

/** End a call through OpenAI (POST /v1/realtime/calls/{id}/hangup). */
export async function hangUpCall(apiKey: string, callId: string): Promise<void> {
  try {
    const res = await fetch(`https://api.openai.com/v1/realtime/calls/${encodeURIComponent(callId)}/hangup`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    // 404: the call had already ended.
    if (!res.ok && res.status !== 404) {
      console.error("[realtime] hangup failed", res.status, (await res.text().catch(() => "")).slice(0, 300));
    }
  } catch (err) {
    console.error("[realtime] could not reach OpenAI to hang up", err);
  }
}

interface Slot {
  callId: string | null;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * Tracks the calls in progress. A slot is reserved before asking OpenAI for a
 * call, so two requests at once can't both squeeze past the cap, and freed
 * when the call is hung up, times out, or fails to start.
 */
export function createCallRegistry(maxActive: number) {
  const slots = new Map<number, Slot>();
  let nextId = 0;

  const release = (id: number) => {
    const slot = slots.get(id);
    if (!slot) return null;
    clearTimeout(slot.timer);
    slots.delete(id);
    return slot;
  };

  return {
    get active() {
      return slots.size;
    },

    /** A slot id, or null when `maxActive` calls are already running. */
    reserve(): number | null {
      if (slots.size >= maxActive) return null;
      const id = ++nextId;
      slots.set(id, { callId: null });
      return id;
    },

    /** Free a slot whose call never started. */
    release(id: number) {
      release(id);
    },

    /**
     * The call started: after `limitMs`, free the slot and call `onTimeout`
     * (which hangs up). Without a call id the slot is still held until then.
     */
    started(id: number, callId: string | null, limitMs: number, onTimeout: (callId: string) => void) {
      const slot = slots.get(id);
      if (!slot) return;
      slot.callId = callId;
      slot.timer = setTimeout(() => {
        release(id);
        if (callId) onTimeout(callId);
      }, limitMs);
    },

    /** The browser hung up: free the call's slot. Returns false for an unknown call. */
    ended(callId: string): boolean {
      for (const [id, slot] of slots) {
        if (slot.callId === callId) {
          release(id);
          return true;
        }
      }
      return false;
    },
  };
}

const globalForCalls = globalThis as unknown as { __callRegistry?: ReturnType<typeof createCallRegistry> };
export const callRegistry = (globalForCalls.__callRegistry ??= createCallRegistry(MAX_ACTIVE_CALLS));
