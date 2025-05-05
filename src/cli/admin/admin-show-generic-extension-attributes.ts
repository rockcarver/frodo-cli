import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { showGenericExtensionAttributes } from '../../ops/AdminOps';
import { getTokens } from '../../ops/AuthenticateOps';
import { printMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo admin show-generic-extension-attributes',
    [],
    deploymentTypes
  );

  program
    .description('Show generic extension attributes.')
    .addOption(
      new Option(
        '--include-customized',
        'Include customized attributes.'
      ).default(false, 'false')
    )
    .addOption(
      new Option('--dry-run', 'Dry-run only, do not perform changes.').default(
        false,
        'false'
      )
    )
    .action(
      // implement command logic inside action handler
      async (host, realm, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          realm,
          user,
          password,
          options,
          command
        );
        if (await getTokens(false, true, deploymentTypes)) {
          printMessage(
            `Showing generic extension attributes in realm "${state.getRealm()}"...`
          );
          const outcome = await showGenericExtensionAttributes(
            options.includeCustomized,
            options.dryRun
          );
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
