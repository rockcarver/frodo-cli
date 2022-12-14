import { Command, Option } from 'commander';
import { Authenticate, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common';
import {
  exportJourneyToFile,
  exportJourneysToFile,
  exportJourneysToFiles,
} from '../../ops/JourneyOps';
import { printMessage, verboseMessage } from '../../utils/Console';

const { getTokens } = Authenticate;

const program = new Command('frodo journey export');

program
  .description('Export journeys/trees.')
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
      '-i, --journey-id <journey>',
      'Name of a journey/tree. If specified, -a and -A are ignored.'
    )
  )
  .addOption(
    new Option(
      '-f, --file <file>',
      'Name of the file to write the exported journey(s) to. Ignored with -A.'
    )
  )
  .addOption(
    new Option(
      '-a, --all',
      'Export all the journeys/trees in a realm. Ignored with -i.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Export all the journeys/trees in a realm as separate files <journey/tree name>.json. Ignored with -i or -a.'
    )
  )
  .addOption(
    new Option(
      '--use-string-arrays',
      'Where applicable, use string arrays to store multi-line text (e.g. scripts).'
    ).default(false, 'off')
  )
  .addOption(
    new Option(
      '--no-deps',
      'Do not include any dependencies (scripts, email templates, SAML entity providers and circles of trust, social identity providers, themes).'
    )
  )
  .addOption(
    new Option('-D, --directory <directory>', 'Destination directory.')
  )
  .addOption(
    new Option(
      '-O, --organize <method>',
      'Organize exports into folders using the indicated method. Valid values for method:\n' +
        'id: folders named by id of exported object\n' +
        'type: folders named by type (e.g. script, journey, idp)\n' +
        'type/id: folders named by type with sub-folders named by id'
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
      if (options.directory)
        state.default.session.setDirectory(options.directory);
      // export
      if (options.journeyId && (await getTokens())) {
        verboseMessage('Exporting journey...');
        await exportJourneyToFile(options.journeyId, options.file, {
          useStringArrays: options.useStringArrays,
          deps: options.deps,
        });
      }
      // --all -a
      else if (options.all && (await getTokens())) {
        verboseMessage('Exporting all journeys to a single file...');
        await exportJourneysToFile(options.file, {
          useStringArrays: options.useStringArrays,
          deps: options.deps,
        });
      }
      // --all-separate -A
      else if (options.allSeparate && (await getTokens())) {
        verboseMessage('Exporting all journeys to separate files...');
        await exportJourneysToFiles({
          useStringArrays: options.useStringArrays,
          deps: options.deps,
        });
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
