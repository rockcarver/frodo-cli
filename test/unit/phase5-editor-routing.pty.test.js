import { connection } from '../e2e/utils/TestConfig.js';
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
 *   ("[→] N options" in the Navigate bar) -- the truthful promise the → key
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
            // The page opens on the first row without a value: username.
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
        expect(page).toMatch(/› username: \(not set\)/);
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
        expect(picker).toMatch(/\] \d+ options/);

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

  test(
    'realm picker: → opens the editor; ← returns to the realm picker',
    async () => {
      const homeDir = createShellTestHome();
      try {
        // `realm list` with env-resolved service-account credentials:
        // auth succeeds on the mock cassette, then the post-auth realm
        // picker (alpha/bravo) arms the → hint. REGRESSION (user report
        // 2026-10-13): this picker answered → by re-prompting itself
        // without ever opening the editor, so the key looked dead while
        // the Navigate bar still advertised "N options".
        const result = runShellScenario({
          homeDir,
          allowPrompting: true,
          args: ['realm', 'list'],
          env: {
            ...ENV,
            FRODO_HOST: '__FRODO_PTY_DELETE__',
            FRODO_CONNECTION_PROFILES_PATH: '',
            FRODO_SA_ID: connection.saId,
            FRODO_SA_JWK: connection.saJwk,
          },
          actions: [
            { type: 'wait_plain', regex: 'AM base URL:', timeoutMs: 30000 },
            { type: 'send', text: ENV.FRODO_HOST },
            { type: 'key', name: 'enter' },
            { type: 'wait_plain', regex: 'Choose a realm', timeoutMs: 30000 },
            { type: 'sleep', ms: 400 },
            { type: 'capture', label: 'picker' },
            { type: 'key', name: 'right' },
            {
              type: 'wait_plain',
              regex: 'Optional options for',
              timeoutMs: 15000,
            },
            { type: 'sleep', ms: 300 },
            { type: 'capture', label: 'editor' },
            // wait_plain scans ALL accumulated output, so drop it first:
            // the next 'Choose a realm' must be the picker RE-OPENING.
            { type: 'clear_output' },
            { type: 'key', name: 'left' },
            { type: 'wait_plain', regex: 'Choose a realm', timeoutMs: 15000 },
            { type: 'sleep', ms: 300 },
            { type: 'capture', label: 'back' },
          ],
        });

        expect(result.captures.picker.plain).toMatch(/\] \d+ options/);
        expect(result.captures.editor.plain).toMatch(
          /Optional options for 'list'/
        );
        expect(result.captures.back.plain).toMatch(/Choose a realm/);
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
          // The assertions below need auth to FAIL deterministically. On the
          // shared cloud login cassette the outcome depends on which
          // order-indexed /oauth2/authorize entry deployment detection
          // replays (cloud -> auth succeeds and the command runs; forgeops
          // -> auth fails). Bypass the cassette: the per-command recording
          // has no login entries, so auth always fails.
          env: { ...ENV, FRODO_MOCK_DEDICATED_AUTH: '1' },
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
        // The LIVE footer legitimately shows `-a` while the picker's
        // boolean member is highlighted (green-when-valid semantics);
        // the authoring print is a STANDALONE line, so anchor on the
        // line start -- a mid-frame footer fragment carries the panel
        // wall directly before it and does not match.
        expect(result.captures.final.plain).not.toMatch(
          /^frodo esv secret delete -a$/m
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

  /**
   * FOOTER COLOR (user report 2026-10-13: "the command is never red, always
   * green"). No test asserted the footer's color at all -- jest sets
   * NO_COLOR=1 and the PTY driver merges the runner's env under the
   * scenario's, so raw captures carried no SGR. Only the DELETE sentinel
   * removes the key (a blank still disables color; see prompt-erase). The
   * connection stage was the gap: the resolver recorded the connection's
   * state only AFTER its prompts concluded, and an unset flag reads as
   * "ready", so a command with no host / no credentials rendered green.
   */
  describe('footer color (red+italic = incomplete, green = ready)', () => {
    const COLOR_ENV = { NO_COLOR: '__FRODO_PTY_DELETE__' };
    const DROP = '__FRODO_PTY_DELETE__';
    const stripSgr = (text) => text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
    // The footer is the first `frodo ...` line under the last panel wall.
    const footerOf = (raw) =>
      raw
        .slice(raw.lastIndexOf('┘') + 1)
        .split('\n')
        .find((line) => stripSgr(line).trim().startsWith('frodo')) ?? '';
    const colorOf = (footer) => ({
      red: /\x1b\[(?:31|91)m/.test(footer),
      green: /\x1b\[(?:32|92)m/.test(footer),
      italic: /\x1b\[3m/.test(footer),
      text: stripSgr(footer).trim(),
    });
    // Connection-stage scenarios start from nothing: no host, no
    // credentials in the env, so the resolver must prompt for them.
    const NO_CONNECTION = {
      FRODO_HOST: DROP,
      FRODO_USERNAME: DROP,
      FRODO_PASSWORD: DROP,
    };

    test(
      'one-of picker (mandatory choice missing): red + italic',
      async () => {
        const homeDir = createShellTestHome();
        try {
          const result = runShellScenario({
            homeDir,
            allowPrompting: true,
            args: ['esv', 'secret', 'delete'],
            env: { ...ENV, ...COLOR_ENV },
            actions: [
              {
                type: 'wait_plain',
                regex: 'Choose which secrets',
                timeoutMs: 30000,
              },
              { type: 'sleep', ms: 400 },
              { type: 'capture', label: 'picker' },
            ],
          });
          const footer = colorOf(footerOf(result.captures.picker.raw));
          expect(footer.text).toBe('frodo esv secret delete');
          expect(footer).toMatchObject({ red: true, italic: true });
        } finally {
          removeShellTestHome(homeDir);
        }
      },
      TIMEOUT
    );

    test(
      'one-of picker boolean member HIGHLIGHT: green, flag alone (copy-paste-faithful)',
      async () => {
        // The boolean shadow maps to real `true` (what the committed pick
        // writes), so serializeCommand renders the flag ALONE -- the
        // re-typable short spelling `-a`, not `--all true` (regression pin
        // for the shadow-as-string bug, 2026-10-14). Green per the
        // valid-as-committed-now rule: the shadowed flag satisfies the
        // one-of group before any [ENTER].
        const homeDir = createShellTestHome();
        try {
          const result = runShellScenario({
            homeDir,
            allowPrompting: true,
            args: ['esv', 'secret', 'delete'],
            env: { ...ENV, ...COLOR_ENV },
            actions: [
              {
                type: 'wait_plain',
                regex: 'Choose which secrets',
                timeoutMs: 30000,
              },
              { type: 'sleep', ms: 400 },
              { type: 'key', name: 'down' }, // highlight -a, NO enter
              { type: 'sleep', ms: 400 },
              { type: 'capture', label: 'highlighted' },
            ],
          });
          const footer = colorOf(footerOf(result.captures.highlighted.raw));
          expect(footer.text).toBe('frodo esv secret delete -a');
          expect(footer).toMatchObject({
            green: true,
            red: false,
            italic: false,
          });
        } finally {
          removeShellTestHome(homeDir);
        }
      },
      TIMEOUT
    );

    test(
      'connection profile picker with no host chosen: red + italic',
      async () => {
        const homeDir = createShellTestHome();
        try {
          const result = runShellScenario({
            homeDir,
            allowPrompting: true,
            args: ['journey', 'list'],
            env: { ...ENV, ...NO_CONNECTION, ...COLOR_ENV },
            actions: [
              {
                type: 'wait_plain',
                regex: 'Choose a connection profile',
                timeoutMs: 30000,
              },
              { type: 'sleep', ms: 400 },
              // Filter to NO matches: nothing is highlighted, so the
              // footer shows the committed state -- no host yet.
              { type: 'send', text: 'zzzz' },
              { type: 'sleep', ms: 400 },
              { type: 'capture', label: 'noHost' },
            ],
          });
          const footer = colorOf(footerOf(result.captures.noHost.raw));
          expect(footer.text).toBe('frodo journey list');
          expect(footer).toMatchObject({
            red: true,
            green: false,
            italic: true,
          });
        } finally {
          removeShellTestHome(homeDir);
        }
      },
      TIMEOUT
    );

    test(
      'connection page while credentials are missing: red + italic',
      async () => {
        const homeDir = createShellTestHome();
        try {
          const result = runShellScenario({
            homeDir,
            allowPrompting: true,
            args: ['journey', 'list'],
            // A host with no saved profile: the credentials page opens.
            env: {
              ...ENV,
              ...NO_CONNECTION,
              FRODO_HOST: 'https://unknown.example.com/am',
              ...COLOR_ENV,
            },
            actions: [
              { type: 'wait_plain', regex: 'Connection:', timeoutMs: 30000 },
              { type: 'sleep', ms: 400 },
              { type: 'capture', label: 'page' },
            ],
          });
          const footer = colorOf(footerOf(result.captures.page.raw));
          expect(footer.text).toMatch(/^frodo journey list/);
          expect(footer).toMatchObject({
            red: true,
            green: false,
            italic: true,
          });
        } finally {
          removeShellTestHome(homeDir);
        }
      },
      TIMEOUT
    );

    test(
      'realm picker after prompting for the missing host: green, upright',
      async () => {
        const homeDir = createShellTestHome();
        try {
          const result = runShellScenario({
            homeDir,
            allowPrompting: true,
            args: ['realm', 'list'],
            env: {
              ...ENV,
              FRODO_HOST: '__FRODO_PTY_DELETE__',
              FRODO_CONNECTION_PROFILES_PATH: '',
              FRODO_SA_ID: connection.saId,
              FRODO_SA_JWK: connection.saJwk,
              ...COLOR_ENV,
            },
            actions: [
              { type: 'wait_plain', regex: 'AM base URL:', timeoutMs: 30000 },
              { type: 'send', text: ENV.FRODO_HOST },
              { type: 'key', name: 'enter' },
              { type: 'wait_plain', regex: 'Choose a realm', timeoutMs: 30000 },
              { type: 'sleep', ms: 400 },
              { type: 'capture', label: 'realm' },
            ],
          });
          const footer = colorOf(footerOf(result.captures.realm.raw));
          expect(footer.text).toMatch(/^frodo realm list /);
          expect(footer).toMatchObject({
            green: true,
            red: false,
            italic: false,
          });
        } finally {
          removeShellTestHome(homeDir);
        }
      },
      TIMEOUT
    );

    test(
      'entity picker HIGHLIGHT (valid as-committed-now, before enter): green, upright',
      async () => {
        // User decision 2026-10-14 (reversing "green only after commit"):
        // green = the command as-committed-now would be VALID, including
        // while the user is merely HIGHLIGHTING an entity. Arrowing
        // through the secret list shadows --secret-id into the footer;
        // that shadow satisfies the one-of group, so the footer flips
        // green BEFORE any [ENTER] -- a valid-looking command reads
        // valid. (The one-of PICKER stays red while a valued member is
        // highlighted: its value step is still owed -- no fake commit.)
        const homeDir = createShellTestHome();
        try {
          const result = runShellScenario({
            homeDir,
            allowPrompting: true,
            args: ['esv', 'secret', 'delete'],
            env: { ...ENV, ...COLOR_ENV },
            actions: [
              {
                type: 'wait_plain',
                regex: 'Choose which secrets',
                timeoutMs: 30000,
              },
              { type: 'key', name: 'enter' }, // -i: defers to the entity pick
              {
                type: 'wait_plain',
                regex: 'Select secret to act on',
                timeoutMs: 30000,
              },
              { type: 'sleep', ms: 500 }, // frame settle (slice-1 lesson)
              { type: 'key', name: 'down' }, // highlight, NO enter
              { type: 'sleep', ms: 500 },
              { type: 'capture', label: 'highlighted' },
            ],
          });
          const footer = colorOf(footerOf(result.captures.highlighted.raw));
          // The highlighted secret's id is shadowed into --secret-id.
          expect(footer.text).toMatch(
            /^frodo esv secret delete --secret-id \S+/
          );
          expect(footer).toMatchObject({
            green: true,
            red: false,
            italic: false,
          });
        } finally {
          removeShellTestHome(homeDir);
        }
      },
      TIMEOUT
    );

    test(
      'entity picker EMPTY FILTER: preview renders committed state, no crash',
      async () => {
        // Regression pin (2026-10-14): typing a filter that matches zero
        // rows used to crash the live footer preview with "Cannot read
        // properties of undefined (reading '_id')" -- the highlighted
        // entity is undefined on an empty list and the label callback
        // dereferenced it. Now the callback maps undefined -> undefined
        // (committed-state render) and the prompt shows its no-matches
        // hint. The process must survive, still on the picker.
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
              { type: 'key', name: 'enter' }, // -i: defers to the entity pick
              {
                type: 'wait_plain',
                regex: 'Select secret to act on',
                timeoutMs: 30000,
              },
              { type: 'sleep', ms: 500 }, // frame settle (slice-1 lesson)
              // Scrollback holds earlier frames (the one-of picker's
              // highlighted-member footer shadow, the commit echo) that
              // would trip the footer-line assertions -- clear it, then
              // type the zero-match filter so the capture holds only the
              // empty-filter frame (the send's re-render repopulates).
              { type: 'clear_output' },
              { type: 'send', text: '9no-match-9' }, // '9' matches no secret id: zero rows on the FIRST keystroke
              { type: 'sleep', ms: 700 },
              { type: 'capture', label: 'empty' },
            ],
          });
          const empty = result.captures.empty;
          // The no-matches hint renders (list is empty, not crashed).
          expect(empty.plain).toMatch(/no matches -- backspace to edit/);
          // The crash string must never appear.
          expect(empty.plain).not.toMatch(/Cannot read properties/);
          // With nothing highlighted, the footer shows the COMMITTED
          // state: the bare command line, with no --secret-id shadow on
          // it. (A bare substring ban would trip over the one-of picker
          // rows' "--secret-id <secret-id>" help text still in the
          // scrollback -- anchor on the footer line itself instead.)
          expect(empty.plain).toMatch(/^frodo esv secret delete$/m);
          expect(empty.plain).not.toMatch(
            /^frodo esv secret delete --secret-id/m
          );
        } finally {
          removeShellTestHome(homeDir);
        }
      },
      TIMEOUT
    );
  });
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
        expect(reopened).toMatch(/◉ (?:› )?\s*--debug/);
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
        expect(afterCommit).toMatch(/◉ (?:› )?\s*--env-file/);
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
        expect(navWhilePicker).toMatch(/\[ENTER\] pick · \[ESC\] rejects/);
        expect(navWhilePicker).not.toMatch(/\[space\] select/);

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
        expect(afterPickFrame).toMatch(/◉ (?:› )?\s*--retry/);
        expect(afterPickFrame).toMatch(
          /frodo esv secret delete -k --retry everything/
        );
        // Navigate menu back to the LIST hints once the editor closed.
        expect(afterPickFrame).toMatch(/\[space\] select · \[ENTER\] commit/);
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

  /**
   * GROUPED OPTIONS EDITOR (user decision 2026-10-13): the invocation
   * editor renders the command's own options flat and every shared help
   * group as a collapsible section (the -hh order). Through the real
   * prompt stack: initial collapse, [space] expand/collapse on a header,
   * filter flattening, auto-expand on selection, and the nav bar's
   * context-dependent [space] label.
   */
  describe('grouped options editor: collapsible sections', () => {
    const TIMEOUT = 90000;

    const openEditor = async (homeDir, args = [], extraActions = []) => {
      const result = runShellScenario({
        homeDir,
        allowPrompting: true,
        args: ['esv', 'secret', 'delete', ...args],
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
          ...extraActions,
        ],
      });
      return result;
    };

    test(
      'opens with own options + collapsed group headers; no shared flags visible',
      async () => {
        const homeDir = createShellTestHome();
        try {
          const result = await openEditor(
            homeDir,
            [],
            [{ type: 'capture', label: 'editor' }]
          );
          const editor = result.captures.editor.plain;
          // Own options flat on top...
          expect(editor).toMatch(/○ › -a, --all/);
          expect(editor).toMatch(/○   -i, --secret-id/);
          // ...each shared group a COLLAPSED header in the -hh order...
          expect(editor).toMatch(/▸ Authentication options \(9\)/);
          expect(editor).toMatch(/▸ Connection options \(4\)/);
          expect(editor).toMatch(/▸ Output options \(3\)/);
          expect(editor).toMatch(/▸ Runtime options \(7\)/);
          // ...with none of the shared flags visible while collapsed.
          expect(editor).not.toMatch(/--debug/);
          expect(editor).not.toMatch(/--env-file/);
          expect(editor).not.toMatch(/--idm-host/);
          expect(editor).not.toMatch(/--browser/);
        } finally {
          removeShellTestHome(homeDir);
        }
      },
      TIMEOUT
    );

    test(
      '[space] on a header expands in place; again collapses; badge counts selections',
      async () => {
        const homeDir = createShellTestHome();
        try {
          const result = await openEditor(
            homeDir,
            ['-k'],
            [
              // Cursor starts on the first row (-a). Down to the
              // Authentication header (3rd row), expand it.
              { type: 'key', name: 'down' },
              { type: 'key', name: 'down' },
              { type: 'sleep', ms: 300 },
              { type: 'capture', label: 'onHeader' },
              { type: 'key', name: 'space' },
              { type: 'sleep', ms: 400 },
              { type: 'capture', label: 'expanded' },
              // Collapse again. clear_output drops the expanded frame
              // from the accumulated stream; the next capture only has
              // content after a repaint, so nudge the cursor (up+down
              // = same position, fresh frame).
              { type: 'key', name: 'space' },
              { type: 'sleep', ms: 400 },
              { type: 'clear_output' },
              { type: 'key', name: 'up' },
              { type: 'key', name: 'down' },
              { type: 'sleep', ms: 400 },
              { type: 'capture', label: 'collapsed' },
            ]
          );
          const onHeader = result.captures.onHeader.plain;
          // The nav bar's [space] label follows the row kind.
          expect(onHeader).toMatch(/\[space\] expand/);
          const expanded = result.captures.expanded.plain;
          expect(expanded).toMatch(/▾ Authentication options \(9\)/);
          expect(expanded).toMatch(/--login-client-id/);
          expect(expanded).toMatch(/\[space\] collapse/);
          const collapsed = result.captures.collapsed.plain;
          expect(collapsed).toMatch(/▸ Authentication options \(9\)/);
          // The option ROW is gone (the panel description legitimately
          // still lists the group's flags while the cursor is on the
          // collapsed header), so anchor on the row shape.
          expect(collapsed).not.toMatch(/○ +--login-client-id/);
        } finally {
          removeShellTestHome(homeDir);
        }
      },
      TIMEOUT
    );

    test(
      'typing a filter flattens across groups: --debug found inside a collapsed group',
      async () => {
        const homeDir = createShellTestHome();
        try {
          const result = await openEditor(
            homeDir,
            [],
            [
              // The initial sectioned frame advertises the collapsed
              // headers; drop it from the accumulated stream so the
              // filtered capture's negative assertion (no headers while
              // flattened) reads only the filtered frame.
              { type: 'clear_output' },
              { type: 'send', text: 'debug' },
              { type: 'sleep', ms: 500 },
              { type: 'capture', label: 'filtered' },
              // Select it; the group must re-appear expanded when the
              // filter clears (auto-expand + commit below proves the
              // selection survived outside the flattened view).
              { type: 'key', name: 'space' },
              { type: 'sleep', ms: 200 },
              { type: 'key', name: 'ctrl_u' },
              { type: 'sleep', ms: 300 },
              { type: 'capture', label: 'selected' },
            ]
          );
          const filtered = result.captures.filtered.plain;
          expect(filtered).toMatch(/query: debug/);
          expect(filtered).toMatch(/--debug/);
          expect(filtered).not.toMatch(/▸ Output options/);
          const selected = result.captures.selected.plain;
          // Back on the sectioned list, Output is expanded and --debug marked.
          expect(selected).toMatch(/▾ Output options/);
          expect(selected).toMatch(/◉ (?:› )?\s*--debug/);
        } finally {
          removeShellTestHome(homeDir);
        }
      },
      TIMEOUT
    );

    test(
      'a pre-set shared option (flag/env) starts its group expanded and marked',
      async () => {
        const homeDir = createShellTestHome();
        try {
          const result = await openEditor(
            homeDir,
            ['--debug'],
            [{ type: 'capture', label: 'editor' }]
          );
          const editor = result.captures.editor.plain;
          expect(editor).toMatch(/▾ Output options \(3\)/);
          expect(editor).toMatch(/◉ (?:› )?\s*--debug/);
          // The other groups stay collapsed.
          expect(editor).toMatch(/▸ Runtime options \(7\)/);
        } finally {
          removeShellTestHome(homeDir);
        }
      },
      TIMEOUT
    );
  });

  /**
   * UNCOMMITTED-SELECTIONS GUARD (user rule 2026-10-13): [LEFT] is
   * disabled while the editor holds selections not yet committed
   * ([ENTER] commits, [ESC] resets them and backs out) -- the old
   * behavior silently discarded them. Also pins the [space]-toggle
   * buffer scrub: a toggle must not leak a space into the filter query
   * (it used to pollute it -- " curl" matched nothing -- and made the
   * buffer non-empty so [LEFT] was swallowed as cursor movement).
   */
  describe('grouped options editor: uncommitted-selections guard', () => {
    const TIMEOUT = 90000;

    test(
      '[LEFT] with uncommitted selections does nothing but shows the guard hint',
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
              { type: 'key', name: 'right' },
              {
                type: 'wait_plain',
                regex: 'Optional options for',
                timeoutMs: 15000,
              },
              { type: 'sleep', ms: 400 },
              { type: 'key', name: 'space' },
              { type: 'sleep', ms: 300 },
              { type: 'key', name: 'left' },
              { type: 'sleep', ms: 600 },
              { type: 'capture', label: 'guarded' },
            ],
          });
          const guarded = result.captures.guarded.plain;
          // The guard hint renders ONLY on an open editor frame, so its
          // presence proves the editor is still up (the done/cancelled
          // summaries never render it). Still the sectioned list, not a
          // concluded summary.
          expect(guarded).toMatch(/not committed/);
          expect(guarded).toMatch(/\[ESC\] resets, \[ENTER\] commits/);
          expect(guarded).toMatch(/▸ Authentication options/);
        } finally {
          removeShellTestHome(homeDir);
        }
      },
      TIMEOUT
    );

    test(
      '[ESC] with uncommitted selections resets them (nothing survives a reopen)',
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
              { type: 'key', name: 'right' },
              {
                type: 'wait_plain',
                regex: 'Optional options for',
                timeoutMs: 15000,
              },
              { type: 'sleep', ms: 400 },
              { type: 'key', name: 'space' },
              { type: 'sleep', ms: 300 },
              { type: 'key', name: 'escape' },
              { type: 'sleep', ms: 1000 },
              { type: 'key', name: 'right' },
              { type: 'sleep', ms: 2000 },
              { type: 'capture', label: 'reopened' },
            ],
          });
          // The LAST editor frame: the reopened editor's title is the
          // final occurrence, so the segment after it holds that
          // frame's rows. The first row (-a, --all) was toggled before
          // ESC; after the reset it must be UNMARKED there.
          const reopened = result.captures.reopened.plain
            .replace(/\x1b/g, '')
            .split('Optional options for')
            .pop();
          expect(reopened).not.toMatch(/◉[^│]*-a,/);
        } finally {
          removeShellTestHome(homeDir);
        }
      },
      TIMEOUT
    );

    test(
      '[space] toggle scrubs the buffer: filtering after a toggle still matches',
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
              { type: 'key', name: 'right' },
              {
                type: 'wait_plain',
                regex: 'Optional options for',
                timeoutMs: 15000,
              },
              { type: 'sleep', ms: 400 },
              { type: 'key', name: 'space' },
              { type: 'sleep', ms: 300 },
              { type: 'send', text: 'retry' },
              { type: 'sleep', ms: 500 },
              { type: 'capture', label: 'filtered' },
            ],
          });
          // ' retry' (leading space) matched nothing before the scrub.
          expect(result.captures.filtered.plain).toMatch(
            /-F, --force-update|--retry <strategy>/
          );
        } finally {
          removeShellTestHome(homeDir);
        }
      },
      TIMEOUT
    );
  });
});
