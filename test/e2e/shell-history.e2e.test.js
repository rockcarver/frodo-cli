import {
    createShellTestHome,
    removeShellTestHome,
    runShellScenario,
} from '../utils/ShellPty.js';

describe('frodo shell history e2e', () => {
    test('stashed drafts survive a shell restart', async () => {
        const sharedHomeDir = createShellTestHome();
        try {
            runShellScenario({
                homeDir: sharedHomeDir,
                actions: [
                    { type: 'wait_prompt' },
                    { type: 'clear_output' },
                    { type: 'send', text: 'frodo.cloud.secret.readSecretValue(' },
                    { type: 'key', name: 'tab' },
                    { type: 'wait_plain', regex: 'readSecretValue\\([^)]*\\)' },
                    { type: 'clear_output' },
                    { type: 'key', name: 'down' },
                    { type: 'sleep', ms: 150 },
                ],
            });

            const result = runShellScenario({
                homeDir: sharedHomeDir,
                actions: [
                    { type: 'wait_prompt' },
                    { type: 'clear_output' },
                    { type: 'key', name: 'up' },
                    {
                        type: 'wait_plain',
                        regex: 'frodo\\.cloud\\.secret\\.readSecretValue\\([^)]*\\)',
                    },
                    { type: 'capture', label: 'recalledDraft' },
                ],
            });

            expect(result.captures.recalledDraft.plain).toMatch(
                /frodo\.cloud\.secret\.readSecretValue\([^)]*\)/
            );
        } finally {
            removeShellTestHome(sharedHomeDir);
        }
    });
});