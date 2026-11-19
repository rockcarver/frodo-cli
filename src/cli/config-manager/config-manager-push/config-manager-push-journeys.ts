import { Option } from 'commander';
import { configManagerImportJourneys } from '../../../configManagerOps/FrConfigJourneysOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../../FrodoCommand';
import { selectorOption } from '../../SelectorOption';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager push journeys', []);

  program
    .description('Import journeys.')
    .addOption(
      selectorOption(
        '-i, --journey-id <id>',
        'Journey id, imports the specified Journey.',
        ['-n', '--name']
      )
    )

    .addOption(
      new Option('--push-dependencies', 'Push scripts and inner journeys')
    )
    .addOption(
      new Option('--no-validate', 'Do not validate journeys before import.')
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

      const getTokensIsSuccessful = await getTokens(false, true);
      if (!getTokensIsSuccessful) {
        process.exitCode = 1;
        return;
      }
      verboseMessage('Importing email provider configuration.');
      const outcome = await configManagerImportJourneys(
        options.journeyId,
        realmOfRun(command, realm),
        options.pushDependencies,
        options.validate,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
