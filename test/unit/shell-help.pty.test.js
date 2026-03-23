import {
    createShellTestHome,
    removeShellTestHome,
    runShellScenario,
} from '../utils/ShellPty.js';

describe('frodo shell help() function', () => {
    test('all help() variants produce correct output in a single session', async () => {
        const homeDir = createShellTestHome();
        try {
            const result = runShellScenario({
                homeDir,
                actions: [
                    { type: 'wait_prompt' },

                    // ── help() ─────────────────────────────────────────────────────
                    { type: 'clear_output' },
                    { type: 'send_line', text: 'help()' },
                    { type: 'wait_plain', regex: 'Frodo Shell - Help System' },
                    { type: 'wait_prompt' },
                    { type: 'capture', label: 'helpOverview' },

                    // ── help(frodo.info) ────────────────────────────────────────────
                    { type: 'clear_output' },
                    { type: 'send_line', text: 'help(frodo.info)' },
                    // 'getInfo' must appear in the method listing for the info module
                    { type: 'wait_plain', regex: 'getInfo' },
                    { type: 'wait_prompt' },
                    { type: 'capture', label: 'helpModule' },

                    // ── help("getInfo") ─────────────────────────────────────────────
                    { type: 'clear_output' },
                    { type: 'send_line', text: 'help("getInfo")' },
                    // formatMethodDoc always emits "Signature :" line
                    { type: 'wait_plain', regex: 'Signature\\s*:' },
                    { type: 'wait_prompt' },
                    { type: 'capture', label: 'helpMethod' },

                    // ── help("definitelyNotAMethod") ────────────────────────────────
                    { type: 'clear_output' },
                    { type: 'send_line', text: 'help("definitelyNotAMethod")' },
                    { type: 'wait_plain', regex: 'No documentation found' },
                    { type: 'capture', label: 'helpNotFound' },
                ],
            });

            expect(result.captures.helpOverview.plain).toMatch(
                /Frodo Shell - Help System/
            );
            // overview must list at least one module entry
            expect(result.captures.helpOverview.plain).toMatch(/frodo\.\w+/);

            expect(result.captures.helpModule.plain).toMatch(/getInfo/);

            expect(result.captures.helpMethod.plain).toMatch(/Signature\s*:/);

            expect(result.captures.helpNotFound.plain).toMatch(
                /No documentation found/
            );
        } finally {
            removeShellTestHome(homeDir);
        }
    });
});
