---
status: accepted
date: 2026-10-24
decision-makers:
  - maintainers
applies-to:
  - src/ops/cloud/SecretsOps.ts
  - src/ops/TokenCacheOps.ts
  - src/ops/ConnectionProfileOps.ts
repos:
  - rockcarver/frodo-cli
  - rockcarver/frodo-lib
---

# Secrets are never exported in the clear, and stored credentials are encrypted

Recorded in the umbrella repository rockcarver/frodo (archived 2026-10) until 2026-10-24; this copy is the record.

## Context and problem statement

Frodo reads and writes platform configuration that contains passwords, keys and secret values, and it stores credentials and tokens on the user's machine. The stewardship of secret values belongs with the environment they live in. The principle is stated in both READMEs ("Platform passwords and secrets", "Secure Token Caching", "Connection profiles"). Recorded retroactively and spot-checked against the code on 2026-10-24.

## Decision

- Platform passwords and secrets are generally not exported. Frodo assumes administrators use configuration placeholders and environment secrets and variables (ESVs). Where the APIs support it, an administrator may seed import data with raw secrets and frodo imports them.
- Frodo exports ESV secret values only encrypted, with the keys of the source environment (the default) or of the target environment. It never exports secrets in the clear.
- Connection profiles keep passwords, secrets and keys encrypted on disk. The token cache is on by default, tokenised and encrypted on disk, and can be turned off (`FRODO_NO_CACHE`, `--no-cache`).
- Credential files are created with restrictive permissions, on Windows, macOS and Linux; both pipelines run a cross-platform test for it.
- No credentials, keys or tokens in the repositories, including test fixtures and recordings.

## Consequences

- Measured: the secret export takes a `target` for encrypting values, the token cache and the connection profiles encrypt and decrypt through the library's data protection, and both pipelines have the permissions test.
- A feature that would print or write a secret value in the clear needs a new record.
