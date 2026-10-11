import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerImportLocales } from '../../../configManagerOps/FrConfigLocalesOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager push locales',
    [],
    deploymentTypes
  );

  program
    .description('Import custom locales objects.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Locale name, it only imports the Locale with the specified name'
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

      if (await getTokens(false, true, deploymentTypes)) {
        verboseMessage('Importing config entity locales');
        const outcome = await configManagerImportLocales(options.name);
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
