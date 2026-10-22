import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { validateJourneyExports } from '../../ops/JourneyValidationOps';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo journey validate');

  program
    .description('Validate journey references.')
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
        'Validate journeys/trees from separate files in a directory.'
      )
    )
    .addOption(new Option('--strict', 'Treat warnings as validation failures.'))
    .requireOneOf({
      options: ['journeyId', 'all'],
      purpose: 'which journeys to validate',
    })
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );

      if (
        (options.allSeparate && !options.directory) ||
        (options.directory && !options.allSeparate) ||
        (options.file && options.allSeparate)
      ) {
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
        options.directory
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
