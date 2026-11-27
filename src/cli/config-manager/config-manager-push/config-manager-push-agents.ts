import { configManagerImportAgents } from '../../../configManagerOps/FrConfigOauth2AgentOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import {
  KEY_SET_PUSH_SENTENCE,
  PLACEHOLDER_VALUES_RULE,
} from '../../../utils/PlaceholderValues';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config push agents');

  program
    .summary('Import agents from the files written by pull.')
    .description(
      'Import the agents (the gateway, Java, web and policy agents and the other agent types listed below, but not the OAuth2 clients) from the files realms/<realm>/realm-config/agents/<type>/<id>.json that "pull agents" writes, from the working directory (-D). The OAuth2 clients are pushed by "push oauth-clients".'
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Push every agent file of the tree in the working directory (realms/<realm>/realm-config/agents/<type>/<id>.json) to the tenant:\n` +
        c.command(`  $ frodo config push agents ${s.connId}\n`) +
        `  Push from a config directory other than the working directory:\n` +
        c.command(`  $ frodo config push agents -D ./config ${s.connId}\n`) +
        `  Succeed although some agents could not be pushed (the failures are still summarised):\n` +
        c.command(`  $ frodo config push agents --allow-failures ${s.connId}\n`)
    )
    .addHelpText(
      'after',
      '\nThe folders of these agent types are pushed: IdentityGatewayAgent, J2EEAgent, WebAgent, 2.2_Agent, SharedAgent, RemoteConsentAgent, SoapSTSAgent (it exists only in classic deployments) and OAuth2Thing (it exists only where the deployment has enabled it), as realms/<realm>/realm-config/agents/<type>/<id>.json.\n' +
        'The folder of the OAuth2 clients, OAuth2Client, is not read here: "frodo config push oauth-clients" pushes it.\n' +
        'The agent types CIMDProfile, TrustedJwtIssuer and SoftwarePublisher have a command of their own: "frodo config push oauth-cimd-profiles", "frodo config push oauth-issuers" and "frodo config push oauth-software-publishers". The folders of those types are skipped here with a warning; no file in them is read or changed.\n' +
        `Each \${NAME} in a file ${PLACEHOLDER_VALUES_RULE} The agents with a password (IdentityGatewayAgent, J2EEAgent, WebAgent, 2.2_Agent and SharedAgent) are pulled with an override that holds such a placeholder. ${KEY_SET_PUSH_SENTENCE}\n` +
        'A file you push is a request: if the deployment cannot serve its type (SoapSTSAgent outside a classic deployment, OAuth2Thing where it is not enabled), that file fails with the text of the library or of the server, the other files are still pushed, and the command exits with 1 unless --allow-failures is given.\n'
    )
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
      const outcome = await configManagerImportAgents(
        options.allowFailures,
        'agents'
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
