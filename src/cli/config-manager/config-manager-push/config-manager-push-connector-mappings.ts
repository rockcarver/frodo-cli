import { frodo } from '@rockcarver/frodo-lib';
import { configManagerImportMappings } from '../../../configManagerOps/FrConfigConnectorMappingOps';
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
    'frodo config push connector-mappings',
    [],
    deploymentTypes
  );

  program
    .description('Import connector mappings.')
    .addOption(
      selectorOption(
        '-i, --connector-mapping-id <id>',
        'Connector mapping id: the name of the mapping, without the sync/ prefix; imports only the connector mapping with the specified id.',
        ['-n', '--name']
      )
    )
    .addHelpText('after', ownedObjectsPushHelp('mappings'))
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
        verboseMessage('Importing connector mappings');
        const outcome = await configManagerImportMappings(
          options.connectorMappingId
        );
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
