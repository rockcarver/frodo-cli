import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportJourneysToFile,
  exportJourneysToFiles,
  exportJourneyToFile,
} from '../../ops/JourneyOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const {
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
} = frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo journey export', [], deploymentTypes);

  program
    .description('Export journeys/trees.')
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
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
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
        '--no-coords',
        'Do not include the x and y coordinate positions of the journey/tree nodes.'
      )
    )
    // .addOption(
    //   new Option(
    //     '-O, --organize <method>',
    //     'Organize exports into folders using the indicated method. Valid values for method:\n' +
    //       'id: folders named by id of exported object\n' +
    //       'type: folders named by type (e.g. script, journey, idp)\n' +
    //       'type/id: folders named by type with sub-folders named by id'
    //   )
    // )
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
        // export
        if (
          options.journeyId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting journey...');
          const outcome = await exportJourneyToFile(
            options.journeyId,
            options.file,
            options.metadata,
            {
              useStringArrays: options.useStringArrays,
              deps: options.deps,
              coords: options.coords,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting all journeys to a single file...');
          const outcome = await exportJourneysToFile(
            options.file,
            options.metadata,
            {
              useStringArrays: options.useStringArrays,
              deps: options.deps,
              coords: options.coords,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all-separate -A
        else if (
          options.allSeparate &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting all journeys to separate files...');
          const outcome = await exportJourneysToFiles(options.metadata, {
            useStringArrays: options.useStringArrays,
            deps: options.deps,
            coords: options.coords,
          });
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
      // end command logic inside action handler
    );

  return program;
}
