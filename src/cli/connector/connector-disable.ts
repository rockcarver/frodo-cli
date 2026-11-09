import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { disableConnector } from '../../ops/ConnectorOps';
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
    'frodo connector disable',
    [],
    deploymentTypes
  );

  program
    .description('Disable a connector (switch it off).')
    .addOption(
      new Option(
        '-i, --connector-id <id>',
        'Connector id: the name of the connector configuration without the provisioner.openicf/ prefix.'
      ).makeOptionMandatory()
    )
    .addHelpText(
      'after',
      `To disable the connector of a provisioning application by the name of the application, use ${c.command('frodo app disable')}.\n\n` +
        `Usage Examples:\n` +
        `  Disable the connector '${s.connectorId}':\n` +
        c.command(
          `  $ frodo connector disable -i ${s.connectorId} ${s.amBaseUrl}\n`
        ) +
        `  Disable it using a connection profile:\n` +
        c.command(
          `  $ frodo connector disable -i ${s.connectorId} ${s.connId}\n`
        )
    )
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
        // an unspecified -i gets a picker from the framework after the login
        // (decision record 0038), so the login comes first
        if (await getTokens(false, true, deploymentTypes)) {
          verboseMessage('Disabling connector...');
          const outcome = await disableConnector(options.connectorId);
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
