import {
  frodo,
  state,
  type LogApiKey,
  type LogEventPayloadSkeleton,
  type LogTailStream,
} from '@rockcarver/frodo-lib';
import {
  createTable,
  debugMessage,
  failSpinner,
  printError,
  printMessage,
  showSpinner,
  succeedSpinner,
  verboseMessage,
} from '../utils/Console';
import { OperationRun } from '../utils/OperationRun';
import { getTokens } from './AuthenticateOps';

const {
  getLogApiKeys,
  createLogApiKey,
  fetch,
  createLogTailStream,
  getDefaultNoiseFilter,
  resolvePayloadLevel,
  deleteLogApiKey: _deleteLogApiKey,
} = frodo.cloud.log;
const { getConnectionProfile, saveConnectionProfile } = frodo.conn;

/**
 * Resolves and applies Log API credentials onto `state`, in priority
 * order: explicit username/password on the command line, an existing
 * connection profile's saved log API key/secret, environment variables,
 * or (if the profile has admin username/password instead) provisioning a
 * fresh log API key on the fly. Shared by `frodo log tail` and
 * `frodo debug` — both need exactly this bootstrap before they can call
 * the Log API at all.
 * @returns whether usable Log API credentials ended up on `state`.
 */
export async function ensureLogApiCredentials(
  deploymentTypes: string[]
): Promise<boolean> {
  // Fail fast and clearly on a genuinely absent host -- unlike getTokens()'s
  // implicit path, this bootstrap resolves a connection profile directly
  // and has no guard of its own otherwise, so a missing host would
  // silently fall through to whatever profile matches an empty search
  // instead of reporting the real problem before any network call.
  if (!state.getHost()) {
    printMessage(
      'No host specified. Provide a host URL, or a unique substring/alias identifying a saved connection profile.',
      'error'
    );
    return false;
  }
  const conn = await getConnectionProfile();
  if (conn) state.setHost(conn.tenant);

  if (state.getUsername() && state.getPassword()) {
    verboseMessage(`Using log api credentials from command line.`);
    state.setLogApiKey(state.getUsername());
    state.setLogApiSecret(state.getPassword());
    return true;
  }
  if (conn && conn.logApiKey != null && conn.logApiSecret != null) {
    verboseMessage(`Using log api credentials from connection profile.`);
    state.setLogApiKey(conn.logApiKey);
    state.setLogApiSecret(conn.logApiSecret);
    return true;
  }
  if (state.getLogApiKey() && state.getLogApiSecret()) {
    verboseMessage(`Using log api credentials from environment variables.`);
    return true;
  }
  if (conn && conn.username && conn.password) {
    printMessage(
      `Found admin credentials in connection profile, attempting to create log api credentials...`
    );
    state.setUsername(conn.username);
    state.setPassword(conn.password);
    if (await getTokens(true, true, deploymentTypes)) {
      const creds = await provisionCreds();
      state.setLogApiKey(creds.api_key_id as string);
      state.setLogApiSecret(creds.api_key_secret as string);
      try {
        await saveConnectionProfile(state.getHost());
      } catch (error) {
        printError(error);
      }
      return true;
    }
    printMessage(`Unable to create log api credentials.`);
  }
  return false;
}

export async function listLogApiKeys(long = false): Promise<boolean> {
  let outcome = false;
  try {
    const keys = await getLogApiKeys();
    if (long) {
      const table = createTable(['Key Id', 'Name', 'Created at']);
      for (const key of keys) {
        table.push([key.api_key_id, key.name, key.created_at]);
      }
      printMessage(table.toString(), 'data');
    } else {
      for (const key of keys) {
        printMessage(`${key.api_key_id}`, 'data');
      }
    }
    outcome = true;
  } catch (error) {
    printError(error);
  }
  return outcome;
}

export async function provisionCreds() {
  try {
    let keyName = `frodo-${state.getUsername()}`;
    try {
      const keys = await getLogApiKeys();
      for (const key of keys) {
        if (key.name === keyName) {
          // append current timestamp to name if the named key already exists
          keyName = `${keyName}-${new Date().toISOString()}`;
        }
      }
      try {
        const resp: LogApiKey = await createLogApiKey(keyName);
        verboseMessage(
          `Created a new log API key [${keyName}] in ${state.getHost()}`
        );
        return resp;
      } catch (error) {
        printError(error);
        return null;
      }
    } catch (error) {
      printError(error);
      return null;
    }
  } catch (error) {
    printError(error);
    return null;
  }
}

export async function deleteLogApiKey(keyId) {
  let outcome = false;
  debugMessage(`cli.LogOps.deleteKey: start`);
  showSpinner(`Deleting ${keyId}...`);
  try {
    await _deleteLogApiKey(keyId);
    succeedSpinner(`Deleted ${keyId}.`);
    outcome = true;
  } catch (error) {
    failSpinner(`Error deleting ${keyId}`);
    printError(error);
  }
  debugMessage(`cli.LogOps.deleteKey: end [${outcome}]`);
  return outcome;
}

/**
 * Delete all log API keys
 * @param {boolean} allowFailures true to report keys that could not be deleted but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteLogApiKeys(allowFailures = false) {
  let outcome = false;
  debugMessage(`cli.LogOps.deleteKeys: start`);
  showSpinner(`Deleting all keys...`);
  try {
    const keys = await getLogApiKeys();
    const run = new OperationRun({ unit: 'key', allowFailures });
    for (const key of keys) {
      await run.run(key.name || key.api_key_id, async () => {
        await _deleteLogApiKey(key.api_key_id);
      });
    }
    if (run.hasFailures) {
      failSpinner(`Some keys could not be deleted`);
    } else {
      succeedSpinner(`Deleted ${keys.length} keys.`);
    }
    outcome = run.finish();
  } catch (error) {
    failSpinner(`Error deleting keys`);
    printError(error);
  }
  debugMessage(`cli.LogOps.deleteKeys: end [${outcome}]`);
  return outcome;
}

function logPollError(error: unknown) {
  type Link = {
    httpStatus?: number;
    response?: { status?: number; headers?: Record<string, unknown> };
    originalErrors?: unknown[];
  };
  let status: number | undefined;
  let reset: unknown;
  const seen = new Set<unknown>();
  const visit = (error: unknown) => {
    if (!error || typeof error !== 'object' || seen.has(error)) return;
    seen.add(error);
    const link = error as Link;
    const code = link.response?.status ?? link.httpStatus;
    if (status == null || code === 401 || code === 403) status = code;
    for (const [name, value] of Object.entries(link.response?.headers ?? {})) {
      if (name.toLowerCase() === 'x-ratelimit-reset') reset = value;
    }
    if (Array.isArray(link.originalErrors)) link.originalErrors.forEach(visit);
  };
  visit(error);
  return { status, reset };
}

export async function tailLogs(
  source: string,
  levels: string[],
  txid: string,
  nf: string[],
  stream?: LogTailStream,
  {
    keepTrying = false,
    sleep = (milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
    now = Date.now,
  } = {}
): Promise<boolean> {
  const tailStream = stream ?? createLogTailStream(source);
  let failures = 0;
  let pauses = 0;
  let outageSince = 0;
  for (;;) {
    let delay = 5000;
    try {
      const events = await tailStream.poll();
      const noiseFilter = nf == null ? getDefaultNoiseFilter() : nf;
      const filteredLogs = events.filter(
        (el) =>
          !noiseFilter.includes(
            (el.payload as LogEventPayloadSkeleton).logger
          ) &&
          !noiseFilter.includes(el.type) &&
          (levels[0] === 'ALL' || levels.includes(resolvePayloadLevel(el))) &&
          (typeof txid === 'undefined' ||
            txid === null ||
            (el.payload as LogEventPayloadSkeleton).transactionId?.includes(
              txid
            ))
      );

      filteredLogs.forEach((e) => {
        printMessage(JSON.stringify(e), 'data');
      });
      if (failures > 0) {
        printMessage(
          `Log API is responding again after ${failures} failed polls.`
        );
        if (now() - outageSince > 15000) {
          printMessage(
            'Events from the outage may be missing: the Log API returns only recent events to a tail.',
            'warn'
          );
        }
      }
      failures = 0;
      pauses = 0;
    } catch (error) {
      const { status, reset } = logPollError(error);
      delay = [5000, 10000, 20000, 30000][Math.min(pauses++, 3)];
      if (status === 429) {
        if (reset != null && reset !== '' && Number.isFinite(Number(reset))) {
          delay = Math.min(
            60000,
            Math.max(5000, Math.ceil(Number(reset) * 1000 - now() + 1000))
          );
        }
        printMessage(
          `Log API rate limit reached (60 requests per minute for the environment, shared with everything that reads its logs). Waiting ${Math.ceil(delay / 1000)} seconds.`,
          'warn'
        );
      } else {
        if (failures === 0) {
          outageSince = now();
          printError(error);
        }
        if (status === 401 || status === 403) {
          printMessage(
            `Log API credentials refused (HTTP ${status}). Stopping log tail.`,
            'error'
          );
          return false;
        }
        failures++;
        if (!keepTrying && failures >= 5) {
          printMessage(
            'Stopping log tail after 5 failed polls in a row. Use --keep-trying to keep following through outages.',
            'error'
          );
          return false;
        }
        printMessage(
          `Log API unreachable${status ? ` (HTTP ${status})` : ''}, retrying in ${delay / 1000} seconds (failure ${failures} in a row). Ctrl-C stops.`,
          'warn'
        );
      }
    }
    await sleep(delay);
  }
}

export async function fetchLogs(
  source: string,
  startTs: string,
  endTs: string,
  levels: string[],
  txid: string,
  filter: string,
  ffString: string,
  cookie: string,
  nf: string[]
) {
  try {
    const logsObject = await fetch(
      source,
      startTs,
      endTs,
      cookie,
      txid,
      filter
    );
    let filteredLogs = [];
    const noiseFilter = nf == null ? getDefaultNoiseFilter() : nf;
    if (Array.isArray(logsObject.result)) {
      filteredLogs = logsObject.result.filter(
        (el) =>
          !noiseFilter.includes(
            (el.payload as LogEventPayloadSkeleton).logger
          ) &&
          !noiseFilter.includes(el.type) &&
          (levels[0] === 'ALL' || levels.includes(resolvePayloadLevel(el)))
      );
    }

    filteredLogs.forEach((e) => {
      const log = JSON.stringify(e, null, 2);
      if (ffString) {
        if (log.includes(ffString)) {
          printMessage(log, 'data');
        }
      } else {
        printMessage(log, 'data');
      }
    });
    if (logsObject.pagedResultsCookie != null) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await fetchLogs(
        source,
        startTs,
        endTs,
        levels,
        txid,
        filter,
        ffString,
        logsObject.pagedResultsCookie,
        nf
      );
    }
  } catch (error) {
    printError(error);
  }
}
