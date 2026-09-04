# Security

Homeward is a local-first family AI gateway prototype. Its filter helps parents review and limit chats. It is not fail-closed, not a babysitter, and not a guarantee of “safe AI.”

## Reporting a vulnerability

Please do **not** open a public issue for anything that could let someone bypass parent controls, reach the model directly, or read another family's data.

1. Use [GitHub security advisories](https://github.com/matt-dance/homeword-family-ai/security/advisories/new) on this repository.
2. If you cannot file an advisory, open a [GitHub issue](https://github.com/matt-dance/homeword-family-ai/issues/new) titled “Security” and omit exploit details until a maintainer replies.

There is no bug bounty. We will try to acknowledge reports when we can.

## Scope notes

- Parent dashboard and setup are intended to work only on the Homeward computer (`http://localhost`).
- Kid chat on the LAN (`http://homeward.local/chat`) is intentionally reachable on the home Wi‑Fi.
- Cloud / bring-your-own-key models are not a supported parent feature yet.
