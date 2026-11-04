import { Option } from 'commander';
import { configManagerExportServices } from '../../../configManagerOps/FrConfigServiceOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager pull services');

  program
    .description('Export authentication services.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Service name. If specified, only exports the service with the specified name.'
      )
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

      if (await getTokens()) {
        verboseMessage('Exporting services...');
        const outcome = await configManagerExportServices(realm, options.name);
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
