import {
    createShellTestHome,
    removeShellTestHome,
    runShellScenario,
} from '../utils/ShellPty.js';

describe('frodo shell autocomplete e2e', () => {
    test('invocation-context Tab completion renders the scaffold and hint', async () => {
        const homeDir = createShellTestHome();
        try {
            const result = runShellScenario({
                homeDir,
                actions: [
                    { type: 'wait_prompt' },
                    { type: 'clear_output' },
                    { type: 'send', text: 'frodo.cloud.secret.readSecretValue(' },
                    { type: 'key', name: 'tab' },
                    {
                        type: 'wait_plain',
                        regex: '▸\\s+frodo\\.cloud\\.secret\\.readSecretValue\\([^)]*\\)',
                    },
                    { type: 'capture', label: 'afterTab' },
                ],
            });

            expect(result.captures.afterTab.raw).toContain('\u001b[36m');
            expect(result.captures.afterTab.plain).toMatch(
                /frodo\.cloud\.secret\.readSecretValue\([^)]*\)/
            );
        } finally {
            removeShellTestHome(homeDir);
        }
    });
});