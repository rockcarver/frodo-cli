# MCP Agentic Testing Guide

This guide defines a repeatable way to score MCP tool usability for agentic workflows.

## Goals

- Minimize total tool attempts per completed task.
- Maximize first-attempt success rate.
- Minimize duplicate-tool retries caused by invocation errors.

Every tool invocation attempt counts as 1.

## Required Build Step

Before each testing cycle, rebuild the CLI binary:

```bash
npm run build
```

This ensures the local `frodo` binary used by MCP client profiles reflects current code.

## Profile Variants

Use these variants for A/B scoring:

- `agentic`: default for guided agent workflows; import/export excluded.
- `standard`: current broad non-admin baseline; export available, import excluded.
- `admin`: full exposure, including import/export.

## Recommended Scenario Mix

Use a fixed set of scenarios for all variants:

1. Read/list/count only (no mutation)
2. Read + update flow
3. Search + read follow-up
4. Domain with explicit `scope` required
5. Pagination flow (`pageSize`, `pageOffset` or `pageToken`)
6. Realm override flow
7. Export-optional task (should complete without export)
8. Historically error-prone argument contract (named arguments)
9. Cross-domain discovery then operation
10. Error-handling scenario (intentional invalid input, then correction)

## Data Collection Format

Use the template in `docs/mcp-agentic-run-log.template.json` and append one record per scenario run.

Key fields:

- `variant`: `agentic`, `standard`, or `admin`
- `scenarioId`
- `taskCompleted`: boolean
- `attempts`: ordered list of tool calls
- `failureCategory`: optional category for incomplete runs

## Scoring Script

Generate a scoreboard report:

```bash
npm run mcp:score -- --input docs/mcp-agentic-run-log.template.json
```

Optionally write output to JSON:

```bash
npm run mcp:score -- --input docs/mcp-agentic-run-log.template.json --output docs/mcp-agentic-scoreboard.json
```

## Suggested Decision Thresholds

Adopt a variant only if all are true versus baseline:

- Mean attempts/task decreases by at least 20%
- First-attempt success increases by at least 15 percentage points
- Scenario completion rate does not decrease
