import { Command, Option } from 'commander';
import { Authenticate, Idm, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';

const { getTokens } = Authenticate;
const {
  importAllConfigEntities,
  importAllRawConfigEntities,
  importConfigEntity,
} = Idm;

const program = new Command('frodo idm import');

interface IdmImportOptions {
  type?: string;
  insecure?: string;
  name?: string;
  file?: string;
  entitiesFile?: string;
  envFile?: string;
  all?: string;
  allSeparate?: string;
  directory?: string;
}

program
  .description('Import IDM configuration objects.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.realmArgument)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
  .addOption(
    new Option(
      '-N, --name <name>',
      'Config entity name. E.g. "managed", "sync", "provisioner-<connector-name>", etc.'
    )
  )
  .addOption(new Option('-f, --file [file]', 'Import file. Ignored with -A.'))
  .addOption(
    new Option(
      '-E, --entities-file [entities-file]',
      'Name of the entity file. Ignored with -A.'
    )
  )
  .addOption(
    new Option(
      '-e, --env-file [envfile]',
      'Name of the env file. Ignored with -A.'
    )
  )
  .addOption(
    new Option(
      '-a, --all',
      'Import all IDM configuration objects into a single file in directory -D. Ignored with -N.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Import all IDM configuration objects into separate JSON files in directory -D. Ignored with -N, and -a.'
    )
  )
  .addOption(
    new Option(
      '-D, --directory <directory>',
      'Import directory. Required with and ignored without -a/-A.'
    )
  )
  .action(
    // implement command logic inside action handler
    async (
      host: string,
      realm: string,
      user: string,
      password: string,
      options: IdmImportOptions
    ) => {
      state.default.session.setTenant(host);
      state.default.session.setRealm(realm);
      state.default.session.setUsername(user);
      state.default.session.setPassword(password);
      state.default.session.setDeploymentType(options.type);
      state.default.session.setAllowInsecureConnection(options.insecure);
      if (await getTokens()) {
        // import by id/name
        if (options.name) {
          console.log(
            `Importing object "${
              options.name
            }" to realm "${state.default.session.getRealm()}"...`
          );
          importConfigEntity(options.name, options.file);
        }
        // --all-separate -A
        else if (
          options.allSeparate &&
          options.directory &&
          options.entitiesFile &&
          options.envFile
        ) {
          console.log(
            `Importing IDM configuration objects specified in ${options.entitiesFile} into separate files in ${options.directory} using ${options.envFile} for variable replacement...`
          );
          importAllConfigEntities(
            options.directory,
            options.entitiesFile,
            options.envFile
          );
        }
        // --all-separate -A without variable replacement
        else if (options.allSeparate && options.directory) {
          console.log(
            `Importing all IDM configuration objects into separate files in ${options.directory}...`
          );
          importAllRawConfigEntities(options.directory);
        }
        // unrecognized combination of options or no options
        else {
          console.log(
            'Unrecognized combination of options or no options...',
            'error'
          );
          program.help();
        }
      }
    }
    // end command logic inside action handler
  );

program.parse();
