import { Option } from 'commander';

import { configManagerImportJourneys } from '../../../configManagerOps/FrConfigJourneysOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
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
      if (!getTokensIsSuccessful) process.exit(1);
      verboseMessage('Importing email provider configuration.');
      const outcome = await configManagerImportJourneys(
        options.name,
        realm,
        options.pushDependencies
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
