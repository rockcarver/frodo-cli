import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';

describe('frodo shell openidm functions', () => {
  test('openidm binds, completes with the documented scaffold, and help(openidm.read) prints its doc', async () => {
    const homeDir = createShellTestHome();
    try {
      const result = runShellScenario({
        homeDir,
        actions: [
          { type: 'wait_prompt' },
          { type: 'clear_output' },
          // The context binds the 13 IDM scripting functions.
          { type: 'send_line', text: 'typeof openidm' },
          { type: 'wait_plain', regex: "'object'" },
          // Tab completes a method with the hint line above it.
          { type: 'clear_output' },
          { type: 'send', text: 'openidm.re' },
          { type: 'key', name: 'tab' },
          { type: 'wait_plain', regex: '▸\\s+openidm\\.read\\(' },
          { type: 'capture', label: 'complete' },
          // The hand-written doc rides the same index as
          // frodo-lib's methods. First backspace over the
          // completed '()' so the help call lands on a clean line.
          { type: 'key', name: 'enter' },
          { type: 'wait_prompt' },
          { type: 'clear_output' },
          { type: 'send_line', text: 'help(openidm.read)' },
          { type: 'wait_plain', regex: 'Fetches one object' },
          { type: 'wait_prompt' },
          { type: 'capture', label: 'help' },
        ],
      });

      expect(result.captures.complete.plain).toMatch(
        /▸\s+openidm\.read\(resourceName: str, params\?: object, fields\?: str\[\]\)/
      );
      expect(result.captures.help.plain).toMatch(
        /Signature :\s+read\(resourceName, params\?, fields\?\)/
      );
      expect(result.captures.help.plain).toMatch(
        /Returns null if it is not found/
      );
    } finally {
      removeShellTestHome(homeDir);
    }
  }, 60000);

  test('bad arguments fail synchronously with a message naming the function', async () => {
    const homeDir = createShellTestHome();
    try {
      const result = runShellScenario({
        homeDir,
        actions: [
          { type: 'wait_prompt' },
          { type: 'send_line', text: 'openidm.read()' },
          { type: 'wait_plain', regex: 'resourceName is required' },
          { type: 'wait_prompt' },
          { type: 'capture', label: 'err' },
        ],
      });
      const plain = result.captures.err.plain;
      expect(plain).toMatch(/Uncaught TypeError/);
      expect(plain).toMatch(/openidm\.read: resourceName is required/);
      // The unhandled-rejection banner must NOT appear: the throw is
      // synchronous, before any promise exists.
      expect(plain).not.toContain('Please report this unhandled error');
    } finally {
      removeShellTestHome(homeDir);
    }
  }, 60000);
});
