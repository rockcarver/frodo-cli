import { configManagerImportAgents } from '../../../configManagerOps/FrConfigOauth2AgentOps';
import * as s from '../../../help/SampleData';
import { ownedObjectsPushHelp } from '../../../ops/ApplicationOwnedObjectsHelp';
import { getTokens } from '../../../ops/AuthenticateOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { PLACEHOLDER_VALUES_RULE } from '../../../utils/PlaceholderValues';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager push oauth2-agents');

  program
    .description('Import Oauth2 agents.')
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Push every agent file of the tree in the working directory (realms/<realm>/realm-config/agents/<type>/<id>.json) to the tenant:\n` +
        c.command(`  $ frodo config-manager push oauth2-agents ${s.connId}\n`) +
        `  Push from a config directory other than the working directory:\n` +
        c.command(
          `  $ frodo config-manager push oauth2-agents -D ./config ${s.connId}\n`
        ) +
        `  Succeed although some agents could not be pushed (the failures are still summarised):\n` +
        c.command(
          `  $ frodo config-manager push oauth2-agents --allow-failures ${s.connId}\n`
        )
    )
    .addHelpText(
      'after',
      '\nThe folders of these agent types are pushed: IdentityGatewayAgent, J2EEAgent, WebAgent, 2.2_Agent, SharedAgent, OAuth2Client, RemoteConsentAgent, SoapSTSAgent (it exists only in classic deployments) and OAuth2Thing (it exists only where the deployment has enabled it), as realms/<realm>/realm-config/agents/<type>/<id>.json.\n' +
        'The agent types CIMDProfile, TrustedJwtIssuer and SoftwarePublisher have a kind of their own: "frodo config-manager push oauth-cimd-profiles", "frodo config-manager push oauth-issuers" and "frodo config-manager push oauth-software-publishers". The folders of those types are skipped here with a warning; no file in them is read or changed.\n' +
        `Each \${NAME} in a file ${PLACEHOLDER_VALUES_RULE} The agents with a password (IdentityGatewayAgent, J2EEAgent, WebAgent, 2.2_Agent, SharedAgent and the OAuth2 client secret) are pulled with an override that holds such a placeholder.\n` +
        'A file you push is a request: if the deployment cannot serve its type (SoapSTSAgent outside a classic deployment, OAuth2Thing where it is not enabled), that file fails with the text of the library or of the server, the other files are still pushed, and the command exits with 1 unless --allow-failures is given. The kind for CIMD profiles is different: a deployment that does not have them is skipped with a note unless a name is given.\n'
    )
    .addHelpText('after', ownedObjectsPushHelp('OAuth2 clients'))
    .multiOp()
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );

      const getTokensIsSuccessful = await getTokens();
      if (!getTokensIsSuccessful) {
        process.exitCode = 1;
        return;
      }

      verboseMessage('Importing agents.');
      const outcome = await configManagerImportAgents(options.allowFailures);
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
