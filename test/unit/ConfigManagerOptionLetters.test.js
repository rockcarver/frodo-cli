import fs from 'fs';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from '@jest/globals';
import { fullName, loadCommandTree } from '../utils/CommandExamples.js';
import {
  findLetterProblems,
  isGroupLeaf,
  lettersOf,
} from '../utils/OptionLetters.js';
import {
  DESCRIPTION_LETTERS,
  EXPECTED_SHORT_FORMS,
  HERITAGE_OVERLAPS,
  SAME_MEANING,
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

/** A leaf with options given as `[short, long, description]`; `null` for no short form. */
function leaf(name, options, description = '') {
  return {
    name,
    description,
    options: options.map(([short, long, text = '']) => ({
      short: short ?? undefined,
      long,
      description: text,
    })),
  };
}

const NONE = {
  groupLeaves: [],
  heritageLeaves: [],
  sameMeaning: [],
  expected: [],
  heritageOverlaps: [],
  descriptionLetters: [],
};

const find = (input) => findLetterProblems({ ...NONE, ...input });
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
    const text = [
      '| `-i, --stdin` | `push raw` | `--stdin` |',
      '| `-C, --clean` | `service import` | `--clean` |',
      '`-d, --dry-run` is new on `push secrets`, where only',
    ].join('\n');

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
      expect(migration[0]).toContain(
        '`-d, --dry-run` is new on `push secrets`'
      );
    });

    it('is not read when the text is not given', () => {
      expect(find({ expected }).migration).toEqual([]);
    });
  });
});

describe('the options of the configuration commands', () => {
  let groupLeaves;
  let heritageLeaves;
  let problems;
  let migration;

  beforeAll(async () => {
    const { leaves } = await loadCommandTree();
    const toLeaf = (command) => ({
      name: fullName(command),
      description: command.description(),
      options: command.options,
    });
    const data = leaves.map(toLeaf);
    groupLeaves = data.filter((l) => isGroupLeaf(l.name));
    heritageLeaves = data.filter((l) => !isGroupLeaf(l.name));
    migration = fs.readFileSync(migrationPath, 'utf8');
    problems = findLetterProblems({
      groupLeaves,
      heritageLeaves,
      sameMeaning: SAME_MEANING,
      expected: EXPECTED_SHORT_FORMS,
      heritageOverlaps: HERITAGE_OVERLAPS,
      descriptionLetters: DESCRIPTION_LETTERS,
      migration,
    });
  }, 120000);

  it('reads the real command tree', () => {
    // a floor, so that a tree that failed to load cannot pass by being empty
    expect(groupLeaves.length).toBeGreaterThanOrEqual(100);
    expect(heritageLeaves.length).toBeGreaterThanOrEqual(200);
    expect(
      groupLeaves.filter((l) =>
        l.name.startsWith('frodo config-manager promote ')
      ).length
    ).toBeGreaterThanOrEqual(5);
  });

  it('gives a letter one meaning inside the group', () => {
    expect(problems.letters).toEqual([]);
  });

  it('keeps exactly the three letters that two long names share, each with a reason and an end', () => {
    expect(SAME_MEANING.map((e) => e.letter)).toEqual(['-f', '-i', '-n']);
    expect(
      problems.entries.filter((e) => e.startsWith('SAME_MEANING'))
    ).toEqual([]);
  });

  it('declares the short forms that the record decided', () => {
    expect(EXPECTED_SHORT_FORMS).toHaveLength(34);
    expect(problems.shortForms).toEqual([]);
  });

  it('gives --dry-run the short form -d on every command of the group that has one', () => {
    const withDryRun = groupLeaves.filter((l) =>
      l.options.some((o) => o.long === '--dry-run')
    );

    expect(withDryRun.length).toBeGreaterThanOrEqual(18);
    expect(problems.dryRun).toEqual([]);
  });

  it('does not let a heritage command take a letter of the group without a reason', () => {
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
    expect(problems.descriptions).toEqual([]);
    expect(
      problems.entries.filter((e) => e.startsWith('DESCRIPTION_LETTERS'))
    ).toEqual([]);
  });

  it('lists every removed spelling in MIGRATION.md', () => {
    expect(EXPECTED_SHORT_FORMS.filter((row) => row.was)).toHaveLength(28);
    expect(problems.migration).toEqual([]);
  });

  it('has no problem that the checks above did not name', () => {
    expect(Object.values(problems).flat()).toEqual([]);
  });
});
