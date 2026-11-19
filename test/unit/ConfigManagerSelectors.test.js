import fs from 'fs';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from '@jest/globals';
import { Command } from 'commander';
import { getOptionAliases } from '../../src/cli/OptionAlias.ts';
import { getOneOfGroups } from '../../src/cli/ResolveInteractiveInputs.ts';
import { fullName, loadCommandTree } from '../utils/CommandExamples.js';
import {
  findOldSpellingProblems,
  findSelectorMigrationProblems,
  findSelectorProblems,
  isGroupLeaf,
} from '../utils/OptionLetters.js';
import {
  EXPECTED_SELECTORS,
  KEPT_OLD_SPELLING,
  NO_SELECTOR_COMMANDS,
  PENDING_VERBS,
  STRAY_SELECTOR_OPTIONS,
} from './ConfigManagerSelectorRows.js';

/**
 * The commands of the configuration group that name an object select it by
 * `-i, --<type>-id` (an identifier) and, for a type whose objects have a name
 * that can change, by `-n, --<type>-name`, declared mutually exclusive; `-n,
 * --name` stays as the permanent alias:
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md
 * (options of the configuration commands). The first block checks the rules on
 * hand-built commands (a seeded defect for each rule); the second reads the
 * real command tree and the real files, without a build: the rows of the
 * commands that have been renamed (C4a: the pull commands, C4b: the push
 * commands), that each command
 * declares exactly those options, that every spelling parses to the attribute
 * of its option, that a selector is never mandatory and never in a one-of
 * group (so that no picker is needed), that MIGRATION.md lists each command and
 * that the e2e tests type the new spelling.
 */

const migrationPath = fileURLToPath(
  new URL('../../MIGRATION.md', import.meta.url)
);
const e2eFolder = fileURLToPath(new URL('../e2e/', import.meta.url));

/** An option as the check reads it. */
const opt = (short, long, extra = {}) => ({
  short,
  long,
  description: '',
  aliases: [],
  mandatory: false,
  takesValue: true,
  attribute: long
    .replace(/^--/, '')
    .replace(/-(\w)/g, (_, c) => c.toUpperCase()),
  conflicts: [],
  ...extra,
});

/** `-i, --journey-id` with the alias `-n, --name`, as a command of class I has it. */
const idWithAlias = (extra = {}) =>
  opt('-i', '--journey-id', {
    description: 'Journey id. (alias: -n, --name)',
    aliases: ['-n', '--name'],
    ...extra,
  });

const leaf = (name, options, oneOf = []) => ({ name, options, oneOf });

const ROW_I = {
  command: 'frodo config-manager pull journeys',
  id: '--journey-id',
  name: null,
  aliases: ['-n', '--name'],
};
const ROW_N = {
  command: 'frodo config-manager pull applications',
  id: '--app-id',
  name: '--app-name',
  aliases: ['--name'],
};
const appId = (extra = {}) =>
  opt('-i', '--app-id', { conflicts: ['appName'], ...extra });
const appName = (extra = {}) =>
  opt('-n', '--app-name', {
    description: 'Name. (alias: --name)',
    aliases: ['--name'],
    conflicts: ['appId'],
    ...extra,
  });

const run = (input) =>
  findSelectorProblems({
    groupLeaves: [],
    rows: [ROW_I],
    strays: [],
    pendingVerbs: [],
    ...input,
  });
const find = (input) => run(input).problems;
const all = (problems) => Object.values(problems).flat();

describe('findSelectorProblems on hand-built commands', () => {
  const journeys = (options = [idWithAlias()], oneOf = []) =>
    leaf(ROW_I.command, options, oneOf);
  const applications = (options = [appId(), appName()]) =>
    leaf(ROW_N.command, options);

  it('accepts a command of class I with -i and the alias, and a command of class N with the pair', () => {
    const { problems, checked } = run({
      groupLeaves: [journeys(), applications()],
      rows: [ROW_I, ROW_N],
    });

    expect(all(problems)).toEqual([]);
    expect(checked).toMatchObject({
      rows: 2,
      rowsMatched: 2,
      pairs: 1,
      aliased: 2,
    });
  });

  it('fails a row whose command does not exist', () => {
    expect(find({ groupLeaves: [] }).rows).toEqual([
      'frodo config-manager pull journeys :: the command does not exist',
    ]);
  });

  it('fails a command without -i, and names the option that was expected', () => {
    const { rows } = find({
      groupLeaves: [journeys([opt(null, '--journey-id')])],
    });

    expect(rows[0]).toBe(
      'frodo config-manager pull journeys :: has no -i option, expected -i, --journey-id'
    );
  });

  it('fails a -i with the wrong word', () => {
    const { rows } = find({
      groupLeaves: [journeys([idWithAlias({ long: '--tree-id' })])],
    });

    expect(rows).toContain(
      'frodo config-manager pull journeys :: -i is --tree-id, expected --journey-id'
    );
  });

  it('fails a selector that takes no value', () => {
    const { rows } = find({
      groupLeaves: [journeys([idWithAlias({ takesValue: false })])],
    });

    expect(rows).toEqual([
      'frodo config-manager pull journeys :: --journey-id takes no value',
    ]);
  });

  it('fails a class N command without the name option, and one with the wrong name', () => {
    expect(
      find({
        groupLeaves: [applications([appId()])],
        rows: [ROW_N],
      }).rows[0]
    ).toMatch(/has no -n option, expected -n, --app-name/);
    expect(
      find({
        groupLeaves: [applications([appId(), appName({ long: '--name' })])],
        rows: [ROW_N],
      }).rows.join('\n')
    ).toMatch(/-n is --name, expected --app-name/);
  });

  it('fails a class I command that has an -n option of its own', () => {
    const { rows } = find({
      groupLeaves: [
        journeys([
          opt('-i', '--journey-id', {
            description: 'Id. (alias: -n, --name)',
            aliases: ['-n', '--name'],
          }),
          opt('-n', '--journey-name'),
        ]),
      ],
    });

    expect(rows.join('\n')).toMatch(
      /has -n, --journey-name of its own, where -n is only an alias of -i/
    );
  });

  it('fails a pair that is not mutually exclusive on one side, naming the missing .conflicts', () => {
    const { rows } = find({
      groupLeaves: [applications([appId({ conflicts: [] }), appName()])],
      rows: [ROW_N],
    });

    expect(rows).toEqual([
      "frodo config-manager pull applications :: --app-id does not declare the conflict with --app-name (.conflicts(['appName']))",
    ]);
    const other = find({
      groupLeaves: [applications([appId(), appName({ conflicts: [] })])],
      rows: [ROW_N],
    }).rows;
    expect(other).toEqual([
      "frodo config-manager pull applications :: --app-name does not declare the conflict with --app-id (.conflicts(['appId']))",
    ]);
  });

  it('fails a conflict with another option that is declared on one side only, naming the side that is missing', () => {
    const scripts = (id, prefix) =>
      leaf('frodo config-manager pull scripts', [
        opt('-i', '--script-id', { conflicts: id }),
        opt('-p', '--prefix', { conflicts: prefix }),
      ]);
    const row = {
      command: 'frodo config-manager pull scripts',
      id: '--script-id',
      name: null,
      aliases: [],
    };

    expect(
      find({ groupLeaves: [scripts(['prefix'], ['scriptId'])], rows: [row] })
        .rows
    ).toEqual([]);
    expect(
      find({ groupLeaves: [scripts(['prefix'], [])], rows: [row] }).rows
    ).toEqual([
      "frodo config-manager pull scripts :: --script-id conflicts with --prefix, but --prefix does not declare the conflict back (.conflicts(['scriptId']))",
    ]);
    expect(
      find({ groupLeaves: [scripts([], ['scriptId'])], rows: [row] }).rows
    ).toEqual([
      "frodo config-manager pull scripts :: --prefix conflicts with --script-id, but --script-id does not declare the conflict back (.conflicts(['prefix']))",
    ]);
  });

  it('fails a selector that is mandatory, and one that stands in a one-of group', () => {
    expect(
      find({ groupLeaves: [journeys([idWithAlias({ mandatory: true })])] }).rows
    ).toEqual([
      'frodo config-manager pull journeys :: --journey-id is mandatory: a selector is a filter, the command works without it',
    ]);
    expect(
      find({ groupLeaves: [journeys([idWithAlias()], ['journeyId'])] }).rows
    ).toEqual([
      'frodo config-manager pull journeys :: --journey-id is in a one-of group: a selector is a filter, the command works without it',
    ]);
    // a group that names the option by its long form without the dashes
    expect(
      find({ groupLeaves: [journeys([idWithAlias()], ['journey-id'])] }).rows
    ).toHaveLength(1);
  });

  it('fails an alias that is missing, or different from the row', () => {
    const missing = find({
      groupLeaves: [journeys([idWithAlias({ aliases: [] })])],
    }).rows;
    expect(missing).toEqual([
      'frodo config-manager pull journeys :: --journey-id has the alias [], expected [-n, --name]',
    ]);
    const other = find({
      groupLeaves: [journeys([idWithAlias({ aliases: ['--name'] })])],
    }).rows;
    expect(other[0]).toMatch(
      /has the alias \[--name\], expected \[-n, --name\]/
    );
  });

  it('fails an alias that the help does not name at the end of the description', () => {
    const { rows } = find({
      groupLeaves: [
        journeys([idWithAlias({ description: 'Journey id. (alias: -n)' })]),
      ],
    });

    expect(rows).toEqual([
      'frodo config-manager pull journeys :: the description of --journey-id does not end with (alias: -n, --name)',
    ]);
  });

  it('fails a plain --name option next to the selector', () => {
    const { rows } = find({
      groupLeaves: [journeys([idWithAlias(), opt(null, '--name')])],
    });

    expect(rows.join('\n')).toMatch(/has a plain --name option/);
  });

  it('fails a row that is badly formed: a wrong word, an alias that is not a flag, -n as the alias of anything but --name', () => {
    const bad = (changes) =>
      find({
        groupLeaves: [journeys()],
        rows: [{ ...ROW_I, ...changes }],
      }).rows.join('\n');

    expect(bad({ id: '--journey' })).toMatch(/is not --<type>-id/);
    // the words are compared whole: a longer word is not a selector
    expect(bad({ id: '--journey-ids' })).toMatch(/is not --<type>-id/);
    expect(bad({ name: '--journey-names' })).toMatch(/is not --<type>-name/);
    expect(bad({ name: '--name-prefix' })).toMatch(/is not --<type>-name/);
    expect(bad({ name: '--journey-title' })).toMatch(/is not --<type>-name/);
    expect(bad({ aliases: ['name'] })).toMatch(/is not a flag/);
    expect(bad({ aliases: ['-n'] })).toMatch(
      /the alias -n is only the alias of --name/
    );
    expect(bad({ aliases: ['-n', '--name', '--other'] })).toMatch(
      /is not -n or --name/
    );
    expect(
      find({
        groupLeaves: [applications()],
        rows: [{ ...ROW_N, aliases: ['-n', '--name'] }],
      }).rows.join('\n')
    ).toMatch(/so -n is no alias/);
  });

  it('fails a row that stands twice, and counts it once', () => {
    const { problems, checked } = run({
      groupLeaves: [journeys()],
      rows: [ROW_I, ROW_I],
    });

    expect(problems.rows).toEqual([
      'frodo config-manager pull journeys :: this row stands twice in the expected selectors: one row for each command',
    ]);
    expect(checked.rows).toBe(1);
  });

  describe('a command of the group that no row names', () => {
    const stray = leaf('frodo config-manager promote unlock-tenants', [
      opt('-i', '--id'),
    ]);
    const base = { groupLeaves: [journeys(), stray] };

    it('fails when it declares -i or -n, naming both', () => {
      const { strays } = find(base);

      expect(strays).toHaveLength(1);
      expect(strays[0]).toContain(
        'frodo config-manager promote unlock-tenants'
      );
      expect(strays[0]).toContain('-i --id');
    });

    it('fails when only an alias has the letter', () => {
      const { strays } = find({
        groupLeaves: [
          leaf('frodo config-manager pull other', [
            opt('-x', '--other-id', { aliases: ['-n', '--name'] }),
          ]),
        ],
      });

      expect(strays[0]).toContain('-n --other-id');
    });

    it('accepts it when a stray entry says why, and fails the entry when it is not needed', () => {
      const entry = {
        command: 'frodo config-manager promote unlock-tenants',
        long: '--id',
        why: 'a promotion',
      };

      const used = run({ ...base, strays: [entry] });
      expect(all(used.problems)).toEqual([]);
      expect(used.checked.strays).toBe(1);

      const unused = find({ groupLeaves: [journeys()], strays: [entry] });
      expect(unused.entries).toHaveLength(1);
      expect(unused.entries[0]).toMatch(
        /^STRAY_SELECTOR_OPTIONS frodo config-manager promote unlock-tenants --id :: the command has no -i or -n option/
      );
    });

    it('fails an entry that has no reason', () => {
      const { entries } = find({
        ...base,
        strays: [
          {
            command: 'frodo config-manager promote unlock-tenants',
            long: '--id',
          },
        ],
      });

      expect(entries).toEqual([
        'STRAY_SELECTOR_OPTIONS frodo config-manager promote unlock-tenants :: entry without why',
      ]);
    });

    it('is not looked at when its verb is pending, and the entry fails when the verb has nothing pending', () => {
      const push = leaf('frodo config-manager push journeys', [
        opt('-n', '--name'),
      ]);
      const pending = {
        verb: 'push',
        why: 'not renamed yet',
        until: 'C4b',
      };

      const used = run({
        groupLeaves: [journeys(), push],
        pendingVerbs: [pending],
      });
      expect(all(used.problems)).toEqual([]);
      expect(used.checked.pendingVerbs).toBe(1);

      const unused = find({
        groupLeaves: [journeys()],
        pendingVerbs: [pending],
      });
      expect(unused.entries).toEqual([
        'PENDING_VERBS push :: every command of the verb that has -i or -n has a row now (until: C4b) :: remove the entry',
      ]);
    });

    it('does not look at a command of the group that declares neither letter', () => {
      const { strays } = find({
        groupLeaves: [
          journeys(),
          leaf('frodo config-manager pull cors', [opt(null, '--dump')]),
        ],
      });

      expect(strays).toEqual([]);
    });
  });

  describe('the inputs of the check', () => {
    const complete = () => ({
      groupLeaves: [journeys()],
      rows: [ROW_I],
      strays: [],
      pendingVerbs: [],
    });

    it.each(['groupLeaves', 'rows', 'strays', 'pendingVerbs'])(
      'throws, naming "%s", when it is missing',
      (name) => {
        const input = complete();
        delete input[name];

        expect(() => findSelectorProblems(input)).toThrow(TypeError);
        expect(() => findSelectorProblems(input)).toThrow(`"${name}"`);
      }
    );

    it('throws when there are no rows to compare the commands with', () => {
      expect(() => findSelectorProblems({ ...complete(), rows: [] })).toThrow(
        /"rows" is empty/
      );
    });
  });
});

describe('findSelectorMigrationProblems', () => {
  const table = [
    '| `pull journeys`     | `-i, --journey-id`                  | `-n`, `--name` |',
    '| `pull applications` | `-i, --app-id`, `-n, --app-name`    | `--name`       |',
  ].join('\n');

  it('accepts a table that lists each command with its options and aliases', () => {
    const { problems, checked } = findSelectorMigrationProblems(table, [
      ROW_I,
      ROW_N,
    ]);

    expect(problems).toEqual([]);
    expect(checked.rows).toBe(2);
  });

  it('fails a command that is not listed, naming it', () => {
    const { problems } = findSelectorMigrationProblems(
      table.replace('`pull journeys`', '`pull journey`'),
      [ROW_I]
    );

    expect(problems).toEqual([
      'frodo config-manager pull journeys :: MIGRATION.md has no line with `pull journeys` and `-i, --journey-id`: add the command to the table of the selectors',
    ]);
  });

  it('fails a line that lacks the name option, or an alias spelling', () => {
    expect(
      findSelectorMigrationProblems(table.replace(', `-n, --app-name`', ''), [
        ROW_N,
      ]).problems[0]
    ).toMatch(/does not hold `-n, --app-name`/);
    expect(
      findSelectorMigrationProblems(table.replace('`-n`, `--name`', '`-n`'), [
        ROW_I,
      ]).problems[0]
    ).toMatch(/does not hold `--name`/);
  });

  it('throws on a text that is empty', () => {
    expect(() => findSelectorMigrationProblems('  ', [ROW_I])).toThrow(
      TypeError
    );
  });
});

describe('findOldSpellingProblems', () => {
  const file = (lines) => ({
    name: 'config-manager-pull-journeys.e2e.test.js',
    text: lines.join('\n'),
  });
  const cmd = (args) =>
    `    const CMD = \`frodo config-manager pull journeys ${args}\`;`;

  it('accepts a line that types the new spelling', () => {
    const { problems, checked } = findOldSpellingProblems(
      [file([cmd('-i Login -D ${dirName}')])],
      [ROW_I, ROW_N],
      []
    );

    expect(problems).toEqual([]);
    expect(checked.cmdLines).toBe(1);
  });

  it.each([
    ['-n', '-n Login -D ${dirName}'],
    ['--name', '--name Login'],
    ['-n at the end of a cluster', '-Dn dir Login'],
  ])(
    'fails a line that types %s on a command that has it as an alias',
    (_label, args) => {
      const { problems } = findOldSpellingProblems(
        [file([cmd(args)])],
        [ROW_I],
        []
      );

      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('type the new spelling');
      expect(problems[0]).toContain('--journey-id');
    }
  );

  it('does not look at a command whose -n is its own option, nor at a line that is not a command', () => {
    const application = file([
      '    const CMD = `frodo config-manager pull applications -n Zion -D ${dirName}`;',
      '    // frodo config-manager pull journeys -n Login',
      '    const other = `frodo config-manager pull journeys -n Login`;',
    ]);

    const { problems, checked } = findOldSpellingProblems(
      [application],
      [ROW_I, ROW_N],
      []
    );

    expect(problems).toEqual([]);
    expect(checked.cmdLines).toBe(0);
  });

  it('accepts a line that is kept on purpose, and fails the entry when no line is left', () => {
    const line = 'frodo config-manager pull journeys -n Login';
    const entry = {
      file: 'config-manager-pull-journeys.e2e.test.js',
      cmd: line,
      why: 'covers the alias',
    };

    const kept = findOldSpellingProblems(
      [file([cmd('-n Login')])],
      [ROW_I],
      [entry]
    );
    expect(kept.problems).toEqual([]);
    expect(kept.checked.kept).toBe(1);

    const gone = findOldSpellingProblems(
      [file([cmd('-i Login')])],
      [ROW_I],
      [entry]
    );
    expect(gone.problems).toHaveLength(1);
    expect(gone.problems[0]).toMatch(
      /^KEPT_OLD_SPELLING .* no such line types the old spelling/
    );
  });

  describe('the record header lines', () => {
    const header = (
      args,
      flags = 'FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_TEST_NAME=0_n_D'
    ) => `${flags} frodo config-manager pull journeys ${args}`;

    it('accepts a header line that types the new spelling, and counts it', () => {
      const { problems, checked } = findOldSpellingProblems(
        [file([header('-i Login -D testDir1')])],
        [ROW_I],
        []
      );

      expect(problems).toEqual([]);
      expect(checked.headerLines).toBe(1);
    });

    it.each([
      ['-n', '-n Login -D testDir1'],
      ['--name', '--name Login'],
      ['-n at the end of a cluster', '-Dn dir Login'],
    ])(
      'fails a header line that types %s while the CMD line types the new spelling',
      (_label, args) => {
        const { problems } = findOldSpellingProblems(
          [file([header(args), cmd('-i Login -D ${dirName}')])],
          [ROW_I],
          []
        );

        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain('the record line types');
        expect(problems[0]).toContain('--journey-id');
      }
    );

    it('leaves the header line of a command that the file keeps on purpose, and a line that is no record line, and a command with a name of its own', () => {
      const entry = {
        file: 'config-manager-pull-journeys.e2e.test.js',
        cmd: 'frodo config-manager pull journeys -n Login',
        why: 'covers the alias',
      };
      const lines = [
        header('-n Login -D testDir1'),
        cmd('-n Login'),
        '// frodo config-manager pull journeys -n Login',
        'FRODO_MOCK=record frodo config-manager pull applications -n Zion',
      ];

      const kept = findOldSpellingProblems(
        [file(lines)],
        [ROW_I, ROW_N],
        [entry]
      );
      expect(kept.problems).toEqual([]);
      expect(kept.checked.headerLines).toBe(1);

      // without the entry the header line fails as well as the CMD line
      const not = findOldSpellingProblems([file(lines)], [ROW_I, ROW_N], []);
      expect(not.problems).toHaveLength(2);
    });
  });

  it('fails an entry without a reason', () => {
    const { problems } = findOldSpellingProblems(
      [file([cmd('-n Login')])],
      [ROW_I],
      [
        {
          file: 'config-manager-pull-journeys.e2e.test.js',
          cmd: 'frodo config-manager pull journeys -n Login',
        },
      ]
    );

    expect(problems).toContain(
      'KEPT_OLD_SPELLING config-manager-pull-journeys.e2e.test.js :: entry without why'
    );
  });
});

/**
 * The options with the letter of a selector that no row names: the two promote
 * options, and the option that a command without a selector declared before
 * the selectors and keeps (`push csp -n, --name`), each with its reason.
 */
const ALL_STRAYS = [
  ...STRAY_SELECTOR_OPTIONS,
  ...NO_SELECTOR_COMMANDS.filter((entry) => entry.ownOption).map((entry) => ({
    command: entry.command,
    long: entry.ownOption.long,
    why: entry.ownOption.why,
  })),
];

describe('the selectors of the configuration commands', () => {
  let groupLeaves;
  let commands;
  let problems;
  let checked;
  let migration;

  beforeAll(async () => {
    const { leaves } = await loadCommandTree();
    const data = leaves.map((command) => ({
      name: fullName(command),
      command,
      options: command.options.map((option) => ({
        short: option.short,
        long: option.long,
        description: option.description,
        aliases: getOptionAliases(option),
        mandatory: !!option.mandatory,
        takesValue: !!(option.required || option.optional),
        attribute: option.attributeName(),
        conflicts: [...(option.conflictsWith ?? [])],
      })),
      oneOf: getOneOfGroups(command).flatMap((group) => group.options),
    }));
    groupLeaves = data.filter((l) => isGroupLeaf(l.name));
    commands = new Map(data.map((l) => [l.name, l.command]));
    migration = fs.readFileSync(migrationPath, 'utf8');
    ({ problems, checked } = findSelectorProblems({
      groupLeaves,
      rows: EXPECTED_SELECTORS,
      strays: ALL_STRAYS,
      pendingVerbs: PENDING_VERBS,
    }));
  }, 120000);

  it('lists the commands that have been renamed: the 24 pull commands of C4a and the 25 push commands of C4b, and every row is a command', () => {
    // a floor that grows with each step: 24 (pull), 49 (push), then the delete commands
    expect(EXPECTED_SELECTORS.length).toBeGreaterThanOrEqual(49);
    expect(checked.rows).toBe(EXPECTED_SELECTORS.length);
    expect(checked.rowsMatched).toBe(EXPECTED_SELECTORS.length);
    expect(
      EXPECTED_SELECTORS.filter((row) => row.command.includes(' pull ')).length
    ).toBe(24);
    expect(
      EXPECTED_SELECTORS.filter((row) => row.command.includes(' push ')).length
    ).toBe(25);
  });

  it('has the options of every row, and nothing else on -i and -n: one -i, a -n of its own only for a name that can change, the conflicts in both directions', () => {
    expect(problems.rows).toEqual([]);
    // 12 commands have both options: applications, custom-nodes, internal-roles, iga-workflows, scripts, themes, on pull and on push
    expect(checked.pairs).toBe(12);
    // 20 commands have the alias (-n, --name on -i, or --name on -n)
    expect(checked.aliased).toBe(
      EXPECTED_SELECTORS.filter((row) => row.aliases.length > 0).length
    );
  });

  it('knows every other -i and -n of the group: the two promote options, the option that push csp keeps, and the verbs that have no rows yet', () => {
    expect(problems.strays).toEqual([]);
    expect(problems.entries).toEqual([]);
    expect(ALL_STRAYS).toHaveLength(3);
    expect(checked.strays).toBe(ALL_STRAYS.length);
    expect(checked.pendingVerbs).toBe(PENDING_VERBS.length);
  });

  it.each(NO_SELECTOR_COMMANDS.map((entry) => [entry.command, entry]))(
    '%s takes no selector: no -i, no -n, no alias and no --<type>-id or --<type>-name option, except the option that the entry says it keeps',
    (name, entry) => {
      const leaf = groupLeaves.find((l) => l.name === name);
      // a command that selects nothing: its options are the ones of every command
      const baseline = groupLeaves.find(
        (l) => l.name === 'frodo config-manager pull cors'
      );

      expect(entry.why).toMatch(/\S/);
      expect(leaf).toBeDefined();
      expect(baseline).toBeDefined();
      expect(EXPECTED_SELECTORS.map((row) => row.command)).not.toContain(name);
      const known = new Set(baseline.options.map((o) => o.long));
      const selectorLike = leaf.options.filter(
        (o) =>
          o.short === '-i' ||
          o.short === '-n' ||
          o.aliases.length > 0 ||
          (!known.has(o.long) &&
            /^--(?:[a-z]+-)*(?:id|name)$/.test(o.long ?? ''))
      );
      if (entry.ownOption) {
        // the one option that the command declared before the selectors and keeps: with a reason, exactly as declared, and nothing else
        expect(entry.ownOption.why).toMatch(/\S/);
        expect(selectorLike.map((o) => [o.short, o.long, o.aliases])).toEqual([
          [entry.ownOption.short, entry.ownOption.long, []],
        ]);
      } else {
        expect(selectorLike.map((o) => o.long)).toEqual([]);
      }
    }
  );

  it('lists push csp and push terms-and-conditions as commands without a selector, and no row names them', () => {
    const names = NO_SELECTOR_COMMANDS.map((entry) => entry.command);

    expect(names).toEqual(
      expect.arrayContaining([
        'frodo config-manager push csp',
        'frodo config-manager push terms-and-conditions',
      ])
    );
    expect(
      EXPECTED_SELECTORS.filter((row) => names.includes(row.command))
    ).toEqual([]);
    // push csp keeps the -n it declared; push terms-and-conditions never had one
    expect(
      NO_SELECTOR_COMMANDS.filter((entry) => entry.ownOption).map(
        (entry) => entry.command
      )
    ).toEqual(['frodo config-manager push csp']);
  });

  it('has no plain --name option on a command of a verb that has its rows, except the one that push csp keeps', () => {
    const done = new Set(
      EXPECTED_SELECTORS.map((row) => row.command.split(' ')[2])
    );
    const kept = NO_SELECTOR_COMMANDS.filter(
      (entry) => entry.ownOption?.long === '--name'
    ).map((entry) => entry.command);
    const plain = groupLeaves
      .filter((l) => done.has(l.name.split(' ')[2]))
      .filter((l) => l.options.some((o) => o.long === '--name'))
      .map((l) => l.name);

    expect(plain).toEqual(kept);
  });

  describe('the spellings', () => {
    /** The options a command line sets: the options of the command on a fresh command, parsed without an action. */
    const parse = (name, args) => {
      const fresh = new Command('x').exitOverride();
      fresh.configureOutput({ writeErr: () => {}, writeOut: () => {} });
      for (const option of commands.get(name).options) fresh.addOption(option);
      fresh.parseOptions(args);
      return fresh.opts();
    };
    const attributeOf = (name, long) =>
      commands
        .get(name)
        .options.find((option) => option.long === long)
        .attributeName();

    /** Parses the arguments and expects the one attribute to be set, and no other selector attribute. */
    const expectSets = (row, args, attribute) => {
      const options = parse(row.command, args);
      expect(options[attribute]).toBe('x');
      for (const other of [row.id, row.name].filter(Boolean)) {
        const name = attributeOf(row.command, other);
        if (name !== attribute) expect(options[name]).toBeUndefined();
      }
    };

    it.each(EXPECTED_SELECTORS.map((row) => [row.command, row]))(
      '%s: every spelling sets the attribute of its option',
      (name, row) => {
        const id = attributeOf(name, row.id);
        expectSets(row, ['-i', 'x'], id);
        expectSets(row, [row.id, 'x'], id);
        const named = row.name === null ? id : attributeOf(name, row.name);
        if (row.name !== null) {
          expectSets(row, ['-n', 'x'], named);
          expectSets(row, [row.name, 'x'], named);
        }
        if (row.aliases.includes('-n')) {
          expectSets(row, ['-n', 'x'], id);
          expectSets(row, ['-nx'], id);
          // a letter of another option next to -n in one cluster (-k is --insecure on every command)
          expectSets(row, ['-kn', 'x'], id);
          expect(parse(name, ['-kn', 'x']).insecure).toBe(true);
        }
        if (row.aliases.includes('--name')) {
          expectSets(row, ['--name', 'x'], named);
          expectSets(row, ['--name=x'], named);
        }
      }
    );

    /** Parses the arguments on a fresh command that has the options of the leaf, and returns what commander says. */
    const failure = (name, args) => {
      const fresh = new Command('x').exitOverride();
      fresh.configureOutput({ writeErr: () => {}, writeOut: () => {} });
      for (const option of commands.get(name).options) fresh.addOption(option);
      fresh.action(() => {});
      try {
        fresh.parse(args, { from: 'user' });
      } catch (error) {
        return error;
      }
      return undefined;
    };

    it.each(EXPECTED_SELECTORS.map((row) => [row.command, row]))(
      '%s: an empty value is refused for every spelling, before the command runs, naming the option',
      (name, row) => {
        const spellings = [
          ['-i', ''],
          [row.id, ''],
          [`${row.id}=`],
          ...(row.name === null
            ? row.aliases.includes('-n')
              ? [['-n', '']]
              : []
            : [['-n', ''], [row.name, ''], [`${row.name}=`]]),
          ...(row.aliases.includes('--name')
            ? [['--name', ''], ['--name=']]
            : []),
        ];
        for (const args of spellings) {
          const error = failure(name, args);

          expect([args.join(' '), error?.code, error?.exitCode]).toEqual([
            args.join(' '),
            'commander.invalidArgument',
            1,
          ]);
          expect(error.message).toMatch(
            /error: option '-[in], --[a-z-]+ <[a-z]+>'/
          );
          expect(error.message).toContain(
            'An empty value never selects all objects'
          );
        }
        // a value that is not empty is not refused
        expect(failure(name, ['-i', 'x'])).toBeUndefined();
      }
    );

    it('refuses an empty prefix of pull scripts, which would match every script, and takes repeated prefixes', () => {
      const name = 'frodo config-manager pull scripts';

      for (const args of [['-p', ''], ['--prefix', ''], ['--prefix=']]) {
        const error = failure(name, args);

        expect([args.join(' '), error?.code, error?.exitCode]).toEqual([
          args.join(' '),
          'commander.invalidArgument',
          1,
        ]);
        expect(error.message).toContain("option '-p, --prefix <prefix>'");
        expect(error.message).toContain(
          'An empty value never selects all objects'
        );
      }
      expect(failure(name, ['-p', 'a', '-p', ''])).toBeDefined();
      expect(failure(name, ['-p', 'a'])).toBeUndefined();
      expect(parse(name, ['-p', 'a', '--prefix=b']).prefix).toEqual(['a', 'b']);
    });

    it('refuses an empty -n of push csp, which would write both policies, and still takes a policy name as it did', () => {
      const name = 'frodo config-manager push csp';

      for (const args of [['-n', ''], ['--name', ''], ['--name=']]) {
        const error = failure(name, args);

        expect([args.join(' '), error?.code, error?.exitCode]).toEqual([
          args.join(' '),
          'commander.invalidArgument',
          1,
        ]);
        expect(error.message).toContain("option '-n, --name <name>'");
        expect(error.message).toContain(
          'An empty value never selects all objects'
        );
      }
      // the meaning of the option did not change: a name is passed on as it was typed
      expect(failure(name, ['-n', 'enforced'])).toBeUndefined();
      expect(failure(name, ['--name', 'report-only'])).toBeUndefined();
      expect(parse(name, ['-n', 'enforced']).name).toBe('enforced');
      // no -i and no alias: the command has no selector
      expect(failure(name, ['-i', 'x'])?.code).toBe('commander.unknownOption');
    });

    it('keeps the letters of the other options: -n is no letter of another option on a renamed command', () => {
      for (const row of EXPECTED_SELECTORS) {
        const others = commands
          .get(row.command)
          .options.filter(
            (o) => o.short === '-n' && o.long !== (row.name ?? row.id)
          );
        expect(others.map((o) => o.long)).toEqual([]);
      }
    });

    it('rejects -i with -n on a command with a name that can change, before anything runs', () => {
      const rows = EXPECTED_SELECTORS.filter((row) => row.name !== null);
      expect(rows.length).toBe(12);
      for (const row of rows) {
        const fresh = new Command('x').exitOverride();
        fresh.configureOutput({ writeErr: () => {}, writeOut: () => {} });
        for (const option of commands.get(row.command).options) {
          fresh.addOption(option);
        }
        fresh.action(() => {});

        expect(() =>
          fresh.parse(['-i', 'a', '-n', 'b'], { from: 'user' })
        ).toThrow(/cannot be used with option/);
        // the other spelling of the name: the alias --name where there is one
        const other = row.aliases.includes('--name') ? '--name' : row.name;
        expect(() =>
          fresh.parse([other, 'b', '-i', 'a'], { from: 'user' })
        ).toThrow(/cannot be used with option/);
      }
    });

    it('takes the last of two spellings on a command with an identifier only, as for a repeated option', () => {
      const row = EXPECTED_SELECTORS.find(
        (r) => r.name === null && r.aliases.length
      );
      const id = attributeOf(row.command, row.id);

      expect(parse(row.command, ['-i', 'a', '-n', 'b'])[id]).toBe('b');
      expect(parse(row.command, ['--name', 'a', '-i', 'b'])[id]).toBe('b');
    });
  });

  it('lists every renamed command in MIGRATION.md with its new option and its alias', () => {
    const result = findSelectorMigrationProblems(migration, EXPECTED_SELECTORS);

    expect(result.problems).toEqual([]);
    expect(result.checked.rows).toBe(EXPECTED_SELECTORS.length);
  });

  it('types the new spelling in the e2e tests, except the lines kept on purpose', () => {
    const files = fs
      .readdirSync(e2eFolder)
      .filter((name) => /^config-manager-.+\.test\.js$/.test(name))
      .map((name) => ({
        name,
        text: fs.readFileSync(`${e2eFolder}${name}`, 'utf8'),
      }));

    const result = findOldSpellingProblems(
      files,
      EXPECTED_SELECTORS,
      KEPT_OLD_SPELLING
    );

    expect(result.problems).toEqual([]);
    // a floor, so that a folder that was not read cannot pass by being empty
    expect(files.length).toBeGreaterThanOrEqual(60);
    expect(result.checked.cmdLines).toBeGreaterThanOrEqual(14);
    expect(result.checked.kept).toBe(KEPT_OLD_SPELLING.length);
  });
});
