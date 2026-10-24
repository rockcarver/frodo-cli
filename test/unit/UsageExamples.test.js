import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import {
  fullName,
  groupModules,
  loadLeafCommands,
  registeredGroupCount,
  renderFullHelp,
} from '../utils/CommandExamples.js';
import { LEGACY_COMMANDS_WITHOUT_EXAMPLES } from './UsageExamplesLegacyExceptions.js';

/**
 * Every command ships a "Usage Examples:" block (shown by `-hhh`). The command
 * tree is built the way src/app.ts builds it: the command groups are read from
 * app.ts's own imports, so a newly registered group is covered without
 * touching this file. Commands that predate the rule are listed in
 * UsageExamplesLegacyExceptions.js, which can only shrink.
 */

const LEGACY_FILE = 'test/unit/UsageExamplesLegacyExceptions.js';
const HOW_TO_FIX =
  "Add an `.addHelpText('after', `Usage Examples:\\n` + ...)` block in the style of " +
  '`frodo info` (src/cli/info/info.ts) and `frodo conn save` (src/cli/conn/conn-save.ts): ' +
  'one sentence per scenario, then the command via c.command(...), with sample values from ' +
  'src/help/SampleData.ts. src/cli/_template/*.ts shows the shape.';

const originalArgv = process.argv;
let leaves = [];
let hasExamples = new Map();

beforeAll(async () => {
  // The examples are only rendered for -hhh (see FrodoCommand.addHelpText).
  process.argv = [...originalArgv, '--help-all'];
  leaves = await loadLeafCommands();
  hasExamples = new Map(
    leaves.map((leaf) => [
      fullName(leaf),
      renderFullHelp(leaf).includes('Usage Examples:'),
    ])
  );
});

afterAll(() => {
  process.argv = originalArgv;
});

describe('usage examples', () => {
  it('finds the command tree the way app.ts builds it', () => {
    expect(groupModules.length).toBeGreaterThan(0);
    // A group registered in a form the import pattern does not match would
    // silently escape the check below; make that loud.
    expect(groupModules).toHaveLength(registeredGroupCount);
    expect(hasExamples.size).toBeGreaterThan(0);
    // Anchors: one command that has examples and one that is still legacy.
    expect(hasExamples.get('frodo info')).toBe(true);
    expect(hasExamples.get('frodo journey validate')).toBe(true);
    expect(hasExamples.get('frodo journey export')).toBe(true);
  });

  it('gives every command that is not a legacy exception a Usage Examples block', () => {
    const legacy = new Set(LEGACY_COMMANDS_WITHOUT_EXAMPLES);
    const missing = [...hasExamples]
      .filter(([name, has]) => !has && !legacy.has(name))
      .map(([name]) => name);
    if (missing.length > 0) {
      throw new Error(
        `These commands have no "Usage Examples:" block in their -hhh help:\n` +
          missing.map((name) => `  ${name}`).join('\n') +
          `\n\n${HOW_TO_FIX}\n` +
          `Do not add a command to ${LEGACY_FILE}: that list only shrinks.`
      );
    }
  });

  it('keeps the legacy list honest', () => {
    const names = LEGACY_COMMANDS_WITHOUT_EXAMPLES;
    const nowHaveExamples = names.filter((name) => hasExamples.get(name));
    if (nowHaveExamples.length > 0) {
      throw new Error(
        `These commands now have usage examples. Remove them from ${LEGACY_FILE}:\n` +
          nowHaveExamples.map((name) => `  ${name}`).join('\n')
      );
    }
    const gone = names.filter((name) => !hasExamples.has(name));
    if (gone.length > 0) {
      throw new Error(
        `These commands no longer exist. Remove them from ${LEGACY_FILE}:\n` +
          gone.map((name) => `  ${name}`).join('\n')
      );
    }
    expect(names).toEqual([...new Set(names)].sort());
  });
});
