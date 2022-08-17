import { Command, Option } from 'commander';
import * as common from '../cmd_common.js';
import { AuthenticateOps, JourneyOps, state } from '@rockcarver/frodo-lib';
const { getTokens } = AuthenticateOps;
const {
  importJourneyFromFile,
  importJourneysFromFile,
  importJourneysFromFiles,
  importFirstJourneyFromFile,
} = JourneyOps;

const program = new Command('frodo command sub');

program
  .description('Import journey/tree.')
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
      'Name of the file to import the journey(s) from. Ignored with -A.'
    )
  )
  .addOption(
    new Option(
      '-a, --all',
      'Import all the journeys/trees from single file. Ignored with -i.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Import all the journeys/trees from separate files (*.json) in the current directory. Ignored with -i or -a.'
    )
  )
  .addOption(
    new Option(
      '--re-uuid',
      'Generate new UUIDs for all nodes during import.'
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
        // import
        if (options.journeyId) {
          console.log(`Importing journey ${options.journeyId}...`);
          importJourneyFromFile(options.journeyId, options.file, {
            reUuid: options.reUuid,
            deps: options.deps,
            verbose: options.verbose,
          });
        }
        // --all -a
        else if (options.all && options.file) {
          console.log(
            `Importing all journeys from a single file (${options.file})...`
          );
          importJourneysFromFile(options.file, {
            reUuid: options.reUuid,
            deps: options.deps,
            verbose: options.verbose,
          });
        }
        // --all-separate -A
        else if (options.allSeparate && !options.file) {
          console.log(
            'Importing all journeys from separate files in current directory...'
          );
          importJourneysFromFiles({
            reUuid: options.reUuid,
            deps: options.deps,
            verbose: options.verbose,
          });
        }
        // import first journey in file
        else if (options.file) {
          console.log('Importing first journey in file...');
          importFirstJourneyFromFile(options.file, {
            reUuid: options.reUuid,
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
