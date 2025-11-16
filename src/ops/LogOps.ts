import { frodo, state } from '@rockcarver/frodo-lib';
import { type LogEventPayloadSkeleton } from '@rockcarver/frodo-lib/types/api/cloud/LogApi';

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

const {
  getLogApiKeys,
  createLogApiKey,
  fetch,
  tail,
  getDefaultNoiseFilter,
  resolvePayloadLevel,
  deleteLogApiKey: _deleteLogApiKey,
  deleteLogApiKeys: _deleteLogApiKeys,
} = frodo.cloud.log;

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
        const resp = await createLogApiKey(keyName);
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

export async function deleteLogApiKeys() {
  let outcome = false;
  debugMessage(`cli.LogOps.deleteKeys: start`);
  showSpinner(`Deleting all keys...`);
  try {
    const response = await _deleteLogApiKeys();
    succeedSpinner(`Deleted ${response.length} keys.`);
    outcome = true;
  } catch (error) {
    failSpinner(`Error deleting keys`);
    printError(error);
  }
  debugMessage(`cli.LogOps.deleteKeys: end [${outcome}]`);
  return outcome;
}

export async function tailLogs(
  source: string,
  levels: string[],
  txid: string,
  cookie: string,
  nf: string[]
) {
  try {
    const logsObject = await tail(source, cookie);
    let filteredLogs = [];
    const noiseFilter = nf == null ? getDefaultNoiseFilter() : nf;
    if (Array.isArray(logsObject.result)) {
      filteredLogs = logsObject.result.filter(
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
    }

    filteredLogs.forEach((e) => {
      printMessage(JSON.stringify(e), 'data');
    });

    setTimeout(() => {
      tailLogs(source, levels, txid, logsObject.pagedResultsCookie, nf);
    }, 5000);
  } catch (error) {
    printError(error);
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
