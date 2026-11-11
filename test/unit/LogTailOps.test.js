import { jest } from '@jest/globals';

const createLogTailStream = jest.fn();
const printMessage = jest.fn();
const printError = jest.fn();
const resolvePayloadLevel = jest.fn(() => 'INFO');

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    cloud: {
      log: {
        createLogTailStream,
        getDefaultNoiseFilter: () => ['noise'],
        resolvePayloadLevel,
      },
    },
    conn: {},
  },
  state: {},
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  createTable: jest.fn(),
  debugMessage: jest.fn(),
  failSpinner: jest.fn(),
  printError,
  printMessage,
  showSpinner: jest.fn(),
  succeedSpinner: jest.fn(),
  verboseMessage: jest.fn(),
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/OperationRun', () => ({
  OperationRun: jest.fn(),
}));

const { tailLogs } = await import('../../src/ops/LogOps');
const STOP = new Error('test stopped after the last scheduled pause');
const event = (id, logger = 'test', transactionId = 'tx-1') => ({
  _id: id,
  type: 'test',
  payload: { logger, transactionId },
});
const httpError = (status, headers) =>
  Object.assign(new Error(`HTTP ${status}`), {
    name: 'AxiosError',
    response: { status, headers },
  });
const wrapped = (error, httpStatus = null) =>
  Object.assign(new Error('Error fetching logs'), {
    name: 'FrodoError',
    httpStatus,
    originalErrors: [error],
  });

function follow(steps, options = {}, filters = {}) {
  const queue = [...steps];
  let time = 1700000000000;
  const poll = jest.fn(async () => {
    if (!queue.length) throw new Error('unexpected extra poll');
    const step = queue.shift();
    if (step instanceof Error) throw step;
    return step;
  });
  const sleep = jest.fn(async (delay) => {
    time += delay;
    if (!queue.length) throw STOP;
  });
  const stream = { poll };
  createLogTailStream.mockReturnValue(stream);
  const result = tailLogs(
    'am-core',
    filters.levels ?? ['ALL'],
    filters.txid,
    filters.nf ?? null,
    options.injectStream ? stream : undefined,
    { keepTrying: options.keepTrying, sleep, now: () => time }
  );
  return { result, poll, sleep, stream };
}
const delays = (run) => run.sleep.mock.calls.map(([delay]) => delay);
const messages = () => printMessage.mock.calls.map(([text]) => text);

beforeEach(() => {
  jest.clearAllMocks();
  // A reverted timer-recursive implementation must fail assertions, not leave timers.
  jest.useFakeTimers();
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('one failure between successes keeps the same stream and reports the error once', async () => {
  const error = httpError(503);
  const run = follow([[event('before')], error, [event('after')]]);
  await expect(run.result).rejects.toBe(STOP);
  expect(createLogTailStream).toHaveBeenCalledTimes(1);
  expect(createLogTailStream).toHaveBeenCalledWith('am-core');
  expect(run.poll).toHaveBeenCalledTimes(3);
  expect(printError).toHaveBeenCalledTimes(1);
  expect(printError).toHaveBeenCalledWith(error);
  expect(delays(run)).toEqual([5000, 5000, 5000]);
  expect(printMessage).toHaveBeenCalledWith(
    JSON.stringify(event('before')),
    'data'
  );
  expect(printMessage).toHaveBeenCalledWith(
    JSON.stringify(event('after')),
    'data'
  );
  expect(messages()).toContain(
    'Log API is responding again after 1 failed polls.'
  );
  expect(messages().join('\n')).not.toContain(
    'Events from the outage may be missing'
  );
});

test('a failed first poll is retried using the injected stream', async () => {
  const run = follow([new Error('timeout'), [event('first')]], {
    injectStream: true,
  });
  await expect(run.result).rejects.toBe(STOP);
  expect(createLogTailStream).not.toHaveBeenCalled();
  expect(run.poll).toHaveBeenCalledTimes(2);
  expect(delays(run)).toEqual([5000, 5000]);
  expect(printMessage).toHaveBeenCalledWith(
    JSON.stringify(event('first')),
    'data'
  );
});

test('backs off to 30 seconds, gives up after five failures and prints one summary', async () => {
  const error = httpError(503);
  const run = follow(Array(5).fill(error));
  await expect(run.result).resolves.toBe(false);
  expect(run.poll).toHaveBeenCalledTimes(5);
  expect(delays(run)).toEqual([5000, 10000, 20000, 30000]);
  expect(printError).toHaveBeenCalledTimes(1);
  expect(
    messages().filter((text) => text.startsWith('Stopping log tail'))
  ).toEqual([
    'Stopping log tail after 5 failed polls in a row. Use --keep-trying to keep following through outages.',
  ]);
  expect(printMessage).toHaveBeenCalledWith(
    'Log API unreachable (HTTP 503), retrying in 30 seconds (failure 4 in a row). Ctrl-C stops.',
    'warn'
  );
});

test('success resets the failure count and pause schedule', async () => {
  const error = new Error('network');
  const run = follow([...Array(4).fill(error), [], ...Array(5).fill(error)]);
  await expect(run.result).resolves.toBe(false);
  expect(run.poll).toHaveBeenCalledTimes(10);
  expect(delays(run)).toEqual([
    5000, 10000, 20000, 30000, 5000, 5000, 10000, 20000, 30000,
  ]);
  expect(printError).toHaveBeenCalledTimes(2);
  expect(messages()).toContain(
    'Log API is responding again after 4 failed polls.'
  );
});

test.each([401, 403])(
  'HTTP %i stops at once, raw or wrapped, in either mode',
  async (status) => {
    for (const keepTrying of [false, true]) {
      for (const error of [
        httpError(status),
        wrapped(httpError(status), status),
        wrapped(wrapped(httpError(status))),
        wrapped(new Error('no response'), status),
      ]) {
        const run = follow([error], { keepTrying });
        await expect(run.result).resolves.toBe(false);
        expect(run.poll).toHaveBeenCalledTimes(1);
        expect(run.sleep).not.toHaveBeenCalled();
        expect(printMessage).toHaveBeenCalledWith(
          `Log API credentials refused (HTTP ${status}). Stopping log tail.`,
          'error'
        );
      }
    }
  }
);

test.each([404, 500, 503, undefined])(
  'other failures (%s) are transient in both shapes',
  async (status) => {
    for (const error of [
      httpError(status),
      wrapped(wrapped(httpError(status))),
    ]) {
      const run = follow([error, []]);
      await expect(run.result).rejects.toBe(STOP);
      expect(run.poll).toHaveBeenCalledTimes(2);
      expect(delays(run)).toEqual([5000, 5000]);
    }
  }
);

test.each([
  ['X-RateLimit-Reset', '1700000022', 23000],
  ['x-ratelimit-reset', '1699999990', 5000],
  ['X-RATELIMIT-RESET', '1700001000', 60000],
  ['x-RaTeLiMiT-rEsEt', '1700000004', 5000],
])(
  '429 honors case-insensitive %s=%s with bounded wait %i',
  async (name, value, wait) => {
    for (const error of [
      httpError(429, { [name]: value }),
      wrapped(wrapped(httpError(429, { [name]: value }))),
    ]) {
      const run = follow([error, []]);
      await expect(run.result).rejects.toBe(STOP);
      expect(delays(run)).toEqual([wait, 5000]);
      expect(printMessage).toHaveBeenCalledWith(
        `Log API rate limit reached (60 requests per minute for the environment, shared with everything that reads its logs). Waiting ${wait / 1000} seconds.`,
        'warn'
      );
      expect(printError).not.toHaveBeenCalled();
    }
  }
);

test.each([undefined, {}, { 'X-RateLimit-Reset': 'invalid' }])(
  '429 without a usable reset (%j) backs off but never counts towards the failure limit',
  async (headers) => {
    const run = follow([
      ...Array(7).fill(httpError(429, headers)),
      ...Array(5).fill(httpError(503)),
    ]);
    await expect(run.result).resolves.toBe(false);
    expect(run.poll).toHaveBeenCalledTimes(12);
    expect(delays(run)).toEqual([5000, 10000, 20000, ...Array(8).fill(30000)]);
    expect(printError).toHaveBeenCalledTimes(1);
  }
);

test('429 does not increment or reset an existing failure streak', async () => {
  const run = follow([
    ...Array(4).fill(httpError(503)),
    httpError(429, { 'X-RateLimit-Reset': '1700001000' }),
    httpError(503),
  ]);
  await expect(run.result).resolves.toBe(false);
  expect(run.poll).toHaveBeenCalledTimes(6);
  expect(delays(run)).toEqual([5000, 10000, 20000, 30000, 60000]);
  expect(printError).toHaveBeenCalledTimes(1);
});

test('--keep-trying continues beyond five failures and reports recovery and possible missing events', async () => {
  const run = follow([...Array(7).fill(httpError(503)), []], {
    keepTrying: true,
  });
  await expect(run.result).rejects.toBe(STOP);
  expect(run.poll).toHaveBeenCalledTimes(8);
  expect(delays(run)).toEqual([
    5000, 10000, 20000, 30000, 30000, 30000, 30000, 5000,
  ]);
  expect(printError).toHaveBeenCalledTimes(1);
  expect(printMessage).toHaveBeenCalledWith(
    'Log API unreachable (HTTP 503), retrying in 30 seconds (failure 7 in a row). Ctrl-C stops.',
    'warn'
  );
  expect(printMessage).toHaveBeenCalledWith(
    'Log API is responding again after 7 failed polls.'
  );
  expect(printMessage).toHaveBeenCalledWith(
    'Events from the outage may be missing: the Log API returns only recent events to a tail.',
    'warn'
  );
  expect(messages().join('\n')).not.toContain('Stopping log tail');
});

test('an outage lasting exactly 15 seconds does not warn about missing events', async () => {
  const run = follow([httpError(503), httpError(503), []]);
  await expect(run.result).rejects.toBe(STOP);
  expect(messages()).toContain(
    'Log API is responding again after 2 failed polls.'
  );
  expect(messages().join('\n')).not.toContain(
    'Events from the outage may be missing'
  );
});

test('log filtering still applies after recovery and events alone use stdout', async () => {
  const run = follow(
    [
      httpError(503),
      [
        event('wanted'),
        event('noise', 'noise'),
        event('wrong-tx', 'test', 'other'),
      ],
    ],
    {},
    { levels: ['INFO'], txid: 'tx-1' }
  );
  await expect(run.result).rejects.toBe(STOP);
  const data = printMessage.mock.calls.filter(([, type]) => type === 'data');
  expect(data).toEqual([[JSON.stringify(event('wanted')), 'data']]);
  expect(resolvePayloadLevel).toHaveBeenCalled();
  expect(printError).toHaveBeenCalledTimes(1);
});
