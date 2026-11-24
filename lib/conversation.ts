/**
 * Conversation limits, shared by the browser and the API schemas. Kept free
 * of zod so the client bundle stays small.
 */

export const MAX_MESSAGE_CHARS = 4000;

/** Notes the user can share before a call: deck text, a one-pager, deal notes. */
export const MAX_NOTES_CHARS = 8000;

/** The persona only sees the most recent part of a long call. */
export const CHAT_WINDOW_MESSAGES = 40;
export const CHAT_WINDOW_CHARS = 24_000;

/** A whole session, which is what the scorecard judges. */
export const SESSION_MAX_MESSAGES = 120;
export const FEEDBACK_MAX_CHARS = 60_000;
/** Warn the user this many messages before the session is full. */
export const SESSION_WARN_MESSAGES = 10;

/**
 * The longest tail of `messages` that fits both limits, in order. Used to
 * window chat history and to trim very long transcripts before scoring.
 */
export function lastMessages<T extends { content: string }>(messages: T[], maxCount: number, maxChars: number): T[] {
  let chars = 0;
  let start = messages.length;
  while (start > 0 && messages.length - start < maxCount) {
    chars += messages[start - 1]!.content.length;
    if (chars > maxChars) break;
    start--;
  }
  return messages.slice(start);
}
