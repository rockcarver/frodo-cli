import { Command, Option } from 'commander';
import { Authenticate, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common';
import { printMessage, verboseMessage } from '../../utils/Console';
import {
  importAllConfigEntities,
  importAllRawConfigEntities,
  importConfigEntity,
} from '../../ops/IdmOps';

const { getTokens } = Authenticate;

const program = new Command('frodo idm import');

interface IdmImportOptions {
  type?: string;
  insecure?: boolean;
  verbose?: boolean;
  debug?: boolean;
  curlirize?: boolean;
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
  .addArgument(common.hostArgument)
  .addArgument(common.realmArgument)
  .addArgument(common.usernameArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
  .addOption(common.verboseOption)
  .addOption(common.debugOption)
  .addOption(common.curlirizeOption)
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
      state.default.session.setVerbose(options.verbose);
      state.default.session.setDebug(options.debug);
      state.default.session.setCurlirize(options.curlirize);
      // import by id/name
      if (options.name && (await getTokens())) {
        verboseMessage(
          `Importing object "${
            options.name
          }" to realm "${state.default.session.getRealm()}"...`
        );
        await importConfigEntity(options.name, options.file);
      }
      // --all-separate -A
      else if (
        options.allSeparate &&
        options.directory &&
        options.entitiesFile &&
        options.envFile &&
        (await getTokens())
      ) {
        verboseMessage(
          `Importing IDM configuration objects specified in ${options.entitiesFile} into separate files in ${options.directory} using ${options.envFile} for variable replacement...`
        );
        await importAllConfigEntities(
          options.directory,
          options.entitiesFile,
          options.envFile
        );
      }
      // --all-separate -A without variable replacement
      else if (
        options.allSeparate &&
        options.directory &&
        (await getTokens())
      ) {
        verboseMessage(
          `Importing all IDM configuration objects into separate files in ${options.directory}...`
        );
        await importAllRawConfigEntities(options.directory);
      }
      // unrecognized combination of options or no options
      else {
        printMessage(
          'Unrecognized combination of options or no options...',
          'error'
        );
        program.help();
      }
    }
    // end command logic inside action handler
  );

program.parse();
