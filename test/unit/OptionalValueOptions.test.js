import { beforeAll, describe, expect, it } from '@jest/globals';
import { isSecretOption } from '../../src/utils/interactive/SecretOptions.ts';
import { fullName, loadCommandTree } from '../utils/CommandExamples.js';

/**
 * An option declared with an optional value (`--x [value]`) is valid with no
 * value, and commander then passes `true`. Almost nothing in this CLI gives
 * that meaning: `--scope` crashed on `true.split(' ')`, `--description` stored
 * "true", `conn set --password` set the password to `true`. Those declarations
 * were wrong from the start and were never caught (cli record 0034).
 *
 * So an optional value is allowed only where a bare flag means something, and
 * each of those is listed here with what it means. A new one needs a line in
 * this list, which is where a reviewer asks whether the bare flag really has a
 * meaning. A secret option (SecretOption) is the other legitimate case: a
 * bare flag asks for the value (SecretOptions.test.js and
 * SecretOptionDeclarations.test.js cover those).
 */
const BARE_FLAG_MEANS = {
  '-f, --file [file]': 'writes the export to the default file name',
  '--oauth-forward-resource [uri]':
    'forwards the resource parameter as received (the option is boolean | string)',
};

/** Every command of the tree: the groups, the stubs between them and the leaves. */
function allCommands(group) {
  return [group, ...group.commands.flatMap(allCommands)];
}

let rows;

beforeAll(async () => {
  const { groups } = await loadCommandTree();
  rows = groups
    .flatMap(allCommands)
    .flatMap((command) =>
      command.options
        .filter((option) => option.optional)
        .map((option) => ({
          id: `${fullName(command)} ${option.flags}`,
          option,
        }))
    );
});

describe('options with an optional value', () => {
  it('exist where the walk of the tree can see them', () => {
    // the two kinds that are allowed, so the walk cannot silently come up empty
    expect(rows.some((r) => r.option.flags === '-f, --file [file]')).toBe(true);
    expect(rows.some((r) => isSecretOption(r.option))).toBe(true);
  });

  it('are only the ones where a bare flag means something, or secrets that ask for their value', () => {
    const unexplained = rows
      .filter(
        (r) => !isSecretOption(r.option) && !(r.option.flags in BARE_FLAG_MEANS)
      )
      .map((r) => r.id);
    expect(unexplained).toEqual([]);
  });

  it('list nothing that no command declares any more', () => {
    const declared = new Set(rows.map((r) => r.option.flags));
    expect(
      Object.keys(BARE_FLAG_MEANS).filter((flags) => !declared.has(flags))
    ).toEqual([]);
  });
});
