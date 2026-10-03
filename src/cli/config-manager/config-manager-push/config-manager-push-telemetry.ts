import { frodo } from '@rockcarver/frodo-lib';
import { configManagerImportTelemetry } from '../../../configManagerOps/FrConfigTelemetryOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager push telemetry',
    [],
    deploymentTypes
  );
  program
    .description('Import telemetry exporters.')
    .option(
      '-c, --category <category>',
      'Telemetry category to import (otlp or splunk).'
    )
    .option(
      '-n, --name <name>',
      'Name of a single exporter to import. Requires --category.'
    )
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );
      if (options.name && !options.category) {
        printMessage(
          'Named telemetry config requires category (e.g. --category otlp)',
          'error'
        );
        process.exitCode = 1;
        program.help();
      }

      const getTokensIsSuccessful = await getTokens(
        false,
        true,
        deploymentTypes
      );
      if (!getTokensIsSuccessful) process.exit(1);
      verboseMessage('Importing telemetry.');
      const outcome = await configManagerImportTelemetry(
        options.category,
        options.name
      );
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
