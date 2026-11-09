import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  importConnectorFromFile,
  importConnectorsFromFile,
  importConnectorsFromFiles,
  importFirstConnectorFromFile,
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
    'frodo connector import',
    [],
    deploymentTypes
  );

  program
    .description('Import IDM connectors.')
    .addOption(
      new Option(
        '-i, --connector-id <id>',
        'Connector id: import this one from the file given with -f. Cannot be used with -a or -A.'
      ).conflicts(['all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the import file. Without -i or -a the first connector of the file is imported. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Import all connectors from the file given with -f. Cannot be used with -i or -A.'
      ).conflicts(['connectorId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all connectors from separate files (*.connector.idm.json) in the current directory. Cannot be used with -i, -f or -a.'
      ).conflicts(['connectorId', 'file', 'all'])
    )
    .addOption(
      new Option(
        '--no-deps',
        'Do not import the mappings of the file with the connector. Only with -i or when the first connector is imported: importing all connectors never imports mappings.'
      )
    )
    .requireOneOf({
      options: ['file', 'allSeparate'],
      purpose: 'what to import',
    })
    .multiOp()
    .addHelpText(
      'after',
      `Importing a connector writes its configuration, including whether it is enabled. A secret that was encrypted for another tenant cannot be used here: use ESV placeholders such as &{esv.zion.directory.secret}.\n\n` +
        `Usage Examples:\n` +
        `  Import the connector '${s.connectorId}' and its mappings from a file:\n` +
        c.command(
          `  $ frodo connector import -i ${s.connectorId} -f ${s.connectorId}.connector.idm.json ${s.amBaseUrl}\n`
        ) +
        `  Import the first connector of a file, without its mappings:\n` +
        c.command(
          `  $ frodo connector import -f ${s.connectorId}.connector.idm.json --no-deps ${s.connId}\n`
        ) +
        `  Import all connectors from a single file:\n` +
        c.command(
          `  $ frodo connector import -a -f allConnectors.connector.idm.json ${s.connId}\n`
        ) +
        `  Import all connectors from separate files in the current directory:\n` +
        c.command(`  $ frodo connector import -A ${s.connId}\n`)
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
        if (await getTokens(false, true, deploymentTypes)) {
          let outcome: boolean;
          if (options.allSeparate) {
            verboseMessage(
              'Importing all connectors from separate files (*.connector.idm.json) in the current directory...'
            );
            outcome = await importConnectorsFromFiles(options.allowFailures);
          } else if (options.connectorId) {
            verboseMessage(`Importing connector ${options.connectorId}...`);
            outcome = await importConnectorFromFile(
              options.connectorId,
              options.file,
              options.deps
            );
          } else if (options.all) {
            verboseMessage(
              `Importing all connectors from a single file (${options.file})...`
            );
            outcome = await importConnectorsFromFile(
              options.file,
              options.allowFailures
            );
          } else {
            verboseMessage(
              `Importing the first connector from file "${options.file}"...`
            );
            outcome = await importFirstConnectorFromFile(
              options.file,
              options.deps
            );
          }
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
