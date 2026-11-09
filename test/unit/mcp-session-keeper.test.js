/**
 * Unit tests for the session keeper of the MCP server (McpSessionKeeper.ts):
 * what a shutdown ends, what a request ends, and that a logout can neither
 * fail nor hold up either. The keeper is dependency-free, so it loads without
 * mocks; the instances are plain objects with the one method it calls.
 */
import { jest } from '@jest/globals';
import {
  createMcpSessionKeeper,
  MCP_SESSION_END_TIMEOUT_MS,
} from '../../src/ops/McpSessionKeeper.ts';

/** An instance whose `login.dispose()` answers with `result` (or rejects). */
function instance(name, result = { userSession: 'ended' }) {
  const dispose = jest.fn(async () => {
    if (result instanceof Error) {
      throw result;
    }
    return result;
  });
  return { name, login: { dispose } };
}

/** An instance whose `login.dispose()` settles when `release()` is called. */
function slowInstance(name, result = { userSession: 'ended' }) {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const dispose = jest.fn(async () => {
    await gate;
    return result;
  });
  return { name, login: { dispose }, release };
}

/** Resolves true when `promise` settled within `ms`, false otherwise. */
async function settlesWithin(promise, ms) {
  let timer;
  const outcome = await Promise.race([
    promise.then(() => true),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(false), ms);
    }),
  ]);
  clearTimeout(timer);
  return outcome;
}

function reports() {
  const lines = [];
  return {
    lines,
    report: (level, message) => lines.push({ level, message }),
  };
}

describe('createMcpSessionKeeper', () => {
  test('the time limit of a shutdown is three seconds', () => {
    expect(MCP_SESSION_END_TIMEOUT_MS).toBe(3000);
  });

  describe('endAll', () => {
    test('disposes of the singleton and of the request-scoped instances it still holds', async () => {
      const singleton = instance('singleton');
      const first = instance('first');
      const second = instance('second');
      const keeper = createMcpSessionKeeper(singleton);
      keeper.adopt(first);
      keeper.adopt(second);

      await keeper.endAll();

      expect(singleton.login.dispose).toHaveBeenCalledTimes(1);
      expect(first.login.dispose).toHaveBeenCalledTimes(1);
      expect(second.login.dispose).toHaveBeenCalledTimes(1);
    });

    test('never remembers the singleton as a request-scoped instance', async () => {
      const singleton = instance('singleton');
      const keeper = createMcpSessionKeeper(singleton);

      expect(keeper.adopt(singleton)).toBe(singleton);
      await keeper.endAll();

      expect(singleton.login.dispose).toHaveBeenCalledTimes(1);
    });

    test('returns the instance it adopts', () => {
      const keeper = createMcpSessionKeeper(instance('singleton'));
      const scoped = instance('scoped');

      expect(keeper.adopt(scoped)).toBe(scoped);
    });

    test('ends the sessions once, however often it is called', async () => {
      const singleton = instance('singleton');
      const keeper = createMcpSessionKeeper(singleton);

      await Promise.all([keeper.endAll(), keeper.endAll()]);
      await keeper.endAll();

      expect(singleton.login.dispose).toHaveBeenCalledTimes(1);
    });

    test('a failed logout is reported as a warning and does not reject', async () => {
      const failed = instance('failed', {
        userSession: 'failed',
        error: { message: 'Error logging out' },
      });
      const { lines, report } = reports();
      const keeper = createMcpSessionKeeper(failed, { report });

      await expect(keeper.endAll()).resolves.toBeUndefined();

      expect(lines).toContainEqual({
        level: 'warn',
        message: 'Could not end the server session: Error logging out',
      });
    });

    test('a dispose that throws is reported as a warning and does not reject', async () => {
      const throwing = instance('throwing', new Error('boom'));
      const other = instance('other');
      const { lines, report } = reports();
      const keeper = createMcpSessionKeeper(throwing, { report });
      keeper.adopt(other);

      await expect(keeper.endAll()).resolves.toBeUndefined();

      expect(lines).toContainEqual({
        level: 'warn',
        message: 'Could not end the server session: boom',
      });
      // One failing instance does not keep the others from being ended.
      expect(other.login.dispose).toHaveBeenCalledTimes(1);
    });

    test('says why a logout failed in a debug line, without the credentials of a host URL', async () => {
      const failed = instance('failed', {
        userSession: 'failed',
        error: {
          message: 'Error logging out',
          getCombinedMessage: () =>
            'Error logging out\n  Network error:\n  URL: https://admin:Passw0rd!@tenant.example.com/am/json/sessions?_action=logout\n  Status: 400',
        },
      });
      const { lines, report } = reports();
      const keeper = createMcpSessionKeeper(failed, { report });

      await keeper.endAll();

      const detail = lines.find((line) => line.level === 'debug');
      expect(detail.message).toContain('Status: 400');
      expect(detail.message).toContain('https://tenant.example.com/am/json');
      expect(detail.message).not.toContain('Passw0rd!');
      expect(detail.message).not.toContain('\n');
    });

    test('a failing report sink does not break the shutdown', async () => {
      const keeper = createMcpSessionKeeper(instance('singleton'), {
        report: () => {
          throw new Error('sink is gone');
        },
      });

      await expect(keeper.endAll()).resolves.toBeUndefined();
    });

    test('reports what the library did with each kind of session at debug level', async () => {
      const { lines, report } = reports();
      const keeper = createMcpSessionKeeper(
        instance('singleton', { userSession: 'kept' }),
        { report }
      );
      keeper.adopt(instance('ended', { userSession: 'ended' }));
      keeper.adopt(instance('none', { userSession: 'none' }));

      await keeper.endAll();

      expect(lines.map((line) => line.level)).toEqual([
        'debug',
        'debug',
        'debug',
      ]);
      const messages = lines.map((line) => line.message).sort();
      expect(messages).toEqual([
        'Ended the request-scoped session.',
        'Left the server session alone: it may be in use by another process.',
        'There is no request-scoped user session to end.',
      ]);
    });

    test('a logout that never finishes holds up the shutdown for the time limit, not longer', async () => {
      const hung = {
        login: { dispose: jest.fn(() => new Promise(() => undefined)) },
      };
      const { lines, report } = reports();
      const keeper = createMcpSessionKeeper(hung, { timeoutMs: 100, report });

      const started = Date.now();
      const ended = await settlesWithin(keeper.endAll(), 2000);
      const took = Date.now() - started;

      expect(ended).toBe(true);
      expect(took).toBeGreaterThanOrEqual(90);
      expect(took).toBeLessThan(1500);
      expect(lines).toContainEqual({
        level: 'warn',
        message:
          'Ending the sessions took more than 100 ms; shutting down without waiting for it.',
      });
    });

    test('does not wait for the time limit when the logouts finish sooner', async () => {
      const keeper = createMcpSessionKeeper(instance('singleton'), {
        timeoutMs: 60000,
      });

      await expect(settlesWithin(keeper.endAll(), 2000)).resolves.toBe(true);
    });
  });

  describe('runRequest', () => {
    test('returns what the request returns, and rethrows what it throws', async () => {
      const keeper = createMcpSessionKeeper(instance('singleton'));

      await expect(keeper.runRequest(async () => 42)).resolves.toBe(42);
      await expect(
        keeper.runRequest(async () => {
          throw new Error('request failed');
        })
      ).rejects.toThrow('request failed');
    });

    test('disposes of the instances adopted during the request once it is over', async () => {
      const singleton = instance('singleton');
      const scoped = instance('scoped');
      const keeper = createMcpSessionKeeper(singleton);

      await keeper.runRequest(async () => {
        await Promise.resolve();
        keeper.adopt(scoped);
        // Still in use: not yet disposed of while the request runs.
        expect(scoped.login.dispose).not.toHaveBeenCalled();
      });
      await keeper.endAll();

      expect(scoped.login.dispose).toHaveBeenCalledTimes(1);
      // The singleton serves every request and is only ended at shutdown.
      expect(singleton.login.dispose).toHaveBeenCalledTimes(1);
    });

    test('disposes of the instance when the request fails', async () => {
      const scoped = instance('scoped');
      const keeper = createMcpSessionKeeper(instance('singleton'));

      await expect(
        keeper.runRequest(async () => {
          keeper.adopt(scoped);
          throw new Error('request failed');
        })
      ).rejects.toThrow('request failed');

      expect(scoped.login.dispose).toHaveBeenCalledTimes(1);
    });

    test('does not touch the singleton when a request resolved to it', async () => {
      const singleton = instance('singleton');
      const keeper = createMcpSessionKeeper(singleton);

      await keeper.runRequest(async () => keeper.adopt(singleton));

      expect(singleton.login.dispose).not.toHaveBeenCalled();
    });

    test('does not dispose of an instance twice when the shutdown has taken it', async () => {
      const scoped = instance('scoped');
      const keeper = createMcpSessionKeeper(instance('singleton'));

      await keeper.runRequest(async () => {
        keeper.adopt(scoped);
        await keeper.endAll();
      });

      expect(scoped.login.dispose).toHaveBeenCalledTimes(1);
    });

    test('each of several concurrent requests disposes of its own instances only', async () => {
      const keeper = createMcpSessionKeeper(instance('singleton'));
      const a = instance('a');
      const b = instance('b');
      let releaseA;
      const gateA = new Promise((resolve) => (releaseA = resolve));

      const requestA = keeper.runRequest(async () => {
        keeper.adopt(a);
        await gateA;
      });
      const requestB = keeper.runRequest(async () => {
        await Promise.resolve();
        keeper.adopt(b);
      });
      await requestB;

      // B is over, A still runs: only B's instance is disposed of.
      expect(b.login.dispose).toHaveBeenCalledTimes(1);
      expect(a.login.dispose).not.toHaveBeenCalled();

      releaseA();
      await requestA;
      expect(a.login.dispose).toHaveBeenCalledTimes(1);
    });

    test('the response does not wait for the logout of its instance', async () => {
      const slow = slowInstance('slow');
      const keeper = createMcpSessionKeeper(instance('singleton'));

      const answered = await settlesWithin(
        keeper.runRequest(async () => {
          keeper.adopt(slow);
          return 'answer';
        }),
        1000
      );

      expect(answered).toBe(true);
      expect(slow.login.dispose).toHaveBeenCalledTimes(1);
      slow.release();
    });

    test('a shutdown waits for the logout of a request that is already over', async () => {
      const slow = slowInstance('slow');
      const keeper = createMcpSessionKeeper(instance('singleton'), {
        timeoutMs: 60000,
      });
      await keeper.runRequest(async () => {
        keeper.adopt(slow);
      });

      const ending = keeper.endAll();
      expect(await settlesWithin(ending, 100)).toBe(false);
      slow.release();
      expect(await settlesWithin(ending, 2000)).toBe(true);
    });

    test('an instance adopted outside any request is ended at shutdown', async () => {
      const scoped = instance('scoped');
      const keeper = createMcpSessionKeeper(instance('singleton'));

      keeper.adopt(scoped);
      await keeper.endAll();

      expect(scoped.login.dispose).toHaveBeenCalledTimes(1);
    });

    test('a failing logout of a request-scoped instance is a warning, not an error of the request', async () => {
      const failing = instance('failing', {
        userSession: 'failed',
        error: { message: 'Error logging out' },
      });
      const { lines, report } = reports();
      const keeper = createMcpSessionKeeper(instance('singleton'), { report });

      await expect(
        keeper.runRequest(async () => {
          keeper.adopt(failing);
          return 'answer';
        })
      ).resolves.toBe('answer');
      await keeper.endAll();

      expect(lines).toContainEqual({
        level: 'warn',
        message: 'Could not end the request-scoped session: Error logging out',
      });
    });
  });
});
