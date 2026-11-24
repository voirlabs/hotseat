# Working rules for AI agents

Hotseat is a small Next.js 16 app for practicing investor pitches and client calls
against AI personas, with live voice (OpenAI Realtime over WebRTC), text chat and a
scorecard. Keep it minimal: one OpenAI key, no extra providers, no features off the core
flow (pick a persona → call or chat → scorecard → export).

## Workflow
- Work on a branch and open a pull request. Never push to `main` directly.
- Run `pnpm check` (lint, typecheck, tests) before every commit. `pnpm build` must pass
  with no API keys set.
- Add or update tests in `tests/` for logic you change.

## Invariants
- API keys, model names and system prompts never reach the browser. The client sends a
  persona id and the conversation; the server picks the model, voice and prompt. Pages get
  a `PublicPersona`, without the fields the prompt is built from. One exception: a voice
  call is WebRTC from the browser to OpenAI, so the session (including its instructions)
  is visible on the call's data channel to the signed-in owner. The key never is.
- Every API route calls `guard()` from `lib/server/api.ts` (same-origin, session, rate
  limit) and validates its body with a Zod schema from `lib/schemas.ts`.
- Server configuration is read only in `lib/server/env.ts`. The product name, repo URL
  and public app URL come from `lib/site.ts`, so a rename is a one-line change. Every env
  var is listed in `.env.example` and the README table.
- Conversation limits live in `lib/conversation.ts` and are shared by the client and the
  schemas.
- Personas are fictional. Never add real people's names, likenesses or cloned voices.
- Errors must be visible to the user. No silent failures.
