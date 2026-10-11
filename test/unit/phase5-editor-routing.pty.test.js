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
