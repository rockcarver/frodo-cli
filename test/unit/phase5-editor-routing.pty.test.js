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
        FRODO_MASTER_KEY_PATH: new URL(
            '../e2e/env/masterkey.key',
            import.meta.url
        ).pathname,
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
                        { type: 'wait_plain', regex: 'Choose which secrets', timeoutMs: 30000 },
                        { type: 'key', name: 'right' },
                        { type: 'wait_plain', regex: 'Optional options for', timeoutMs: 15000 },
                        { type: 'sleep', ms: 400 },
                        { type: 'send', text: 'retry' },
                        // The description wraps mid-token in a narrow PTY,
                        // so anchor on the unambiguous prefix.
                        { type: 'wait_plain', regex: '\\(current: net', timeoutMs: 15000 },
                        { type: 'sleep', ms: 300 },
                        { type: 'capture', label: 'description' },
                        { type: 'key', name: 'space' },
                        { type: 'key', name: 'enter' },
                        { type: 'wait_plain', regex: 'Choose a value for --retry', timeoutMs: 15000 },
                        { type: 'capture', label: 'valuestep' },
                        { type: 'key', name: 'enter' },
                        { type: 'sleep', ms: 400 },
                        { type: 'capture', label: 'committed' },
                    ],
                });

                // The provided value shows as current in its description
                // (highlighted row).
                expect(result.captures.description.plain).toMatch(
                    /\(current: net[\s\S]*?work\)/
                );

                const valuestep = result.captures.valuestep.plain;
                // The value step PRE-HIGHLIGHTS it (mount-skip:
                // the cursor-reset-on-query-change must not clobber the
                // configured default on the first render).
                expect(valuestep).toMatch(/› network/);
                // Enter commits the pre-filled value as-is.
                expect(result.captures.committed.plain).toMatch(
                    /Choose a value for --retry <strategy>: network/
                );
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
                        { type: 'capture', label: 'page' },
                        { type: 'key', name: 'down' },
                        { type: 'key', name: 'enter' },
                        { type: 'send', text: 'probeuser' },
                        { type: 'key', name: 'enter' },
                        { type: 'key', name: 'down' },
                        { type: 'key', name: 'enter' },
                        { type: 'send', text: 'probesecret' },
                        { type: 'key', name: 'enter' },
                        { type: 'sleep', ms: 400 },
                        { type: 'capture', label: 'filled' },
                        { type: 'key', name: 'down' },
                        { type: 'key', name: 'enter' },
                        { type: 'wait_plain', regex: 'Choose which secrets', timeoutMs: 30000 },
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
                expect(result.captures.after.plain).toMatch(
                    /Choose which secrets/
                );
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
                        { type: 'wait_plain', regex: 'Choose which secrets', timeoutMs: 30000 },
                        // The prompt renders its frames over a few paint
                        // cycles; capture after the frame settles or the
                        // hint line races (seen on fast CI runners).
                        { type: 'sleep', ms: 400 },
                        { type: 'capture', label: 'picker' },
                        { type: 'key', name: 'right' },
                        { type: 'wait_plain', regex: 'Optional options for', timeoutMs: 15000 },
                        { type: 'capture', label: 'editor' },
                        { type: 'key', name: 'left' },
                        { type: 'wait_plain', regex: 'Choose which secrets', timeoutMs: 15000 },
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
        FRODO_MASTER_KEY_PATH: new URL(
            '../e2e/env/masterkey.key',
            import.meta.url
        ).pathname,
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
                        { type: 'wait_plain', regex: 'Choose which secrets', timeoutMs: 30000 },
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
                    /type to filter\nfrodo esv secret delete/
                );

                // After the user's `-a` selection resolves the one-of
                // group, the concluding authoring print shows exactly the
                // command with the user's token -- the copy-paste moment.
                expect(result.captures.final.plain).toMatch(
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
                        { type: 'wait_plain', regex: 'Choose which secrets', timeoutMs: 30000 },
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
        FRODO_MASTER_KEY_PATH: new URL(
            '../e2e/env/masterkey.key',
            import.meta.url
        ).pathname,
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
                expect(filtered.captures.filtered.plain).toMatch(
                    /-l, --long/
                );

                // Enter committed the empty set; the authoring print fired.
                expect(result.captures.after.plain).toMatch(
                    /\(none -- run with defaults\)/
                );
                expect(result.captures.after.plain).toMatch(
                    /frodo esv secret list/
                );
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
                        { type: 'wait_plain', regex: "unknown option", timeoutMs: 15000 },
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
});
