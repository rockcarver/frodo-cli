# Example: Updating Agent Delete Test for Secure Credentials

This shows how to update `test/e2e/agent-delete.e2e.test.js` to use the global `getEnv()` recording/replay behavior.

## Before (Current - Hardcoded Credentials)

```javascript
import {
  clearFixture,
  getEnv,
  removeAnsiEscapeCodes,
  stageFixture,
} from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c); // ← Uses hardcoded mock connection from TestConfig

const stagedAgentImport =
  'frodo agent import -i frodo-test-ig-agent -f test/e2e/exports/all/allAlphaAgents.agent.json';
const deleteAgent = 'frodo agent delete -i frodo-test-ig-agent';
const deleteAllAgents = 'frodo agent delete -a';

describe('frodo agent delete', () => {
  beforeAll(async () => {
    if (process.env['FRODO_MOCK'] === 'record') {
      await stageFixture(stagedAgentImport, env);
    }
  });
  // ... tests ...
});
```

**Problem:** During recording, this uses the hardcoded credentials from TestConfig.js, which get embedded in the environment.

## After (Recommended - Secure Credentials)

```javascript
import {
  clearFixture,
  getEnv,
  removeAnsiEscapeCodes,
  stageFixture,
} from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
// ← Use local connection profile during recording, mock during replay
const env = getEnv(c);

const stagedAgentImport =
  'frodo agent import -i frodo-test-ig-agent -f test/e2e/exports/all/allAlphaAgents.agent.json';
const deleteAgent = 'frodo agent delete -i frodo-test-ig-agent';
const deleteAllAgents = 'frodo agent delete -a';

describe('frodo agent delete', () => {
  beforeAll(async () => {
    if (process.env['FRODO_MOCK'] === 'record') {
      await stageFixture(stagedAgentImport, env);
    }
  });
  // ... tests unchanged ...
});
```

**Key Changes:**

1. Keep using `getEnv(c)`
2. `getEnv()` now handles recording/replay mode automatically across all suites

## How This Works

### Recording (FRODO_MOCK=record)

```bash
FRODO_MOCK=record FRODO_NO_CACHE=1 npm run test:update e2e/agent-delete
```

1. `getEnv(c)` is called
2. Since `FRODO_MOCK === 'record'`, it returns:
   ```javascript
   {
     env: {
       ...process.env,
      FRODO_CONNECTION: 'frodo-dev'  // ← Use local profile
     }
   }
   ```
3. Frodo CLI loads credentials from `~/.frodo/connections.json` for `frodo-dev`
4. Real API calls use YOUR local credentials (never committed to git)
5. HTTP responses recorded to HAR files
6. HAR files committed (credentials are not visible in HAR files)

### Replay (npm run test:only)

```bash
npm run test:only e2e/agent-delete
```

1. `getEnv(c)` is called
2. Since `FRODO_MOCK !== 'record'`, it returns:
   ```javascript
   getEnv(c); // ← Use mock connection
   ```
3. Mock credentials from TestConfig.js are used (for env setup only)
4. Polly replays HTTP responses from HAR files
5. Tests run without making real API calls

## Requirements for Recording

1. **Save your connection profile:**

   ```bash
   frodo conn save https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@forgerock.com Sup3rS3cr3t! -n frodo-dev
   ```

2. **Update test file:** Change one line:

   ```javascript
   // FROM:
   const env = getEnv(c);

   // TO:
   const env = getEnv(c);
   ```

3. **Record the test:**

   ```bash
   FRODO_MOCK=record FRODO_NO_CACHE=1 npm run test:update e2e/agent-delete
   ```

4. **Verify replay works:**
   ```bash
   npm run test:only e2e/agent-delete
   ```

## Migration Path

You can gradually migrate test files:

| Test File                    | Status                 | Action                                          |
| ---------------------------- | ---------------------- | ----------------------------------------------- |
| agent-delete.e2e.test.js     | ✅ Ready               | Uses global `getEnv()` behavior                 |
| agent-web-delete.e2e.test.js | ✅ Ready               | Can keep `getEnv()` (no custom override needed) |
| other-tests.e2e.test.js      | Still using `getEnv()` | Works fine (backward compatible)                |

Old `getEnv()` calls continue to work. You can update tests incrementally.

## Benefits of This Approach

✅ **No credentials in git:** Real credentials only in `~/.frodo/connections.json` (your machine)  
✅ **Backward compatible:** Old tests using `getEnv()` still work  
✅ **Easy to understand:** Clear intent in test code  
✅ **Flexible:** Each developer can use their own profile name  
✅ **Secure HAR files:** No credentials visible in recorded HTTP responses  
✅ **Matches CLI behavior:** Uses standard `frodo conn` workflow
