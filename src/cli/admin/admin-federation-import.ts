import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  importAdminFederationProviderFromFile,
  importAdminFederationProvidersFromFile,
  importAdminFederationProvidersFromFiles,
  importFirstAdminFederationProviderFromFile,
} from '../../ops/cloud/AdminFederationOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo admin federation import',
    ['realm'],
    deploymentTypes
  );

  program
    .description('Import admin federation providers.')
    .addOption(
      new Option(
        '-i, --idp-id <id>',
        'Provider id. Cannot be used with -a or -A.'
      ).conflicts(['all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the file to import the provider(s) from. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Import all the providers from single file. Cannot be used with -i or -A.'
      ).conflicts(['idpId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all the providers from separate files (*.admin.federation.json) in the current directory. Cannot be used with -i, -f or -a.'
      ).conflicts(['idpId', 'file', 'all'])
    )
    .requireOneOf({
      options: ['all', 'allSeparate', 'file', 'idpId'],
      purpose: 'what to import',
    })
    .multiOp()
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
        // an unrecognized combination of options is refused before the login
        const importById = options.file && options.idpId;
        const importAll = options.all && options.file;
        const importAllSeparate = options.allSeparate && !options.file;
        if (!(importById || importAll || importAllSeparate || options.file)) {
          printMessage('Unrecognized combination of options or no options...');
          process.exitCode = 1;
          program.help();
          return;
        }
        // a failed login is a failure of its own, not an unrecognized combination of options
        if (!(await getTokens(true, true, deploymentTypes))) {
          process.exitCode = 1;
          return;
        }
        // import by id
        if (importById) {
          verboseMessage(`Importing provider "${options.idpId}"...`);
          const outcome = await importAdminFederationProviderFromFile(
            options.idpId,
            options.file
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (importAll) {
          verboseMessage(
            `Importing all providers from a single file (${options.file})...`
          );
          const outcome = await importAdminFederationProvidersFromFile(
            options.file,
            options.allowFailures
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all-separate -A
        else if (importAllSeparate) {
          verboseMessage(
            'Importing all providers from separate files in current directory...'
          );
          const outcome = await importAdminFederationProvidersFromFiles(
            options.allowFailures
          );
          if (!outcome) process.exitCode = 1;
        }
        // import first provider from file
        else {
          verboseMessage(
            `Importing first provider from file "${options.file}"...`
          );
          const outcome = await importFirstAdminFederationProviderFromFile(
            options.file
          );
          if (!outcome) process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
