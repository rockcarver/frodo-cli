import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { validateJourneyExports } from '../../ops/JourneyValidationOps';
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
