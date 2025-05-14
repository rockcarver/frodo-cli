import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportRealmById,
  exportRealmByName,
  exportRealmsToFile,
  exportRealmsToFiles,
} from '../../ops/RealmOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const {
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
} = frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo realm export', [], deploymentTypes);

  program
    .description('Export realms.')
    .addOption(
      new Option(
        '-i, --realm-id <realm-id>',
        'Realm id. If specified, -n, -a, and -A are ignored.'
      )
    )
    .addOption(
      new Option(
        '-n, --realm-name <realm-name>',
        'Realm name. If specified, -a and -A are ignored.'
      )
    )
    .addOption(new Option('-f, --file <file>', 'Name of the export file.'))
    .addOption(
      new Option(
        '-a, --all',
        'Export all realms to a single file. Ignored with -i or -n.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all realms to separate files (*.realm.json) in the current directory. Ignored with -i, -n, or -a.'
      )
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
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
        // export by id
        if (
          options.realmId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting realm...');
          const outcome = await exportRealmById(
            options.realmId,
            options.file,
            options.metadata
          );
          if (!outcome) process.exitCode = 1;
        }
        // export by name
        else if (
          options.realmName &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting realm...');
          const outcome = await exportRealmByName(
            options.realmName,
            options.file,
            options.metadata
          );
          if (!outcome) process.exitCode = 1;
        }
        // -a / --all
        else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting all realms to a single file...');
          const outcome = await exportRealmsToFile(
            options.file,
            options.metadata
          );
          if (!outcome) process.exitCode = 1;
        }
        // -A / --all-separate
        else if (
          options.allSeparate &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting all realms to separate files...');
          const outcome = await exportRealmsToFiles(options.metadata);
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
      }
      // end command logic inside action handler
    );

  return program;
}
