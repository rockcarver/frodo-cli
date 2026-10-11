import {
    createShellTestHome,
    removeShellTestHome,
    runShellScenario,
} from '../utils/ShellPty.js';

/**
 * Regression tests for the bare-stub sub-command picker's interaction with
 * root-level options (Phase 1b interception, src/cli/FrodoCommand.ts
 * _parseCommand override).
 *
 * The picker replaces commander's parseOptions wholesale when a stub is
 * invoked bare. Options that must act at the root itself -- the help family
 * and version -- would never fire if the picker swallowed them: on a TTY
 * `frodo -v` and `frodo -h` showed the sub-command picker instead of their
 * own output. `--no-prompt` (the explicit prompting opt-out) was likewise
 * swallowed.
 *
 * These tests need the REAL prompt gate (no FRODO_TEST): they run with
 * allowPrompting so the picker would fire if the interception regressed --
 * asserting on the root options' own output is what fails then.
 *
 * The positive picker case (bare `frodo` / `frodo journey` still shows the
 * picker) stays manual/PTY-probe-verified: asserting a prompt renders here
 * would make every CI runner open an interactive prompt.
 */
describe('bare stub invocation with root-exiting options', () => {
    // CI startup can be slow under resource contention; allow up to 90 s.
    const TIMEOUT = 90000;

    test(
        '"frodo -v" prints the version instead of the sub-command picker',
        async () => {
            const homeDir = createShellTestHome();
            try {
                const result = runShellScenario({
                    homeDir,
                    allowPrompting: true,
                    args: ['-v'],
                    actions: [
                        { type: 'wait_plain', regex: 'cli: v', timeoutMs: 30000 },
                        { type: 'capture', label: 'end' },
                    ],
                });
                expect(result.captures.end.plain).toMatch(/cli: v\d+\.\d+\.\d+/);
                expect(result.captures.end.plain).not.toMatch(
                    /Choose a sub-command/
                );
            } finally {
                removeShellTestHome(homeDir);
            }
        },
        TIMEOUT
    );

    test(
        '"frodo -h" prints help instead of the sub-command picker',
        async () => {
            const homeDir = createShellTestHome();
            try {
                const result = runShellScenario({
                    homeDir,
                    allowPrompting: true,
                    args: ['-h'],
                    actions: [
                        { type: 'wait_plain', regex: 'Usage: frodo', timeoutMs: 30000 },
                        { type: 'capture', label: 'end' },
                    ],
                });
                expect(result.captures.end.plain).toMatch(/Usage: frodo/);
                expect(result.captures.end.plain).not.toMatch(
                    /Choose a sub-command/
                );
            } finally {
                removeShellTestHome(homeDir);
            }
        },
        TIMEOUT
    );
});
