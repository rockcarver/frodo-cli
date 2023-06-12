/* eslint-disable no-console */
import { MultiBar, Presets } from 'cli-progress';
import { createSpinner } from 'nanospinner';
import Table from 'cli-table3';
import { frodo, state } from '@rockcarver/frodo-lib';
import Color from 'colors';

Color.enable();

let multiBarContainer = null;
let progressBar = null;
let spinner = null;

/**
 * Output a message in default color to stdout or append to `state.getOutputFile()`
 * @param {string | object} message the message
 */
function data(message: string | object, newline = true) {
  if (!message) return;
  if (state.getOutputFile()) {
    if (typeof message === 'object') {
      message = JSON.stringify(message, null, 2);
    }
    if (newline) {
      message += '\n';
    }
    frodo.utils.impex.appendTextToFile(message, state.getOutputFile());
  } else if (typeof message === 'object') {
    console.dir(message, { depth: 3 });
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
 * Creates a progress bar on stderr
 *
 * Example:
 * [========================================] 100% | 49/49 | Analyzing journey - transactional_auth
 *
 * @param {Number} total The total number of entries to track progress for
 * @param {String} message optional progress bar message
 * @param {Object} options progress bar configuration options
 *
 */
export function createProgressBar(
  total,
  message = null,
  options = {
    format: '[{bar}] {percentage}% | {value}/{total} | {data}',
    noTTYOutput: true,
  }
) {
  let opt = options;
  if (message == null) {
    opt = {
      format: '[{bar}] {percentage}% | {value}/{total}',
      noTTYOutput: true,
    };
  }
  // progressBar = new SingleBar(opt, Presets.legacy); // create only when needed
  // progressBar.start(total, 0, {
  //   data: message,
  // });
  multiBarContainer = new MultiBar(opt, Presets.legacy);
  progressBar = multiBarContainer.create(total, 0, {
    data: message,
  });
}

/**
 * Updates the progress bar by 1
 * @param {string} message optional message to update the progress bar
 *
 */
export function updateProgressBar(message = null) {
  if (message)
    progressBar.increment({
      data: message,
    });
  else progressBar.increment();
}

/**
 * Stop and hide the progress bar
 * @param {*} message optional message to update the progress bar
 */
export function stopProgressBar(message = null) {
  if (message)
    progressBar.update({
      data: message,
    });
  // progressBar.stop();
  multiBarContainer.stop();
  multiBarContainer = null;
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
  type = 'determinate',
  total = 0,
  message = null
) {
  if (type === 'determinate') {
    createProgressBar(total, message);
  } else {
    showSpinner(message);
  }
}

export function updateProgressIndicator(message) {
  if (!progressBar) {
    spinSpinner(message);
  } else {
    updateProgressBar(message);
  }
}

export function stopProgressIndicator(message, status = 'none') {
  if (!progressBar) {
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
    stopProgressBar(message);
  }
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
