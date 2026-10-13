import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';

/**
 * Phase 5 slice 1 (INTERACTIVE-COMMANDS-PLAN.md): the key-language
 * sentinels and the discoverability hint, exercised through the real
 * prompt stack.
 *
 * - A picker with anything left to configure renders the counted hint
 *   ("→ N options to configure") -- the truthful promise the → key
 *   delivers on.
 * - → from that picker opens the invocation editor; ← (or Esc) in the
 *   editor returns to the picker.
 * - The editor never lists help machinery (--help-more/--help-all).
 *
 * The scenario command is `frodo esv secret delete` against the mock
 * tenant: it has a requireOneOf group (member picker), an entity-pickable
 * option, and plenty of optional options, so all three pieces show.
 */
describe('phase 5 slice 1: hint + segment routing', () => {
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
    'editor lists provided options with (current: x) and pre-fills the value step',
    async () => {
      const homeDir = createShellTestHome();
      try {
        const result = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: ['esv', 'secret', 'delete', '-k', '--retry', 'network'],
          env: ENV,
          actions: [
            {
              type: 'wait_plain',
              regex: 'Choose which secrets',
              timeoutMs: 30000,
            },
            { type: 'key', name: 'right' },
            {
              type: 'wait_plain',
              regex: 'Optional options for',
              timeoutMs: 15000,
            },
            { type: 'sleep', ms: 400 },
            { type: 'send', text: 'retry' },
            // The description wraps mid-token in a narrow PTY,
            // so anchor on the unambiguous prefix.
            { type: 'wait_plain', regex: '\\(current: net', timeoutMs: 15000 },
            { type: 'sleep', ms: 300 },
            { type: 'capture', label: 'description' },
            // --retry arrives PRE-MARKED (it holds a user value, source
            // 'cli'): <enter> commits the selection WITH it -- and the
            // post-commit loop SKIPS its value step (the value already
            // stands from the command line; the skip rule keeps
            // already-valued members from being asked twice -- the
            // inline editor's onValue commits set the same source).
            { type: 'key', name: 'enter' },
            { type: 'sleep', ms: 600 },
            { type: 'capture', label: 'committed' },
          ],
        });

        // The provided value shows as current in its description
        // (highlighted row).
        expect(result.captures.description.plain).toMatch(
          /\(current: net[\s\S]*?work\)/
        );

        const committed = result.captures.committed.plain;
        // Enter committed straight away -- no second prompt for the
        // value the command line already provided.
        expect(committed).toMatch(
          /Choose which secrets: -i, --secret-id <secret-id>/
        );
        expect(committed).not.toMatch(/Choose a value for --retry/);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );

  test(
    'connection page: rows, masked password edit, Done concludes',
    async () => {
      const homeDir = createShellTestHome();
      try {
        const result = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: [
            'esv',
            'secret',
            'delete',
            'https://page-probe.example.com/am',
          ],
          env: { FRODO_MOCK: '1', FRODO_MOCK_DEPLOYMENT: 'cloud' },
          actions: [
            { type: 'wait_plain', regex: 'Connection:', timeoutMs: 30000 },
            { type: 'sleep', ms: 500 },
            { type: 'capture', label: 'page' },
            { type: 'key', name: 'down' },
            { type: 'key', name: 'enter' },
            { type: 'send', text: 'probeuser' },
            { type: 'key', name: 'enter' },
            { type: 'key', name: 'down' },
            { type: 'key', name: 'enter' },
            { type: 'send', text: 'probesecret' },
            { type: 'key', name: 'enter' },
            // GATE on the committed mask, then settle -- a blind sleep
            // raced the render and captured the password row mid-editing
            // ('password: •', one bullet of a still-open editor).
            {
              type: 'wait_plain',
              regex: 'password: ••••••••',
              timeoutMs: 8000,
            },
            { type: 'sleep', ms: 300 },
            { type: 'capture', label: 'filled' },
            { type: 'key', name: 'down' },
            { type: 'key', name: 'enter' },
            {
              type: 'wait_plain',
              regex: 'Choose which secrets',
              timeoutMs: 30000,
            },
            { type: 'capture', label: 'after' },
          ],
        });

        const page = result.captures.page.plain;
        expect(page).toMatch(/host: https:\/\/page-probe\.example\.com\/am/);
        expect(page).toMatch(/username: \(not set\)/);
        expect(page).toMatch(/password: \(not set\)/);
        expect(page).toMatch(/Done/);

        const filled = result.captures.filled.plain;
        expect(filled).toMatch(/username: probeuser/);
        // The committed password renders masked, never plaintext.
        expect(filled).toMatch(/password: ••••••••/);
        expect(filled).not.toMatch(/probesecret/);

        // Done concluded and the flow continued to the one-of
        // picker with the values applied.
        expect(result.captures.after.plain).toMatch(/Choose which secrets/);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );

  test(
    'one-of picker shows the hint; → opens the editor; ← returns',
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
            // The prompt renders its frames over a few paint
            // cycles; capture after the frame settles or the
            // hint line races (seen on fast CI runners).
            { type: 'sleep', ms: 400 },
            { type: 'capture', label: 'picker' },
            { type: 'key', name: 'right' },
            {
              type: 'wait_plain',
              regex: 'Optional options for',
              timeoutMs: 15000,
            },
            { type: 'capture', label: 'editor' },
            { type: 'key', name: 'left' },
            {
              type: 'wait_plain',
              regex: 'Choose which secrets',
              timeoutMs: 15000,
            },
            { type: 'key', name: 'escape' },
            { type: 'capture', label: 'end' },
          ],
        });

        const picker = result.captures.picker.plain;
        expect(picker).toMatch(/Choose which secrets/);
        expect(picker).toMatch(/→ \d+ options to configure/);

        const editor = result.captures.editor.plain;
        expect(editor).toMatch(/Optional options for 'delete'/);
        expect(editor).not.toMatch(/--help-more/);
        expect(editor).not.toMatch(/--help-all/);

        // Back at the picker after ←, the hint still shows.
        expect(result.captures.end.plain).toMatch(/Choose which secrets/);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );
});

/**
 * Phase 5 slice 4 (INTERACTIVE-COMMANDS-PLAN.md): the command preview --
 * the command being authored rendered live in the prompt footers (red +
 * cursive while mandatory input is missing, green/white upright when
 * validated), and the final authoring print on the concluding <enter>
 * (the copy-paste moment).
 *
 * Readiness is the RESOLVER's truth, not positional sniffing: with the
 * connection resolved from env/profile (FRODO_HOST/FRODO_USERNAME/
 * FRODO_PASSWORD set), the host/username/password positionals stay empty
 * yet the final print is green -- the case that drove the readiness
 * refactor (isCommandReady no longer inspects the command object for
 * connection state).
 */
describe('phase 5 slice 4: command preview', () => {
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
    'footer red+cursive while incomplete; final print green with the user token',
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
            // Frame-settle sleep: capture-at-match-time grabs
            // mid-frame on fast runners (slice-1 lesson).
            { type: 'sleep', ms: 400 },
            { type: 'capture', label: 'incomplete' },
            { type: 'key', name: 'down' },
            { type: 'key', name: 'enter' },
            { type: 'sleep', ms: 600 },
            { type: 'capture', label: 'final' },
          ],
        });

        // While the one-of group is unsatisfied, the footer shows
        // the bare command path. (Color is verified by manual PTY
        // probe -- the jest run sets NO_COLOR=1, so raw captures
        // carry no SGR sequences here.)
        expect(result.captures.incomplete.plain).toMatch(
          /^frodo esv secret delete$/m
        );

        // After the user's `-a` selection resolves the one-of
        // group, the committed answer used to conclude with an
        // authoring print showing exactly the command with the
        // user's token. Since the prompt-erase slice that print
        // is deferred and gated on the command actually RUNNING
        // (auth success) -- this scenario's mock auth fails, so
        // NOTHING prints: an abandoned/failed session leaves no
        // print behind. The print's presence + placement is
        // covered by prompt-erase.pty.test.js's realm-list flow
        // (auth succeeds there).
        expect(result.captures.final.plain).not.toMatch(
          /frodo esv secret delete -a/
        );
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );

  test(
    'serializer: provided tokens appear; defaults and empty values stay out',
    async () => {
      const homeDir = createShellTestHome();
      try {
        const result = runShellScenario({
          homeDir,
          allowPrompting: true,
          // --env (not a one-of member) keeps the picker up so the
          // footer can be captured; the value must be well-formed
          // (key=value) or the command errors before prompting.
          // --no-cache covers the negatable-option shape (typed
          // negative form, value false, source cli).
          args: [
            'esv',
            'secret',
            'delete',
            '--no-cache',
            '--env',
            'a=1',
            '--env',
            'b=2',
          ],
          env: ENV,
          actions: [
            {
              type: 'wait_plain',
              regex: 'Choose which secrets',
              timeoutMs: 30000,
            },
            { type: 'sleep', ms: 400 },
            { type: 'capture', label: 'footer' },
          ],
        });

        const footer = result.captures.footer.plain;
        // Every serialized token must be re-typable: the negatable
        // flag alone (NOT "--no-cache false") and repeated flags
        // for array-valued options (NOT a joined "a=1,b=2").
        expect(footer).toMatch(
          /frodo esv secret delete --no-cache --env a=1 --env b=2/
        );
        // Commander defaults (--retry nothing, --no-open) never
        // serialize -- the preview is a copy-paste source of
        // exactly what the user would type.
        expect(footer).not.toMatch(/--retry nothing/);
        expect(footer).not.toMatch(/--no-open/);
        // Unset array/valued options don't appear as bare flags.
        expect(footer).not.toMatch(/--env-file/);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );
});

/**
 * Phase 5 slice 5 (INTERACTIVE-COMMANDS-PLAN.md): the --prompt/--no-prompt
 * trigger pair and the --edit retirement.
 *
 * - An explicit --prompt runs the interactive flow even when nothing is
 *   mandatory pending: the options editor opens (and, via slice 4, the
 *   authoring print follows).
 * - The SAME command without --prompt stays quiet on a fully-specified
 *   run: no prompts, no editor, no print (default behavior unchanged).
 * - --no-prompt keeps the classic errors (no prompts) even on a TTY.
 * - --edit is retired: commander rejects it as an unknown option.
 *
 * `frodo esv secret list` is the probe command: nothing mandatory, so the
 * difference between "--prompt opens the editor" and "default stays
 * quiet" shows cleanly.
 */
describe('phase 5 slice 5: prompt trigger flags', () => {
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
    '--prompt opens the options editor on a fully-specified run',
    async () => {
      const homeDir = createShellTestHome();
      try {
        const result = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: ['esv', 'secret', 'list', '--prompt'],
          env: ENV,
          actions: [
            { type: 'wait_plain', regex: 'Optional options', timeoutMs: 30000 },
            // Frame-settle sleep (slice-1 lesson).
            { type: 'sleep', ms: 400 },
            { type: 'capture', label: 'editor' },
            { type: 'key', name: 'enter' },
            { type: 'sleep', ms: 800 },
            { type: 'capture', label: 'after' },
          ],
        });

        // The editor opened with the command's optional options
        // (nothing was pending; --prompt forced the flow).
        expect(result.captures.editor.plain).toMatch(
          /Optional options for 'list'/
        );

        // Type-to-filter narrows to --long (it sits beyond the
        // 20-item pagination window: shared options render
        // before the leaf's own).
        const filtered = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: ['esv', 'secret', 'list', '--prompt'],
          env: ENV,
          actions: [
            { type: 'wait_plain', regex: 'Optional options', timeoutMs: 30000 },
            { type: 'send', text: 'long' },
            { type: 'sleep', ms: 400 },
            { type: 'capture', label: 'filtered' },
          ],
        });
        expect(filtered.captures.filtered.plain).toMatch(/-l, --long/);

        // Enter committed the empty set; the authoring print fired.
        expect(result.captures.after.plain).toMatch(
          /\(none -- run with defaults\)/
        );
        expect(result.captures.after.plain).toMatch(/frodo esv secret list/);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );

  test(
    'fully-specified run without --prompt stays quiet; --edit is retired',
    async () => {
      const homeDir = createShellTestHome();
      try {
        const quiet = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: ['esv', 'secret', 'list'],
          env: ENV,
          actions: [
            { type: 'sleep', ms: 2500 },
            { type: 'capture', label: 'out' },
          ],
        });

        // No editor, no prompts, no authoring print: the
        // fully-specified default run is byte-identical to
        // pre-Phase-5 behavior.
        expect(quiet.captures.out.plain).not.toMatch(/Optional options/);
        expect(quiet.captures.out.plain).not.toMatch(/Choose which/);
        expect(quiet.captures.out.plain).not.toMatch(/Connection:/);

        // --edit retired: commander rejects it as an unknown option
        // (same exit path for stub-level help snapshots).
        const retired = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: ['esv', 'secret', 'list', '--edit'],
          env: ENV,
          actions: [
            { type: 'wait_plain', regex: 'unknown option', timeoutMs: 15000 },
            { type: 'sleep', ms: 300 },
            { type: 'capture', label: 'err' },
          ],
        });
        expect(retired.captures.err.plain).toMatch(
          /error: unknown option '--edit'/
        );
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );

  test(
    'editor selections: the footer shows the space-toggled set live, and re-opening the editor keeps prior selections marked',
    async () => {
      const homeDir = createShellTestHome();
      try {
        const result = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: ['esv', 'secret', 'delete', '-k', '--retry', 'network'],
          env: ENV,
          actions: [
            {
              type: 'wait_plain',
              regex: 'Choose which secrets',
              timeoutMs: 30000,
            },
            { type: 'sleep', ms: 400 },
            { type: 'key', name: 'right' },
            {
              type: 'wait_plain',
              regex: 'Optional options for',
              timeoutMs: 15000,
            },
            { type: 'sleep', ms: 400 },
            { type: 'send', text: 'verbose' },
            { type: 'sleep', ms: 400 },
            { type: 'key', name: 'space' },
            { type: 'sleep', ms: 200 },
            { type: 'key', name: 'ctrl_u' },
            { type: 'sleep', ms: 300 },
            { type: 'send', text: 'debug' },
            { type: 'sleep', ms: 400 },
            { type: 'key', name: 'space' },
            { type: 'sleep', ms: 200 },
            { type: 'capture', label: 'twoMarked' },
            { type: 'key', name: 'enter' },
            { type: 'sleep', ms: 1200 },
            { type: 'key', name: 'right' },
            {
              type: 'wait_plain',
              regex: 'Optional options for',
              timeoutMs: 15000,
            },
            { type: 'sleep', ms: 400 },
            { type: 'capture', label: 'reopened' },
          ],
        });

        // The footer follows the space-toggled SET, live -- both flags
        // visible before <enter> commits the set. (--retry was provided
        // on the command line, so it serializes its REAL value; the
        // placeholder shadow now stands down for options that already
        // hold a user value.)
        const two = result.captures.twoMarked.plain;
        expect(two).toMatch(
          /frodo esv secret delete -k --verbose --debug --retry network/
        );

        // Re-opened editor (via the one-of picker's ->): previously
        // committed selections are PRE-MARKED -- the user's markers are
        // the command state, not an empty slate.
        const reopened = result.captures.reopened.plain;
        expect(reopened).toMatch(/frodo esv secret delete -k --verbose/);
        expect(reopened).toMatch(/◉ (?:› )?--debug/);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );

  test(
    'inline value editor: framed box, filter-query leak guard, esc rejects (no nested prompt freeze)',
    async () => {
      const homeDir = createShellTestHome();
      try {
        const result = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: ['esv', 'secret', 'delete', '-k', '--retry', 'network'],
          env: ENV,
          actions: [
            {
              type: 'wait_plain',
              regex: 'Choose which secrets',
              timeoutMs: 30000,
            },
            { type: 'sleep', ms: 400 },
            { type: 'key', name: 'right' },
            {
              type: 'wait_plain',
              regex: 'Optional options for',
              timeoutMs: 15000,
            },
            { type: 'sleep', ms: 400 },
            { type: 'send', text: 'env-file' },
            {
              type: 'wait_plain',
              regex: 'query: env-file',
              timeoutMs: 15000,
            },
            { type: 'sleep', ms: 300 },
            // Space on a valued-unset option: the INLINE value editor
            // opens IN THE SAME FRAME, as a FRAMED box in the top slot
            // (the previous async-hook design nested a second prompt
            // and froze the outer one; the pre-framed collector sat at
            // the frame bottom where it was hard to see).
            { type: 'key', name: 'space' },
            {
              type: 'wait_plain',
              regex: 'Value for --env-file',
              timeoutMs: 8000,
            },
            { type: 'sleep', ms: 300 },
            { type: 'send_line', text: 'FOO=bar' },
            { type: 'sleep', ms: 500 },
            { type: 'capture', label: 'afterCommit' },
            // Reject path: space on another valued option, then esc --
            // the option stays unmarked.
            { type: 'key', name: 'ctrl_u' },
            { type: 'sleep', ms: 300 },
            { type: 'send', text: 'env' },
            { type: 'sleep', ms: 500 },
            { type: 'key', name: 'space' },
            {
              type: 'wait_plain',
              regex: 'Value for -E, --env',
              timeoutMs: 8000,
            },
            { type: 'sleep', ms: 400 },
            { type: 'capture', label: 'rejectOpen' },
            { type: 'key', name: 'escape' },
            { type: 'sleep', ms: 400 },
            { type: 'capture', label: 'afterReject' },
          ],
        });

        // The committed value marked the option, and the footer
        // serializes the REAL value (the filter query "env-file" did
        // not leak into the buffer as a prefix of the value).
        const afterCommit = result.captures.afterCommit.plain;
        expect(afterCommit).toMatch(/◉ (?:› )?--env-file/);
        expect(afterCommit).toMatch(
          /frodo esv secret delete -k --retry network --env-file FOO=bar/
        );
        // The reject path opens the same framed box for -E/--env...
        const rejectOpen = result.captures.rejectOpen.plain;
        const rejectFrame = rejectOpen.slice(
          rejectOpen.lastIndexOf('┌ Value for')
        );
        expect(rejectFrame).toMatch(/┌ Value for -E, --env <key=value> ─/);
        // ...and escaping it leaves the option UNMARKED (the committed
        // --env-file stands; "--env" is a PREFIX of "--env-file", so the
        // boundary assertions anchor on a space/end, never \b -- dash is
        // a non-word char and \b would match inside the committed
        // option's name).
        const afterReject = result.captures.afterReject.plain;
        expect(afterReject).not.toMatch(/◉ (?:› )?--env /);
        expect(afterReject).not.toMatch(/◉ (?:› )?--env$/m);
        expect(afterReject).toMatch(/--env-file/);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );

  test(
    'enum option gets an in-frame PICKER (not free text): cursor moves, commit serializes the real value',
    async () => {
      const homeDir = createShellTestHome();
      try {
        const result = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: ['esv', 'secret', 'delete', '-k'],
          env: ENV,
          actions: [
            {
              type: 'wait_plain',
              regex: 'Choose which secrets',
              timeoutMs: 30000,
            },
            { type: 'sleep', ms: 400 },
            { type: 'key', name: 'right' },
            {
              type: 'wait_plain',
              regex: 'Optional options for',
              timeoutMs: 15000,
            },
            { type: 'sleep', ms: 400 },
            { type: 'send', text: 'retry' },
            // Gate on the FILTERED frame (the option is on-page and
            // highlighted) before toggling -- racing the filter echo
            // toggles whichever row the half-typed query highlighted.
            { type: 'wait_plain', regex: 'query: retry', timeoutMs: 15000 },
            { type: 'sleep', ms: 300 },
            { type: 'key', name: 'space' },
            {
              type: 'wait_plain',
              regex: 'Value for --retry',
              timeoutMs: 8000,
            },
            { type: 'sleep', ms: 400 },
            { type: 'capture', label: 'pickerOpen' },
            // RETRY_STRATEGIES order [nothing, everything, network]:
            // one down moves the cursor nothing -> everything.
            { type: 'key', name: 'down' },
            { type: 'sleep', ms: 400 },
            { type: 'capture', label: 'pickerMoved' },
            { type: 'key', name: 'enter' },
            { type: 'sleep', ms: 600 },
            { type: 'capture', label: 'afterPick' },
          ],
        });

        const pickerOpen = result.captures.pickerOpen.plain;
        // Captures ACCUMULATE all prior frames -- assertions on the
        // CURRENT frame must slice from the marker onward.
        const pickerFrame = pickerOpen.slice(
          pickerOpen.lastIndexOf('┌ Value for --retry')
        );
        expect(pickerFrame).toMatch(/┌ Value for --retry <strategy> ─/);
        expect(pickerFrame).toMatch(/› nothing/);
        expect(pickerFrame).toMatch(/  everything/);
        expect(pickerFrame).toMatch(/  network/);
        // PANEL PER SURFACE: the Navigate box stays on top while the
        // picker is open -- it swaps its hints to the picker's keys
        // (slice the Navigate box out of the same capture and assert it
        // shows the picker hints, not the list hints).
        const navWhilePicker = pickerOpen.slice(
          pickerOpen.lastIndexOf('┌ Navigate ─'),
          pickerOpen.lastIndexOf('┌ Value for --retry')
        );
        expect(navWhilePicker).toMatch(/enter pick · esc rejects/);
        expect(navWhilePicker).not.toMatch(/space select/);

        const pickerMoved = result.captures.pickerMoved.plain;
        const movedFrame = pickerMoved.slice(
          pickerMoved.lastIndexOf('┌ Value for --retry')
        );
        expect(movedFrame).toMatch(/› everything/);
        expect(movedFrame).toMatch(/  nothing/);

        const afterPick = result.captures.afterPick.plain;
        const afterPickFrame = afterPick.slice(
          afterPick.lastIndexOf('┌ Navigate ─')
        );
        // everything picked -> marked, footer carries the REAL value.
        // (The list ROW keeps showing the flag spec -- `--retry
        // <strategy>` is the option's label; the footer is where the
        // real value belongs.)
        expect(afterPickFrame).toMatch(/◉ (?:› )?--retry/);
        expect(afterPickFrame).toMatch(
          /frodo esv secret delete -k --retry everything/
        );
        // Navigate menu back to the LIST hints once the editor closed.
        expect(afterPickFrame).toMatch(/space select · enter commit/);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );

  test(
    'debug output does not appear during the editor; appears only in action output',
    async () => {
      const homeDir = createShellTestHome();
      try {
        const result = runShellScenario({
          homeDir,
          allowPrompting: true,
          // --debug BEFORE the prompt flag; editor still must be clean.
          args: ['esv', 'secret', 'delete', '-k', '--debug', '--prompt'],
          env: ENV,
          actions: [
            {
              type: 'wait_plain',
              regex: 'Choose which secrets',
              timeoutMs: 30000,
            },
            { type: 'sleep', ms: 500 },
            { type: 'key', name: 'right' },
            {
              type: 'wait_plain',
              regex: 'Optional options for',
              timeoutMs: 30000,
            },
            { type: 'sleep', ms: 600 },
            { type: 'capture', label: 'editorWithDebug' },
            { type: 'key', name: 'escape' },
            { type: 'sleep', ms: 400 },
            { type: 'key', name: 'space' },
            { type: 'sleep', ms: 400 },
            { type: 'key', name: 'enter' },
            { type: 'sleep', ms: 4000 },
            { type: 'capture', label: 'afterRun' },
          ],
        });

        const editor = result.captures.editorWithDebug.plain;
        // Editor frame is CLEAN: no debug chatter between Navigate box
        // and the footer. (Debug output, if any, would be raw state
        // dumps interleaved with the frame.)
        expect(editor).toMatch(/┌ Navigate ─/);
        expect(editor).toMatch(/Optional options for 'delete'/);
        // Any debugMessage lines carry the FrodoCommand: prefix; the
        // editor frame must not contain them.
        expect(editor).not.toMatch(/FrodoCommand:/);

        const after = result.captures.afterRun.plain;
        // The run concludes (delete-all via the one-of -a pick): the
        // debug lines DO appear -- but only in the ACTION output, never
        // inside the prompt frames. Find the LAST Navigate box and
        // confirm every debug line comes after it.
        const lastNav = after.lastIndexOf('┌ Navigate ─');
        const firstDebug = after.indexOf('FrodoCommand:');
        if (firstDebug !== -1) {
          expect(firstDebug).toBeGreaterThan(lastNav);
        }
        expect(after).toMatch(/frodo esv secret delete -k --debug/);
      } finally {
        removeShellTestHome(homeDir);
      }
    },
    TIMEOUT
  );
});
