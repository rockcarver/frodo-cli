import { configManagerImportAgents } from '../../../configManagerOps/FrConfigOauth2AgentOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager push oauth2-agents');

  program
    .description('Import Oauth2 agents.')
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
      if (!getTokensIsSuccessful) process.exit(1);

      verboseMessage('Importing agents.');
      const outcome = await configManagerImportAgents();
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
