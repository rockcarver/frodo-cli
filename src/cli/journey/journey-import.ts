import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  importFirstJourneyFromFile,
  importJourneyFromFile,
  importJourneysFromFile,
  importJourneysFromFiles,
} from '../../ops/JourneyOps';
import c from '../../utils/ColorTheme';
import { printMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo journey import');

  program
    .description('Import journey/tree.')
    .addOption(
      new Option(
        '-i, --journey-id <journey>',
        'Name of a journey/tree. Cannot be used with -a or -A.'
      ).conflicts(['all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the file to import the journey(s) from. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Import all the journeys/trees from single file. Cannot be used with -i or -A.'
      ).conflicts(['journeyId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all the journeys/trees from separate files (*.json) in the current directory. Cannot be used with -i, -f or -a.'
      ).conflicts(['journeyId', 'file', 'all'])
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
      new Option('--no-validate', 'Do not validate the journey before import.')
    )
    .requireOneOf({
      options: ['all', 'allSeparate', 'file', 'journeyId'],
      purpose: 'what to import',
    })
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Import the first journey in a file and log in with AM base URL, username, and password:\n` +
        c.command(
          `  $ frodo journey import -f ${s.journeyFile} ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        ) +
        `  Import a named journey from a file using a connection profile, reassigning node UUIDs:\n` +
        c.command(
          `  $ frodo journey import -i ${s.journeyId} -f ${s.journeyFile} --re-uuid ${s.connId}\n`
        ) +
        `  Import all journeys from one file:\n` +
        c.command(
          `  $ frodo journey import -a -f ${s.allJourneysFile} ${s.connId} ${s.realm}\n`
        ) +
        `  Import journeys from separate JSON files in the current directory:\n` +
        c.command(`  $ frodo journey import -A ${s.connId} ${s.realm}\n`)
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
        // import
        if (options.journeyId && (await getTokens())) {
          printMessage(`Importing journey ${options.journeyId}...`);
          const outcome = await importJourneyFromFile(
            options.journeyId,
            options.file,
            {
              reUuid: options.reUuid,
              deps: options.deps,
              validate: options.validate,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (options.all && options.file && (await getTokens())) {
          printMessage(
            `Importing all journeys from a single file (${options.file})...`
          );
          const outcome = await importJourneysFromFile(options.file, {
            reUuid: options.reUuid,
            deps: options.deps,
            validate: options.validate,
          });
          if (!outcome) process.exitCode = 1;
        }
        // --all-separate -A
        else if (options.allSeparate && !options.file && (await getTokens())) {
          printMessage(
            'Importing all journeys from separate files in current directory...'
          );
          const outcome = await importJourneysFromFiles({
            reUuid: options.reUuid,
            deps: options.deps,
            validate: options.validate,
          });
          if (!outcome) process.exitCode = 1;
        }
        // import first journey in file
        else if (options.file && (await getTokens())) {
          printMessage('Importing first journey in file...');
          const outcome = await importFirstJourneyFromFile(options.file, {
            reUuid: options.reUuid,
            deps: options.deps,
            validate: options.validate,
          });
          if (!outcome) process.exitCode = 1;
        }
        // unrecognized combination of options or no options
        else {
          printMessage('Unrecognized combination of options or no options...');
          process.exitCode = 1;
          program.help();
        }
      }
      // end command logic inside action handler
    );

  return program;
}
