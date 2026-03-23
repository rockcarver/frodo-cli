import {
    createShellTestHome,
    removeShellTestHome,
    runShellScenario,
} from '../utils/ShellPty.js';

describe('frodo shell double-Tab ambiguous completion', () => {
    test('double-Tab on an ambiguous prefix lists all matching completions', async () => {
        // "fr" matches both 'frodo' and 'frodoLib' from rootBindings.
        // First Tab extends to the common prefix 'frodo'.
        // Second Tab (same prefix again) causes readline to display the full list.
        const homeDir = createShellTestHome();
        try {
            const result = runShellScenario({
                homeDir,
                actions: [
                    { type: 'wait_prompt' },
                    { type: 'clear_output' },
                    // type the ambiguous prefix
                    { type: 'send', text: 'fr' },
                    { type: 'sleep', ms: 50 },
                    // first Tab — readline extends to common prefix 'frodo'
                    { type: 'key', name: 'tab' },
                    { type: 'sleep', ms: 150 },
                    // second Tab — readline prints the completion list
                    { type: 'key', name: 'tab' },
                    // 'frodoLib' is in the list; wait for it to appear
                    { type: 'wait_plain', regex: 'frodoLib' },
                    { type: 'capture', label: 'afterDoubleTab' },
                    // clean up the line so shutdown is clean
                    { type: 'key', name: 'ctrl_u' },
                ],
            });

            const plain = result.captures.afterDoubleTab.plain;
            // both completions must appear in the listing
            expect(plain).toMatch(/frodo\b/);
            expect(plain).toMatch(/frodoLib/);
            // completing without throwing implicitly verifies the prompt is not corrupted
        } finally {
            removeShellTestHome(homeDir);
        }
    });
});
