import fs from 'fs';

// The air-gap switch must reach the library before any command runs, so that
// every command and `frodo mcp server start` (whose request-scoped instances
// inherit from this root state) are covered by one call (cli#1307). The call
// is in `src/app.ts`; a source check pins it where it works, because no command
// of this CLI prints the flag of the library state.

const app = fs.readFileSync(
  new URL('../../src/app.ts', import.meta.url),
  'utf8'
);

test('1: app.ts imports the call from the air-gap operations', () => {
  expect(app).toMatch(
    /import \{ applyAirGapSwitchToState \} from '\.\/ops\/AirGapOps';/
  );
});

test('2: the call happens once, after the output handlers and before the commands are parsed', () => {
  const calls = [...app.matchAll(/applyAirGapSwitchToState\(\);/g)];
  expect(calls).toHaveLength(1);
  const call = calls[0].index;
  expect(call).toBeGreaterThan(app.indexOf('state.setVerboseHandler('));
  expect(call).toBeLessThan(app.indexOf('await program.parseAsync()'));
  // before the first command is built, and before the update check runs
  expect(call).toBeLessThan(app.indexOf('program.addCommand(admin()'));
  expect(call).toBeLessThan(app.indexOf('await getVersions(false)'));
});

test('3: it is not inside a branch: nothing between the handlers and the call can skip it', () => {
  const start = app.indexOf('state.setVerboseHandler(');
  const call = app.indexOf('applyAirGapSwitchToState();');
  const between = app.slice(start, call);
  expect(between).not.toMatch(/\bif\s*\(/);
  expect(between).not.toMatch(/\breturn\b/);
});
