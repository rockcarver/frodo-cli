import { Option } from 'commander';
import { configManagerImportServices } from '../../../configManagerOps/FrConfigServiceOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager push services');

  program
    .description('Import AM authentication services.')
    .addOption(
      new Option('-n, --name <name>', 'Name of the service to import.')
    )
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
      verboseMessage('Importing services.');
      const outcome = await configManagerImportServices(options.name, realm);
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
