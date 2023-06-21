import { frodo, state } from '@rockcarver/frodo-lib';
import type { LogEventPayloadSkeleton } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import {
  createTable,
  debugMessage,
  failSpinner,
  printMessage,
  showSpinner,
  succeedSpinner,
  verboseMessage,
} from '../utils/Console';

export async function listLogApiKeys(long = false): Promise<boolean> {
  let outcome = false;
  try {
    const keys = await frodo.cloud.log.getLogApiKeys();
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
    printMessage(`Error listing log API keys: ${error}`, 'error');
  }
  return outcome;
}

export async function provisionCreds() {
  try {
    let keyName = `frodo-${state.getUsername()}`;
    try {
      const keys = await frodo.cloud.log.getLogApiKeys();
      for (const key of keys) {
        if (key.name === keyName) {
          // append current timestamp to name if the named key already exists
          keyName = `${keyName}-${new Date().toISOString()}`;
        }
      }
      try {
        const resp = await frodo.cloud.log.createLogApiKey(keyName);
        // if (resp.name !== keyName) {
        //   printMessage(
        //     `create keys ERROR: could not create log API key ${keyName} [new key name: ${resp.name}]`,
        //     'error'
        //   );
        //   return null;
        // }
        verboseMessage(
          `Created a new log API key [${keyName}] in ${state.getHost()}`
        );
        return resp;
      } catch (error) {
        printMessage(
          `create keys ERROR: create keys call returned ${error}`,
          'error'
        );
        return null;
      }
    } catch (error) {
      printMessage(`get keys ERROR: get keys call returned ${error}`, 'error');
    }
  } catch (e) {
    printMessage(`create keys ERROR: create keys data error - ${e}`, 'error');
    return null;
  }
}

export async function deleteLogApiKey(keyId) {
  let outcome = false;
  debugMessage(`cli.LogOps.deleteKey: start`);
  showSpinner(`Deleting ${keyId}...`);
  try {
    await frodo.cloud.log.deleteLogApiKey(keyId);
    succeedSpinner(`Deleted ${keyId}.`);
    outcome = true;
  } catch (error) {
    failSpinner(`Error deleting ${keyId}: ${error.message}`);
  }
  debugMessage(`cli.LogOps.deleteKey: end [${outcome}]`);
  return outcome;
}

export async function deleteLogApiKeys() {
  let outcome = false;
  debugMessage(`cli.LogOps.deleteKeys: start`);
  showSpinner(`Deleting all keys...`);
  try {
    const response = await frodo.cloud.log.deleteLogApiKeys();
    succeedSpinner(`Deleted ${response.length} keys.`);
    outcome = true;
  } catch (error) {
    failSpinner(`Error deleting keys: ${error.message}`);
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
    const logsObject = await frodo.cloud.log.tail(source, cookie);
    let filteredLogs = [];
    const noiseFilter =
      nf == null ? frodo.cloud.log.getDefaultNoiseFilter() : nf;
    if (Array.isArray(logsObject.result)) {
      filteredLogs = logsObject.result.filter(
        (el) =>
          !noiseFilter.includes(
            (el.payload as LogEventPayloadSkeleton).logger
          ) &&
          !noiseFilter.includes(el.type) &&
          (levels[0] === 'ALL' ||
            levels.includes(frodo.cloud.log.resolvePayloadLevel(el))) &&
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
    return null;
  } catch (e) {
    printMessage(`tail ERROR: tail data error - ${e}`, 'error');
    return `tail ERROR: tail data error - ${e}`;
  }
}

export async function fetchLogs(
  source: string,
  startTs: string,
  endTs: string,
  levels: string[],
  txid: string,
  ffString: string,
  cookie: string,
  nf: string[]
) {
  try {
    const logsObject = await frodo.cloud.log.fetch(
      source,
      startTs,
      endTs,
      cookie
    );
    let filteredLogs = [];
    const noiseFilter =
      nf == null ? frodo.cloud.log.getDefaultNoiseFilter() : nf;
    if (Array.isArray(logsObject.result)) {
      filteredLogs = logsObject.result.filter(
        (el) =>
          !noiseFilter.includes(
            (el.payload as LogEventPayloadSkeleton).logger
          ) &&
          !noiseFilter.includes(el.type) &&
          (levels[0] === 'ALL' ||
            levels.includes(frodo.cloud.log.resolvePayloadLevel(el))) &&
          (typeof txid === 'undefined' ||
            txid === null ||
            (el.payload as LogEventPayloadSkeleton).transactionId?.includes(
              txid
            ))
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
      await fetchLogs(
        source,
        startTs,
        endTs,
        levels,
        txid,
        ffString,
        logsObject.pagedResultsCookie,
        nf
      );
    }
    return null;
  } catch (e) {
    printMessage(`fetch ERROR: fetch data error - ${e}`, 'error');
    return `fetch ERROR: fetch data error - ${e}`;
  }
}
