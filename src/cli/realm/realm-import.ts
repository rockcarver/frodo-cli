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

const { CLASSIC_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;
const deploymentTypes = [
  CLASSIC_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo realm import');

  program
    .description('Import realms.')
    .addOption(
      new Option(
        '-i, --realm-id <realm-id>',
        'Realm id. Cannot be used with -n, -a or A.'
      ).conflicts(['realmName', 'all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-n, --realm-name <realm-name>',
        'Realm name. Cannot be used with -i, -a or -A.'
      ).conflicts(['realmId', 'all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the file to import. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Import all realms from single file. Cannot be used with -i, -n or -A.'
      ).conflicts(['realmId', 'realmName', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all realms from separate files (*.realm.json) in the current directory. Cannot be used with -i, -n or -a.'
      ).conflicts(['realmId', 'realmName', 'all'])
    )
    .requireOneOf({
      options: ['all', 'allSeparate', 'file', 'realmId', 'realmName'],
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
        // import by id
        if (options.realmId && options.file) {
          task = {
            message: `Importing realm ${options.realmId}...`,
            run: () =>
              importRealmFromFile(
                options.realmId,
                options.realmName,
                options.file
              ),
          };
        }
        // import by name
        else if (options.realmName && options.file) {
          task = {
            message: `Importing realm ${options.realmName}...`,
            run: () =>
              importRealmFromFile(
                options.realmId,
                options.realmName,
                options.file
              ),
          };
        }
        // --all / -a
        else if (options.all && options.file) {
          task = {
            message: `Importing all realms from a single file (${options.file})...`,
            run: () =>
              importRealmsFromFile(options.file, options.allowFailures),
          };
        }
        // --all-separate / -A
        else if (options.allSeparate) {
          task = {
            message: 'Importing all realms from separate files...',
            run: () => importRealmsFromFiles(options.allowFailures),
          };
        }
        // import first realm in file
        else if (options.file) {
          task = {
            message: `Importing first realm in file...`,
            run: () =>
              importRealmFromFile(
                options.realmId,
                options.realmName,
                options.file
              ),
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
