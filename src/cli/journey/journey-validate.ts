import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { validateJourneys } from '../../ops/JourneyValidationOps';
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

      if (options.file) {
        const outcome = await validateJourneys(
          options.journeyId ? [options.journeyId] : undefined,
          options.file,
          options.strict
        );
        if (!outcome) process.exitCode = 1;
      } else if (await getTokens()) {
        verboseMessage('Validating journeys...');
        const outcome = await validateJourneys(
          options.journeyId ? [options.journeyId] : undefined,
          undefined,
          options.strict
        );
        if (!outcome) process.exitCode = 1;
      } else {
        process.exitCode = 1;
      }
    });

  return program;
}
