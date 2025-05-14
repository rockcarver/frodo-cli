import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { printMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand.js';

const { trainAA } = frodo.admin;

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo admin train-auto-access-model',
    ['realm'],
    deploymentTypes
  );

  program
    .description('Train Auto Access model.')
    .addOption(
      new Option(
        '--api-key <key>',
        'API key to authenticate to training journey.'
      ).default('')
    )
    .addOption(
      new Option(
        '--api-secret <secret>',
        'API secret to authenticate to training journey.'
      ).default('')
    )
    .addOption(
      new Option(
        '--usernames [usernames]',
        'Comma-delimited list of custom usernames.'
      ).default('')
    )
    .addOption(
      new Option(
        '--user-agents [usernames]',
        'Comma-delimited list of custom user agents.'
      ).default('')
    )
    .addOption(
      new Option(
        '--ip-addresses [usernames]',
        'Comma-delimited list of custom IP addresses.'
      ).default('')
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
            `Training Auto Access model in realm "${state.getRealm()}"...`
          );
          try {
            await trainAA(
              options.apiKey,
              options.apiSecret,
              options.usernames.split(','),
              options.userAgents.split(','),
              options.ipAddresses.split(','),
              100
            );
            printMessage(`Done.`);
          } catch (error) {
            printMessage(error, 'error');
            process.exitCode = 1;
          }
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
