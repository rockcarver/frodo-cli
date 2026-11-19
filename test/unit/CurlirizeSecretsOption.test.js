import { beforeAll, describe, expect, it } from '@jest/globals';
import { isNeverSavedOption } from '../../src/utils/interactive/DefaultsStore.ts';
import { fullName, loadLeafCommands } from '../utils/CommandExamples.js';

/**
 * How `--curlirize-secrets` is declared on the commands (frodo-cli#1214): every
 * command that can print curl commands has it, no command without them has it,
 * the MCP server does not, and it is a plain switch that is never saved as a
 * default. What it does at run time is in CurlirizeSecrets.test.js.
 */
let leaves = [];

beforeAll(async () => {
  leaves = await loadLeafCommands();
});

const named = (command, name) =>
  command.options.find((option) => option.name() === name);

// the MCP server prints curl commands, but it is run for a client that must not
// be able to see credentials, so it does not take the option
const WITHOUT_THE_OPTION = ['frodo mcp server start'];

describe('--curlirize-secrets on the commands', () => {
  it('the command tree has commands with --curlirize', () => {
    expect(
      leaves.filter((leaf) => named(leaf, 'curlirize')).length
    ).toBeGreaterThan(100);
  });

  it('is on every command that has --curlirize, except the MCP server', () => {
    const missing = leaves
      .filter((leaf) => named(leaf, 'curlirize'))
      .filter((leaf) => !named(leaf, 'curlirize-secrets'))
      .map(fullName)
      .sort();
    expect(missing).toEqual(WITHOUT_THE_OPTION);
  });

  it('is on no command that has no --curlirize', () => {
    const extra = leaves
      .filter((leaf) => !named(leaf, 'curlirize'))
      .filter((leaf) => named(leaf, 'curlirize-secrets'))
      .map(fullName);
    expect(extra).toEqual([]);
  });

  it('is a switch without a value or a default, in the Output Options group, and never saved', () => {
    const options = leaves
      .map((leaf) => named(leaf, 'curlirize-secrets'))
      .filter(Boolean);
    expect(options.length).toBeGreaterThan(100);
    for (const option of options) {
      expect(option.flags).toBe('--curlirize-secrets');
      expect(option.required).toBe(false);
      expect(option.optional).toBe(false);
      expect(option.defaultValue).toBeUndefined();
      expect(option.envVar).toBeUndefined();
      expect(option.helpGroupHeading).toBe('Output Options:');
      expect(isNeverSavedOption(option)).toBe(true);
    }
  });

  it('is described: --curlirize says what is masked and how to see it, the new option says that the output has valid credentials', () => {
    const leaf = leaves.find((l) => fullName(l) === 'frodo journey list');
    expect(named(leaf, 'curlirize').description).toContain('<redacted>');
    expect(named(leaf, 'curlirize').description).toContain(
      '--curlirize-secrets'
    );
    expect(named(leaf, 'curlirize-secrets').description).toContain(
      'valid credentials'
    );
    expect(named(leaf, 'curlirize-secrets').description).toContain(
      'FRODO_CURLIRIZE_SECRETS'
    );
  });
});
