import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';

/**
 * The first key typed in answer to the first `frodo> ` prompt of the console.
 *
 * The console used to put the terminal into raw mode after the first prompt
 * was written, and switching waits until the terminal has read what was
 * written before it. A sender that answers the prompt as soon as it reads it
 * (a terminal emulator, a pasted key, a script) therefore wrote its key while
 * the terminal was still in cooked mode: the terminal's own line handling ate
 * Ctrl+R, turned Ctrl+C into a signal that ended the process, and echoed the
 * rest, so a pasted line showed twice. The console now switches to raw mode
 * just before it draws the first prompt.
 *
 * These scenarios use the driver's `send_on_match`: the key is written in the
 * very pass that read the prompt, with nothing between the read and the write.
 * A delay of a few milliseconds hides the defect, which is why the older
 * scenarios (they wait, then send) never saw it. The terminal's flags are read
 * at the same instant, so the first case does not depend on timing: it fails
 * on every run against the old order, the others fail on some runs. What is
 * typed before the first prompt (the sign-in, the welcome text) still meets a
 * cooked terminal on purpose, so that Ctrl+C aborts a slow start.
 *
 * Run `npx tsdown` first, the test scripts do not rebuild `dist/`.
 */
describe('the first key typed at the first prompt of the console', () => {
  /** Run the console, answer the first prompt with `text`, then `actions`. */
  function answerFirstPrompt(text, actions) {
    const homeDir = createShellTestHome();
    try {
      return runShellScenario({
        args: ['shell'],
        homeDir,
        actions: [
          { type: 'send_on_match', regex: 'frodo> ', text, label: 'atPrompt' },
          ...actions,
        ],
      });
    } finally {
      removeShellTestHome(homeDir);
    }
  }

  test('finds the terminal in raw mode at the instant the prompt is read', () => {
    const result = answerFirstPrompt('', []);

    // raw mode: no echo, no line editing, no signal keys
    expect(result.captures.atPrompt.tty).toEqual({
      echo: false,
      icanon: false,
      isig: false,
    });
  });

  test('Ctrl+R opens the history search and is not echoed', () => {
    const result = answerFirstPrompt('\x12', [
      { type: 'wait_plain', regex: '\\(fuzzy-search\\)', timeoutMs: 5000 },
      { type: 'key', name: 'escape' },
      { type: 'sleep', ms: 200 },
    ]);

    expect(result.plainOutput).toMatch(/\(fuzzy-search\)/);
    expect(result.plainOutput).not.toContain('^R');
  });

  test('Ctrl+C reaches the console, which says how to exit, and does not end the process', () => {
    const result = answerFirstPrompt('\x03', [
      { type: 'wait_plain', regex: 'To exit, press', timeoutMs: 5000 },
    ]);

    expect(result.plainOutput).toMatch(/To exit, press/);
    expect(result.plainOutput).not.toContain('^C');
    // the program ended by itself when the scenario was done, not by SIGINT
    expect(result.exitSignal).toBeNull();
  });

  test('a line sent with the first answer runs, and is shown once', () => {
    const result = answerFirstPrompt('6*7\r', [
      { type: 'wait_plain', regex: '\\n42\\n', timeoutMs: 5000 },
    ]);

    expect(result.plainOutput).toMatch(/\n42\n/);
    // the terminal echoed nothing of its own: the console draws the line once
    expect(result.plainOutput.split('6*7').length - 1).toBe(1);
  });
});
