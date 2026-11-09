import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { describeConnector } from '../../ops/ConnectorOps';
import c from '../../utils/ColorTheme';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo connector describe',
    [],
    deploymentTypes
  );

  program
    .description('Describe an IDM connector.')
    .addOption(
      new Option(
        '-i, --connector-id <id>',
        'Connector id: the name of the connector configuration without the provisioner.openicf/ prefix.'
      ).makeOptionMandatory()
    )
    .addOption(
      new Option(
        '--json',
        'Output the whole configuration in JSON format, as IDM keeps it (secrets stay encrypted).'
      )
    )
    .addHelpText(
      'after',
      `The table leaves the configuration properties out, because that is where the secrets of a connector are.\n\n` +
        `Usage Examples:\n` +
        `  Describe the connector '${s.connectorId}':\n` +
        c.command(
          `  $ frodo connector describe -i ${s.connectorId} ${s.amBaseUrl}\n`
        ) +
        `  Print its whole configuration in JSON format:\n` +
        c.command(
          `  $ frodo connector describe -i ${s.connectorId} --json ${s.connId}\n`
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
          const outcome = await describeConnector(
            options.connectorId,
            options.json
          );
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
