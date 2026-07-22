import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { configManagerImportSecretMappings } from '../../../configManagerOps/FrConfigSecretMappingsOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, DEFAULT_REALM_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager push secret-mappings',
    [],
    deploymentTypes
  );

  program
    .description('Import secret mappings.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Secret mapping name. It will only import secret mapping with the specified name.'
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

      if (options.name && (!realm || realm === DEFAULT_REALM_KEY)) {
        printMessage(
          'The -n/--name option requires a realm argument to be specified.',
          'error'
        );
        program.help();
        process.exitCode = 1;
        return;
      }

      const getTokensIsSuccessful = await getTokens(
        false,
        true,
        deploymentTypes
      );
      if (!getTokensIsSuccessful) process.exit(1);
      verboseMessage('Importing secret mappings configuration.');
      const outcome = await configManagerImportSecretMappings(
        options.name,
        realm
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
