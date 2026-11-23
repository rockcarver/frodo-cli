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

  test('an error that does not go away is reported at the time-out, with its message', async () => {
    const failing = async () => {
      throw new Error('Cannot read properties of null (reading "textContent")');
    };
    await expect(waitFor(failing, 150, 10)).rejects.toThrow(
      /Timed out waiting after 150 ms.*last error: Cannot read properties of null \(reading "textContent"\)/
    );
  });

  test('an answer that stays empty is reported at the time-out, with its value', async () => {
    await expect(waitFor(async () => false, 100, 10)).rejects.toThrow(
      /Timed out waiting after 100 ms; last value: false/
    );
  });

  test('the last error is the one reported when the errors change', async () => {
    let asked = 0;
    const failing = async () => {
      throw new Error(`error number ${++asked}`);
    };
    const error = await waitFor(failing, 120, 20).catch((e) => e);
    expect(error.message).toContain(`last error: error number ${asked}`);
    expect(asked).toBeGreaterThan(1);
  });
});
