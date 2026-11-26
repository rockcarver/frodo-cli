import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { getOneOfGroups } from '../../src/cli/ResolveInteractiveInputs.ts';
import {
  fullName,
  loadLeafCommands,
  renderFullHelp,
} from '../utils/CommandExamples.js';

/**
 * The config file of the `config-manager pull` commands is `--config-file <file>`, with no short
 * form and no other spelling, on the eleven commands that take one:
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md
 * (options of the configuration commands). Six of them took `-f, --file` (`pull raw`: `-f,
 * --config-file`) and gave it up at once, with no alias; the other three had `--config-file`
 * already, and `pull oauth-clients` and `pull agents`, which split `pull oauth2-agents`, never had `-f`. `pull service-objects` cannot guess what to pull, so the file is mandatory there;
 * `pull raw` cannot either, so it needs the file or `--path`, a requirement that is declared
 * (`requireOneOf`); on the other nine it is optional, and on `pull saml`, `pull authz-policies`
 * and the three agent commands (`pull oauth2-agents`, `pull oauth-clients`, `pull agents`) an empty value is refused while the command line is parsed (it would
 * read as "no file" and pull everything).
 *
 * This reads the real command tree and the real MIGRATION.md, without a build.
 */

const migrationPath = fileURLToPath(
  new URL('../../MIGRATION.md', import.meta.url)
);

/** The eleven pull commands that take a config file, and whether the file is mandatory (`pull raw` needs it or --path). */
const COMMANDS = [
  ['agents', false],
  ['authz-policies', false],
  ['csp', false],
  ['oauth-cimd-profiles', false],
  ['oauth-clients', false],
  ['oauth-issuers', false],
  ['oauth-software-publishers', false],
  ['oauth2-agents', false],
  ['raw', false],
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
/** The five where no file means everything, so an empty file name must not mean no file. */
const PULL_EVERYTHING = [
  'agents',
  'authz-policies',
  'oauth-clients',
  'oauth2-agents',
  'saml',
];

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
  test('finds the eleven commands', () => {
    for (const [verb] of COMMANDS) expect(leafOf(verb)).toBeDefined();
    expect(COMMANDS).toHaveLength(11);
  });

  test.each(COMMANDS)(
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

  test('the file is mandatory on service-objects only, and pull raw needs it or --path', () => {
    expect(
      COMMANDS.filter(([verb]) => configFileOf(verb).mandatory).map(
        ([verb]) => verb
      )
    ).toEqual(['service-objects']);
    expect(
      COMMANDS.filter(([, mandatory]) => mandatory).map(([verb]) => verb)
    ).toEqual(['service-objects']);
    // declared as a requirement, so that --path alone is enough and neither is refused before login
    expect(getOneOfGroups(leafOf('raw'))).toEqual([
      { options: ['configFile', 'path'], purpose: 'what to pull', all: false },
    ]);
    expect(
      leafOf('raw').options.find((o) => o.long === '--path').mandatory
    ).toBe(false);
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
    for (const [verb] of COMMANDS.filter(
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
  /** The selectors of the commands that pull everything without a file, by attribute. */
  const SELECTORS = {
    saml: [
      ['entityId', '-i, --entity-id <id>'],
      ['cotId', '--cot-id <id>'],
    ],
    'authz-policies': [
      ['policyId', '-i, --policy-id <id>'],
      ['setId', '--set-id <id>'],
    ],
    'oauth2-agents': [['agentId', '-i, --agent-id <id>']],
    'oauth-clients': [['clientId', '-i, --client-id <id>']],
    agents: [['agentId', '-i, --agent-id <id>']],
  };
  const optionOf = (verb, attribute) =>
    leafOf(verb).options.find((o) => o.attributeName() === attribute);

  test.each(Object.entries(SELECTORS))(
    'pull %s: the selectors and --config-file cannot be combined, and each side of every pair says so',
    (verb, selectors) => {
      const file = optionOf(verb, 'configFile');
      const attributes = selectors.map(([attribute]) => attribute);

      // the file refuses every selector, and every selector refuses the file and the other selector
      expect([...file.conflictsWith].sort()).toEqual([...attributes].sort());
      for (const [attribute, flags] of selectors) {
        const option = optionOf(verb, attribute);
        expect(option.flags).toBe(flags);
        expect(option.conflictsWith).toContain('configFile');
        for (const other of attributes.filter((a) => a !== attribute)) {
          expect(option.conflictsWith).toContain(other);
        }
        // a selector is a filter: the command works without it
        expect(option.mandatory).toBe(false);
        // the description says what it cannot be combined with
        expect(option.description).toContain('Cannot be used with');
        expect(option.description).toContain('--config-file');
      }
      expect(file.description).toContain('Cannot be used with');
    }
  );

  test('the selectors have no short form but -i, and no alias: the id is the name', () => {
    const shorts = Object.entries(SELECTORS).flatMap(([verb, selectors]) =>
      selectors.map(([attribute]) => [
        `${verb} ${attribute}`,
        optionOf(verb, attribute).short ?? null,
      ])
    );

    expect(Object.fromEntries(shorts)).toEqual({
      'saml entityId': '-i',
      'saml cotId': null,
      'authz-policies policyId': '-i',
      'authz-policies setId': null,
      'oauth2-agents agentId': '-i',
      'oauth-clients clientId': '-i',
      'agents agentId': '-i',
    });
    // pull csp and pull raw take no selector
    for (const verb of ['csp', 'raw']) {
      expect(leafOf(verb).options.filter((o) => o.short === '-i')).toEqual([]);
    }
  });

  test('the selectors refuse an empty value, as the file does', () => {
    for (const [verb, selectors] of Object.entries(SELECTORS)) {
      for (const [attribute] of selectors) {
        expect(() => optionOf(verb, attribute).parseArg('', undefined)).toThrow(
          'An empty value never selects all objects'
        );
      }
    }
  });
});
