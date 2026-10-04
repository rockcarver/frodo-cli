import { frodo } from '@rockcarver/frodo-lib';
import { configManagerExportTelemetry } from '../../../configManagerOps/FrConfigTelemetryOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull telemetry',
    [],
    deploymentTypes
  );
  program
    .description('Export telemetry exporters.')
    .option(
      '-c, --category <category>',
      'Telemetry category to export (e.g. otlp, splunk).'
    )
    .option('-n, --name <name>', 'Name of a single exporter to export.')
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );
      const getTokensIsSuccessful = await getTokens(
        false,
        true,
        deploymentTypes
      );
      if (!getTokensIsSuccessful) process.exit(1);
      verboseMessage('Exporting telemetry configuration.');
      const outcome = await configManagerExportTelemetry(
        options.category,
        options.name
      );
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
