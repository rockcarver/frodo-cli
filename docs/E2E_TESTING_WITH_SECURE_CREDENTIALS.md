# E2E Testing with Secure Credentials

## Overview

Use local frodo connection profiles for recording and HAR replay for normal test runs.

- Recording mode (`FRODO_MOCK=record`): use local profile `frodo-dev`
- Replay mode (`FRODO_MOCK=1` or default): use HAR playback

This prevents real credentials from being committed to git.

## Setup

### 1) Save local profile

```bash
frodo conn save https://openam-frodo-dev.forgeblocks.com/am <username> <password> -n frodo-dev
```

Profile is stored locally in `~/.frodo/connections.json`.

### 2) Use `getEnv()` in tests

```javascript
// old
const env = getEnv(connection);

// new
const env = getEnv(connection);
```

### 3) Record

```bash
FRODO_MOCK=record FRODO_NO_CACHE=1 npm run test:update e2e/your-test-file
```

### 4) Replay verify

```bash
npm run test:only e2e/your-test-file
```

## Behavior

Recording (`FRODO_MOCK=record`):

- `getEnv()` prefers profile-based auth (`FRODO_CONNECTION`), defaulting to the requested profile/host and then `frodo-dev`
- If profile exists in `test/e2e/env/Connections.json`, it sets `FRODO_CONNECTION_PROFILES_PATH` and `FRODO_MASTER_KEY_PATH`
- If that file/profile is unavailable, frodo falls back to standard `~/.frodo/Connections.json`
- Polly records HAR responses

Replay:

- `getEnv()` keeps mock env values for deterministic HAR replay
- Polly replays HAR files
- No real API auth needed

## Verify local profile

```bash
frodo conn list
FRODO_CONNECTION=frodo-dev frodo config describe
```

## Troubleshooting

- Connection profile not found:

```bash
frodo conn list
frodo conn save <host> <user> <password> -n frodo-dev
```

- HAR shows oauth2 400 errors:

```bash
jq '.log.entries[0].response.content.text' test/e2e/mocks/*/oauth2_*/recording.har
```

Common causes:

- `Unknown JWT issuer`: issuer not trusted by test environment
- `invalid_scope`: requested service account scope unsupported
