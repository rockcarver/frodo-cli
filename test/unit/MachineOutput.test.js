import infoSetup from '../../src/cli/info/info.ts';
import {
  isMachineOutput,
  setMachineOutput,
} from '../../src/utils/MachineOutput.ts';

// The notes meant for a person stay silent when the command prints for a
// program: the framework records it from the options of the command that runs.

/** The hooks that run before the action of a command, in the order they were registered. */
const preActionHooks = (command) => command._lifeCycleHooks.preAction;

function runFirstHook(options) {
  const command = infoSetup();
  for (const [key, value] of Object.entries(options)) {
    command.setOptionValue(key, value);
  }
  setMachineOutput(false);
  // the first hook is synchronous (stability, prompting, machine output); the
  // one after it opens the resolution pass
  preActionHooks(command)[0](command, command);
}

afterEach(() => setMachineOutput(false));

describe('machine output', () => {
  test('1: --json means a program reads the output', () => {
    runFirstHook({ json: true });
    expect(isMachineOutput()).toBe(true);
  });

  test('2: --scriptFriendly (-s) too', () => {
    runFirstHook({ scriptFriendly: true });
    expect(isMachineOutput()).toBe(true);
  });

  test('3: a command without either prints for a person', () => {
    runFirstHook({});
    expect(isMachineOutput()).toBe(false);
    runFirstHook({ json: false, scriptFriendly: false });
    expect(isMachineOutput()).toBe(false);
  });

  test('4: the flag can be set and cleared', () => {
    setMachineOutput(true);
    expect(isMachineOutput()).toBe(true);
    setMachineOutput(false);
    expect(isMachineOutput()).toBe(false);
  });
});
