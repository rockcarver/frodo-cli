import { Option } from 'commander';
import { configManagerImportJourneys } from '../../../configManagerOps/FrConfigJourneysOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager push journeys', []);

  program
    .description('Import journeys.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Journey name, imports the specified Journey.'
      )
    )

    .addOption(
      new Option('-d, --push-dependencies', 'Push scripts and inner journeys')
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
        options.name,
        realmOfRun(command, realm),
        options.pushDependencies,
        options.validate,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
