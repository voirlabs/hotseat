# Contributing to Hotseat

Thanks for helping out.

## Getting set up

You need Node.js 24 and pnpm 10.

```bash
pnpm install
cp .env.example .env.local   # set ADMIN_PASSWORD (12+ characters)
pnpm dev
```

Every page needs a sign-in, so set `ADMIN_PASSWORD` first. You can work on most of the UI
without an API key: the app shows a setup notice and chat is disabled. For chat without
spending OpenAI credits, set `OPENAI_API_KEY` to any value and point `OPENAI_BASE_URL` at
a local OpenAI-compatible server such as Ollama (voice calls still need a real OpenAI key).

## Before you open a PR

```bash
pnpm check   # lint, typecheck and tests
pnpm build   # must pass with no API keys set
```

CI runs the same commands. Keep PRs focused on one change and describe what you tested.

## Adding a persona

1. Add `personas/<id>.json`. The schema lives in `lib/personas/schema.ts`.
2. Import it in `lib/personas/index.ts`.
3. Run `pnpm test`.

Good personas have a clear situation and point of view: what they need, what they care
about, what makes them walk away and how they talk. Keep the opener short, since it's
spoken aloud.

**Personas must be fictional.** Don't use real people's names, likenesses, catchphrases or
cloned voices. Pull requests that do will be closed.

## Code guidelines

- TypeScript strict mode, no `any`.
- Validate every request body with Zod in `lib/schemas.ts`.
- Every API route goes through `guard()` in `lib/server/api.ts`.
- Never send API keys, model names or system prompts to the browser.
- Add or update tests in `tests/` for logic you change.

## Commit messages

Short imperative subject line, for example `Add climate fund persona` or
`Keep the transcript in order when you cut in`.

## Code of conduct

By taking part you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).
