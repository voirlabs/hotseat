# Security policy

## Reporting a vulnerability

Please don't open a public issue for security problems.

Report it privately through GitHub:
**Security → Report a vulnerability** on this repository
([docs](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)).
If you can't use GitHub, email [contact@voirlabs.io](mailto:contact@voirlabs.io) instead.

Include steps to reproduce and the impact you expect. We aim to acknowledge reports within
three business days and will keep you updated until it's resolved.

## Scope

In scope: anything that exposes API keys, bypasses `ADMIN_PASSWORD`, lets a client control
the model, voice or system prompt, or bypasses validation or rate limits on API routes.

Out of scope:

- Prompt injection that only changes what the persona says to the same user.
- The signed-in owner changing their own call over its WebRTC data channel (for example
  with `session.update`). The browser holds that channel by design; it's the owner's own
  session, and the server still caps call length and count.
- Limits not being shared across serverless instances, or the call timer not firing on
  serverless hosts (documented limitations; see the README's Deploy section).

## Supported versions

Only the latest release on `main` receives security fixes.
