import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

/**
 * `config-manager pull|push oauth-clients` and `pull|push agents` replace `oauth2-agents`: the
 * OAuth2 clients have a pair of commands and the other agent types have one. Their full help
 * (-hhh) says which agent types each pair handles and where the others go, so that a user who
 * finds an entry or a folder skipped, or who wonders why a type is missing, reads it here. The
 * deprecated `oauth2-agents` help is in config-manager-oauth2-agents-help.test.js.
 */

/** The eight agent types of `agents`. */
const EIGHT = [
  'IdentityGatewayAgent',
  'J2EEAgent',
  'WebAgent',
  '2.2_Agent',
  'SharedAgent',
  'RemoteConsentAgent',
  'SoapSTSAgent',
  'OAuth2Thing',
];
/** Listed in the help although the example config has no entry for them: they exist only on some deployments. */
const NOT_IN_EXAMPLE = ['SoapSTSAgent', 'OAuth2Thing'];
const DEDICATED = ['CIMDProfile', 'TrustedJwtIssuer', 'SoftwarePublisher'];

/** The help of a command, whitespace collapsed, and as it is printed. */
async function helpOf(verb, word) {
  const { stdout } = await exec(`frodo config-manager ${verb} ${word} -hhh`);
  return { text: stdout.replace(/\s+/g, ' '), raw: stdout };
}

/** The sentence that lists the agent types of `agents`, up to the sentence about the OAuth2 clients. */
const listOf = (text, start, end) => {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from);
  return from >= 0 && to > from ? text.slice(from, to) : undefined;
};

describe.each(['pull', 'push'])(
  "'config-manager %s agents' full help",
  (verb) => {
    let text;
    let raw;
    beforeAll(async () => {
      ({ text, raw } = await helpOf(verb, 'agents'));
    });

    const LIST_START =
      verb === 'pull'
        ? 'Agent types: '
        : 'The folders of these agent types are pushed: ';
    const OAUTH2_CLIENTS_SENTENCE =
      verb === 'pull'
        ? 'The OAuth2 clients are pulled by'
        : 'The folder of the OAuth2 clients, OAuth2Client, is not read here';

    test('lists the eight agent types in one sentence, and not the OAuth2 client', () => {
      const list = listOf(text, LIST_START, OAUTH2_CLIENTS_SENTENCE);
      expect(list).toBeDefined();
      for (const agentType of EIGHT) expect(list).toContain(agentType);
      expect(list).not.toContain('OAuth2Client');
      for (const agentType of DEDICATED) expect(list).not.toContain(agentType);
    });

    test('names the command that handles the OAuth2 clients', () => {
      expect(text).toContain(`"frodo config-manager ${verb} oauth-clients"`);
    });

    test('names the three agent types that have a command of their own and the command of each', () => {
      expect(text).toContain(
        `The agent types CIMDProfile, TrustedJwtIssuer and SoftwarePublisher have a command of their own: ` +
          `"frodo config-manager ${verb} oauth-cimd-profiles", "frodo config-manager ${verb} oauth-issuers" and "frodo config-manager ${verb} oauth-software-publishers".`
      );
      expect(text).toContain('skipped here with a warning');
    });

    test('has a Usage Examples block with the command, a config directory and --allow-failures', () => {
      expect(text).toContain('Usage Examples:');
      expect(text).toContain(`$ frodo config-manager ${verb} agents`);
      expect(text).toContain('-D ./config');
      // one example line, so that the option in a sentence below does not count
      expect(raw).toMatch(
        new RegExp(
          `^\\s*\\$ frodo config-manager ${verb} agents .*--allow-failures`,
          'm'
        )
      );
      if (verb === 'pull') {
        expect(text).toContain(
          '$ frodo config-manager pull agents -i zion-gateway matrix /alpha'
        );
      }
    });

    test('says that an entry or file of a type the deployment cannot serve is a request that fails', () => {
      expect(text).toContain(
        verb === 'pull'
          ? 'An entry you write is a request'
          : 'A file you push is a request'
      );
      expect(text).toContain('unless --allow-failures is given');
    });

    test('says nothing about a kind, which the commands of the split do not use as a word', () => {
      expect(raw).not.toMatch(/\bkinds?\b/i);
    });

    if (verb === 'pull') {
      test('shows an example config with an entry for every type that exists on every deployment, and none for the OAuth2 client or the types with a command of their own', () => {
        for (const agentType of EIGHT.filter(
          (t) => !NOT_IN_EXAMPLE.includes(t)
        )) {
          expect(raw).toContain(`"${agentType}": [`);
        }
        for (const agentType of ['OAuth2Client', ...DEDICATED]) {
          expect(raw).not.toContain(`"${agentType}": [`);
        }
      });

      test('says that an OAuth2Client entry in the config file is skipped with a warning, and that the same file can serve every command', () => {
        expect(text).toContain(
          'An OAuth2Client entry in the config file is skipped here with a warning'
        );
        expect(text).toContain('so that one file can serve them all');
      });
    }
  }
);

describe.each(['pull', 'push'])(
  "'config-manager %s oauth-clients' full help",
  (verb) => {
    let text;
    let raw;
    beforeAll(async () => {
      ({ text, raw } = await helpOf(verb, 'oauth-clients'));
    });

    test('names the folder of the OAuth2 clients and the command that handles the other agent types', () => {
      expect(text).toContain(
        'realms/<realm>/realm-config/agents/OAuth2Client/'
      );
      expect(text).toContain(`"${verb} agents"`);
    });

    test('names none of the eight types of agents as a type it handles', () => {
      for (const agentType of EIGHT) {
        expect(raw).not.toContain(`"${agentType}": [`);
      }
    });

    test('has a Usage Examples block with the command, a config directory and --allow-failures', () => {
      expect(text).toContain('Usage Examples:');
      expect(text).toContain(`$ frodo config-manager ${verb} oauth-clients`);
      expect(text).toContain('-D ./config');
      // one example line, so that the option in a sentence below does not count
      expect(raw).toMatch(
        new RegExp(
          `^\\s*\\$ frodo config-manager ${verb} oauth-clients .*--allow-failures`,
          'm'
        )
      );
      if (verb === 'pull') {
        expect(text).toContain(
          '$ frodo config-manager pull oauth-clients -i zion-portal-client matrix /alpha'
        );
      }
    });

    test('says what it leaves out in a tree that uses one folder per application', () => {
      expect(text).toContain(
        `In a tree that uses one folder per application (see frodo config-manager ${verb} applications), OAuth2 clients that an application owns are not ${verb === 'pull' ? 'pulled' : 'pushed'} here`
      );
    });

    test('says nothing about a kind, which the commands of the split do not use as a word', () => {
      expect(raw).not.toMatch(/\bkinds?\b/i);
    });

    if (verb === 'pull') {
      test('shows an example config with an OAuth2Client entry and no agent entry', () => {
        expect(raw).toContain('"OAuth2Client": [');
        for (const agentType of EIGHT) {
          expect(raw).not.toContain(`"${agentType}": [`);
        }
      });

      test('takes -i, --client-id and says it needs a single realm', () => {
        expect(text).toContain('-i, --client-id <id>');
        expect(text).toContain('Needs a single realm');
      });
    }
  }
);

describe.each(['pull', 'push'])(
  "'config-manager %s oauth2-agents' full help names its replacements",
  (verb) => {
    test('says in its description which two commands do what it does together', async () => {
      const { text } = await helpOf(verb, 'oauth2-agents');
      expect(text).toContain(
        `Deprecated: ${verb === 'pull' ? 'pulls' : 'pushes'} what "${verb} oauth-clients" and "${verb} agents" ${verb} together.`
      );
    });
  }
);
