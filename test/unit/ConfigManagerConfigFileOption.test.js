import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import {
  fullName,
  loadLeafCommands,
  renderFullHelp,
} from '../utils/CommandExamples.js';

/**
 * The config file of the `config-manager pull` commands is `--config-file <file>`, with no short
 * form and no other spelling, on the nine commands that take one:
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md
 * (options of the configuration commands). Six of them took `-f, --file` (`pull raw`: `-f,
 * --config-file`) and gave it up at once, with no alias; the other three had `--config-file`
 * already. `pull service-objects` and `pull raw` cannot guess what to pull, so the file is
 * mandatory there; on the other seven it is optional, and on `pull saml`, `pull authz-policies`
 * and `pull oauth2-agents` an empty value is refused while the command line is parsed (it would
 * read as "no file" and pull everything).
 *
 * This reads the real command tree and the real MIGRATION.md, without a build.
 */

const migrationPath = fileURLToPath(
  new URL('../../MIGRATION.md', import.meta.url)
);

/** The nine pull commands that take a config file, and whether the file is mandatory. */
const NINE = [
  ['authz-policies', false],
  ['csp', false],
  ['oauth-cimd-profiles', false],
  ['oauth-issuers', false],
  ['oauth-software-publishers', false],
  ['oauth2-agents', false],
  ['raw', true],
  ['saml', false],
  ['service-objects', true],
];
/** The six that took `-f` and gave it up, with the spelling that was removed. */
const SIX = [
  ['authz-policies', '-f, --file'],
  ['csp', '-f, --file'],
  ['oauth2-agents', '-f, --file'],
  ['raw', '-f, --config-file'],
  ['saml', '-f, --file'],
  ['service-objects', '-f, --file'],
];
/** The three where no file means everything, so an empty file name must not mean no file. */
const PULL_EVERYTHING = ['authz-policies', 'oauth2-agents', 'saml'];

const originalArgv = process.argv;
let leaves = [];
let helpOf = new Map();
const leafOf = (verb) =>
  leaves.find((leaf) => fullName(leaf) === `frodo config-manager pull ${verb}`);
const configFileOf = (verb) =>
  leafOf(verb).options.find((option) => option.long === '--config-file');

beforeAll(async () => {
  // the usage examples are only rendered for -hhh
  process.argv = [...originalArgv, '--help-all'];
  leaves = await loadLeafCommands();
  helpOf = new Map(
    leaves
      .filter((leaf) => fullName(leaf).startsWith('frodo config-manager '))
      .map((leaf) => [fullName(leaf), renderFullHelp(leaf)])
  );
}, 120000);

afterAll(() => {
  process.argv = originalArgv;
});

describe('the config file of the pull commands', () => {
  test('finds the nine commands', () => {
    for (const [verb] of NINE) expect(leafOf(verb)).toBeDefined();
    expect(NINE).toHaveLength(9);
  });

  test.each(NINE)(
    'pull %s takes --config-file <file> and nothing else for it: no short form, no --file',
    (verb) => {
      const leaf = leafOf(verb);
      const option = configFileOf(verb);

      expect(option).toBeDefined();
      expect(option.flags).toBe('--config-file <file>');
      expect(option.short).toBeUndefined();
      expect(leaf.options.filter((o) => o.long === '--file')).toEqual([]);
      expect(
        leaf.options.filter((o) => o.long === '--config-file')
      ).toHaveLength(1);
    }
  );

  test('no command of the group has -f any more', () => {
    const groupLeaves = leaves.filter((leaf) =>
      fullName(leaf).startsWith('frodo config-manager ')
    );
    expect(groupLeaves.length).toBeGreaterThanOrEqual(100);
    expect(
      groupLeaves.flatMap((leaf) =>
        leaf.options
          .filter((option) => option.short === '-f')
          .map((option) => `${fullName(leaf)} ${option.flags}`)
      )
    ).toEqual([]);
  });

  test('the file is mandatory exactly on service-objects and raw', () => {
    expect(
      NINE.filter(([verb]) => configFileOf(verb).mandatory).map(
        ([verb]) => verb
      )
    ).toEqual(['raw', 'service-objects']);
    expect(
      NINE.filter(([, mandatory]) => mandatory).map(([verb]) => verb)
    ).toEqual(['raw', 'service-objects']);
  });

  test.each(PULL_EVERYTHING)(
    'pull %s refuses an empty value while the command line is parsed, and takes any other value as it is',
    (verb) => {
      const option = configFileOf(verb);

      expect(() => option.parseArg('', undefined)).toThrow(
        'An empty value never selects all objects'
      );
      expect(option.parseArg('saml.json', undefined)).toBe('saml.json');
      expect(option.parseArg('a b/c.json', undefined)).toBe('a b/c.json');
    }
  );

  test('the other commands keep the value of the file as it is typed', () => {
    for (const [verb] of NINE.filter(
      ([name]) => !PULL_EVERYTHING.includes(name)
    )) {
      const option = configFileOf(verb);
      // commander's own default is to keep the value; a parser here would be a change of behaviour
      expect(option.parseArg).toBeUndefined();
    }
  });

  test.each(PULL_EVERYTHING)(
    'pull %s says in its help that the realm is not used with a file, and that no file pulls everything',
    (verb) => {
      const text = configFileOf(verb).description;

      expect(text).toContain('Without it');
      expect(text).toContain('the realm argument is not used');
    }
  );

  test.each(SIX)(
    'MIGRATION.md has a table row for the spelling that pull %s gave up: %s',
    (verb, spelling) => {
      const rows = fs
        .readFileSync(migrationPath, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('|') && line.endsWith('|'))
        .map((line) =>
          line
            .slice(1, -1)
            .split('|')
            .map((cell) => cell.trim())
        );

      expect(
        rows.filter(
          (cells) =>
            cells.length === 3 &&
            cells[0] === `\`${spelling}\`` &&
            cells[1] === `\`pull ${verb}\`` &&
            cells[2] === '`--config-file`'
        )
      ).toHaveLength(1);
    }
  );

  test.each(SIX)(
    'the help of pull %s names no -f and no --file, and its examples type --config-file',
    (verb) => {
      const text = helpOf.get(`frodo config-manager pull ${verb}`);

      expect(text).not.toMatch(/(^|\s)-f[\s,]/);
      expect(text).not.toMatch(/--file\b/);
      expect(text).toContain('--config-file');
    }
  );
});
