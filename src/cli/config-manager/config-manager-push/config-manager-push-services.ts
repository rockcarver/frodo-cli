import { configManagerImportServices } from '../../../configManagerOps/FrConfigServiceOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../../FrodoCommand';
import { selectorOption } from '../../SelectorOption';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager push services');

  program
    .description('Import AM authentication services.')
    .addOption(
      selectorOption('-i, --service-id <id>', 'Id of the service to import.', [
        '-n',
        '--name',
      ])
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

      const getTokensIsSuccessful = await getTokens();
      if (!getTokensIsSuccessful) {
        process.exitCode = 1;
        return;
      }
      verboseMessage('Importing services.');
      const outcome = await configManagerImportServices(
        options.serviceId,
        realmOfRun(command, realm),
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
