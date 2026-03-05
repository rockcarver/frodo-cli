import { Option } from 'commander';

import { configManagerExportSecretMappings } from '../../../configManagerOps/FrConfigSecretMappingsOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const deploymentTypes = ['cloud', 'forgeops'];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull secret-mappings',
    [],
    deploymentTypes
  );

  program
    .description('Export secret mappings.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Name of the secret mapping, It will only export secret mapping with the name. Works both with mapping._id or alias.  '
      )
    )
    .addOption(
      new Option(
        '-r, --realm <realm>',
        'Specific realm to get secret mappings from (overrides environment)'
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
      if (options.realm) {
        realm = options.realm;
      }

      if (await getTokens(false, true, deploymentTypes)) {
        verboseMessage('Exporting config entity secret-mappings');
        const outcome = await configManagerExportSecretMappings(
          options.name,
          realm
        );
        if (!outcome) process.exitCode = 1;
      }
      // unrecognized combination of options or no options
      else {
        printMessage(
          'Unrecognized combination of options or no options...',
          'error'
        );
        program.help();
        process.exitCode = 1;
      }
    });

  return program;
}
