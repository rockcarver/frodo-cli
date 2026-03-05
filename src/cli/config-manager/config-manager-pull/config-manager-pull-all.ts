import { Option } from 'commander';

import { configManagerExportAllWithConfigFolder } from '../../../configManagerOps/FrConfigAllOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const deploymentTypes = ['cloud', 'forgeops'];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull all',
    [],
    deploymentTypes
  );
  // TO DO: Adding a realm option to export all config for a specific realm
  program
    .description('Export all config.')
    .addOption(
      new Option(
        '-F, --config-folder <config-folder-path>',
        'Path to the folder containing the config files.\n'
      )
    )
    .addHelpText(
      'after',
      'The following entities require config files to be exported:\n' +
        '- authz-policies\n' +
        '- oauth2-agents\n' +
        '- saml\n' +
        '- service-objects\n\n' +
        'Each config file must be named after the command it applies to. For example,\n' +
        'the config file for "authz-policies" should be named "authz-policies.json".\n' +
        'Please refer to the help message of each command to see an example config file by running:\n' +
        '"frodo config-manager pull <entity-name> -h"'
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

      if (
        options.configFolder &&
        (await getTokens(false, true, deploymentTypes))
      ) {
        verboseMessage(
          'Exporting config files that fr-config-manager supports.'
        );
        const outcome = await configManagerExportAllWithConfigFolder({
          configFolder: options.configFolder,
        });
        if (!outcome) process.exitCode = 1;
      }
      // unrecognized combination of options or no options
      else {
        printMessage(
          'You must specify a folder containing the config files.\n' +
            'Please refer to the help message for more information.',
          'error'
        );
        program.help();
        process.exitCode = 1;
      }
    });

  return program;
}
