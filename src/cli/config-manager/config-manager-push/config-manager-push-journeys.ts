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
        'Journey id, imports the specified journey and, unless --no-deps is given, its inner journeys.',
        ['-n', '--name']
      )
    )
    .addOption(
      new Option(
        '--no-deps',
        'Do not push the scripts that the journeys use, nor the inner journeys of a journey that is named.'
      )
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
      verboseMessage('Importing journeys...');
      const outcome = await configManagerImportJourneys(
        options.journeyId,
        realmOfRun(command, realm),
        options.deps,
        options.validate,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
