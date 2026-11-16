import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

/**
 * The generic `config-manager pull|push oauth2-agents` say, in their full help
 * (-hhh), which agent types they handle and which three they leave to a kind of
 * their own (frodo-cli#1249, frodo-cli#1259, frodo-cli#1343). A user who finds an entry or a
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
];

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

    test.each(HANDLED)('names the agent type %s', (agentType) => {
      expect(text).toContain(agentType);
    });

    test('names the three types that have a kind of their own and the command of each', () => {
      expect(text).toContain(
        'The agent types CIMDProfile, TrustedJwtIssuer and SoftwarePublisher have a kind of their own: ' +
          `"frodo config-manager ${verb} oauth-cimd-profiles", "frodo config-manager ${verb} oauth-issuers" and "frodo config-manager ${verb} oauth-software-publishers".`
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
  // the three types with a kind of their own are not in the example config
  expect(stdout).not.toContain('"CIMDProfile": [');
  expect(stdout).not.toContain('"TrustedJwtIssuer": [');
  expect(stdout).not.toContain('"SoftwarePublisher": [');
});
