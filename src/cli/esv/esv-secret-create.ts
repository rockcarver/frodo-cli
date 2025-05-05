import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { createSecret, createSecretFromFile } from '../../ops/cloud/SecretsOps';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo esv secret create',
    ['realm'],
    deploymentTypes
  );

  program
    .description('Create secrets.')
    .requiredOption('-i, --secret-id <secret-id>', 'Secret id.')
    .option('--value <value>', 'Secret value. Overrides "--file"')
    .addOption(
      new Option(
        '-f, --file [file]',
        'Name of the file to read pem or base64hmac encoded secret from. Ignored if --value is specified'
      )
    )
    .option('--description [description]', 'Secret description.')
    .addOption(
      new Option('--encoding [encoding]', 'Secret encoding')
        .choices(['generic', 'pem', 'base64hmac'])
        .default('generic', 'generic')
    )
    .addOption(
      new Option(
        '--no-use-in-placeholders',
        'Secret cannot be used in placeholders.'
      )
    )
    .action(
      // implement command logic inside action handler
      async (host, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          user,
          password,
          options,
          command
        );
        if (await getTokens(false, true, deploymentTypes)) {
          verboseMessage('Creating secret...');
          let outcome = null;
          if (options.value) {
            outcome = await createSecret(
              options.secretId,
              options.value,
              options.description,
              options.encoding,
              options.useInPlaceholders
            );
          } else {
            outcome = await createSecretFromFile(
              options.secretId,
              options.file,
              options.description,
              options.encoding,
              options.useInPlaceholders
            );
          }
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
