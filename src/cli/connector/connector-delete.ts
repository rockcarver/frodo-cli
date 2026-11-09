import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteConnector, deleteConnectors } from '../../ops/ConnectorOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../utils/BulkDeleteGuard';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo connector delete',
    [],
    deploymentTypes
  );

  program
    .description('Delete IDM connectors.')
    .addOption(
      new Option(
        '-i, --connector-id <id>',
        'Connector id: the name of the connector configuration without the provisioner.openicf/ prefix. Cannot be used with -a.'
      ).conflicts(['all'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all connectors. Cannot be used with -i.'
      ).conflicts(['connectorId'])
    )
    .addOption(
      new Option(
        '--deep',
        'Delete the mappings of the connector too. Without it only the connector is deleted.'
      ).default(false, 'false')
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all connectors. Required with -a when there is no terminal.'
      )
    )
    .requireOneOf({
      options: ['all', 'connectorId'],
      purpose: 'what to delete',
    })
    .addHelpText(
      'after',
      `Deleting a connector removes its configuration, whether it is enabled or not and whether an application uses it or not. To switch a connector off instead, use ${c.command('frodo connector disable')}.\n\n` +
        `Usage Examples:\n` +
        `  Delete the connector '${s.connectorId}':\n` +
        c.command(
          `  $ frodo connector delete -i ${s.connectorId} ${s.amBaseUrl}\n`
        ) +
        `  Delete it with its mappings:\n` +
        c.command(
          `  $ frodo connector delete -i ${s.connectorId} --deep ${s.connId}\n`
        ) +
        `  Delete all connectors:\n` +
        c.command(`  $ frodo connector delete -a ${s.connId}\n`)
    )
    .multiOp()
    .action(
      // implement command logic inside action handler
      async (host, realm, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          realm,
          user,
          password,
          options,
          command
        );
        // a run that nobody can be asked about is refused before the login
        // (cli record 0037)
        if (
          options.all &&
          !checkBulkDelete({
            what: 'all connectors',
            yes: options.yes,
            dryRunAvailable: false,
          })
        ) {
          process.exitCode = 1;
          return;
        }
        // an unspecified -i gets a picker from the framework after the login
        // (decision record 0038), so the login comes first
        if (await getTokens(false, true, deploymentTypes)) {
          let outcome: boolean;
          if (options.connectorId) {
            verboseMessage(`Deleting connector ${options.connectorId}...`);
            outcome = await deleteConnector(options.connectorId, options.deep);
          } else {
            if (
              !(await confirmBulkDelete({
                what: 'all connectors',
                yes: options.yes,
                dryRunAvailable: false,
              }))
            ) {
              process.exitCode = 1;
              return;
            }
            verboseMessage('Deleting all connectors...');
            outcome = await deleteConnectors(
              options.deep,
              options.allowFailures
            );
          }
          if (!outcome) process.exitCode = 1;
        } else {
          // getTokens() failed, or the user declined the pick
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
