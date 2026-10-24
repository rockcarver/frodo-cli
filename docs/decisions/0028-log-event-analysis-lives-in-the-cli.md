---
status: proposed
date: 2026-10-24
decision-makers: maintainers
applies-to:
  - src/ops/DebugLogOps.ts
  - src/ops/JourneyDebugAggregator.ts
---

# Log-event analysis lives in the CLI (proposed)

## Context and problem statement

`frodo debug` shows live dashboards of authentication journeys and of OAuth, SAML and sync events. The engine behind them classifies platform log events: which are noise, how a failure reason is condensed, how events are grouped into journey sessions and de-duplicated. The cli record 0005 treats the journey aggregator as the data model of the prompt, a sanctioned exception to the layering. That makes it an interface-specific piece, but the classification itself is not terminal-specific, and a script or the MCP server watching the same logs would repeat it. The call is the maintainers'; this record states the facts. Measured on `main` (75c58f4c, 2026-10-24); status proposed because of that judgement.

## Decision

Proposed, not accepted. If accepted: the classification (noise filter, failure-reason condensing, session grouping) moves to the library next to `LogOps`, and the prompt keeps rendering.

### Evidence

- `ops/DebugLogOps.ts`: 407 lines (177 inside functions), no library calls: `isConfirmedNoise`, `compactFailureReason`, event formatters.
- `ops/JourneyDebugAggregator.ts`: 1,346 lines (617 inside functions, 81% of its statements are logic rather than library or output calls): sessions, ingestion, `dedupeAppend`, sweep.
- Library counterpart: `LogOps` fetches and tails logs and has a default noise filter; it does not classify or group events.
- Consumers: `frodo debug journey` and the tail prompt (`DebugTailPrompt`, which receives its loader by injection).

## Consequences

- The noise rules exist twice in spirit (library default filter, CLI confirmed-noise rules).
- Until the maintainers decide, the two modules are counted as a judgement call, not as interface-specific code and not as a deviation (972 lines, 1.5% of the CLI).

### Remediation

Direction only; not scheduled. Move event classification and journey session grouping into the library behind `frodo.cloud.log` (or a sibling), keep the prompt and the formatters in the CLI. Size M.
