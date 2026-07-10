# Recording Instructions for Agent Delete Tests

## Overview

The agent delete tests now use `beforeAll`/`afterAll` with recording mode guards (following the frodo-lib AgentOps.test.ts pattern). This means:

- **Recording mode**: Import agent once in beforeAll, record all test API calls, cleanup in afterAll
- **Replay mode**: No setup/teardown, tests replay recorded HAR files directly

## Recording Process

Run each delete test in record mode to capture the complete flow:

```bash
# Record agent-delete tests
FRODO_MOCK=record FRODO_NO_CACHE=1 npm run test:update e2e/agent-delete

# Record other delete tests
FRODO_MOCK=record FRODO_NO_CACHE=1 npm run test:update e2e/agent-web-delete
FRODO_MOCK=record FRODO_NO_CACHE=1 npm run test:update e2e/agent-java-delete
FRODO_MOCK=record FRODO_NO_CACHE=1 npm run test:update e2e/agent-gateway-delete
FRODO_MOCK=record FRODO_NO_CACHE=1 npm run test:update e2e/agent-ai-delete
```

## What Happens During Recording

1. **beforeAll**: Imports agent(s) and creates them in the test environment
2. **Test 1-4**: Each test runs and records API calls with Polly
3. **afterAll**: Deletes agents and cleans up

All API calls are recorded in the test's mock HAR directory.

## Validation in Replay Mode

After recording, validate with replay (normal test run):

```bash
npm run test:only e2e/agent-delete
npm run test:only e2e/agent-web-delete
npm run test:only e2e/agent-java-delete
npm run test:only e2e/agent-gateway-delete
npm run test:only e2e/agent-ai-delete
```

All tests should pass because Polly will replay the recorded responses.

## Key Differences from Previous Approach

- ✅ Import and delete only happen ONCE per suite (beforeAll/afterAll), not per test (beforeEach/afterEach)
- ✅ No inter-test interference because setup/cleanup only runs in recording mode
- ✅ Cleaner test isolation and sequencing
- ✅ Matches frodo-lib testing pattern for multi-phase destructive tests
