import { configManagerExportServices } from '../../../configManagerOps/FrConfigServiceOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../../FrodoCommand';
import { selectorOption } from '../../SelectorOption';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager pull services');

  program
    .description('Export authentication services.')
    .addOption(
      selectorOption(
        '-i, --service-id <id>',
        'Service id. If specified, only exports the service with the specified id.',
        ['-n', '--name']
      )
    )

    .multiOp()
    .usesRealm()
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
        const outcome = await configManagerExportServices(
          realmOfRun(command, realm),
          options.serviceId,
          options.allowFailures
        );
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
