import { Command, Option } from 'commander';
import * as common from '../cmd_common.js';
import { AuthenticateOps, JourneyOps, state } from '@rockcarver/frodo-lib';

const { getTokens } = AuthenticateOps;
const { exportJourneyToFile, exportJourneysToFile, exportJourneysToFiles } =
  JourneyOps;

const program = new Command('frodo journey export');

program
  .description('Export journeys/trees.')
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
    new Option(
      '--verbose',
      'Verbose output during command execution. If specified, may or may not produce additional output.'
    ).default(false, 'off')
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
      if (await getTokens()) {
        // export
        if (options.journeyId) {
          console.log('Exporting journey...');
          exportJourneyToFile(options.journeyId, options.file, {
            useStringArrays: options.useStringArrays,
            deps: options.deps,
            verbose: options.verbose,
          });
        }
        // --all -a
        else if (options.all) {
          console.log('Exporting all journeys to a single file...');
          exportJourneysToFile(options.file, {
            useStringArrays: options.useStringArrays,
            deps: options.deps,
            verbose: options.verbose,
          });
        }
        // --all-separate -A
        else if (options.allSeparate) {
          console.log('Exporting all journeys to separate files...');
          exportJourneysToFiles({
            useStringArrays: options.useStringArrays,
            deps: options.deps,
            verbose: options.verbose,
          });
        }
        // unrecognized combination of options or no options
        else {
          console.log('Unrecognized combination of options or no options...');
          program.help();
        }
      }
    }
    // end command logic inside action handler
  );

program.parse();
