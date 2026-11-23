import fs from 'fs';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from '@jest/globals';
import { getOptionAliases } from '../../src/cli/OptionAlias.ts';
import { fullName, loadCommandTree } from '../utils/CommandExamples.js';
import {
  findLetterProblems,
  isGroupLeaf,
  lettersOf,
  selectorMeaning,
} from '../utils/OptionLetters.js';
import {
  DESCRIPTION_LETTERS,
  EXPECTED_SHORT_FORMS,
  HERITAGE_OVERLAPS,
  SAME_MEANING,
  SELECTOR_LETTERS,
} from './ConfigManagerOptionLettersExceptions.js';

/**
 * Inside the configuration command group a short letter has one meaning, the
 * short forms are the ones the options record decided, `--dry-run` is `-d`, a
 * heritage command does not take a letter of the group for another option
 * unless a reason says why, a description names only letters that its command
 * declares, and MIGRATION.md lists every spelling that was removed:
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md
 * (options of the configuration commands). The rules are in
 * test/utils/OptionLetters.js, the data in
 * ConfigManagerOptionLettersExceptions.js. Every list there fails when an
 * entry is no longer needed.
 *
 * The first block checks the rules on hand-built commands (a seeded defect for
 * each rule); the second reads the real command tree, without a build.
 */

const migrationPath = fileURLToPath(
  new URL('../../MIGRATION.md', import.meta.url)
);

/**
 * A leaf with options given as `[short, long, description, aliases]`; `null`
 * for no short form, `aliases` for the extra spellings of an option.
 */
function leaf(name, options, description = '') {
  return {
    name,
    description,
    options: options.map(([short, long, text = '', aliases]) => ({
      short: short ?? undefined,
      long,
      description: text,
      aliases,
    })),
  };
}

/** The selector letters of the record, as the real data has them. */
const SELECTORS = [
  { letter: '-i', pattern: /^--(?:[a-z]+-)*id$/, why: 'an identifier' },
  { letter: '-n', pattern: /^--(?:[a-z]+-)*name$/, why: 'a name' },
];

// The check refuses an empty `expected` and an empty `migration`, so a case
// that is not about them carries one row about a command of its own and one
// line of text.
const PLACEHOLDER = {
  leaf: leaf('frodo config-manager pull placeholder', [
    [null, '--placeholder'],
  ]),
  row: {
    command: 'frodo config-manager pull placeholder',
    long: '--placeholder',
    short: null,
    was: null,
  },
  migration: 'a text',
};

/** The check on hand-built commands: `{ problems, checked }`. */
const run = (input) =>
  findLetterProblems({
    groupLeaves: [],
    heritageLeaves: [],
    sameMeaning: [],
    selectorLetters: [],
    heritageOverlaps: [],
    descriptionLetters: [],
    ...input,
    // after the input, so that the placeholders are always there
    expected: [...(input.expected ?? []), PLACEHOLDER.row],
    groupLeaves: [...(input.groupLeaves ?? []), PLACEHOLDER.leaf],
    migration: input.migration ?? PLACEHOLDER.migration,
  });
const find = (input) => run(input).problems;
const all = (problems) => Object.values(problems).flat();

describe('isGroupLeaf', () => {
  it.each([
    'frodo config-manager pull cors',
    'frodo config-manager promote run-promotion',
    'frodo config push secrets',
    'frodo config delete schedules',
  ])('is true for "%s", the group under either of its names', (name) => {
    expect(isGroupLeaf(name)).toBe(true);
  });

  it.each([
    'frodo config export',
    'frodo config import',
    'frodo config-manager export',
    'frodo promote',
    'frodo journey pull',
    'frodo config-manager',
  ])('is false for "%s"', (name) => {
    expect(isGroupLeaf(name)).toBe(false);
  });
});

describe('lettersOf', () => {
  it('maps each letter to its long names and the commands that declare them', () => {
    const letters = lettersOf([
      leaf('frodo a', [
        ['-n', '--name'],
        ['-y', '--yes'],
      ]),
      leaf('frodo b', [
        ['-n', '--name'],
        ['-n', '--script-name'],
      ]),
    ]);

    expect(letters).toEqual({
      '-n': { '--name': ['frodo a', 'frodo b'], '--script-name': ['frodo b'] },
      '-y': { '--yes': ['frodo a'] },
    });
  });

  it('leaves out the shared letters with their shared long name', () => {
    const letters = lettersOf([
      leaf('frodo a', [
        ['-m', '--type'],
        ['-D', '--directory'],
        ['-E', '--env'],
        ['-F', '--force-update'],
        ['-k', '--insecure'],
        ['-h', '--help'],
        ['-d', '--dry-run'],
      ]),
    ]);

    expect(Object.keys(letters)).toEqual(['-d']);
  });

  it('ignores an option that has a long form only', () => {
    const letters = lettersOf([leaf('frodo a', [[null, '--clean']])]);

    expect(letters).toEqual({});
  });

  it('reads the letter of an alias with the long name of the alias', () => {
    const letters = lettersOf([
      leaf('frodo a', [
        ['-i', '--journey-id', '', ['-n', '--name']],
        ['-y', '--yes'],
      ]),
    ]);

    expect(letters).toEqual({
      '-i': { '--journey-id': ['frodo a'] },
      '-n': { '--name': ['frodo a'] },
      '-y': { '--yes': ['frodo a'] },
    });
  });

  it('reads an alias letter without an alias long name as the long name of the option', () => {
    const letters = lettersOf([
      leaf('frodo a', [['-i', '--journey-id', '', ['-n']]]),
    ]);

    expect(letters['-n']).toEqual({ '--journey-id': ['frodo a'] });
  });

  it('reads no letter from an alias that is a long spelling only', () => {
    const letters = lettersOf([
      leaf('frodo a', [['-n', '--app-name', '', ['--name']]]),
    ]);

    expect(letters).toEqual({ '-n': { '--app-name': ['frodo a'] } });
  });
});

describe('selectorMeaning', () => {
  it.each([
    ['-i', '--id'],
    ['-i', '--report-id'],
    ['-i', '--journey-id'],
    ['-i', '--managed-object-id'],
    ['-n', '--name'],
    ['-n', '--script-name'],
    ['-n', '--software-publisher-name'],
  ])('is true for %s with %s', (letter, long) => {
    expect(selectorMeaning(letter, long, SELECTORS)).toBe(true);
  });

  it.each([
    ['-i', '--include-immutable'],
    ['-i', '--idm-host'],
    ['-i', '--journey-name'],
    ['-n', '--filename-filter'],
    ['-n', '--name-prefix'],
    ['-n', '--journey-id'],
    ['-y', '--yes-id'],
    ['-i', undefined],
  ])('is false for %s with %s', (letter, long) => {
    expect(selectorMeaning(letter, long, SELECTORS)).toBe(false);
  });

  it('is false when no entry names the letter', () => {
    expect(selectorMeaning('-i', '--journey-id', [])).toBe(false);
  });
});

describe('findLetterProblems on hand-built commands', () => {
  const twoMeanings = [
    leaf('frodo config-manager pull a', [['-d', '--dry-run']]),
    leaf('frodo config-manager push b', [['-d', '--description']]),
  ];

  it('accepts commands that give every letter one meaning', () => {
    const problems = find({
      groupLeaves: [
        leaf('frodo config-manager pull a', [['-d', '--dry-run']]),
        leaf('frodo config-manager push b', [['-d', '--dry-run']]),
      ],
    });

    expect(all(problems)).toEqual([]);
  });

  describe('one meaning per letter', () => {
    it('names the letter, both options and the commands when a letter has two', () => {
      const { letters } = find({ groupLeaves: twoMeanings });

      expect(letters).toHaveLength(1);
      expect(letters[0]).toContain('-d');
      expect(letters[0]).toContain('--dry-run (frodo config-manager pull a)');
      expect(letters[0]).toContain(
        '--description (frodo config-manager push b)'
      );
    });

    it('accepts two long names that a SAME_MEANING entry covers', () => {
      const problems = find({
        groupLeaves: twoMeanings,
        sameMeaning: [
          {
            letter: '-d',
            longs: ['--description', '--dry-run'],
            why: 'one meaning',
            until: 'never',
          },
        ],
      });

      expect(all(problems)).toEqual([]);
    });

    it('fails an entry that has no reason, or no end', () => {
      const entry = { letter: '-d', longs: ['--dry-run', '--description'] };

      const { entries } = find({
        groupLeaves: twoMeanings,
        sameMeaning: [{ ...entry, until: 'never' }],
      });
      expect(entries).toEqual(['SAME_MEANING -d :: entry without why']);

      const { entries: noEnd } = find({
        groupLeaves: twoMeanings,
        sameMeaning: [{ ...entry, why: 'one meaning' }],
      });
      expect(noEnd).toEqual(['SAME_MEANING -d :: entry without until']);
    });

    it('fails an entry that no letter needs any more', () => {
      const { entries } = find({
        groupLeaves: [
          leaf('frodo config-manager pull a', [['-d', '--dry-run']]),
        ],
        sameMeaning: [
          {
            letter: '-d',
            longs: ['--dry-run', '--description'],
            why: 'one meaning',
            until: 'C5',
          },
        ],
      });

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatch(/no letter -d has exactly the long names/);
      expect(entries[0]).toContain('until: C5');
    });

    it('does not accept an entry that names only some of the long names', () => {
      const three = [
        ...twoMeanings,
        leaf('frodo config-manager push c', [['-d', '--draft']]),
      ];
      const { letters } = find({
        groupLeaves: three,
        sameMeaning: [
          {
            letter: '-d',
            longs: ['--dry-run', '--description'],
            why: 'one meaning',
            until: 'C5',
          },
        ],
      });

      expect(letters).toHaveLength(1);
      expect(letters[0]).toContain('3 meanings');
    });

    describe('the selector letters', () => {
      const selectors = [
        leaf('frodo config-manager pull a', [['-i', '--journey-id']]),
        leaf('frodo config-manager pull b', [['-i', '--script-id']]),
        leaf('frodo config-manager promote c', [['-i', '--report-id']]),
      ];

      it('counts the long names that a selector pattern matches as one meaning', () => {
        const { problems, checked } = run({
          groupLeaves: selectors,
          selectorLetters: [SELECTORS[0]],
        });

        expect(all(problems)).toEqual([]);
        expect(checked.selectorLetters).toBe(1);
      });

      it('fails the same long names without the entry', () => {
        const { letters } = find({ groupLeaves: selectors });

        expect(letters).toHaveLength(1);
        expect(letters[0]).toContain('3 meanings');
      });

      it('counts an alias spelling as a selector too: -n --name next to -n --script-name', () => {
        const { problems } = run({
          groupLeaves: [
            leaf('frodo config-manager pull a', [
              ['-i', '--journey-id', '', ['-n', '--name']],
            ]),
            leaf('frodo config-manager pull b', [['-n', '--script-name']]),
          ],
          selectorLetters: [SELECTORS[1]],
        });

        expect(all(problems)).toEqual([]);
      });

      it('still fails a letter that has a selector and another meaning, naming both', () => {
        const { letters } = find({
          groupLeaves: [
            ...selectors,
            leaf('frodo config-manager pull d', [
              ['-i', '--include-immutable'],
            ]),
          ],
          selectorLetters: SELECTORS,
        });

        expect(letters).toHaveLength(1);
        expect(letters[0]).toContain('2 meanings');
        expect(letters[0]).toContain('--include-immutable');
        expect(letters[0]).toContain('--journey-id/--script-id/--report-id');
      });

      it('fails a second option on the letter of an alias, in another command', () => {
        const { letters } = find({
          groupLeaves: [
            leaf('frodo config-manager pull a', [
              ['-i', '--journey-id', '', ['-n', '--name']],
            ]),
            leaf('frodo config-manager pull b', [['-n', '--no-deps']]),
          ],
          selectorLetters: SELECTORS,
        });

        expect(letters).toHaveLength(1);
        expect(letters[0]).toContain('-n');
        expect(letters[0]).toContain('--no-deps');
      });

      it('fails an entry that no letter needs any more', () => {
        const { entries } = find({
          groupLeaves: [
            leaf('frodo config-manager pull a', [['-i', '--journey-id']]),
          ],
          selectorLetters: SELECTORS,
        });

        expect(entries).toHaveLength(2);
        expect(entries[0]).toMatch(
          /^SELECTOR_LETTERS -i :: no letter -i has two long names/
        );
        expect(entries[1]).toMatch(/^SELECTOR_LETTERS -n ::/);
      });

      it('fails an entry that has no reason or no pattern', () => {
        const { entries } = find({
          groupLeaves: selectors,
          selectorLetters: [
            { letter: '-i', pattern: SELECTORS[0].pattern },
            { letter: '-n', why: 'a name' },
          ],
        });

        expect(entries).toEqual(
          expect.arrayContaining([
            'SELECTOR_LETTERS -i :: entry without why',
            'SELECTOR_LETTERS -n :: entry without a pattern',
          ])
        );
      });
    });

    it('fails a shared letter that means something else on a command', () => {
      const { letters } = find({
        groupLeaves: [leaf('frodo config-manager pull a', [['-D', '--dir']])],
      });

      expect(letters).toEqual([
        '-D :: frodo config-manager pull a :: -D is --directory on every command, here it is --dir',
      ]);
    });
  });

  describe('the short forms of the record', () => {
    const groupLeaves = [
      leaf('frodo config-manager pull a', [
        ['-I', '--ignore-encrypted-secrets'],
        [null, '--clean'],
      ]),
    ];
    const row = (changes) => ({
      command: 'frodo config-manager pull a',
      long: '--ignore-encrypted-secrets',
      short: '-I',
      was: '-i',
      ...changes,
    });

    it('accepts a row that is what the command declares', () => {
      const problems = find({
        groupLeaves,
        expected: [row(), row({ long: '--clean', short: null, was: '-c' })],
      });

      expect(problems.shortForms).toEqual([]);
    });

    it('fails a row with the wrong letter', () => {
      const { shortForms } = find({
        groupLeaves,
        expected: [row({ short: '-i' })],
      });

      expect(shortForms).toEqual([
        'frodo config-manager pull a :: --ignore-encrypted-secrets :: has -I, expected -i',
      ]);
    });

    it('fails a short form where none is expected', () => {
      const { shortForms } = find({
        groupLeaves,
        expected: [row({ short: null })],
      });

      expect(shortForms[0]).toMatch(
        /has the short form -I, where none is expected/
      );
    });

    it('fails a long form where a short one is expected', () => {
      const { shortForms } = find({
        groupLeaves,
        expected: [row({ long: '--clean', short: '-c' })],
      });

      expect(shortForms).toEqual([
        'frodo config-manager pull a :: --clean :: has no short form, expected -c',
      ]);
    });

    it('fails a row of a command or an option that does not exist', () => {
      const { shortForms } = find({
        groupLeaves,
        expected: [
          row({ command: 'frodo config-manager pull z' }),
          row({ long: '--zzz' }),
        ],
      });

      expect(shortForms).toEqual([
        'frodo config-manager pull z :: --ignore-encrypted-secrets :: the command does not exist',
        'frodo config-manager pull a :: --zzz :: the command has no such option',
      ]);
    });
  });

  describe('the expected rows', () => {
    const groupLeaves = [
      leaf('frodo config-manager pull a', [
        ['-I', '--ignore-encrypted-secrets'],
        [null, '--clean'],
      ]),
    ];
    const row = (changes) => ({
      command: 'frodo config-manager pull a',
      long: '--ignore-encrypted-secrets',
      short: '-I',
      was: '-i',
      ...changes,
    });

    it('fails a row that stands twice, and counts it once', () => {
      const { problems, checked } = run({
        groupLeaves,
        expected: [row(), row()],
      });

      expect(problems.shortForms).toEqual([
        'frodo config-manager pull a :: --ignore-encrypted-secrets :: this row stands twice in the expected short forms: one row for each option',
      ]);
      // the placeholder row is the second row
      expect(checked.rows).toBe(2);
    });

    it('counts the rows that the commands match by command, option and letter', () => {
      const { problems, checked } = run({
        groupLeaves,
        expected: [row(), row({ long: '--clean', short: null, was: '-c' })],
      });

      expect(problems.shortForms).toEqual([]);
      expect(checked).toMatchObject({ rows: 3, rowsMatched: 3 });
      expect(
        run({ groupLeaves, expected: [row({ short: '-i' })] }).checked
      ).toMatchObject({ rows: 2, rowsMatched: 1 });
    });
  });

  describe('the dry run', () => {
    it('fails a --dry-run without -d on a command of the group', () => {
      const { dryRun } = find({
        groupLeaves: [
          leaf('frodo config-manager push secrets', [[null, '--dry-run']]),
        ],
      });

      expect(dryRun).toEqual([
        'frodo config-manager push secrets :: --dry-run has no short form, expected -d',
      ]);
    });

    it('does not look at a heritage command', () => {
      const problems = find({
        heritageLeaves: [
          leaf('frodo oauth issuer delete', [[null, '--dry-run']]),
        ],
      });

      expect(problems.dryRun).toEqual([]);
    });
  });

  describe('a heritage command and the letters of the group', () => {
    const groupLeaves = [
      leaf('frodo config-manager push raw', [['-C', '--config-folder']]),
    ];
    const heritage = (long) => [leaf('frodo service import', [['-C', long]])];

    it('fails a heritage option that takes a letter of the group, naming both', () => {
      const { heritage: problems } = find({
        groupLeaves,
        heritageLeaves: heritage('--clean'),
      });

      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('frodo service import');
      expect(problems[0]).toContain('-C --clean');
      expect(problems[0]).toContain(
        '--config-folder (frodo config-manager push raw)'
      );
    });

    it('needs no entry for the same long name', () => {
      const problems = find({
        groupLeaves,
        heritageLeaves: heritage('--config-folder'),
      });

      expect(problems.heritage).toEqual([]);
    });

    it('accepts an option that an entry covers, by name or by pattern', () => {
      const entry = (longs) => ({ letter: '-C', longs, why: 'a reason' });

      expect(
        all(
          find({
            groupLeaves,
            heritageLeaves: heritage('--clean'),
            heritageOverlaps: [entry(['--clean'])],
          })
        )
      ).toEqual([]);
      expect(
        all(
          find({
            groupLeaves,
            heritageLeaves: heritage('--clean'),
            heritageOverlaps: [entry([/^--cl/])],
          })
        )
      ).toEqual([]);
    });

    it('fails an entry that has no reason', () => {
      const { entries } = find({
        groupLeaves,
        heritageLeaves: heritage('--clean'),
        heritageOverlaps: [{ letter: '-C', longs: ['--clean'] }],
      });

      expect(entries).toEqual(['HERITAGE_OVERLAPS -C :: entry without why']);
    });

    it('fails an entry, or a name of an entry, that no heritage command uses', () => {
      const { entries } = find({
        groupLeaves,
        heritageLeaves: heritage('--clean'),
        heritageOverlaps: [
          { letter: '-C', longs: ['--clean', '--gone'], why: 'a reason' },
        ],
      });

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatch(
        /^HERITAGE_OVERLAPS -C --gone :: no heritage command declares -C/
      );
    });

    it('leaves a letter of the heritage commands alone when the group does not use it', () => {
      const problems = find({
        groupLeaves,
        heritageLeaves: [leaf('frodo journey export', [['-x', '--anything']])],
      });

      expect(problems.heritage).toEqual([]);
    });
  });

  describe('the letters that a description names', () => {
    const groupLeaves = (text) => [
      leaf(
        'frodo config-manager pull a',
        [['-l', '--list', text]],
        'Pulls things.'
      ),
    ];

    it('accepts a letter that the command declares, a shared one and a long option', () => {
      const problems = find({
        groupLeaves: groupLeaves(
          'Cannot be used with -l, -D or --dump. -h helps.'
        ),
      });

      expect(problems.descriptions).toEqual([]);
    });

    it('fails a letter that the command does not declare', () => {
      const { descriptions } = find({
        groupLeaves: groupLeaves('Cannot be used with -r.'),
      });

      expect(descriptions).toHaveLength(1);
      expect(descriptions[0]).toContain('frodo config-manager pull a');
      expect(descriptions[0]).toContain('the description of --list names -r');
    });

    it('reads an uppercase letter as a letter too (-I, -L, -P and -C are letters of the record)', () => {
      const { descriptions } = find({
        groupLeaves: groupLeaves('Cannot be used with -P.'),
      });

      expect(descriptions).toHaveLength(1);
      expect(descriptions[0]).toContain('names -P');
      expect(
        find({
          groupLeaves: [
            leaf('frodo config-manager pull a', [
              ['-P', '--promoter', 'Cannot be used with -P.'],
            ]),
          ],
        }).descriptions
      ).toEqual([]);
    });

    it('accepts the letter of an alias that the command declares', () => {
      const problems = find({
        groupLeaves: [
          leaf(
            'frodo config-manager pull a',
            [
              [
                '-i',
                '--journey-id',
                'Journey id. Cannot be used with -p. (alias: -n, --name)',
                ['-n', '--name'],
              ],
              ['-p', '--prefix', 'Cannot be used with -n.'],
            ],
            'Pulls things.'
          ),
        ],
      });

      expect(problems.descriptions).toEqual([]);
    });

    it('fails the letter of an alias that another command declares', () => {
      const { descriptions } = find({
        groupLeaves: [
          leaf('frodo config-manager pull a', [
            ['-i', '--journey-id', 'Id.', ['-n', '--name']],
          ]),
          leaf('frodo config-manager pull b', [
            ['-p', '--prefix', 'Cannot be used with -n.'],
          ]),
        ],
      });

      expect(descriptions).toHaveLength(1);
      expect(descriptions[0]).toContain('frodo config-manager pull b');
    });

    it('reads the description of the command too', () => {
      const { descriptions } = find({
        groupLeaves: [leaf('frodo config-manager pull a', [], 'Use -p.')],
      });

      expect(descriptions[0]).toContain(
        'the description of the command names -p'
      );
    });

    it('does not read a letter inside a word or a long option', () => {
      const problems = find({
        groupLeaves: groupLeaves(
          'An e-mail, a non-empty --x-ray, 10-20, well-known, a-b and --z.'
        ),
      });

      expect(problems.descriptions).toEqual([]);
    });

    it('accepts a letter that an entry says is not an option, and fails the entry when it is not needed', () => {
      const entry = {
        command: 'frodo config-manager pull a',
        letter: '-u',
        why: 'an option of date',
      };

      expect(
        all(
          find({
            groupLeaves: groupLeaves('Run date -u.'),
            descriptionLetters: [entry],
          })
        )
      ).toEqual([]);
      expect(
        find({
          groupLeaves: groupLeaves('Nothing.'),
          descriptionLetters: [entry],
        }).entries
      ).toEqual([
        'DESCRIPTION_LETTERS frodo config-manager pull a -u :: no description names it any more :: remove the entry',
      ]);
    });

    it('reads the description of a heritage command only when a row of the record names it', () => {
      const heritageLeaves = [leaf('frodo journey export', [], 'Use -p.')];
      const row = (command) => ({
        command,
        long: '--x',
        short: null,
        was: '-x',
      });

      expect(find({ heritageLeaves }).descriptions).toEqual([]);
      expect(
        find({
          heritageLeaves: [
            leaf('frodo iga workflow delete', [[null, '--x']], 'Unless -d.'),
          ],
          expected: [row('frodo iga workflow delete')],
        }).descriptions
      ).toHaveLength(1);
    });
  });

  describe('the inputs of the check', () => {
    const complete = () => ({
      groupLeaves: [PLACEHOLDER.leaf],
      heritageLeaves: [],
      sameMeaning: [],
      selectorLetters: [],
      expected: [PLACEHOLDER.row],
      heritageOverlaps: [],
      descriptionLetters: [],
      migration: PLACEHOLDER.migration,
    });

    it('accepts a complete input, with the lists of entries empty', () => {
      expect(() => findLetterProblems(complete())).not.toThrow();
    });

    it.each([
      'groupLeaves',
      'heritageLeaves',
      'sameMeaning',
      'selectorLetters',
      'expected',
      'heritageOverlaps',
      'descriptionLetters',
      'migration',
    ])('throws, naming "%s", when it is missing', (name) => {
      const input = complete();
      delete input[name];

      expect(() => findLetterProblems(input)).toThrow(TypeError);
      expect(() => findLetterProblems(input)).toThrow(`"${name}"`);
    });

    it('throws when there are no expected rows to compare the commands with', () => {
      expect(() => findLetterProblems({ ...complete(), expected: [] })).toThrow(
        /"expected" is missing or empty/
      );
    });

    it.each(['', '  \n', 42, null])(
      'throws when the text of MIGRATION.md is %j',
      (migration) => {
        expect(() => findLetterProblems({ ...complete(), migration })).toThrow(
          /"migration" is missing or empty/
        );
      }
    );

    it('says what each input made it look at', () => {
      const a = leaf('frodo config-manager push a', [
        ['-d', '--dry-run'],
        ['-n', '--name'],
        [null, '--stdin', 'Use date -u.'],
      ]);
      const b = leaf('frodo config-manager pull b', [['-n', '--script-name']]);
      const c = leaf('frodo config-manager push c', [['-d', '--draft']]);
      const h = leaf('frodo service import', [
        ['-n', '--service-name'],
        [null, '--clean'],
      ]);
      const input = {
        groupLeaves: [a, b, c],
        heritageLeaves: [h],
        sameMeaning: [
          {
            letter: '-d',
            longs: ['--dry-run', '--draft'],
            why: 'one meaning',
            until: 'never',
          },
        ],
        selectorLetters: [
          { letter: '-n', pattern: /^--(?:[a-z]+-)*name$/, why: 'a name' },
        ],
        heritageOverlaps: [
          { letter: '-n', longs: [/^--[a-z]+-name$/], why: 'a reason' },
        ],
        descriptionLetters: [
          { command: a.name, letter: '-u', why: 'an option of date' },
        ],
        expected: [
          { command: a.name, long: '--dry-run', short: '-d', was: null },
          { command: h.name, long: '--clean', short: null, was: '-C' },
        ],
        migration: [
          '| `-C, --clean` | `service import` | `--clean` |',
          '',
          '`-d, --dry-run` is new on `push a`.',
        ].join('\n'),
      };

      const { problems, checked } = findLetterProblems(input);

      expect(Object.values(problems).flat()).toEqual([]);
      expect(checked).toEqual({
        groupLeaves: 3,
        heritageLeaves: 1,
        sameMeaning: 1,
        selectorLetters: 1,
        rows: 2,
        rowsMatched: 2,
        dryRunLeaves: 1,
        heritageOverlaps: 1,
        descriptionLeaves: 4,
        descriptionLetters: 1,
        spellings: 1,
        dryRunAdded: 1,
      });
      // each input that is dropped shows in what the check looked at
      expect(
        findLetterProblems({ ...input, sameMeaning: [] }).checked.sameMeaning
      ).toBe(0);
      expect(
        findLetterProblems({ ...input, selectorLetters: [] }).checked
          .selectorLetters
      ).toBe(0);
      expect(
        findLetterProblems({ ...input, heritageOverlaps: [] }).checked
          .heritageOverlaps
      ).toBe(0);
      expect(
        findLetterProblems({ ...input, descriptionLetters: [] }).checked
          .descriptionLetters
      ).toBe(0);
    });
  });

  describe('MIGRATION.md', () => {
    const expected = [
      {
        command: 'frodo config-manager push raw',
        long: '--stdin',
        short: null,
        was: '-i',
      },
      {
        command: 'frodo config-manager push secrets',
        long: '--dry-run',
        short: '-d',
        was: null,
      },
      {
        command: 'frodo service import',
        long: '--clean',
        short: null,
        was: '-C',
      },
    ];
    const table = [
      '| `-i, --stdin` | `push raw` | `--stdin` |',
      '| `-C, --clean` | `service import` | `--clean` |',
    ].join('\n');
    const paragraph = '`-d, --dry-run` is new on `push secrets`, where only';
    const text = `${table}\n\n${paragraph}`;

    it('accepts a text that lists each removed spelling and the new dry run', () => {
      expect(find({ expected, migration: text }).migration).toEqual([]);
    });

    it('fails a spelling that has no line with its command', () => {
      const { migration } = find({
        expected,
        migration: text.replace('`-i, --stdin`', '`-i, --stdins`'),
      });

      expect(migration).toHaveLength(1);
      expect(migration[0]).toContain('`-i, --stdin`');
      expect(migration[0]).toContain('`push raw`');
    });

    it('fails a spelling that is listed for another command', () => {
      const { migration } = find({
        expected,
        migration: text.replace('`push raw`', '`push other`'),
      });

      expect(migration).toHaveLength(1);
    });

    it('fails a dry run that is not announced', () => {
      const { migration } = find({
        expected,
        migration: text.replace('`-d, --dry-run`', '`--dry-run`'),
      });

      expect(migration).toHaveLength(1);
      expect(migration[0]).toContain('does not name `push secrets`');
    });

    it('fails a command that another entry names but the paragraph of the dry run does not', () => {
      // `push secrets` stands in a table row of another entry
      const { migration, checked } = (() => {
        const result = run({
          expected,
          migration: `${table}\n| \`push secrets\` | another entry |\n\n\`-d, --dry-run\` is new on \`delete schedules\`.`,
        });
        return {
          migration: result.problems.migration,
          checked: result.checked,
        };
      })();

      expect(migration).toHaveLength(1);
      expect(migration[0]).toContain('does not name `push secrets`');
      expect(checked.dryRunAdded).toBe(0);
    });

    it('reads the removed spelling with the long name that the option had before, when the row says so', () => {
      const renamed = [
        {
          command: 'frodo config-manager pull saml',
          long: '--config-file',
          short: null,
          was: '-f',
          wasLong: '--file',
        },
      ];
      const row = '| `-f, --file` | `pull saml` | `--config-file` |';

      expect(find({ expected: renamed, migration: row }).migration).toEqual([]);
      // the new long name is not the removed spelling
      const wrong = find({
        expected: renamed,
        migration: row.replace('`-f, --file`', '`-f, --config-file`'),
      }).migration;
      expect(wrong).toHaveLength(1);
      expect(wrong[0]).toContain('`-f, --file`');
      // without wasLong the spelling is the one of the long name, as before
      expect(
        find({
          expected: [{ ...renamed[0], wasLong: undefined }],
          migration: row.replace('`-f, --file`', '`-f, --config-file`'),
        }).migration
      ).toEqual([]);
    });

    it('counts the spellings it found and the dry runs it saw announced', () => {
      expect(run({ expected, migration: text }).checked).toMatchObject({
        spellings: 2,
        dryRunAdded: 1,
      });
    });
  });
});

describe('the options of the configuration commands', () => {
  let groupLeaves;
  let heritageLeaves;
  let problems;
  let checked;
  let migration;

  beforeAll(async () => {
    const { leaves } = await loadCommandTree();
    const toLeaf = (command) => ({
      name: fullName(command),
      description: command.description(),
      options: command.options.map((option) => ({
        short: option.short,
        long: option.long,
        description: option.description,
        aliases: getOptionAliases(option),
      })),
    });
    const data = leaves.map(toLeaf);
    groupLeaves = data.filter((l) => isGroupLeaf(l.name));
    heritageLeaves = data.filter((l) => !isGroupLeaf(l.name));
    migration = fs.readFileSync(migrationPath, 'utf8');
    // Every input of the check is passed here, and the assertions below read
    // what the check looked at (`checked`), not the constants it was given: a
    // call that loses an input makes the check throw or look at less.
    ({ problems, checked } = findLetterProblems({
      groupLeaves,
      heritageLeaves,
      sameMeaning: SAME_MEANING,
      selectorLetters: SELECTOR_LETTERS,
      expected: EXPECTED_SHORT_FORMS,
      heritageOverlaps: HERITAGE_OVERLAPS,
      descriptionLetters: DESCRIPTION_LETTERS,
      migration,
    }));
  }, 120000);

  it('reads the real command tree', () => {
    // a floor, so that a tree that failed to load cannot pass by being empty
    expect(checked.groupLeaves).toBe(groupLeaves.length);
    expect(checked.heritageLeaves).toBe(heritageLeaves.length);
    expect(checked.groupLeaves).toBeGreaterThanOrEqual(100);
    expect(checked.heritageLeaves).toBeGreaterThanOrEqual(200);
    expect(
      groupLeaves.filter((l) =>
        l.name.startsWith('frodo config-manager promote ')
      ).length
    ).toBeGreaterThanOrEqual(5);
  });

  it('gives a letter one meaning inside the group', () => {
    expect(problems.letters).toEqual([]);
  });

  it('keeps no letter that two long names share: -i and -n are the selectors of the group (below), and -f is gone with C5', () => {
    expect(SAME_MEANING).toEqual([]);
    expect(checked.sameMeaning).toBe(0);
    expect(
      problems.entries.filter((e) => e.startsWith('SAME_MEANING'))
    ).toEqual([]);
  });

  it('joins the long names of -i and -n as the selectors, each letter with a reason and no end', () => {
    expect(SELECTOR_LETTERS.map((e) => e.letter)).toEqual(['-i', '-n']);
    expect(SELECTOR_LETTERS.every((e) => !('until' in e))).toBe(true);
    // both letters have more than one long name in the group, and the pattern joins them
    expect(checked.selectorLetters).toBe(2);
    expect(
      problems.entries.filter((e) => e.startsWith('SELECTOR_LETTERS'))
    ).toEqual([]);
  });

  it('joins only the names of a selector: --<type>-id for -i and --<type>-name for -n, and no other long name', () => {
    const pattern = (letter) =>
      SELECTOR_LETTERS.find((entry) => entry.letter === letter).pattern;
    const joins = (letter, longs) =>
      longs.map((long) => [long, pattern(letter).test(long)]);

    // a pattern that accepted any long name would join `-i, --iterations` to
    // `-i, --journey-id` and the check of the real tree would stay green
    expect(
      joins('-i', [
        '--id',
        '--report-id',
        '--journey-id',
        '--managed-object-id',
        '--org-privileges-id',
      ]).filter(([, joined]) => !joined)
    ).toEqual([]);
    expect(
      joins('-i', [
        '--iterations',
        '--identity',
        '--idle',
        '--ids',
        '--journey-ids',
        '--id-prefix',
        '--Id',
        '--journey_id',
        '--name',
      ]).filter(([, joined]) => joined)
    ).toEqual([]);
    expect(
      joins('-n', [
        '--name',
        '--script-name',
        '--app-name',
        '--workflow-name',
      ]).filter(([, joined]) => !joined)
    ).toEqual([]);
    expect(
      joins('-n', [
        '--names',
        '--name-prefix',
        '--username',
        '--filename',
        '--include-immutable',
        '--Name',
        '--journey-id',
      ]).filter(([, joined]) => joined)
    ).toEqual([]);
  });

  it('declares the short forms that the record decided', () => {
    // 38 different rows, and every one of them is what the tree declares
    expect(checked.rows).toBe(38);
    expect(checked.rowsMatched).toBe(38);
    expect(problems.shortForms).toEqual([]);
  });

  it('gives --dry-run the short form -d on every command of the group that has one', () => {
    const withDryRun = groupLeaves.filter((l) =>
      l.options.some((o) => o.long === '--dry-run')
    );

    expect(withDryRun.length).toBeGreaterThanOrEqual(18);
    expect(checked.dryRunLeaves).toBe(withDryRun.length);
    expect(problems.dryRun).toEqual([]);
  });

  it('does not let a heritage command take a letter of the group without a reason', () => {
    // every name of every entry was met on a heritage command
    expect(checked.heritageOverlaps).toBe(
      HERITAGE_OVERLAPS.flatMap((entry) => entry.longs).length
    );
    expect(checked.heritageOverlaps).toBeGreaterThanOrEqual(30);
    expect(problems.heritage).toEqual([]);
    expect(
      problems.entries.filter((e) => e.startsWith('HERITAGE_OVERLAPS'))
    ).toEqual([]);
  });

  it('takes the three heritage definitions down to a long form only', () => {
    const noShort = (name, long) =>
      heritageLeaves
        .find((l) => l.name === name)
        .options.find((o) => o.long === long).short;

    expect(
      noShort('frodo iga workflow delete', '--draft-only')
    ).toBeUndefined();
    expect(noShort('frodo config import', '--clean')).toBeUndefined();
    expect(noShort('frodo service import', '--clean')).toBeUndefined();
  });

  it('names only letters in a description that the command declares', () => {
    // the group, and the three heritage commands that a row of the record names
    expect(checked.descriptionLeaves).toBe(groupLeaves.length + 3);
    expect(checked.descriptionLetters).toBe(1);
    expect(problems.descriptions).toEqual([]);
    expect(
      problems.entries.filter((e) => e.startsWith('DESCRIPTION_LETTERS'))
    ).toEqual([]);
  });

  it('lists every removed spelling in MIGRATION.md', () => {
    // 32 removed spellings found on a line with their command, and the 6 dry
    // runs that got -d named in the paragraph that announces them
    expect(checked.spellings).toBe(32);
    expect(checked.dryRunAdded).toBe(6);
    expect(problems.migration).toEqual([]);
  });

  it('has no problem that the checks above did not name', () => {
    expect(Object.values(problems).flat()).toEqual([]);
  });
});
