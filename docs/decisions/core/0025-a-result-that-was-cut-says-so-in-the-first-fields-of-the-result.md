---
status: proposed
date: 2026-11-17
decision-makers:
  - maintainers
applies-to:
  - src/mcp/**
  - src/ops/McpServerOps.ts
repos:
  - rockcarver/frodo-cli
  - rockcarver/frodo-lib
issues:
  - rockcarver/frodo-cli#1373
---

# A result that was cut says so in the first fields of the result

## Context and problem statement

[Core 0001](0001-library-is-the-brain-cli-is-a-thin-wrapper.md) makes the library the brain and the CLI a thin wrapper, so a result that an agent reads through the MCP server passes two layers that can cut it. When this was decided, on 2026-11-17, a list read of about two hundred journeys returned a fraction of them and said so only in a nested metadata object that the agent did not read, and the agent concluded that the others did not exist. Other cuts were just as quiet: a result that the platform pages carried a cursor that nothing flagged, and a result too large to send was replaced by a marker of a different shape.

## Decision

Any layer that returns fewer items than exist, for whatever reason (a size cut, an item ceiling, a page the caller asked for, a cursor, a transport limit), says so in the first fields of the result, placed before the data:

- `truncated` is `true` when items remain beyond the data and `false` when the data is everything that remains. `returned` is the number of items in the data. `total` is the number of items that exist before any cut, or `null` when the platform does not say. `nextPageOffset` or `nextPageToken` is the continuation, and `warning` says in one sentence that the result is not complete and how to read on.
- A layer never cuts without setting them. The library sets them for every list and search result it can read (an array, or a result that the platform pages); the CLI sets them when it replaces a result, so that one field answers "is this everything?" for every layer. A result that cannot be read as a list gets none of them. The data itself is never changed by them.
- A live cursor, which has no end, reports `returned` and `nextPageToken` and no `truncated`.
- The default is the first page, loudly marked, with an explicit continuation. A capability does not return an unbounded number of items in one call by default; an explicit, bounded opt-in for more may be added by a later record.
- The descriptions of list and search capabilities name `pageSize`, `pageOffset` and `pageToken` and say that a cut result is not to be counted.

## Consequences

- A reviewer of a new list-shaped capability, or of a layer that limits a result, checks that the fields are set, and a test pins them.
- Clients are told not to count a truncated page and not to conclude that an item does not exist.
- The older markers keep their meaning: `metadata.pagination.isPartial` agrees with `truncated`, `partial` still means that items of a bulk call failed, and the replacement marker of the CLI stays and also sets the fields.
- Adding fields beside the data is additive, so no client that reads the data by key breaks. A client that ignores everything but the data still misses a cut; the fields come first and the tool descriptions name them to lower that risk.
- Not covered: choosing fields to return, a bounded opt-in for a complete result, and the size limits themselves, which are code constants that this record does not fix.

## Alternatives considered

- Wrapping the data in an object only when it was cut: changes the shape exactly when it matters, so it is not additive.
- A sentinel item at the end of the array: pollutes the data and makes every count wrong by one.
- Paging everything by default: costs tokens, repeats full reads for every page and trips rate limits; a result that is not complete and says so is safer.
