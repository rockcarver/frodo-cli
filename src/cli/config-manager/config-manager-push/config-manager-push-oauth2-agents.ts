import { configManagerImportAgents } from '../../../configManagerOps/FrConfigOauth2AgentOps';
import { ownedObjectsPushHelp } from '../../../ops/ApplicationOwnedObjectsHelp';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager push oauth2-agents');

  program
    .description('Import Oauth2 agents.')
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
