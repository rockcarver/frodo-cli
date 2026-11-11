import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from '@jest/globals';
import { fullName, loadLeafCommands } from '../utils/CommandExamples.js';
import { ENTITY_OPTIONS_THAT_NAME_NO_EXISTING_ENTITY } from './EntityPickLegacyExceptions.js';

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
 * such option must have the picker its command family registers
 * (src/utils/interactive/EntityPickFamilies.ts), unless it is listed in
 * EntityPickLegacyExceptions.js as an option that names a NEW entity or one in a
 * file (`create`, `import`), so a picker makes no sense. A new command may only
 * be added there when that is true of the option.
 */

const LEGACY_FILE = 'test/unit/EntityPickLegacyExceptions.js';
const HOW_TO_FIX =
  'Give the command family a picker: add an entry to ' +
  'src/utils/interactive/EntityPickFamilies.ts (how to list its entities) and the ' +
  'command inherits it; the command file declares nothing. If the option names a ' +
  'new entity or one in a file, add it to ENTITY_OPTIONS_THAT_NAME_NO_EXISTING_ENTITY ' +
  `in ${LEGACY_FILE}.`;

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
    // anchors: commands that inherit their picker from the family, and one without
    expect(covered.get('frodo esv secret describe::secretId')).toBe(true);
    expect(covered.get('frodo idm remote-proxy describe::proxyId')).toBe(true);
    expect(covered.get('frodo idm remote-proxy delete::proxyId')).toBe(true);
    expect(covered.get('frodo idm remote-proxy create::proxyId')).toBe(false);
  });

  it('gives every such option a picker, unless it is listed', () => {
    const listed = new Set(ENTITY_OPTIONS_THAT_NAME_NO_EXISTING_ENTITY);
    const missing = keysOf((c) => !c.covered && !listed.has(c.key));
    if (missing.length > 0) {
      throw new Error(
        `These options name an entity and have no picker:\n` +
          missing.map((key) => `  ${key}`).join('\n') +
          `\n\n${HOW_TO_FIX}`
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

  it('offers a family picker on a command that creates or imports only when its family includes it, because an option of it names an entity that exists', () => {
    const offending = leaves
      .filter((leaf) => NEW_ENTITY_VERBS.includes(leaf.name()))
      .filter((leaf) => familyEntityPicks(leaf).length > 0)
      .map(fullName);
    // Reviewed one by one: each adds to an entity that exists (a version to a
    // secret, a mapping or an alias to a secret store) and the picks it gets
    // are for that entity only, never for the one it creates.
    expect(offending).toEqual([
      'frodo esv secret version create',
      'frodo secretstore mapping create',
      'frodo secretstore mapping alias create',
    ]);
  });

  it('gives those commands the pick of the entity that exists, and not of the one they create', () => {
    const picked = (name) =>
      familyEntityPicks(leaves.find((leaf) => fullName(leaf) === name)).map(
        (pick) => pick.name
      );
    expect(picked('frodo esv secret version create')).toEqual(['secretId']);
    // the secret store, but not --secret-id: the mapping it creates
    expect(picked('frodo secretstore mapping create')).toEqual([
      'secretstoreId',
    ]);
    // the secret store and the mapping the alias is added to
    expect(picked('frodo secretstore mapping alias create')).toEqual([
      'secretstoreId',
      'secretId',
    ]);
  });

  it('has no command file that declares or runs a picker: the framework resolves every pick from the registry', () => {
    const cli = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      'src',
      'cli'
    );
    const files = (dir) =>
      fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((entry) =>
          entry.isDirectory()
            ? files(path.join(dir, entry.name))
            : [path.join(dir, entry.name)]
        )
        .filter((file) => file.endsWith('.ts'));
    const offending = files(cli)
      .filter((file) =>
        /deferEntityPicks|resolveEntityPicks/.test(
          fs.readFileSync(file, 'utf8')
        )
      )
      .map((file) => path.relative(cli, file));
    expect(offending).toEqual([]);
  });

  it('no longer has the functions that declared and ran a picker per command', async () => {
    const pickers =
      await import('../../src/utils/interactive/EntityPickers.ts');
    expect(pickers.deferEntityPicks).toBeUndefined();
    expect(pickers.resolveEntityPicks).toBeUndefined();
  });

  it('lists no option twice', () => {
    const all = ENTITY_OPTIONS_THAT_NAME_NO_EXISTING_ENTITY;
    expect(all.filter((key, i) => all.indexOf(key) !== i)).toEqual([]);
  });

  it('keeps the list sorted, one option per line', () => {
    expect(ENTITY_OPTIONS_THAT_NAME_NO_EXISTING_ENTITY).toEqual(
      [...ENTITY_OPTIONS_THAT_NAME_NO_EXISTING_ENTITY].sort()
    );
  });
});
