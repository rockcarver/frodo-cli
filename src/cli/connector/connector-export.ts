import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportConnectorsToFile,
  exportConnectorsToFiles,
  exportConnectorToFile,
} from '../../ops/ConnectorOps';
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
    'frodo connector export',
    [],
    deploymentTypes
  );

  program
    .description('Export IDM connectors.')
    .addOption(
      new Option(
        '-i, --connector-id <id>',
        'Connector id: the name of the connector configuration without the provisioner.openicf/ prefix. Cannot be used with -a or -A.'
      ).conflicts(['all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the export file. Defaults to <id>.connector.idm.json for a connector and allConnectors.connector.idm.json for -a. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Export all connectors to a single file. Cannot be used with -i or -A.'
      ).conflicts(['connectorId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all connectors as separate files <id>.connector.idm.json. Cannot be used with -i, -f or -a.'
      ).conflicts(['connectorId', 'file', 'all'])
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
      )
    )
    .addOption(
      new Option(
        '--no-deps',
        'Do not include the mappings of the connector in the export. Only with -i: the export of all connectors never includes mappings.'
      )
    )
    .requireOneOf({
      options: ['all', 'allSeparate', 'connectorId'],
      purpose: 'what to export',
    })
    .addHelpText(
      'after',
      `The secrets in a connector configuration stay encrypted for the tenant they were exported from. Use ESV placeholders such as &{esv.zion.directory.secret} for a configuration that moves between tenants.\n\n` +
        `Usage Examples:\n` +
        `  Export the connector '${s.connectorId}' with its mappings to ${s.connectorId}.connector.idm.json:\n` +
        c.command(
          `  $ frodo connector export -i ${s.connectorId} ${s.amBaseUrl}\n`
        ) +
        `  Export it to a file of your choice, without its mappings:\n` +
        c.command(
          `  $ frodo connector export -i ${s.connectorId} -f my-connector.json --no-deps ${s.connId}\n`
        ) +
        `  Export all connectors to a single file:\n` +
        c.command(`  $ frodo connector export -a ${s.connId}\n`) +
        `  Export all connectors to separate files:\n` +
        c.command(`  $ frodo connector export -A ${s.connId}\n`) +
        `  Export all connectors without metadata:\n` +
        c.command(`  $ frodo connector export -a -N ${s.connId}\n`)
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
        // an unspecified -i gets a picker from the framework after the login
        // (decision record 0038), so the login comes first
        if (await getTokens(false, true, deploymentTypes)) {
          let outcome: boolean;
          if (options.connectorId) {
            verboseMessage(`Exporting connector ${options.connectorId}...`);
            outcome = await exportConnectorToFile(
              options.connectorId,
              options.file,
              options.metadata,
              options.deps
            );
          } else if (options.all) {
            verboseMessage('Exporting all connectors to a single file...');
            outcome = await exportConnectorsToFile(
              options.file,
              options.metadata
            );
          } else {
            verboseMessage('Exporting all connectors to separate files...');
            outcome = await exportConnectorsToFiles(
              options.metadata,
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
