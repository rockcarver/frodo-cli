/**
 * Phase 4 persistent per-command defaults, PTY-verified end to end
 * (see docs/INTERACTIVE-COMMANDS.md, the resolution pass):
 *
 * 1. SAVE: `frodo journey list --prompt --save-defaults` opens the
 *    invocation editor; committing an option's value persists it to
 *    ~/.frodo/Defaults.json under the command's full store path
 *    ("frodo journey list").
 * 2. APPLY: a fresh run of the same command picks the saved value up --
 *    the preview footer carries `--long` immediately (applied with
 *    commander source 'cli', so the serializer counts it as authored
 *    input), and the editor lists the option as already-valued
 *    (`(current: true)`).
 *
 * The scenario env blanks NO_COLOR via the driver's DELETE sentinel
 * (tinyrainbow disables color on mere PRESENCE of NO_COLOR -- the
 * footer assertions only need plain text here, but the sentinel keeps
 * the child env identical to a real terminal's).
 */

import fs from 'fs';
import { connection } from '../e2e/utils/TestConfig.js';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';

const TIMEOUT = 90000;

const ENV = {
  FRODO_MOCK: '1',
  FRODO_HOST: 'https://openam-frodo-dev.forgeblocks.com/am',
  FRODO_MOCK_DEPLOYMENT: 'cloud',
  FRODO_CONNECTION_PROFILES_PATH: new URL(
    '../e2e/env/Connections.json',
    import.meta.url
  ).pathname,
  FRODO_MASTER_KEY_PATH: new URL('../e2e/env/masterkey.key', import.meta.url)
    .pathname,
  NO_COLOR: '__FRODO_PTY_DELETE__',
  FRODO_SA_ID: connection.saId,
  FRODO_SA_JWK: connection.saJwk,
};

describe('phase 4: persistent per-command defaults', () => {
  test(
    '--prompt --save-defaults persists committed options; the next run applies them',
    async () => {
      const homeDir = createShellTestHome();
      try {
        // SAVE: filter to --long, select it, commit the set. The
        // boolean's value step auto-commits true (no second prompt).
        const save = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: ['journey', 'list', '--prompt', '--save-defaults'],
          env: ENV,
          actions: [
            {
              type: 'wait_plain',
              regex: 'Optional options for',
              timeoutMs: 30000,
            },
            { type: 'sleep', ms: 400 },
            { type: 'send', text: 'long' },
            { type: 'sleep', ms: 500 },
            { type: 'key', name: 'space' },
            { type: 'sleep', ms: 300 },
            { type: 'key', name: 'enter' },
            { type: 'sleep', ms: 3000 },
            { type: 'capture', label: 'afterSave' },
          ],
        });

        const defaultsFile = `${homeDir}/.frodo/Defaults.json`;
        expect(fs.existsSync(defaultsFile)).toBe(true);
        const saved = JSON.parse(fs.readFileSync(defaultsFile, 'utf8'));
        expect(saved).toEqual({ 'frodo journey list': { long: true } });

        // APPLY: a fresh run of the same command. The footer shows
        // --long before any interaction (the saved default applied
        // during the resolution pass, before the editor opened), and
        // filtering the editor to the option shows it already-valued.
        const run = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: ['journey', 'list', '--prompt'],
          env: ENV,
          actions: [
            {
              type: 'wait_plain',
              regex: 'Optional options for',
              timeoutMs: 30000,
            },
            { type: 'sleep', ms: 400 },
            { type: 'send', text: 'long' },
            { type: 'sleep', ms: 500 },
            { type: 'capture', label: 'editor' },
            { type: 'key', name: 'escape' },
            { type: 'sleep', ms: 300 },
            { type: 'key', name: 'escape' },
            { type: 'sleep', ms: 3000 },
            { type: 'capture', label: 'end' },
          ],
        });
        const editorPlain = run.captures.editor.plain;
        // The saved default is visible in the footer AND as the
        // option's current value in the editor list. (--long sits
        // beyond the editor's 20-row page, so the filter is what brings
        // its row into the frame. The description trails inside the
        // panel after a blank separator row -- panel per surface -- so
        // the pattern tolerates the panel wall + padding between them.)
        expect(editorPlain).toMatch(/frodo journey list alpha -l/);
        expect(editorPlain).toMatch(
          /-l, --long[^\n]*\n[^\n]*\n[^\n]*Long with all fields\. \(current: true\)/
        );
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );

  test(
    'the editor footer reflects the SPACE-TOGGLED selection, not just the cursor',
    async () => {
      const homeDir = createShellTestHome();
      try {
        const run = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: ['journey', 'list', '--prompt'],
          env: ENV,
          actions: [
            {
              type: 'wait_plain',
              regex: 'Optional options for',
              timeoutMs: 30000,
            },
            { type: 'sleep', ms: 400 },
            { type: 'send', text: 'verbose' },
            { type: 'sleep', ms: 400 },
            { type: 'key', name: 'space' },
            { type: 'sleep', ms: 300 },
            // Selection footer: --verbose is marked, the footer must
            // show it BEFORE enter commits the set.
            { type: 'capture', label: 'oneSelected' },
            // ctrl-u clears the filter; then mark --debug too.
            { type: 'key', name: 'ctrl_u' },
            { type: 'sleep', ms: 300 },
            { type: 'send', text: 'debug' },
            { type: 'sleep', ms: 400 },
            { type: 'key', name: 'space' },
            { type: 'sleep', ms: 400 },
            { type: 'capture', label: 'twoSelected' },
          ],
        });
        const one = run.captures.oneSelected.plain;
        const two = run.captures.twoSelected.plain;
        expect(one).toMatch(/frodo journey list alpha --verbose/);
        expect(two).toMatch(/frodo journey list alpha --verbose --debug/);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );
});
