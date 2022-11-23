import { Command, Option } from 'commander';
import { Authenticate, Idm, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common';
import { printMessage, verboseMessage } from '../../utils/Console';

const { getTokens } = Authenticate;
const {
  exportAllConfigEntities,
  exportAllRawConfigEntities,
  exportConfigEntity,
} = Idm;

const program = new Command('frodo idm export');

program
  .description('Export IDM configuration objects.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.realmArgument)
  .addArgument(common.userArgument)
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
  .addOption(new Option('-f, --file [file]', 'Export file. Ignored with -A.'))
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
      'Export all IDM configuration objects into a single file in directory -D. Ignored with -N.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Export all IDM configuration objects into separate JSON files in directory -D. Ignored with -N, and -a.'
    )
  )
  .addOption(
    new Option(
      '-D, --directory <directory>',
      'Export directory. Required with and ignored without -a/-A.'
    )
  )
  .action(
    // implement command logic inside action handler
    async (host, realm, user, password, options) => {
      state.default.session.setTenant(host);
      state.default.session.setRealm(realm);
      state.default.session.setUsername(user);
      state.default.session.setPassword(password);
      state.default.session.setDeploymentType(options.type);
      state.default.session.setAllowInsecureConnection(options.insecure);
      state.default.session.setVerbose(options.verbose);
      state.default.session.setDebug(options.debug);
      state.default.session.setCurlirize(options.curlirize);
      // export by id/name
      if (options.name && (await getTokens())) {
        verboseMessage(
          `Exporting object "${
            options.name
          }" from realm "${state.default.session.getRealm()}"...`
        );
        exportConfigEntity(options.name, options.file);
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
          `Exporting IDM configuration objects specified in ${options.entitiesFile} into separate files in ${options.directory} using ${options.envFile} for variable replacement...`
        );
        exportAllConfigEntities(
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
          `Exporting all IDM configuration objects into separate files in ${options.directory}...`
        );
        exportAllRawConfigEntities(options.directory);
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
