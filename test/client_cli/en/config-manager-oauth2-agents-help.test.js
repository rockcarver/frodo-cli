import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

/**
 * The generic `config-manager pull|push oauth2-agents` say, in their full help
 * (-hhh), which agent types they handle and which two they leave to a kind of
 * their own (frodo-cli#1249, frodo-cli#1259). A user who finds an entry or a
 * folder skipped, or who wonders why a type is missing, reads it here.
 */
const HANDLED = [
  'IdentityGatewayAgent',
  'J2EEAgent',
  'WebAgent',
  '2.2_Agent',
  'SharedAgent',
  'OAuth2Client',
  'RemoteConsentAgent',
  'SoftwarePublisher',
];

/** Named in the help although the example config has no entry for them: they exist only on some deployments. */
const NAMED_ONLY = ['SoapSTSAgent', 'OAuth2Thing'];

describe.each(['pull', 'push'])(
  "'config-manager %s oauth2-agents' full help",
  (verb) => {
    let text;
    beforeAll(async () => {
      const { stdout } = await exec(
        `frodo config-manager ${verb} oauth2-agents -hhh`
      );
      text = stdout.replace(/\s+/g, ' ');
    });

    test.each([...HANDLED, ...NAMED_ONLY])(
      'names the agent type %s',
      (agentType) => {
        expect(text).toContain(agentType);
      }
    );

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
        'The agent types CIMDProfile and TrustedJwtIssuer have a kind of their own: ' +
          `"frodo config-manager ${verb} oauth-cimd-profiles" and "frodo config-manager ${verb} oauth-issuers".`
      );
      expect(text).toContain('skipped here with a warning');
    });
  }
);

test("'config-manager pull oauth2-agents' full help lists an entry for every type it handles in the example", async () => {
  const { stdout } = await exec('frodo config-manager pull oauth2-agents -hhh');
  for (const agentType of HANDLED) {
    expect(stdout).toContain(`"${agentType}": [`);
  }
  // the two types with a kind of their own are not in the example config
  expect(stdout).not.toContain('"CIMDProfile": [');
  expect(stdout).not.toContain('"TrustedJwtIssuer": [');
});
