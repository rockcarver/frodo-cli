import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

/**
 * OperationRun (src/utils/OperationRun.ts), decision record 0040: a command that
 * performs several operations runs them all, prints one summary of what failed,
 * and fails unless --allow-failures was given. A failure that the next
 * operations depend on stops the run, whatever the flag says.
 */

const printError = jest.fn();
const printMessage = jest.fn();
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printError,
  printMessage,
}));

const {
  ALLOW_FAILURES_HELP,
  ALLOW_FAILURES_OPTION,
  OperationRun,
  describeFailure,
} = await import('../../src/utils/OperationRun.ts');

beforeEach(() => {
  printError.mockClear();
  printMessage.mockClear();
});

const summary = () => printMessage.mock.calls.map(([text]) => text).join('\n');
const level = () => printMessage.mock.calls[0]?.[1];

describe('a run in which everything succeeds', () => {
  it('prints nothing and succeeds, whether the operations answer true or nothing', async () => {
    const run = new OperationRun({ unit: 'item' });
    expect(await run.run('a', async () => true)).toBe(true);
    expect(await run.run('b', async () => {})).toBe(true);
    expect(await run.run('c', () => true)).toBe(true);

    expect(run.hasFailures).toBe(false);
    expect(run.finish()).toBe(true);
    expect(printMessage).not.toHaveBeenCalled();
  });

  it('succeeds when it ran nothing', () => {
    expect(new OperationRun().finish()).toBe(true);
    expect(printMessage).not.toHaveBeenCalled();
  });
});

describe('a failed operation', () => {
  it('does not stop the others, and ends in one summary that names it and fails', async () => {
    const order = [];
    const run = new OperationRun({ unit: 'item' });
    await run.run('a', async () => order.push('a'));
    expect(
      await run.run('b', async () => {
        order.push('b');
        return false;
      })
    ).toBe(false);
    await run.run('c', async () => order.push('c'));

    expect(order).toEqual(['a', 'b', 'c']);
    expect(run.hasFailures).toBe(true);
    expect(run.finish()).toBe(false);
    expect(printMessage).toHaveBeenCalledTimes(1);
    expect(level()).toBe('error');
    expect(summary()).toBe('1 of 3 items failed:\n  - b');
  });

  it('counts a thrown error as a failure: prints the error, keeps its first line as the reason, goes on', async () => {
    const error = new Error('could not read it\nsecond line');
    const run = new OperationRun({ unit: 'script' });
    expect(
      await run.run('x', async () => {
        throw error;
      })
    ).toBe(false);
    expect(await run.run('y', async () => true)).toBe(true);

    expect(printError).toHaveBeenCalledWith(error);
    expect(run.finish()).toBe(false);
    expect(summary()).toBe('1 of 2 scripts failed:\n  - x: could not read it');
  });

  it('counts a thrown value that is not an error', async () => {
    const run = new OperationRun();
    await run.run('x', async () => {
      throw 'plain text';
    });
    run.finish();
    expect(summary()).toContain('- x: plain text');
  });

  it('names every failure, in the order they happened', async () => {
    const run = new OperationRun({ unit: 'step' });
    await run.run('one', async () => false);
    await run.run('two', async () => true);
    await run.run('three', async () => false);
    run.finish();
    expect(summary()).toBe('2 of 3 steps failed:\n  - one\n  - three');
  });

  it('says operation, singular, by default', async () => {
    const run = new OperationRun();
    await run.run('only', async () => false);
    run.finish();
    expect(summary()).toBe('1 of 1 operation failed:\n  - only');
  });
});

describe('--allow-failures', () => {
  it('lets the run succeed, still printing the summary, as a warning that says why the exit code stays 0', async () => {
    const run = new OperationRun({ unit: 'item', allowFailures: true });
    await run.run('a', async () => false);
    await run.run('b', async () => true);

    expect(run.finish()).toBe(true);
    expect(level()).toBe('warn');
    expect(summary()).toBe(
      `1 of 2 items failed:\n  - a\nThe exit code stays 0 because ${ALLOW_FAILURES_OPTION} was given.`
    );
  });

  it('changes nothing for a run in which everything succeeds', async () => {
    const run = new OperationRun({ allowFailures: true });
    await run.run('a', async () => true);
    expect(run.finish()).toBe(true);
    expect(printMessage).not.toHaveBeenCalled();
  });

  it('is the shared option: one flag and one help text', () => {
    expect(ALLOW_FAILURES_OPTION).toBe('--allow-failures');
    expect(ALLOW_FAILURES_HELP).toContain('exit with code 0');
    expect(ALLOW_FAILURES_HELP).toContain('exits with code 1');
  });
});

describe('a failure that the next operations depend on', () => {
  it('stops the run: the rest are not attempted, and are named', async () => {
    const attempted = [];
    const run = new OperationRun({ unit: 'step' });
    await run.run('first', async () => attempted.push('first'));
    expect(
      await run.run(
        'login',
        async () => {
          attempted.push('login');
          return false;
        },
        { dependent: true }
      )
    ).toBe(false);
    expect(await run.run('second', async () => attempted.push('second'))).toBe(
      false
    );
    await run.run('third', async () => attempted.push('third'));

    expect(attempted).toEqual(['first', 'login']);
    expect(run.finish()).toBe(false);
    expect(summary()).toBe(
      '1 of 4 steps failed, 2 not attempted:\n  - login\n  - second (not attempted)\n  - third (not attempted)'
    );
  });

  it('fails the command whatever --allow-failures says, and says so', async () => {
    const run = new OperationRun({ unit: 'step', allowFailures: true });
    await run.run('prepare', async () => false, { dependent: true });
    await run.run('use it', async () => true);

    expect(run.finish()).toBe(false);
    expect(level()).toBe('error');
    expect(summary()).toContain(
      `The run stopped because a step that the others depend on failed; ${ALLOW_FAILURES_OPTION} does not apply to that.`
    );
  });

  it('does not stop the run when it succeeds', async () => {
    const run = new OperationRun();
    await run.run('prepare', async () => true, { dependent: true });
    await run.run('use it', async () => true);
    expect(run.finish()).toBe(true);
  });

  it('is not a reason to stop when it was the last operation, but still fails the command', async () => {
    const run = new OperationRun({ allowFailures: true });
    await run.run('a', async () => true);
    await run.run('last', async () => false, { dependent: true });
    expect(run.finish()).toBe(false);
  });
});

describe('operations that the caller ran itself', () => {
  it('counts a success and a failure like run() does, and prints nothing until finish()', async () => {
    const run = new OperationRun({ unit: 'item' });
    run.recordSuccess();
    run.recordFailure('b', new Error('could not delete b\nmore'));
    run.recordSuccess();

    expect(printMessage).not.toHaveBeenCalled();
    expect(printError).not.toHaveBeenCalled();
    expect(run.hasFailures).toBe(true);
    expect(run.finish()).toBe(false);
    expect(summary()).toBe('1 of 3 items failed:\n  - b: could not delete b');
  });

  it('keeps a failure without an error as a name only', () => {
    const run = new OperationRun();
    run.recordFailure('only');
    run.finish();
    expect(summary()).toBe('1 of 1 operation failed:\n  - only');
  });

  it('lets --allow-failures succeed after recorded failures', () => {
    const run = new OperationRun({ allowFailures: true });
    run.recordFailure('x', new Error('no'));
    expect(run.finish()).toBe(true);
    expect(level()).toBe('warn');
  });

  it('stops the run for a dependent failure that was recorded, whatever the flag says', async () => {
    const run = new OperationRun({ allowFailures: true });
    run.recordFailure('prepare', new Error('no'), { dependent: true });
    expect(await run.run('next', async () => true)).toBe(false);
    expect(run.finish()).toBe(false);
    expect(summary()).toContain('next (not attempted)');
  });

  it('recordSuccess alone leaves a clean run', () => {
    const run = new OperationRun();
    run.recordSuccess();
    expect(run.hasFailures).toBe(false);
    expect(run.finish()).toBe(true);
    expect(printMessage).not.toHaveBeenCalled();
  });
});

/** A library error that wraps others: a message and the nested errors. */
function libraryError(message, originalErrors = []) {
  const error = new Error(message);
  error.name = 'FrodoError';
  error.originalErrors = originalErrors;
  return error;
}

/** A raw HTTP error as the library's client throws it. */
function httpError(message, url) {
  const error = new Error(message);
  error.name = 'AxiosError';
  error.config = { url };
  return error;
}

describe('describeFailure', () => {
  it('names an item by the message of the library error that wraps the reason', () => {
    const error = libraryError('Error deleting workflow w1', [
      libraryError('Error deleting draft w1', [
        httpError('Request failed with status code 409', '/x/w1'),
      ]),
    ]);
    expect(describeFailure(error)).toEqual({
      name: 'Error deleting workflow w1',
      reason: 'Request failed with status code 409',
    });
  });

  it('names an item of a raw HTTP error by the last segment of its URL, without the query', () => {
    const error = httpError(
      'Request failed with status code 404',
      'https://tenant.example.com/openidm/config/remote-proxy/my%20proxy?_queryFilter=true&token=secret'
    );
    expect(describeFailure(error)).toEqual({
      name: 'my proxy',
      reason: 'Request failed with status code 404',
    });
  });

  it('falls back to the message when the error names nothing else, and keeps only its first line', () => {
    expect(describeFailure(new Error('boom\nstack line'))).toEqual({
      name: 'boom',
    });
    expect(describeFailure('plain text')).toEqual({ name: 'plain text' });
    expect(describeFailure(httpError('no url', undefined))).toEqual({
      name: 'no url',
    });
  });

  it('gives the answer of the server as the reason when the error chain carries one', () => {
    const cause = httpError('Request failed with status code 409', '/x/w1');
    cause.httpMessage = 'Cannot delete node type that is in use';
    const error = libraryError('Error deleting workflow w1', [cause]);
    expect(describeFailure(error)).toEqual({
      name: 'Error deleting workflow w1',
      reason: 'Cannot delete node type that is in use',
    });
    const raw = httpError('Request failed with status code 404', '/x/p1');
    raw.httpMessage = 'No such proxy';
    expect(describeFailure(raw)).toEqual({
      name: 'p1',
      reason: 'No such proxy',
    });
  });

  it('survives a URL that cannot be decoded', () => {
    expect(describeFailure(httpError('bad', '/a/%E0%A4%A')).name).toBe(
      '%E0%A4%A'
    );
  });
});

describe('resultCallback (a library function that reports every item through a callback)', () => {
  let exitCode;
  beforeEach(() => {
    exitCode = process.exitCode;
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = exitCode;
  });

  it('prints and records a failed item, counts a result, and leaves the exit code to finish()', () => {
    const run = new OperationRun({ unit: 'node' });
    const callback = run.resultCallback();
    callback(undefined, { _id: 'n1' });
    callback(
      libraryError('Error deleting custom node N2', [
        httpError('Request failed with status code 500', '/nodes/n2'),
      ])
    );
    callback(undefined, { _id: 'n3' });

    expect(printError).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBeUndefined();
    expect(run.finish()).toBe(false);
    expect(summary()).toBe(
      '1 of 3 nodes failed:\n  - Error deleting custom node N2: Request failed with status code 500'
    );
  });

  it('names the failed item with the extractor of the caller, and falls back to describeFailure when it names nothing', () => {
    const run = new OperationRun({ unit: 'node' });
    const callback = run.resultCallback((error) =>
      error.message.startsWith('Error deleting custom node ')
        ? error.message.slice('Error deleting custom node '.length)
        : undefined
    );
    callback(
      libraryError('Error deleting custom node N2', [
        httpError('Request failed with status code 500', '/nodes/n2'),
      ])
    );
    callback(libraryError('Something else happened', [new Error('boom')]));
    expect(run.finish()).toBe(false);
    expect(summary()).toBe(
      '2 of 2 nodes failed:\n  - N2: Request failed with status code 500\n  - Something else happened: boom'
    );
  });

  it('keeps a clean run quiet', () => {
    const run = new OperationRun({ unit: 'node' });
    const callback = run.resultCallback();
    callback(undefined, { _id: 'n1' });
    expect(run.finish()).toBe(true);
    expect(printMessage).not.toHaveBeenCalled();
  });

  it('lets --allow-failures succeed with a warning, and still prints the failed item', () => {
    const run = new OperationRun({ unit: 'node', allowFailures: true });
    const callback = run.resultCallback();
    callback(new Error('no'));
    expect(printError).toHaveBeenCalledTimes(1);
    expect(run.finish()).toBe(true);
    expect(level()).toBe('warn');
  });
});

describe('recordCombinedError (a library bulk function that threw one combined error)', () => {
  const combined = (...items) => {
    const error = new Error('Error deleting services');
    error.originalErrors = items;
    return error;
  };

  it('records one failure per nested error, names it, and counts the other items as succeeded', () => {
    const run = new OperationRun({ unit: 'service' });
    run.recordCombinedError(
      combined(
        Object.assign(new Error("Error deleting service 'b'"), {
          originalErrors: [new Error('could not delete b')],
        })
      ),
      { total: 4, fallbackName: 'services' }
    );

    expect(run.finish()).toBe(false);
    expect(summary()).toBe(
      "1 of 4 services failed:\n  - Error deleting service 'b': could not delete b"
    );
  });

  it('shows the name of the caller instead of the message when it knows one, and falls back to the message when it does not', () => {
    const run = new OperationRun({ unit: 'mapping' });
    const named = Object.assign(new Error('Error deleting mapping sync/b'), {
      originalErrors: [new Error('nope')],
    });
    const other = new Error('Error updating sync.json');
    run.recordCombinedError(combined(named, other), {
      total: 5,
      fallbackName: 'mappings',
      itemName: (error) =>
        error.message === named.message ? 'sync/b' : undefined,
    });

    run.finish();
    expect(summary()).toBe(
      '2 of 5 mappings failed:\n  - sync/b: nope\n  - Error updating sync.json'
    );
  });

  it('records an error without nested errors as one failure named by the caller', () => {
    const run = new OperationRun({ unit: 'service' });
    run.recordCombinedError(new Error('everything broke'), {
      total: 4,
      fallbackName: 'services',
    });

    run.finish();
    expect(summary()).toBe(
      '1 of 1 service failed:\n  - services: everything broke'
    );
  });

  it('prints nothing itself, and --allow-failures turns the summary into a warning', () => {
    const run = new OperationRun({ unit: 'service', allowFailures: true });
    run.recordCombinedError(combined(new Error('b failed')), {
      total: 2,
      fallbackName: 'services',
    });

    expect(printError).not.toHaveBeenCalled();
    expect(printMessage).not.toHaveBeenCalled();
    expect(run.finish()).toBe(true);
    expect(level()).toBe('warn');
  });
});

describe('the unit in the summary', () => {
  it('is plural unless there is exactly one, also for a unit that ends in y', () => {
    const one = new OperationRun({ unit: 'policy' });
    one.recordFailure('a');
    one.finish();
    expect(summary()).toBe('1 of 1 policy failed:\n  - a');

    printMessage.mockClear();
    const two = new OperationRun({ unit: 'policy' });
    two.recordFailure('a');
    two.recordSuccess();
    two.finish();
    expect(summary()).toMatch(/^1 of 2 policies failed/);

    printMessage.mockClear();
    const key = new OperationRun({ unit: 'key' });
    key.recordFailure('a');
    key.recordSuccess();
    key.finish();
    expect(summary()).toMatch(/^1 of 2 keys failed/);
  });
});
