import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { enableConnector } from '../../ops/ConnectorOps';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console';
import { parseSeconds } from '../../utils/SecondsOption';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo connector enable',
    [],
    deploymentTypes
  );

  program
    .description('Enable a connector (switch it on).')
    .addOption(
      new Option(
        '-i, --connector-id <id>',
        'Connector id: the name of the connector configuration without the provisioner.openicf/ prefix.'
      ).makeOptionMandatory()
    )
    .addOption(
      new Option(
        '--timeout <seconds>',
        'How long to wait, in seconds, for the connector to answer its connection test after it was switched on. 0 tests once. Without this option the library default applies (30 seconds).'
      ).argParser(parseSeconds)
    )
    .addHelpText(
      'after',
      `Enabling waits until the connector answers its connection test. To enable the connector of a provisioning application by the name of the application, use ${c.command('frodo app enable')}.\n\n` +
        `Usage Examples:\n` +
        `  Enable the connector '${s.connectorId}':\n` +
        c.command(
          `  $ frodo connector enable -i ${s.connectorId} ${s.amBaseUrl}\n`
        ) +
        `  Enable it and wait up to 60 seconds for it to answer:\n` +
        c.command(
          `  $ frodo connector enable -i ${s.connectorId} --timeout 60 ${s.connId}\n`
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
          verboseMessage('Enabling connector...');
          const outcome = await enableConnector(
            options.connectorId,
            options.timeout
          );
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
