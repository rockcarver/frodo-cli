import { LogEventPayloadSkeleton } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import { printMessage, verboseMessage } from '../utils/Console';
import { Log, state } from '@rockcarver/frodo-lib';

const {
  getDefaultNoiseFilter,
  tail,
  fetch,
  getLogApiKeys,
  resolvePayloadLevel,
  createAPIKeyAndSecret,
} = Log;

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
    return null;
  } catch (e) {
    printMessage(`tail ERROR: tail data error - ${e}`, 'error');
    return `tail ERROR: tail data error - ${e}`;
  }
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
        const resp = await createAPIKeyAndSecret(keyName);
        if (resp.name !== keyName) {
          printMessage(
            `create keys ERROR: could not create log API key ${keyName}`,
            'error'
          );
          return null;
        }
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
    const logsObject = await fetch(source, startTs, endTs, cookie);
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
