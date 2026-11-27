import { jest } from '@jest/globals';
import { waitFor } from '../utils/WebShell.js';

/**
 * The browser tests of `frodo shell --web` ask a page questions until it
 * answers. A page that is still loading answers a query of a missing element
 * with an exception, and that must never count as the answer.
 */
describe('waitFor, the poll of the browser tests of the web console', () => {
  test('returns the first answer that is not empty', async () => {
    let asked = 0;
    const answer = await waitFor(
      async () => (++asked < 3 ? [null, false, undefined][asked - 1] : 'here'),
      2_000,
      5
    );
    expect(answer).toBe('here');
    expect(asked).toBe(3);
  });

  test('keeps asking while the element is missing and never returns the error as the answer', async () => {
    // a page whose element appears after a moment, queried the way the tests do
    const page = { info: null };
    setTimeout(() => {
      page.info = { textContent: 'session error: no engine' };
    }, 300);
    const answer = await waitFor(
      async () => page.info.textContent, // throws a TypeError until then
      5_000,
      10
    );
    expect(answer).toBe('session error: no engine');
    expect(String(answer)).not.toMatch(/^ERROR/);
  });

  describe('on a fake clock, to the end of the time-out', () => {
    // The time-out and the pauses are timers, so the clock is the test's: an attempt is
    // made at 0, every `everyMs` and no more, whatever the machine does between two of them.
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    /** Runs `waitFor` to the end of its time-out (and one pause more, for the last one) and gives what it did: the error it rejected with, or its answer. */
    const runOut = async (watch, timeoutMs, everyMs) => {
      const outcome = waitFor(watch, timeoutMs, everyMs).then(
        (answer) => ({ answer }),
        (error) => ({ error })
      );
      await jest.advanceTimersByTimeAsync(timeoutMs + everyMs);
      return outcome;
    };

    test('an error that does not go away is reported at the time-out, with its message', async () => {
      const failing = async () => {
        throw new Error(
          'Cannot read properties of null (reading "textContent")'
        );
      };
      const { error } = await runOut(failing, 150, 10);
      expect(error.message).toMatch(
        /Timed out waiting after 150 ms.*last error: Cannot read properties of null \(reading "textContent"\)/
      );
    });

    test('an answer that stays empty is reported at the time-out, with its value', async () => {
      const { error } = await runOut(async () => false, 100, 10);
      expect(error.message).toMatch(
        /Timed out waiting after 100 ms; last value: false/
      );
    });

    test('the last error is the one reported when the errors change', async () => {
      let asked = 0;
      const failing = async () => {
        throw new Error(`error number ${++asked}`);
      };
      const { error } = await runOut(failing, 120, 20);
      // asked at 0, 20, 40, 60, 80 and 100 ms
      expect(asked).toBe(6);
      expect(error.message).toContain('last error: error number 6');
    });
  });
});
