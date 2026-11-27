import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { loadCommandTree, resolveCommand } from '../utils/CommandExamples.js';

const { FrodoStubCommand } = await import('../../src/cli/FrodoCommand.ts');
const { PULL_OAUTH2_AGENTS_DEPRECATION_MESSAGE } =
  await import('../../src/cli/config-manager/config-manager-pull/config-manager-pull-oauth2-agents.ts');
const { PUSH_OAUTH2_AGENTS_DEPRECATION_MESSAGE } =
  await import('../../src/cli/config-manager/config-manager-push/config-manager-push-oauth2-agents.ts');

/**
 * `config pull oauth2-agents` and `push oauth2-agents` are deprecated: the OAuth2 clients
 * and the other agent types have a pair of commands each (`oauth-clients` and `agents`), and the
 * old command does what the two do together, as it always did. It prints one deprecation notice
 * that names the replacements and says that a future major release removes it, and otherwise
 * behaves as before. The replacements that the notice names must exist, so that a rename of one of
 * them fails here and not for a user who follows the notice.
 */

const VERBS = [
  ['pull', PULL_OAUTH2_AGENTS_DEPRECATION_MESSAGE],
  ['push', PUSH_OAUTH2_AGENTS_DEPRECATION_MESSAGE],
];

let groups;
beforeAll(async () => {
  ({ groups } = await loadCommandTree());
});

afterEach(() => {
  jest.restoreAllMocks();
  process.exitCode = undefined;
});

const leafOf = (...words) => {
  const found = resolveCommand(groups, ['frodo', ...words])?.command;
  return found && found.commands.length === 0 ? found : undefined;
};

describe.each(VERBS)(
  'config %s oauth2-agents is deprecated',
  (verb, message) => {
    it('says in its description that it is deprecated and what it does instead', () => {
      const description = leafOf('config', verb, 'oauth2-agents').description();

      expect(
        description.startsWith(
          `Deprecated: ${verb === 'pull' ? 'pulls' : 'pushes'} what "${verb} oauth-clients" and "${verb} agents" ${verb} together.`
        )
      ).toBe(true);
    });

    it('has a notice that says it will be removed in a future major release and names the two commands that do what it does together', () => {
      expect(message).toContain(
        'This command is deprecated and will be removed in a future major release.'
      );
      expect(message).toContain(
        `It does what "frodo config ${verb} oauth-clients" and "frodo config ${verb} agents" do together; use them instead.`
      );
    });

    it('names only commands that exist', () => {
      const named = [...message.matchAll(/"(frodo [^"]+)"/g)].map((m) => m[1]);

      expect(named).toEqual([
        `frodo config ${verb} oauth-clients`,
        `frodo config ${verb} agents`,
      ]);
      for (const line of named) {
        expect(leafOf(...line.split(' ').slice(1))).toBeDefined();
      }
    });

    it('prints the notice once when it runs, with the stability label of a deprecated command', async () => {
      const printed = [];
      jest
        .spyOn(console, 'error')
        .mockImplementation((text) => printed.push(String(text)));
      jest
        .spyOn(console, 'log')
        .mockImplementation((text) => printed.push(String(text)));
      // a one-flag stand-in for a run: `--config-file ''` is refused while the command line is parsed
      // (an empty value never selects everything), which is before the notice; so run the action of
      // the real command with a host that cannot be reached and no credentials instead
      const root = new FrodoStubCommand('frodo');
      const group = groups.find((g) => g.name() === 'config');
      root.addCommand(group);
      const saved = {
        host: process.env.FRODO_HOST,
        home: process.env.HOME,
      };
      process.env.FRODO_HOST = 'http://127.0.0.1:1/am';
      try {
        await root.parseAsync([
          'node',
          'frodo',
          'config',
          verb,
          'oauth2-agents',
          '--no-prompt',
        ]);
      } finally {
        if (saved.host === undefined) delete process.env.FRODO_HOST;
        else process.env.FRODO_HOST = saved.host;
      }

      const notices = printed.filter((line) =>
        line.includes(
          `Deprecated feature in use: 'frodo config ${verb} oauth2-agents'.`
        )
      );
      expect(notices).toHaveLength(1);
      expect(notices[0]).toContain(message);
    });
  }
);
