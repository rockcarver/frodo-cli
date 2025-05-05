import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  importFirstInternalRoleFromFile,
  importInternalRoleFromFile,
  importInternalRolesFromFile,
  importInternalRolesFromFiles,
} from '../../ops/InternalRoleOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const {
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  IDM_DEPLOYMENT_TYPE_KEY,
} = frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  IDM_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo role import', [], deploymentTypes);
  program
    .description('Import internal roles.')
    .addOption(
      new Option(
        '-i, --role-id <role-id>',
        'Internal role id. If specified, only one internal role is imported and the options -n, -a and -A are ignored.'
      )
    )
    .addOption(
      new Option(
        '-n, --role-name <role-name>',
        'Internal role name. If specified, only one internal role is imported and the options -a and -A are ignored.'
      )
    )
    .addOption(new Option('-f, --file <file>', 'Name of the file to import.'))
    .addOption(
      new Option(
        '-a, --all',
        'Import all internal roles from single file. Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all internal roles from separate files (*.internalRole.json) in the current directory. Ignored with -i or -a.'
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
        // import by id or name
        if (
          (options.roleId || options.roleName) &&
          options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Importing internal role ${options.roleId || options.roleName}...`
          );
          const outcome = await importInternalRoleFromFile(
            options.roleId,
            options.roleName,
            options.file
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (
          options.all &&
          options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Importing all internal roles from a single file (${options.file})...`
          );
          const outcome = await importInternalRolesFromFile(options.file);
          if (!outcome) process.exitCode = 1;
        }
        // --all-separate -A
        else if (
          options.allSeparate &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Importing all internal roles from separate files...');
          const outcome = await importInternalRolesFromFiles();
          if (!outcome) process.exitCode = 1;
        }
        // import first role in file
        else if (
          options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Importing first internal role in file...');
          const outcome = await importFirstInternalRoleFromFile(options.file);
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
