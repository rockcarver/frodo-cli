import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerExportConnectorDefinitions } from '../../../configManagerOps/FrConfigConnectorDefinitionsOps';
import { ownedObjectsHelp } from '../../../ops/ApplicationOwnedObjectsHelp';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';
import { withOptionAlias } from '../../OptionAlias';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull connector-definitions',
    [],
    deploymentTypes
  );

  program
    .description('Export connector definitions.')
    .addOption(
      withOptionAlias(
        new Option(
          '-i, --connector-id <id>',
          'Get the connector definition with the specified id, without the type prefix.'
        ),
        ['-n', '--name']
      )
    )
    .addHelpText('after', ownedObjectsHelp('connectors'))
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

      if (!(await getTokens(false, true, deploymentTypes))) {
        process.exitCode = 1;
        return;
      }
      verboseMessage(
        options.connectorId
          ? `Exporting connector definition for connector: "${options.connectorId}"`
          : 'Exporting all connector defitions.'
      );
      const outcome = await configManagerExportConnectorDefinitions(
        options.connectorId,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
