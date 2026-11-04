import { Option } from 'commander';
import { configManagerExportJourneys } from '../../../configManagerOps/FrConfigJourneysOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager pull journeys');

  program
    .description('Export journeys.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Journey name. If specified, only exports the journey with the specified name.'
      )
    )
    .addOption(new Option('-d, --pull-dependencies', 'Pull dependencies.'))
    .addOption(
      new Option('-c, --clean', 'Clear existing configuration before pull.')
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

      if (await getTokens()) {
        verboseMessage('Exporting journeys...');
        const outcome = await configManagerExportJourneys(
          options.name,
          realm,
          options.pullDependencies,
          options.clean
        );
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
