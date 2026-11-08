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

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo role import', [], deploymentTypes);
  program
    .description('Import internal roles.')
    .addOption(
      new Option(
        '-i, --role-id <role-id>',
        'Internal role id. If specified, only one internal role is imported and the options -n, -a or -A cannot be used.'
      ).conflicts(['roleName', 'all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-n, --role-name <role-name>',
        'Internal role name. If specified, only one internal role is imported and the options -i, -a or -A cannot be used.'
      ).conflicts(['roleId', 'all', 'allSeparate'])
    )
    .addOption(new Option('-f, --file <file>', 'Name of the file to import.'))
    .addOption(
      new Option(
        '-a, --all',
        'Import all internal roles from single file. Cannot be used with -i, -n or -A.'
      ).conflicts(['roleId', 'roleName', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all internal roles from separate files (*.internalRole.json) in the current directory. Cannot be used with -i, -n or -a.'
      ).conflicts(['roleId', 'roleName', 'all'])
    )
    .requireOneOf({
      options: ['all', 'allSeparate', 'file', 'roleId', 'roleName'],
      purpose: 'what to import',
    })
    .multiOp()
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
        // decide what to do from the options alone, so that a failed login is
        // reported as such and not as an unrecognized combination of options
        let task: { message: string; run: () => Promise<boolean> } | undefined;
        // import by id or name
        if ((options.roleId || options.roleName) && options.file) {
          task = {
            message: `Importing internal role ${options.roleId || options.roleName}...`,
            run: () =>
              importInternalRoleFromFile(
                options.roleId,
                options.roleName,
                options.file
              ),
          };
        }
        // --all -a
        else if (options.all && options.file) {
          task = {
            message: `Importing all internal roles from a single file (${options.file})...`,
            run: () =>
              importInternalRolesFromFile(options.file, options.allowFailures),
          };
        }
        // --all-separate -A
        else if (options.allSeparate) {
          task = {
            message: 'Importing all internal roles from separate files...',
            run: () => importInternalRolesFromFiles(options.allowFailures),
          };
        }
        // import first role in file
        else if (options.file) {
          task = {
            message: 'Importing first internal role in file...',
            run: () => importFirstInternalRoleFromFile(options.file),
          };
        }
        // unrecognized combination of options or no options
        else {
          printMessage(
            'Unrecognized combination of options or no options...',
            'error'
          );
          process.exitCode = 1;
          program.help();
          return;
        }
        if (!(await getTokens(false, true, deploymentTypes))) {
          // getTokens has said why
          process.exitCode = 1;
          return;
        }
        verboseMessage(task.message);
        const outcome = await task.run();
        if (!outcome) process.exitCode = 1;
      }
      // end command logic inside action handler
    );
  return program;
}
