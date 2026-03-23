import {
    createShellTestHome,
    removeShellTestHome,
    runShellScenario,
} from '../utils/ShellPty.js';

describe('frodo shell history PTY', () => {
    test('Down stashes an autocompleted draft and normal history traversal still works', async () => {
        const homeDir = createShellTestHome();
        try {
            const result = runShellScenario({
                homeDir,
                actions: [
                    { type: 'wait_prompt' },
                    { type: 'clear_output' },
                    { type: 'send', text: 'frodo.cloud.secret.readSecretValue(' },
                    { type: 'key', name: 'tab' },
                    { type: 'wait_plain', regex: 'readSecretValue\\([^)]*\\)' },
                    { type: 'clear_output' },
                    { type: 'key', name: 'down' },
                    { type: 'sleep', ms: 150 },
                    { type: 'send_line', text: '1+1' },
                    { type: 'wait_plain', regex: '\\b2\\b' },
                    { type: 'clear_output' },
                    { type: 'key', name: 'up' },
                    { type: 'wait_plain', regex: '1\\+1' },
                    { type: 'capture', label: 'firstUp' },
                    { type: 'clear_output' },
                    { type: 'key', name: 'up' },
                    {
                        type: 'wait_plain',
                        regex: 'frodo\\.cloud\\.secret\\.readSecretValue\\([^)]*\\)',
                    },
                    { type: 'capture', label: 'secondUp' },
                    { type: 'clear_output' },
                    { type: 'key', name: 'down' },
                    { type: 'wait_plain', regex: '1\\+1' },
                    { type: 'capture', label: 'downTraversal' },
                ],
            });

            expect(result.captures.firstUp.plain).toMatch(/1\+1/);
            expect(result.captures.secondUp.plain).toMatch(
                /frodo\.cloud\.secret\.readSecretValue\([^)]*\)/
            );
            expect(result.captures.downTraversal.plain).toMatch(/1\+1/);
        } finally {
            removeShellTestHome(homeDir);
        }
    });
});