import { Option } from 'commander';
import { configManagerExportJourneys } from '../../../configManagerOps/FrConfigJourneysOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../../FrodoCommand';
import { withOptionAlias } from '../../OptionAlias';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager pull journeys');

  program
    .description('Export journeys.')
    .addOption(
      withOptionAlias(
        new Option(
          '-i, --journey-id <id>',
          'Journey id. If specified, only exports the journey with the specified id.'
        ),
        ['-n', '--name']
      )
    )
    .addOption(new Option('--pull-dependencies', 'Pull dependencies.'))
    .addOption(
      new Option('--clean', 'Clear existing configuration before pull.')
    )
    .multiOp()
    .usesRealm()
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
          options.journeyId,
          realmOfRun(command, realm),
          options.pullDependencies,
          options.clean,
          options.allowFailures
        );
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
