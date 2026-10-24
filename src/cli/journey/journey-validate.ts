import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { validateJourneyExports } from '../../ops/JourneyValidationOps';
import c from '../../utils/ColorTheme';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo journey validate');

  program
    .description('Validate journey references and report each finding.')
    .addOption(
      new Option(
        '-i, --journey-id <journey>',
        'Name of a journey/tree. If specified, -a is ignored.'
      )
    )
    .addOption(new Option('-a, --all', 'Validate all journeys/trees.'))
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the journey export file to validate.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Validate all journeys/trees from separate files in a directory.'
      )
    )
    .addOption(new Option('--strict', 'Treat warnings as validation failures.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Validate a journey in the tenant and login using AM base URL, username, and password (note the quotes around password to allow special characters):\n` +
        c.command(
          `  $ frodo journey validate -i ${s.journeyId} ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        ) +
        `  Validate a journey in the tenant and login using a connection profile (identified by a unique substring of the AM base URL or a saved alias):\n` +
        c.command(
          `  $ frodo journey validate -i ${s.journeyId} ${s.connId} ${s.realm}\n`
        ) +
        `  Validate all journeys in a realm of the tenant:\n` +
        c.command(`  $ frodo journey validate -a ${s.connId} ${s.realm}\n`) +
        `  Validate all journeys in the tenant and also fail (exit code 1) on warnings, for example in a CI job:\n` +
        c.command(
          `  $ frodo journey validate -a --strict ${s.connId} ${s.realm}\n`
        ) +
        `  Validate a journey in an export file (no login needed):\n` +
        c.command(
          `  $ frodo journey validate -i ${s.journeyId} -f ${s.journeyFile}\n`
        ) +
        `  Validate all journeys in an export file (no login needed):\n` +
        c.command(`  $ frodo journey validate -a -f ${s.allJourneysFile}\n`) +
        `  Validate all journeys exported to separate files in a directory (no login needed):\n` +
        c.command(`  $ frodo journey validate -A -D ${s.journeysDirectory}\n`)
    )
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );

      const invalidCombination =
        options.allSeparate && !options.directory
          ? '-A requires -D <directory>.'
          : options.file && options.allSeparate
            ? '-f cannot be combined with -A.'
            : options.directory && !options.file && !options.allSeparate
              ? '-D requires -f or -A.'
              : !options.allSeparate && !options.journeyId && !options.all
                ? 'Specify -i or -a to select journeys; -A -D validates all directory journeys.'
                : undefined;
      if (invalidCombination) {
        printMessage(`Error: ${invalidCombination}`, 'error');
        process.exitCode = 1;
        return;
      }

      if (!options.file && !options.allSeparate) {
        if (!(await getTokens())) {
          process.exitCode = 1;
          return;
        }
        verboseMessage('Validating journeys...');
      }

      const outcome = await validateJourneyExports(
        options.journeyId ? [options.journeyId] : undefined,
        options.file,
        options.strict,
        options.allSeparate ? options.directory : undefined
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
