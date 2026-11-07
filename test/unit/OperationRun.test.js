import { beforeEach, describe, expect, it, jest } from '@jest/globals';

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

const { ALLOW_FAILURES_HELP, ALLOW_FAILURES_OPTION, OperationRun } =
  await import('../../src/utils/OperationRun.ts');

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
    expect(await run.run('second', async () => attempted.push('second'))).toBe(false);
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
