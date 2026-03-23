import {
    createShellTestHome,
    removeShellTestHome,
    runShellScenario,
} from '../utils/ShellPty.js';

describe('frodo shell .help dot-command', () => {
    test('.help prints the Frodo Interactive Shell heading and lists all dot-commands', async () => {
        const homeDir = createShellTestHome();
        try {
            const result = runShellScenario({
                homeDir,
                actions: [
                    { type: 'wait_prompt' },
                    { type: 'clear_output' },
                    { type: 'send_line', text: '.help' },
                    { type: 'wait_plain', regex: 'Frodo Interactive Shell' },
                    // wait for the dot-commands section to appear
                    { type: 'wait_plain', regex: 'Shell dot-commands' },
                    // wait for the prompt to return after displayPrompt()
                    { type: 'wait_prompt' },
                    { type: 'capture', label: 'helpOutput' },
                ],
            });

            const plain = result.captures.helpOutput.plain;
            expect(plain).toMatch(/Frodo Interactive Shell/);
            expect(plain).toMatch(/Explore the Frodo API/);
            expect(plain).toMatch(/Shell dot-commands/);
            // all three built-in dot-commands must be listed
            expect(plain).toMatch(/\.help/);
            expect(plain).toMatch(/\.history/);
            expect(plain).toMatch(/\.exit/);
            // ANSI color was used (raw output should contain escape codes)
            expect(result.captures.helpOutput.raw).toContain('\u001b[');
        } finally {
            removeShellTestHome(homeDir);
        }
    });
});
