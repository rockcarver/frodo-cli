import { frodo } from '@rockcarver/frodo-lib';
import { configManagerImportConnectors } from '../../../configManagerOps/FrConfigConnectorDefinitionsOps';
import { ownedObjectsPushHelp } from '../../../ops/ApplicationOwnedObjectsHelp';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';
import { selectorOption } from '../../SelectorOption';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager push connectors',
    [],
    deploymentTypes
  );

  program
    .description('Import connector definitions.')
    .addOption(
      selectorOption(
        '-i, --connector-id <id>',
        'Connector definition id, without the type prefix; imports only the specified connector definition.',
        ['-n', '--name']
      )
    )
    .addHelpText('after', ownedObjectsPushHelp('connectors'))
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

      if (await getTokens(false, true, deploymentTypes)) {
        verboseMessage('Importing connector definitions');
        const outcome = await configManagerImportConnectors(
          options.connectorId,
          options.allowFailures
        );
        if (!outcome) process.exitCode = 1;
      } else {
        process.exitCode = 1;
      }
    });

  return program;
}
