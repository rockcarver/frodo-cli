import { frodo } from '@rockcarver/frodo-lib';
import { configManagerImportTelemetry } from '../../../configManagerOps/FrConfigTelemetryOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';
import { selectorOption } from '../../SelectorOption';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config push telemetry',
    [],
    deploymentTypes
  );
  program
    .description('Import telemetry exporters.')
    .option(
      '-c, --category <category>',
      'Telemetry category to import (otlp or splunk).'
    )
    .addOption(
      selectorOption(
        '-i, --exporter-id <id>',
        'Id of a single exporter to import. Requires --category.',
        ['-n', '--name']
      )
    )
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
      if (options.exporterId && !options.category) {
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
      if (!getTokensIsSuccessful) {
        process.exitCode = 1;
        return;
      }
      verboseMessage('Importing telemetry.');
      const outcome = await configManagerImportTelemetry(
        options.category,
        options.exporterId,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
