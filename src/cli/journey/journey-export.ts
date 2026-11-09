import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportJourneysToFile,
  exportJourneysToFiles,
  exportJourneyToFile,
} from '../../ops/JourneyOps';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo journey export');

  program
    .description('Export journeys/trees.')
    .addOption(
      new Option(
        '-i, --journey-id <journey>',
        'Name of a journey/tree. Cannot be used with -a or -A.'
      ).conflicts(['all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the file to write the exported journey(s) to. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Export all the journeys/trees in a realm. Cannot be used with -i or -A.'
      ).conflicts(['journeyId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all the journeys/trees in a realm as separate files <journey/tree name>.json. Cannot be used with -i, -f or -a.'
      ).conflicts(['journeyId', 'file', 'all'])
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
    .requireOneOf({
      options: ['all', 'allSeparate', 'journeyId'],
      purpose: 'what to export',
    })
    .multiOp()
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Export one journey to a file, omitting its dependencies and coordinates:\n` +
        c.command(
          `  $ frodo journey export -i ${s.journeyId} -f ${s.journeyFile} --no-deps --no-coords ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        ) +
        `  Export all journeys in a realm to one file without metadata:\n` +
        c.command(
          `  $ frodo journey export -a -f ${s.allJourneysFile} -N ${s.connId} ${s.realm}\n`
        ) +
        `  Export all journeys in a realm as separate files:\n` +
        c.command(`  $ frodo journey export -A ${s.connId} ${s.realm}\n`)
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
        // On a terminal the framework offers a journey to pick, after the
        // login, when -i was left out (cli record 0038). A failed login, a
        // declined pick and a failed read all stop here.
        if (!(await getTokens())) {
          process.exitCode = 1;
          return;
        }
        // export
        if (options.journeyId) {
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
        else if (options.all) {
          verboseMessage('Exporting all journeys to a single file...');
          const outcome = await exportJourneysToFile(
            options.file,
            options.metadata,
            {
              useStringArrays: options.useStringArrays,
              deps: options.deps,
              coords: options.coords,
            },
            options.allowFailures
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all-separate -A
        else if (options.allSeparate) {
          verboseMessage('Exporting all journeys to separate files...');
          const outcome = await exportJourneysToFiles(
            options.metadata,
            {
              useStringArrays: options.useStringArrays,
              deps: options.deps,
              coords: options.coords,
            },
            options.allowFailures
          );
          if (!outcome) process.exitCode = 1;
        }
        // No branch ran: with requireOneOf satisfied, the only way here is a
        // realm with no journey to pick from -- exit 1, as before.
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
