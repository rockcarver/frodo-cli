import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerExportConnectorDefinitions } from '../../../configManagerOps/FrConfigConnectorDefinitionsOps';
import { ownedObjectsHelp } from '../../../ops/ApplicationOwnedObjectsHelp';
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
    'frodo config-manager pull connector-definitions',
    [],
    deploymentTypes
  );

  program
    .description('Export connector definitions.')
    .addOption(
      new Option(
        '-n, --name <connector-name>',
        'Get connector definition from specified name/id, without the type prefix.'
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
        options.name
          ? `Exporting connector definition for connector: "${options.name}"`
          : 'Exporting all connector defitions.'
      );
      const outcome = await configManagerExportConnectorDefinitions(
        options.name,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
