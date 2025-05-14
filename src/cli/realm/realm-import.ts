import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  importRealmFromFile,
  importRealmsFromFile,
  importRealmsFromFiles,
} from '../../ops/RealmOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLASSIC_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const deploymentTypes = [CLASSIC_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand('frodo realm import', [], deploymentTypes);

  program
    .description('Import realms.')
    .addOption(
      new Option(
        '-i, --realm-id <realm-id>',
        'Realm id. If specified, only one realm is imported and the options -n, -a, and -A are ignored.'
      )
    )
    .addOption(
      new Option(
        '-n, --realm-name <realm-name>',
        'Realm name. If specified, only one realm is imported and the options -a and -A are ignored.'
      )
    )
    .addOption(new Option('-f, --file <file>', 'Name of the file to import.'))
    .addOption(
      new Option(
        '-a, --all',
        'Import all realms from single file. Ignored with -i or -n.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all realms from separate files (*.realm.json) in the current directory. Ignored with -i, -n, or -a.'
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
          // import by id
          if (options.realmId && options.file) {
            verboseMessage(`Importing realm ${options.realmId}...`);
            const outcome = await importRealmFromFile(
              options.realmId,
              options.realmName,
              options.file
            );
            if (!outcome) process.exitCode = 1;
          }
          // import by name
          else if (options.realmName && options.file) {
            verboseMessage(`Importing realm ${options.realmName}...`);
            const outcome = await importRealmFromFile(
              options.realmId,
              options.realmName,
              options.file
            );
            if (!outcome) process.exitCode = 1;
          }
          // --all / -a
          else if (options.all && options.file) {
            verboseMessage(
              `Importing all realms from a single file (${options.file})...`
            );
            const outcome = await importRealmsFromFile(options.file);
            if (!outcome) process.exitCode = 1;
          }
          // --all-separate / -A
          else if (options.allSeparate) {
            verboseMessage('Importing all realms from separate files...');
            const outcome = await importRealmsFromFiles();
            if (!outcome) process.exitCode = 1;
          }
          // import first realm in file
          else if (options.file) {
            verboseMessage(`Importing first realm in file...`);
            const outcome = await importRealmFromFile(
              options.realmId,
              options.realmName,
              options.file
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
        }
      }
      // end command logic inside action handler
    );

  return program;
}
