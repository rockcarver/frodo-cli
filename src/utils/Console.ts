/* eslint-disable no-console */
import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
import {
  ProgressIndicatorStatusType,
  ProgressIndicatorType,
} from '@rockcarver/frodo-lib/types/utils/Console';
import Table from 'cli-table3';
import Color from 'colors';
import { stderr as logUpdateStderr } from 'log-update';
import c from 'tinyrainbow';
import { v4 as uuidv4 } from 'uuid';

Color.enable();
const arcSpinner = {
  frames: ['◜', '◠', '◝', '◞', '◡', '◟'],
};

const { appendTextToFile } = frodo.utils;

const indicators = new Map<string, any>();
let renderInterval: NodeJS.Timeout | null = null;

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
  if (indicators.size > 0) {
    logUpdateStderr.clear();
  }

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

  // Render progress indicators after message
  if (indicators.size > 0) {
    renderProgressIndicators();
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
 * Render progress indicators
 */
function renderProgressIndicators() {
  if (process.env.FRODO_TEST === '1') return;
  const lines: string[] = [];

  for (const ind of indicators.values()) {
    if (ind.type === 'determinate') {
      const percent =
        ind.total > 0 ? Math.floor((ind.current / ind.total) * 100) : 0;
      const barWidth = 40;
      const filledWidth = Math.floor((percent / 100) * barWidth);
      const emptyWidth = barWidth - filledWidth;

      const filledBar = '█'.repeat(filledWidth);
      const emptyBar = '░'.repeat(emptyWidth);
      const bar = c.cyan(`[${filledBar}${emptyBar}]`);

      const stats = c.dim(`${percent}% | ${ind.current}/${ind.total}`);
      const msg = ind.message ? ` ${ind.message}` : '';
      lines.push(`${bar} ${stats}${msg}`);
    } else {
      const frame = ind.spinner.frames[ind.frame % ind.spinner.frames.length];
      const spinnerIcon = c.cyan(frame);
      const msg = ind.message ? ` ${ind.message}` : '';

      lines.push(`${spinnerIcon}${msg}`);
    }
  }

  logUpdateStderr(lines.join('\n'));
}

/**
 * Start the render loop for spinners
 */
function startRenderLoop() {
  if (renderInterval) return;

  renderInterval = setInterval(() => {
    for (const ind of indicators.values()) {
      if (ind.type === 'indeterminate') {
        ind.frame++;
      }
    }
    renderProgressIndicators();
  }, 80);
}

/**
 * Stop the render loop
 */
function stopRenderLoop() {
  if (renderInterval) {
    clearInterval(renderInterval);
    renderInterval = null;
  }
}

export function showSpinner(message: string) {
  return createProgressIndicator('indeterminate', 0, message);
}

export function succeedSpinner(message: string) {
  const id = createProgressIndicator('indeterminate', 0, message);
  stopProgressIndicator(id, message, 'success');
}

export function failSpinner(message: string) {
  const id = createProgressIndicator('indeterminate', 0, message);
  stopProgressIndicator(id, message, 'fail');
}

/**
 * Creates a progress indicator
 * @param {ProgressIndicatorType} type type of progress indicator (determinate or indeterminate)
 * @param {number} [total] total amount of work for determinate indicators
 * @param {string} [message] message to display alongside the indicator
 * @returns {string} unique ID associated with the created progress indicator
 */

export function createProgressIndicator(
  type: ProgressIndicatorType,
  total: number = 0,
  message: string = ''
): string {
  const id = uuidv4();
  debugMessage(`createProgressIndicator: start [${id}]`);
  indicators.set(id, {
    id,
    type,
    message,
    spinner: arcSpinner,
    frame: 0,
    total,
    current: 0,
  });
  startRenderLoop();
  renderProgressIndicators();
  debugMessage(`createProgressIndicator: end [${id}]`);
  return id;
}

/**
 * Updates the progress indicator
 * @param {string} id unique ID associated with the progress indicator
 * @param {string} [message] message to display alongside the indicator
 * @param {number} [current] current progress value for determinate indicators
 * @param {number} [total] total amount of work for determinate indicators
 */
export function updateProgressIndicator(
  id: string,
  message?: string,
  current?: number,
  total?: number
) {
  const ind = indicators.get(id);
  if (!ind) {
    warn(`Progress indicator ${id} not found.`);
    return;
  }
  if (message !== undefined) ind.message = message;
  if (total !== undefined) ind.total = total;
  if (ind.type === 'determinate') {
    if (current !== undefined) {
      ind.current = current;
    } else {
      ind.current = Math.min(ind.current + 1, ind.total);
    }
  }
  renderProgressIndicators();
}

/**
 * Stop and remove the progress indicator
 * @param {string} id unique ID associated with the progress indicator
 * @param {string} [message] message to display alongside the indicator
 * @param {ProgressIndicatorStatusType} [status='none'] status type for indeterminate indicators
 */
export function stopProgressIndicator(
  id: string,
  message?: string,
  status: ProgressIndicatorStatusType = 'none'
) {
  debugMessage(`stopProgressIndicator: start [${id}]`);

  const ind = indicators.get(id);
  if (!ind) {
    warn(`Progress indicator ${id} not found.`);
    return;
  }

  if (message || status !== 'none') {
    logUpdateStderr.clear();
    let statusIcon = '';
    let colorFn = (s: string) => s;

    switch (status) {
      case 'success':
        statusIcon = '✔';
        colorFn = c.green;
        break;
      case 'warn':
        statusIcon = '⚠';
        colorFn = c.yellow;
        break;
      case 'fail':
        statusIcon = '✖';
        colorFn = c.red;
        break;
      default:
        statusIcon = '•';
        colorFn = c.white;
    }
    const finalMsg = message || ind.message;
    if (finalMsg) {
      console.error(colorFn(`${statusIcon} ${finalMsg}`));
    }
  }
  indicators.delete(id);
  if (indicators.size === 0) {
    stopRenderLoop();
    logUpdateStderr.clear();
    logUpdateStderr.done();
  } else {
    renderProgressIndicators();
  }
  debugMessage(`stopProgressIndicator end [${id}]`);
}

/**
 * Clean up all progress indicators
 */
export function cleanupProgressIndicators() {
  debugMessage(`cleanupProgressIndicators: start`);
  stopRenderLoop();
  indicators.clear();
  logUpdateStderr.clear();
  logUpdateStderr.done();
  debugMessage(`cleanupProgressIndicators end`);
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
