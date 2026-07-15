import { configManagerImportCors } from '../../../configManagerOps/FrConfigCorsOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager push cors');

  program
    .description('Import CORS configuration.')
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
      verboseMessage('Importing cors configuration.');
      const outcome = await configManagerImportCors();
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
