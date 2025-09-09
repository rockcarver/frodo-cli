/* eslint-disable no-console */
import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
import {
  ProgressIndicatorStatusType,
  ProgressIndicatorType,
} from '@rockcarver/frodo-lib/types/utils/Console';
import { MultiBar, Presets } from 'cli-progress';
import Table from 'cli-table3';
import Color from 'colors';
import { createSpinner } from 'nanospinner';
import { v4 as uuidv4 } from 'uuid';

Color.enable();

const { appendTextToFile } = frodo.utils;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const progressBars: { [k: string]: any } = {};
let multiBarContainer = null;
let spinner = null;

/**
 * Output a message in default color to stdout or append to `state.getOutputFile()`
 * @param {string | object} message the message
 */
function data(message: string | object, newline = true) {
  if (message === null || message === undefined || message === '') return;
  if (state.getOutputFile()) {
    if (typeof message === 'object') {
      message = JSON.stringify(message, null, 2);
    }
    if (newline) {
      message += '\n';
    }
    appendTextToFile(message, state.getOutputFile());
  } else if (typeof message === 'object') {
    console.dir(message, { depth: 10, maxArrayLength: null });
  } else if (newline) {
    console.log(message);
  } else {
    process.stdout.write(message);
  }
}

/**
 * Output a default color message to stderr
 * @param {Object} message the message
 */
function text(message: string | object, newline = true) {
  if (!message) return;
  if (typeof message === 'object') {
    console.dir(message, { depth: 3 });
  } else if (newline) {
    console.error(message);
  } else {
    process.stderr.write(message);
  }
}

/**
 * Output a message in bright cyan to stderr
 * @param {Object} message the message
 */
function info(message: string | object, newline = true) {
  if (!message) return;
  if (typeof message === 'object') {
    console.dir(message, { depth: 3 });
  } else if (newline) {
    console.error(message['brightCyan']);
  } else {
    process.stderr.write(message['brightCyan']);
  }
}

/**
 * Output a message in yellow to stderr
 * @param {Object} message the message
 */
function warn(message: string | object, newline = true) {
  if (!message) return;
  if (typeof message === 'object') {
    console.dir(message, { depth: 3 });
  } else if (newline) {
    console.error(message['yellow']);
  } else {
    process.stderr.write(message['yellow']);
  }
}

/**
 * Output a message in bright red to stderr
 * @param {Object} message the message
 */
function error(message: string | object, newline = true) {
  if (!message) return;
  if (typeof message === 'object') {
    console.dir(message, { depth: 3 });
  } else if (newline) {
    console.error(message['brightRed']);
  } else {
    process.stderr.write(message['brightRed']);
  }
}

/**
 * Output a debug message
 * @param {string | object} message the message
 */
function debug(message: string | object, newline = true) {
  if (!message) return;
  if (typeof message === 'object') {
    console.dir(message, { depth: 6 });
  } else if (newline) {
    console.error(message['brightMagenta']);
  } else {
    process.stderr.write(message['brightMagenta']);
  }
}

/**
 * Output a curlirize message
 * @param {string} message the message
 */
function curlirize(message: string) {
  if (!message) return;
  console.error(message['brightBlue']);
}

/**
 * Output a message in default color to stderr
 * @param {Object} message the message
 */
export function verboseMessage(message) {
  if (!message) return;
  if (state.getVerbose()) {
    text(message);
  }
}

/**
 * Output a debug message
 * @param {Object} message the message
 */
export function debugMessage(message) {
  if (!message) return;
  if (state.getDebug()) {
    debug(message);
  }
}

/**
 * Output a curlirize message
 * @param {Object} message the message
 */
export function curlirizeMessage(message) {
  if (!message) return;
  if (state.getCurlirize()) {
    curlirize(message);
  }
}

/**
 * Prints a string message to console
 *
 * @param {string} message The string message to print
 * @param {string} [type=text] "text", "info", "warn", "error" or "data". All but
 * type="data" will be written to stderr.
 * @param {boolean} [newline=true] Whether to add a newline at the end of message
 *
 */
export function printMessage(message, type = 'text', newline = true) {
  switch (type) {
    case 'data':
      data(message, newline);
      break;
    case 'text':
      text(message, newline);
      break;
    case 'info':
      info(message, newline);
      break;
    case 'warn':
      warn(message, newline);
      break;
    case 'error':
      error(message, newline);
      break;
    default:
      text(message, newline);
  }
}

/**
 * Prints an error message from an error object and an optional custom message
 *
 * @param error error object
 */
export function printError(error: Error, message?: string) {
  if (message) printMessage('' + message, 'error');
  switch (error.name) {
    case 'FrodoError':
      printMessage('' + (error as FrodoError).getCombinedMessage(), 'error');
      break;

    case 'AxiosError': {
      const code = error['code'];
      const status = error['response'] ? error['response'].status : null;
      const message = error['response']
        ? error['response'].data
          ? error['response'].data.message
          : null
        : null;
      const detail = error['response']
        ? error['response'].data
          ? error['response'].data.detail
          : null
        : null;
      let errorMessage = 'HTTP client error';
      errorMessage += code ? `\n  Code: ${code}` : '';
      errorMessage += status ? `\n  Status: ${status}` : '';
      errorMessage += message ? `\n  Message: ${message}` : '';
      errorMessage += detail
        ? `\n  Detail: ${typeof detail === 'object' ? JSON.stringify(detail) : detail}`
        : '';
      printMessage(errorMessage, 'error');
      break;
    }

    default:
      printMessage(error.message, 'error');
      break;
  }
}

/**
 * Creates a progress bar on stderr
 *
 * Example:
 * [========================================] 100% | 49/49 | Analyzing journey - transactional_auth
 *
 * @param {number} total The total number of entries to track progress for
 * @param {string} message optional progress bar message
 * @param {object} options progress bar configuration options
 * @returns {string} progress bar reference id. Save this id to manage (update, stop) the progress bar.
 */
function createProgressBar(
  total: number,
  message: string = null,
  options: object = {
    clearOnComplete: false,
    hideCursor: true,
    format: '[{bar}] {percentage}% | {value}/{total} | {data}',
    noTTYOutput: true,
    forceRedraw: true,
    gracefulExit: true,
    stopOnComplete: true,
  }
): string {
  debugMessage(`cli.Console.createProgressBar: start`);
  let opt = options;
  if (message == null) {
    opt = {
      clearOnComplete: false,
      hideCursor: true,
      format: '[{bar}] {percentage}% | {value}/{total}',
      noTTYOutput: true,
      forceRedraw: true,
      gracefulExit: true,
      stopOnComplete: true,
    };
  }
  if (!multiBarContainer) {
    multiBarContainer = new MultiBar(opt, Presets.legacy);
    debugMessage(
      `cli.Console.createProgressBar: initialized multiBarContainer`
    );
  }
  const id = uuidv4();
  progressBars[id] = multiBarContainer.create(total, 0, {
    data: message,
  });
  debugMessage(
    `cli.Console.createProgressBar: end [${id}, ${
      Object.keys(progressBars).length
    } bars]`
  );
  return id;
}

/**
 * Updates the progress bar by 1
 * @param {string} message optional message to update the progress bar
 *
 */
function updateProgressBar(id: string, message: string = null) {
  if (!progressBars[id]) {
    warn(
      `progressBar is undefined. Make sure to call 'createProgressBar' before calling 'updateProgressBar'.`
    );
  } else if (message) {
    progressBars[id].increment({
      data: message,
    });
  } else {
    progressBars[id].increment();
  }
}

/**
 * Stop and hide the progress bar
 * @param {*} message optional message to update the progress bar
 */
function stopProgressBar(id: string, message: string = null) {
  debugMessage(`cli.Console.stopProgressBar: start [${id}]`);
  if (!progressBars[id]) {
    warn(
      `progressBar is undefined. Make sure to call 'createProgressBar' before calling 'stopProgressBar'.`
    );
  } else if (message) {
    progressBars[id].update({
      data: message,
    });
  }
  progressBars[id].stop();
  // progressBars[id].render();
  debugMessage(
    `cli.Console.stopProgressBar: end [${
      Object.keys(progressBars).length
    } bars]`
  );
}

export function stopAllProgressBars() {
  if (multiBarContainer) {
    multiBarContainer.stop();
    multiBarContainer = null;
  }
}

/**
 * Clean-up progress bars
 */
function cleanupProgressBars() {
  debugMessage(`cli.Console.cleanupProgressBars: start`);
  try {
    debugMessage(
      `cli.Console.cleanupProgressBars: stopping ${
        Object.keys(progressBars).length
      } bars`
    );
    multiBarContainer.stop();
    multiBarContainer = null;
  } catch (error) {
    // ignore
  }
  debugMessage(`cli.Console.cleanupProgressBars: end`);
}

/**
 * Create the spinner
 * @param {String} message optional spinner message
 */
export function showSpinner(message) {
  spinner = createSpinner(message).start();
}

/**
 * Stop the spinner
 * @param {String} message optional message to update the spinner
 */
export function stopSpinner(message = null) {
  if (spinner) {
    let options = {};
    if (message) options = { text: message };
    spinner.stop(options);
  }
}

/**
 * Succeed the spinner. Stop and render success checkmark with optional message.
 * @param {String} message optional message to update the spinner
 */
export function succeedSpinner(message = null) {
  if (spinner) {
    let options = {};
    if (message) options = { text: message };
    spinner.success(options);
  }
}

/**
 * Warn the spinner
 * @param {String} message optional message to update the spinner
 */
export function warnSpinner(message = null) {
  if (spinner) {
    let options = {};
    if (message) options = { text: message };
    spinner.warn(options);
  }
}

/**
 * Fail the spinner
 * @param {String} message optional message to update the spinner
 */
export function failSpinner(message = null) {
  if (spinner) {
    let options = {};
    if (message) options = { text: message };
    spinner.error(options);
  }
}

/**
 * Spin the spinner
 * @param {String} message optional message to update the spinner
 */
export function spinSpinner(message = null) {
  if (spinner) {
    let options = {};
    if (message) options = { text: message };
    spinner.update(options);
    spinner.spin();
  }
}

export function createProgressIndicator(
  type: ProgressIndicatorType = 'determinate',
  total = 0,
  message = null
): string {
  if (type === 'determinate') {
    return createProgressBar(total, message);
  } else {
    showSpinner(message);
  }
}

export function updateProgressIndicator(id: string, message: string) {
  if (!progressBars[id]) {
    spinSpinner(message);
  } else {
    updateProgressBar(id, message);
  }
}

export function stopProgressIndicator(
  id: string,
  message: string = null,
  status: ProgressIndicatorStatusType = 'none'
) {
  if (!progressBars[id]) {
    switch (status) {
      case 'none':
        stopSpinner(message);
        break;
      case 'success':
        succeedSpinner(message);
        break;
      case 'warn':
        warnSpinner(message);
        break;
      case 'fail':
        failSpinner(message);
        break;
      default:
        stopSpinner(message);
        break;
    }
  } else {
    stopProgressBar(id, message);
  }
}

export function cleanupProgressIndicators() {
  cleanupProgressBars();
}

/**
 * Create an empty table
 * @param {string[]} head header row as an array of strings
 * @returns {any} an empty table
 */
export function createTable(head) {
  const table = new Table({
    head,
    chars: {
      top: '',
      'top-mid': '',
      'top-left': '',
      'top-right': '',
      bottom: '',
      'bottom-mid': '',
      'bottom-left': '',
      'bottom-right': '',
      left: '',
      'left-mid': '',
      mid: '',
      'mid-mid': '',
      right: '',
      'right-mid': '',
    },
    style: { 'padding-left': 0, 'padding-right': 0, head: ['brightCyan'] },
  });
  return table;
}

/**
 * Create a new key/value table
 * @returns {any} an empty key/value table
 */
export function createKeyValueTable() {
  const table = new Table({
    chars: {
      top: '',
      'top-mid': '',
      'top-left': '',
      'top-right': '',
      bottom: '',
      'bottom-mid': '',
      'bottom-left': '',
      'bottom-right': '',
      left: '',
      'left-mid': '',
      mid: '',
      'mid-mid': '',
      right: '',
      'right-mid': '',
    },
    style: { 'padding-left': 0, 'padding-right': 0 },
    wordWrap: true,
  });
  return table;
}

/**
 * Helper function to determine the total depth of an object
 * @param {Object} object input object
 * @returns {Number} total depth of the input object
 */
function getObjectDepth(object) {
  return Object(object) === object
    ? 1 + Math.max(-1, ...Object.values(object).map(getObjectDepth))
    : 0;
}

/**
 * Helper function to determine if an object has values
 * @param {Object} object input object
 * @returns {boolean} true of the object or any of its sub-objects contain values, false otherwise
 */
function hasValues(object) {
  let has = false;
  const keys = Object.keys(object);
  for (const key of keys) {
    if (Object(object[key]) !== object[key]) {
      return true;
    }
    has = has || hasValues(object[key]);
  }
  return has;
}

/**
 * Helper function (recursive) to add rows to an object table
 * @param {object} object object to render
 * @param {number} depth total depth of initial object
 * @param {number} level current level
 * @param {any} table the object table to add the rows to
 * @param {Object} keyMap optional JSON map to map raw config names to human readable names {'raw': 'readable'}
 * @returns the updated object table
 */
function addRows(object, depth, level, table, keyMap) {
  const space = '  ';
  const keys = Object.keys(object);
  for (const key of keys) {
    if (Object(object[key]) !== object[key]) {
      if (level === 1) {
        table.push([
          keyMap[key] ? keyMap[key].brightCyan : key['brightCyan'],
          object[key],
        ]);
      } else {
        table.push([
          {
            hAlign: 'right',
            content: keyMap[key] ? keyMap[key].gray : key.gray,
          },
          object[key],
        ]);
      }
    }
  }
  for (const key of keys) {
    if (Object(object[key]) === object[key]) {
      // only print header if there are any values below
      if (hasValues(object[key])) {
        let indention = new Array(level).fill(space).join('');
        if (level < 3) indention = `\n${indention}`;
        table.push([
          indention.concat(
            keyMap[key] ? keyMap[key].brightCyan : key['brightCyan']
          ),
          '',
        ]);
      }
      // eslint-disable-next-line no-param-reassign
      table = addRows(object[key], depth, level + 1, table, keyMap);
    }
  }
  return table;
}

/**
 * Create and populate an object table from any JSON object. Use for describe commands.
 * @param {Object} object JSON object to create
 * @param {Object} keyMap optional JSON map to map raw config names to human readable names {'raw': 'readable'}
 * @returns {any} a table that can be printed to the console
 */
export function createObjectTable(object, keyMap = {}) {
  // eslint-disable-next-line no-param-reassign
  const depth = getObjectDepth(object);
  // eslint-disable-next-line no-param-reassign
  const level = 0;
  // eslint-disable-next-line no-param-reassign
  const table = new Table({
    chars: {
      top: '',
      'top-mid': '',
      'top-left': '',
      'top-right': '',
      bottom: '',
      'bottom-mid': '',
      'bottom-left': '',
      'bottom-right': '',
      left: '',
      'left-mid': '',
      mid: '',
      'mid-mid': '',
      right: '',
      'right-mid': '',
    },
    style: { 'padding-left': 0, 'padding-right': 0, head: ['brightCyan'] },
  });
  addRows(object, depth, level + 1, table, keyMap);
  return table;
}
