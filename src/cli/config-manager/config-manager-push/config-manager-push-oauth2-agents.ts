import { configManagerImportAgents } from '../../../configManagerOps/FrConfigOauth2AgentOps';
import { ownedObjectsPushHelp } from '../../../ops/ApplicationOwnedObjectsHelp';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager push oauth2-agents');

  program
    .description('Import Oauth2 agents.')
    .addHelpText(
      'after',
      '\nThe folders of these agent types are pushed: IdentityGatewayAgent, J2EEAgent, WebAgent, 2.2_Agent, SharedAgent, OAuth2Client and RemoteConsentAgent, as realms/<realm>/realm-config/agents/<type>/<id>.json.\n' +
        'The agent types CIMDProfile, TrustedJwtIssuer and SoftwarePublisher have a kind of their own: "frodo config-manager push oauth-cimd-profiles", "frodo config-manager push oauth-issuers" and "frodo config-manager push oauth-software-publishers". The folders of those types are skipped here with a warning; no file in them is read or changed.\n'
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
