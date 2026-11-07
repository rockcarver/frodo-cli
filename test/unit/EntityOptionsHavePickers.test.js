import { beforeAll, describe, expect, it } from '@jest/globals';
import { fullName, loadLeafCommands } from '../utils/CommandExamples.js';
import {
  ENTITY_OPTIONS_THAT_NAME_NO_EXISTING_ENTITY,
  LEGACY_ENTITY_OPTIONS_WITHOUT_PICKER,
} from './EntityPickLegacyExceptions.js';

const { getEntityPicks } =
  await import('../../src/utils/interactive/EntityPickers.ts');
const { getOneOfGroups } =
  await import('../../src/cli/ResolveInteractiveInputs.ts');
const { NEW_ENTITY_VERBS, familyEntityPicks } =
  await import('../../src/utils/interactive/EntityPickRegistry.ts');

/**
 * Decision record 0038: an option that names an existing entity by `-i`,
 * `--<kind>-id`, `-n` or `--<kind>-name`, and that the command requires
 * (mandatory, or a member of a one-of group), gets its picker from the
 * framework. The command tree is built the way src/app.ts builds it, and every
 * such option must have a picker: its own (`deferEntityPicks`) or the one its
 * command family registers (src/utils/interactive/EntityPickFamilies.ts).
 *
 * Two lists in EntityPickLegacyExceptions.js hold what has none:
 * - the commands that predate the rule. It can only shrink: when a command gets
 *   its picker the test fails until its line is removed;
 * - the options that name a NEW entity or one in a file (`create`, `import`),
 *   so a picker makes no sense. A new command may only be added here when
 *   that is true of the option.
 */

const LEGACY_FILE = 'test/unit/EntityPickLegacyExceptions.js';
const HOW_TO_FIX =
  'Give the command family a picker: add an entry to ' +
  'src/utils/interactive/EntityPickFamilies.ts (how to list its entities) and the ' +
  'command inherits it; the command file declares nothing. If the option names a ' +
  'new entity or one in a file, add it to ENTITY_OPTIONS_THAT_NAME_NO_EXISTING_ENTITY ' +
  `in ${LEGACY_FILE}. Do not add it to the legacy list: that list only shrinks.`;

function namesEntity(option) {
  return (
    option.short === '-i' ||
    option.short === '-n' ||
    /-(id|name)$/.test(option.long ?? '')
  );
}

function isRequired(leaf, option) {
  if (option.mandatory) return true;
  const names = [
    option.attributeName(),
    (option.long ?? '').replace(/^--/, ''),
  ];
  return getOneOfGroups(leaf).some((group) =>
    group.options.some((member) => names.includes(member))
  );
}

let candidates = [];
let leaves = [];

beforeAll(async () => {
  leaves = await loadLeafCommands();
  candidates = leaves.flatMap((leaf) =>
    leaf.options
      .filter((option) => namesEntity(option) && isRequired(leaf, option))
      .map((option) => ({
        key: `${fullName(leaf)}::${option.attributeName()}`,
        covered: getEntityPicks(leaf).some(
          (pick) => pick.name === option.attributeName()
        ),
      }))
  );
});

const keysOf = (predicate) =>
  candidates.filter(predicate).map((candidate) => candidate.key);

describe('entity options have pickers', () => {
  it('finds the entity options of the command tree', () => {
    expect(candidates.length).toBeGreaterThan(100);
    const covered = new Map(candidates.map((c) => [c.key, c.covered]));
    // anchors: a command with a picker of its own, one that inherits it from its family, and one without
    expect(covered.get('frodo esv secret describe::secretId')).toBe(true);
    expect(covered.get('frodo idm remote-proxy describe::proxyId')).toBe(true);
    expect(covered.get('frodo idm remote-proxy delete::proxyId')).toBe(true);
    expect(covered.get('frodo idm remote-proxy create::proxyId')).toBe(false);
  });

  it('gives every such option a picker, unless it is listed', () => {
    const listed = new Set([
      ...LEGACY_ENTITY_OPTIONS_WITHOUT_PICKER,
      ...ENTITY_OPTIONS_THAT_NAME_NO_EXISTING_ENTITY,
    ]);
    const missing = keysOf((c) => !c.covered && !listed.has(c.key));
    if (missing.length > 0) {
      throw new Error(
        `These options name an entity and have no picker:\n` +
          missing.map((key) => `  ${key}`).join('\n') +
          `\n\n${HOW_TO_FIX}`
      );
    }
  });

  it('keeps the legacy list to options that still have no picker, so it can only shrink', () => {
    const uncovered = new Set(keysOf((c) => !c.covered));
    const stale = LEGACY_ENTITY_OPTIONS_WITHOUT_PICKER.filter(
      (key) => !uncovered.has(key)
    );
    if (stale.length > 0) {
      throw new Error(
        `These options have a picker now, or no longer exist. Remove them from ${LEGACY_FILE}:\n` +
          stale.map((key) => `  ${key}`).join('\n')
      );
    }
  });

  it('keeps the list of options that name no existing entity to options that are still there and uncovered', () => {
    const uncovered = new Set(keysOf((c) => !c.covered));
    const stale = ENTITY_OPTIONS_THAT_NAME_NO_EXISTING_ENTITY.filter(
      (key) => !uncovered.has(key)
    );
    if (stale.length > 0) {
      throw new Error(
        `These options have a picker now, or no longer exist. Remove them from ${LEGACY_FILE}:\n` +
          stale.map((key) => `  ${key}`).join('\n')
      );
    }
  });

  it('offers no family picker on a command that creates or imports: its option names an entity that does not exist yet, or one in a file', () => {
    const offending = leaves
      .filter((leaf) => NEW_ENTITY_VERBS.includes(leaf.name()))
      .filter((leaf) => familyEntityPicks(leaf).length > 0)
      .map(fullName);
    expect(offending).toEqual([]);
  });

  it('lists no option twice, and no option in both lists', () => {
    const all = [
      ...LEGACY_ENTITY_OPTIONS_WITHOUT_PICKER,
      ...ENTITY_OPTIONS_THAT_NAME_NO_EXISTING_ENTITY,
    ];
    expect(all.filter((key, i) => all.indexOf(key) !== i)).toEqual([]);
  });

  it('keeps the legacy list sorted, one option per line', () => {
    expect(LEGACY_ENTITY_OPTIONS_WITHOUT_PICKER).toEqual(
      [...LEGACY_ENTITY_OPTIONS_WITHOUT_PICKER].sort()
    );
  });
});
