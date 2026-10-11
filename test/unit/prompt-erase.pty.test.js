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
 * Raw captures are replayed through a VT emulator (pyte) because the
 * erase sequences only remove lines from the SCREEN -- the raw stream
 * always contains every byte ever written, so a plain-text grep would
 * see the erased frames regardless.
 */
import { execFileSync } from 'node:child_process';

function replayScreen(raw, { cols = 120, rows = 200 } = {}) {
    const script = [
        'import sys, pyte',
        'raw = sys.stdin.read()',
        'screen = pyte.Screen(int(sys.argv[1]), int(sys.argv[2]))',
        'pyte.Stream(screen).feed(raw)',
        "print('\\n'.join(screen.display))",
    ].join('\n');
    const stdout = execFileSync('python3', ['-c', script, String(cols), String(rows)], {
        input: raw,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });
    return stdout
        .split('\n')
        .map((line) => line.replace(/\s+$/, ''))
        .filter((line) => line.length > 0);
}

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
        FRODO_MASTER_KEY_PATH: new URL(
            '../e2e/env/masterkey.key',
            import.meta.url
        ).pathname,
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
                        { type: 'wait_plain', regex: 'Choose which secrets', timeoutMs: 30000 },
                        { type: 'sleep', ms: 400 },
                        // → into the editor, then esc back, then esc out:
                        // three frames that previously all stayed visible.
                        { type: 'key', name: 'right' },
                        { type: 'wait_plain', regex: 'Optional options for', timeoutMs: 15000 },
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
                expect(joined).not.toMatch(/options to configure/);
                expect(joined).not.toMatch(/type to filter/);
                expect(joined).not.toMatch(/esc backs out/);
                // And no authoring print: the flow never reached the action,
                // so the deferred print must not have flushed. (The usage
                // block's "frodo esv secret delete [options]" line is
                // commander's, not the print's.)
                expect(
                    screen.filter((line) => line.startsWith('error:')).length
                ).toBe(1);
                expect(
                    screen.filter((line) =>
                        /^frodo esv secret delete [^[]/.test(line)
                    ).length
                ).toBe(0);
            } finally {
                removeShellTestHome(homeDir);
            }
        },
        TIMEOUT
    );

    test(
        'completed flow: prompts erase; the eventual command prints once and last',
        async () => {
            const homeDir = createShellTestHome();
            try {
                // Pick `-a` from the one-of picker (2nd row: boolean flag,
                // no value step, no entity pick) -- the same shape the
                // slice-4 preview test uses. The command then runs (the
                // mock cassette fails on auth, which still reaches
                // postAction), and the deferred print lands LAST.
                const result = runShellScenario({
                    homeDir,
                    allowPrompting: true,
                    args: ['esv', 'secret', 'delete'],
                    env: ENV,
                    actions: [
                        { type: 'wait_plain', regex: 'Choose which secrets', timeoutMs: 30000 },
                        { type: 'sleep', ms: 400 },
                        { type: 'key', name: 'down' },
                        { type: 'key', name: 'enter' },
                        { type: 'sleep', ms: 1500 },
                        { type: 'capture', label: 'final' },
                    ],
                });

                const screen = replayScreen(result.captures.final.raw);
                const printLines = screen.filter((line) =>
                    /^frodo esv secret delete -a$/.test(line)
                );
                // Exactly one authoring print, with the picked token in it.
                expect(printLines.length).toBe(1);
                // It is the LAST line of the run.
                expect(screen[screen.length - 1]).toBe(printLines[0]);
                // No prompt residue: neither the open frame (question, list,
                // hint, footer) nor a committed/cancelled answer survived.
                const joined = screen.join('\n');
                expect(joined).not.toMatch(/Choose which secrets/);
                expect(joined).not.toMatch(/options to configure/);
                expect(joined).not.toMatch(/type to filter/);
                expect(joined).not.toMatch(/esc backs out/);
                expect(joined).not.toMatch(/-a, --all/);
            } finally {
                removeShellTestHome(homeDir);
            }
        },
        TIMEOUT
    );
});
