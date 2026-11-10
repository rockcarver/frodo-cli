import { connection } from '../e2e/utils/TestConfig.js';
import { answerReady } from '../utils/ReadyStep.js';
import { replayScreen } from '../utils/ScreenReplay.js';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';

/**
 * Erase-on-conclude prompts + the deferred authoring print (Phase 5,
 * prompt-erase slice; INTERACTIVE-COMMANDS-PLAN.md).
 *
 * Every prompt passes @inquirer/core's clearPromptOnDone context option,
 * so the whole frame -- question, list, footer, and the committed or
 * cancelled answer -- erases when the prompt settles, on every exit path
 * (enter, escape, SIGINT; @inquirer/core fires it from the prompt
 * promise's .finally()). After the run, scrollback keeps only:
 *
 * - the typed command line (the shell's, never touched by frodo), and
 * - the eventual command, printed ONCE at the action's postAction hook --
 *   the only point where nothing can change the command anymore (realm
 *   pick, entity picks, and the action's own output have concluded).
 *   Abandoned flows (cancelled pickers, unsatisfied one-of) skip
 *   postAction entirely and print nothing.
 *
 * Raw captures are replayed through a small VT line-model interpreter
 * because the erase sequences only remove lines from the SCREEN -- the
 * raw stream always contains every byte ever written, so a plain-text
 * grep would see the erased frames regardless. The model implements the
 * exact vocabulary @inquirer/core emits (its ScreenManager + @inquirer/
 * ansi: cursor up/down, erase-line, column-absolute, hide/show) plus
 * plain writes and newlines -- deliberately NOT a full VT emulator, only
 * what inquirer can produce (verified against @inquirer/ansi's source;
 * anything unknown is a test failure, not silently ignored).
 */

describe('phase 5 prompt erase + deferred authoring print', () => {
  // CI startup can be slow under resource contention; allow up to 90 s.
  const TIMEOUT = 90000;

  const ENV = {
    FRODO_MOCK: '1',
    FRODO_HOST: 'https://openam-frodo-dev.forgeblocks.com/am',
    FRODO_USERNAME: 'runUser1',
    FRODO_PASSWORD: 'runUser1p',
    FRODO_MOCK_DEPLOYMENT: 'cloud',
    FRODO_CONNECTION_PROFILES_PATH: new URL(
      '../e2e/env/Connections.json',
      import.meta.url
    ).pathname,
    FRODO_MASTER_KEY_PATH: new URL('../e2e/env/masterkey.key', import.meta.url)
      .pathname,
  };

  test(
    'cancelled one-of flow leaves only the error + usage, no prompt residue',
    async () => {
      const homeDir = createShellTestHome();
      try {
        const result = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: ['esv', 'secret', 'delete'],
          env: ENV,
          actions: [
            {
              type: 'wait_plain',
              regex: 'Choose which secrets',
              timeoutMs: 30000,
            },
            { type: 'sleep', ms: 400 },
            // → into the editor, then esc back, then esc out:
            // three frames that previously all stayed visible.
            { type: 'key', name: 'right' },
            {
              type: 'wait_plain',
              regex: 'Optional options for',
              timeoutMs: 15000,
            },
            { type: 'key', name: 'escape' },
            { type: 'sleep', ms: 800 },
            { type: 'key', name: 'escape' },
            { type: 'sleep', ms: 1200 },
            { type: 'capture', label: 'final' },
          ],
        });

        const screen = replayScreen(result.captures.final.raw);
        const joined = screen.join('\n');
        // The one-of violation error (the flow's real outcome) IS there.
        expect(joined).toMatch(/one of '-i, --secret-id/);
        // NOTHING of the prompts is: no open frame, no committed
        // answer, no footer.
        expect(joined).not.toMatch(/Choose which secrets/);
        expect(joined).not.toMatch(/Optional options for/);
        expect(joined).not.toMatch(/\] \d+ options/);
        expect(joined).not.toMatch(/type to filter/);
        expect(joined).not.toMatch(/esc backs out/);
        // And no authoring print: the flow never reached the action,
        // so the deferred print must not have flushed. (The usage
        // block's "frodo esv secret delete [options]" line is
        // commander's, not the print's.)
        expect(screen.filter((line) => line.startsWith('error:')).length).toBe(
          1
        );
        expect(
          screen.filter((line) => /^frodo esv secret delete [^[]/.test(line))
            .length
        ).toBe(0);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );

  test(
    'completed flow: prompts erase; the eventual command prints once, above the results',
    async () => {
      const homeDir = createShellTestHome();
      try {
        // `frodo realm list`: env-resolved connection (no profile
        // picker), auth SUCCEEDS on the mock cassette (service-account
        // credentials -- TestConfig's connection is what the cassettes
        // recorded), then the post-auth realm picker offers alpha/bravo.
        // Pick bravo (2nd row): the frames erase, the print fires in the
        // getTokens wrapper -- directly above the listing -- with the
        // picked realm in it (the realm write-back).
        const result = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: ['realm', 'list'],
          env: {
            ...ENV,
            FRODO_HOST: '__FRODO_PTY_DELETE__',
            FRODO_CONNECTION_PROFILES_PATH: '',
            // The color assertion below needs the binary's real theme
            // output -- jest sets NO_COLOR=1 and the PTY driver merges
            // the RUNNER's env under the scenario env. A blank does NOT
            // work: tinyrainbow disables color on mere PRESENCE of
            // NO_COLOR (checked after the #793 plain-print experiment
            // failed the color assertion). The DELETE sentinel removes
            // the key from the child's env entirely.
            NO_COLOR: '__FRODO_PTY_DELETE__',
            FRODO_SA_ID: connection.saId,
            FRODO_SA_JWK: connection.saJwk,
          },
          actions: [
            { type: 'wait_plain', regex: 'AM base URL:', timeoutMs: 30000 },
            { type: 'send', text: ENV.FRODO_HOST },
            { type: 'key', name: 'enter' },
            // the Ready step comes first: the realm picker needs the login
            ...answerReady(),
            { type: 'wait_plain', regex: 'Choose a realm', timeoutMs: 30000 },
            { type: 'sleep', ms: 400 },
            { type: 'key', name: 'down' },
            { type: 'sleep', ms: 400 },
            // Mid-prompt capture: the footer must already show the
            // HIGHLIGHTED realm (live preview), before <enter> commits.
            { type: 'capture', label: 'midPrompt' },
            { type: 'key', name: 'enter' },
            { type: 'sleep', ms: 2500 },
            { type: 'capture', label: 'final' },
          ],
        });

        // LIVE footer: with bravo highlighted (cursor moved down), the
        // footer's realm token reads bravo BEFORE enter.
        const midScreen = replayScreen(result.captures.midPrompt.raw);
        expect(
          midScreen.filter((line) => /^frodo realm list .*bravo$/.test(line))
            .length
        ).toBe(1);
        expect(
          midScreen.filter((line) => /^frodo realm list .*alpha$/.test(line))
            .length
        ).toBe(0);

        const screen = replayScreen(result.captures.final.raw);
        const printLines = screen.filter((line) =>
          /^frodo realm list .*bravo$/.test(line)
        );
        // Exactly one authoring print, with the PICKED realm in it.
        expect(printLines.length).toBe(1);
        // It is NOT the last line: the realm listing follows it -- the
        // print is a header for the results, not a footer after them.
        expect(screen[screen.length - 1]).not.toBe(printLines[0]);
        expect(screen.indexOf(printLines[0])).toBeLessThan(
          screen.indexOf('/alpha')
        );
        // No prompt residue: neither the open frame (question, list,
        // hint, footer) nor a committed/cancelled answer survived.
        const joined = screen.join('\n');
        expect(joined).not.toMatch(/Choose a realm/);
        expect(joined).not.toMatch(/Ready to run/);
        expect(joined).not.toMatch(/\] \d+ options/);
        expect(joined).not.toMatch(/type to filter/);
        expect(joined).not.toMatch(/esc backs out/);

        // The final print IS colored (user decision 2026-10-12,
        // reversing #793's plain-color experiment: green distinguishes
        // the print from the action's results below it). The erased
        // footer frames also carry the string (colored red or green by
        // readiness) and persist in the RAW stream -- so check the LAST
        // occurrence (the print, the final write of the session) only:
        // an SGR sequence must directly precede the print's text.
        const raw = result.captures.final.raw;
        const lastIdx = raw.lastIndexOf('bravo');
        expect(lastIdx).toBeGreaterThan(-1);
        const printIdx = raw.lastIndexOf('frodo realm list');
        expect(printIdx).toBeGreaterThan(-1);
        const before = raw.slice(Math.max(0, printIdx - 24), printIdx);
        expect(/\x1b\[[0-9;]*m$/.test(before)).toBe(true);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );
});
