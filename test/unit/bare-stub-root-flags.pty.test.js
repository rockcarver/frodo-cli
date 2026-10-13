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

    test(
        'sub-command picker with an active filter renders ALIGNED walls',
        async () => {
            const homeDir = createShellTestHome();
            try {
                const result = runShellScenario({
                    homeDir,
                    allowPrompting: true,
                    args: [],
                    actions: [
                        {
                            type: 'wait_plain',
                            regex: 'Choose a sub-command',
                            timeoutMs: 30000,
                        },
                        { type: 'sleep', ms: 500 },
                        { type: 'send', text: 'config' },
                        {
                            type: 'wait_plain',
                            regex: 'query: config',
                            timeoutMs: 15000,
                        },
                        { type: 'sleep', ms: 400 },
                        { type: 'capture', label: 'filtered' },
                    ],
                });

                const frame = result.captures.filtered.plain.slice(
                    result.captures.filtered.plain.lastIndexOf('┌ ? Choose a sub-command')
                );
                // The query echo now renders for name-fallback pickers
                // too (the list visibly narrowed; the title must say so).
                expect(frame).toMatch(
                    /\? Choose a sub-command for 'frodo': query: config ─+┐/
                );
                // THE BUG (user report 2026-10-12): the panel's top wall
                // came out 14 characters short -- exactly the query
                // echo's length -- because the renderer drew a title
                // without the echo while measuring a plain with it. The
                // top and bottom walls must span the same width, and the
                // side walls must align column-for-column.
                const lines = frame.split('\n').slice(0, 4);
                const widths = lines.map((l) => [...l].length);
                expect(widths[0]).toBe(widths[2]); // panel top vs bottom
                expect(widths[1]).toBe(widths[2]); // nav row vs panel bottom
                // 'config' and 'config-manager' remain the matches.
                expect(frame).toMatch(/› config\s/);
                expect(frame).toMatch(/config-manager/);
            } finally {
                removeShellTestHome(homeDir);
            }
        },
        TIMEOUT
    );
});
