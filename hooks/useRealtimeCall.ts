"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Difficulty } from "@/lib/difficulty";
import { historyEvents, openerEvent, textTurnEvents, toCallEvent, type CallEvent } from "@/lib/realtime";

type CallConnection = "idle" | "connecting" | "live";
export type CallError =
  | "insecure"
  | "unsupported"
  | "denied"
  | "no-mic"
  | "signed-out"
  | "session"
  | "busy"
  | "full"
  | "connection"
  | "autoplay";

interface StartOptions {
  /** The conversation so far, replayed into the call. */
  history: { role: "user" | "assistant"; content: string }[];
  /** When set, the persona opens the call by saying this. */
  opener?: string;
  /** The user's notes for this session, built into the persona's instructions. */
  notes?: string;
  difficulty?: Difficulty;
}

/**
 * Tell the server a call ended, so it frees the call's slot and hangs up at
 * OpenAI. keepalive: still sent when the page is closing. If it never
 * arrives, the server frees the slot when the call times out.
 */
function endOnServer(callId: string) {
  fetch("/api/realtime", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callId }),
    keepalive: true,
  }).catch((err) => console.warn("Couldn't tell the server the call ended", err));
}

/**
 * A live voice call with a persona over the OpenAI Realtime API. The browser
 * sends its WebRTC offer to /api/realtime, which opens the session with the
 * server-side key. The persona's voice plays from the remote audio track;
 * everything else arrives as events on the "oai-events" data channel.
 */
export function useRealtimeCall(personaId: string, onEvent: (event: CallEvent) => void) {
  const [connection, setConnection] = useState<CallConnection>("idle");
  const [error, setError] = useState<CallError | null>(null);

  const onEventRef = useRef(onEvent);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeRef = useRef(false);
  /** The server's id for the live call, so hanging up frees its slot there. */
  const callIdRef = useRef<string | null>(null);
  /** Bumped on every teardown, so a start() still awaiting the mic or the server can tell it was cancelled. */
  const sessionRef = useRef(0);

  useEffect(() => {
    onEventRef.current = onEvent;
  });

  const teardown = useCallback(() => {
    sessionRef.current++;
    const callId = callIdRef.current;
    callIdRef.current = null;
    if (callId) endOnServer(callId);
    activeRef.current = false;
    dcRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    setConnection("idle");
  }, []);

  const fail = useCallback(
    (code: CallError) => {
      teardown();
      setError(code);
    },
    [teardown],
  );

  const sendEvents = useCallback((events: object[]): boolean => {
    const dc = dcRef.current;
    if (dc?.readyState !== "open") return false;
    for (const e of events) dc.send(JSON.stringify(e));
    return true;
  }, []);

  const start = useCallback(
    async ({ history, opener, notes, difficulty }: StartOptions) => {
      if (activeRef.current) return;
      setError(null);

      if (!window.isSecureContext) return setError("insecure");
      if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
        return setError("unsupported");
      }

      // Mark the call active before the permission prompt, so a second click
      // can't open a second microphone stream while the first is pending.
      activeRef.current = true;
      const session = sessionRef.current;
      const cancelled = () => sessionRef.current !== session;
      setConnection("connecting");

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (err) {
        if (cancelled()) return;
        teardown();
        return setError(err instanceof DOMException && err.name === "NotAllowedError" ? "denied" : "no-mic");
      }
      // The call was ended (or the page left) while the browser asked for the mic.
      if (cancelled()) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      audioRef.current ??= new Audio();
      audioRef.current.autoplay = true;
      pc.ontrack = (e) => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.srcObject = e.streams[0] ?? null;
        audio.play().catch(() => {
          // Autoplay was blocked: play on the user's next click or tap.
          setError("autoplay");
          document.addEventListener(
            "pointerdown",
            () => void audio.play().then(() => setError((e) => (e === "autoplay" ? null : e))).catch(() => {}),
            { once: true },
          );
        });
      };
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const dc = pc.createDataChannel("oai-events");
      dc.onopen = () => {
        if (cancelled()) return;
        dcRef.current = dc;
        sendEvents(historyEvents(history));
        if (opener) sendEvents([openerEvent(opener)]);
        setConnection("live");
      };
      dc.onmessage = (e) => {
        const event = toCallEvent(String(e.data));
        if (event && !cancelled()) onEventRef.current(event);
      };
      dc.onclose = () => {
        if (!cancelled()) fail("connection");
      };
      pc.onconnectionstatechange = () => {
        if (!cancelled() && pc.connectionState === "failed") fail("connection");
      };

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const res = await fetch("/api/realtime", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personaId, sdp: offer.sdp, notes: notes || undefined, difficulty }),
        });
        const callId = res.headers.get("x-call-id");
        if (res.ok && callId) {
          // Cancelled meanwhile: the server still has to hear the call ended.
          if (cancelled()) return endOnServer(callId);
          callIdRef.current = callId;
        }
        if (cancelled()) return;
        if (!res.ok) {
          return fail(
            res.status === 401 ? "signed-out" : res.status === 429 ? "busy" : res.status === 409 ? "full" : "session",
          );
        }
        await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
      } catch {
        if (!cancelled()) fail("connection");
      }
    },
    [fail, personaId, sendEvents, teardown],
  );

  const stop = useCallback(() => {
    teardown();
    setError(null);
  }, [teardown]);

  /** Send a typed message into the call; the persona answers out loud. Returns false when not connected. */
  const sendText = useCallback((text: string) => sendEvents(textTurnEvents(text)), [sendEvents]);

  useEffect(() => teardown, [teardown]);

  return { connection, error, start, stop, sendText };
}
