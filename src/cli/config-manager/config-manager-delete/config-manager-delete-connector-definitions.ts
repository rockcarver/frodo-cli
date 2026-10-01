
import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { configManagerDeleteConnectorDefinitions } from '../../../configManagerOps/FrConfigConnectorDefinitionsOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager delete connector-definitions',
    [],
    deploymentTypes
  );

  program
    .description('Delete connector definitions.')
    .addOption(
      new Option(
        '-n, --name <connector-name>',
        'Delete connector-definition from specified name/id, without the type prefix.'
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show which connector definitions would be deleted without deleting them.'
      )
    )
    .multiOp()
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );

      const getTokensIsSuccessful = await getTokens(
        false,
        true,
        deploymentTypes
      );
      if (!getTokensIsSuccessful) process.exit(1);

      let outcome: boolean;

      if (options.name) {
        verboseMessage(
          `Deleting connector definition for connector: "${options.name}"`
        );
      } else {
        verboseMessage('Deleting all connector definitions.');
      }

      outcome = await configManagerDeleteConnectorDefinitions(
        options.name,
        options.dryRun,
        options.allowFailures
      );

      if (!outcome) process.exitCode = 1;
    });

  return program;
}
