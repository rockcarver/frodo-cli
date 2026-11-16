import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

/**
 * The generic `config-manager pull|push oauth2-agents` say, in their full help
 * (-hhh), which agent types they handle and which two they leave to a kind of
 * their own (frodo-cli#1249, frodo-cli#1259). A user who finds an entry or a
 * folder skipped, or who wonders why a type is missing, reads it here.
 */
/**
 * Every agent type that config-manager keeps on the generic kind (the dispositions
 * of frodo-cli#1254). The one list of names of this test: the help of both commands
 * must name each of them in its sentence that lists the types.
 */
const ACCEPTED = [
  'IdentityGatewayAgent',
  'J2EEAgent',
  'WebAgent',
  '2.2_Agent',
  'SharedAgent',
  'OAuth2Client',
  'RemoteConsentAgent',
  'SoftwarePublisher',
  'SoapSTSAgent',
  'OAuth2Thing',
];

/** Listed in the help although the example config has no entry for them: they exist only on some deployments. */
const NOT_IN_EXAMPLE = ['SoapSTSAgent', 'OAuth2Thing'];
const HANDLED_IN_EXAMPLE = ACCEPTED.filter(
  (agentType) => !NOT_IN_EXAMPLE.includes(agentType)
);

/** The two types that have a kind of their own: named as such and never in the sentence that lists the types. */
const DEDICATED = ['CIMDProfile', 'TrustedJwtIssuer'];
const DEDICATED_SENTENCE_START = `The agent types ${DEDICATED.join(' and ')} have a kind of their own`;

/** What starts the sentence of each help that lists the types (the whitespace of the help is collapsed). */
const LIST_STARTS = {
  pull: 'Agent types: ',
  push: 'The folders of these agent types are pushed: ',
};

describe.each(['pull', 'push'])(
  "'config-manager %s oauth2-agents' full help",
  (verb) => {
    let text;
    // the sentence that lists the types: from its first words to the sentence about the two
    // types that have a kind of their own (a type named only in an example or in another
    // sentence of the help does not count)
    let list;
    beforeAll(async () => {
      const { stdout } = await exec(
        `frodo config-manager ${verb} oauth2-agents -hhh`
      );
      text = stdout.replace(/\s+/g, ' ');
      const start = text.indexOf(LIST_STARTS[verb]);
      const end = text.indexOf(DEDICATED_SENTENCE_START, start);
      list = start >= 0 && end > start ? text.slice(start, end) : undefined;
    });

    test('has the sentence that lists the agent types, followed by the sentence about the types that have a kind of their own', () => {
      expect(list).toBeDefined();
    });

    test.each(ACCEPTED)(
      'the sentence that lists the agent types names %s',
      (agentType) => {
        expect(list).toContain(agentType);
      }
    );

    test('the sentence that lists the agent types names no type that has a kind of its own', () => {
      expect(list).toBeDefined();
      for (const agentType of DEDICATED) {
        expect(list).not.toContain(agentType);
      }
    });

    test('has a Usage Examples block with the command, a config directory and --allow-failures', () => {
      expect(text).toContain('Usage Examples:');
      expect(text).toContain(`$ frodo config-manager ${verb} oauth2-agents`);
      expect(text).toContain('-D ./config');
      expect(text).toContain('--allow-failures');
    });

    test('says that an entry or file of a type the deployment cannot serve is a request that fails, and how the CIMD kind differs', () => {
      expect(text).toContain(
        verb === 'pull'
          ? 'An entry you write is a request'
          : 'A file you push is a request'
      );
      expect(text).toContain('unless --allow-failures is given');
      expect(text).toContain('The kind for CIMD profiles is different');
    });

    test('names the two types that have a kind of their own and the command of each', () => {
      expect(text).toContain(
        `${DEDICATED_SENTENCE_START}: ` +
          `"frodo config-manager ${verb} oauth-cimd-profiles" and "frodo config-manager ${verb} oauth-issuers".`
      );
      expect(text).toContain('skipped here with a warning');
    });
  }
);

test("'config-manager pull oauth2-agents' full help lists an entry for every type it handles in the example", async () => {
  const { stdout } = await exec('frodo config-manager pull oauth2-agents -hhh');
  for (const agentType of HANDLED_IN_EXAMPLE) {
    expect(stdout).toContain(`"${agentType}": [`);
  }
  // the two types with a kind of their own are not in the example config
  for (const agentType of DEDICATED) {
    expect(stdout).not.toContain(`"${agentType}": [`);
  }
});
