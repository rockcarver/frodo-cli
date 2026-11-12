import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { describeLogApiKey, describeLogApiKeys } from '../../ops/LogOps';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo log key describe',
    ['realm'],
    deploymentTypes
  );

  program
    .description('Describe log API keys.')
    .addOption(
      new Option(
        '-i, --key-id <key-id>',
        'Key id. Without it all the keys are described.'
      )
    )
    .addOption(new Option('--json', 'Output in JSON format.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Describe all log API keys of the tenant of a connection profile:\n` +
        c.command(`  $ frodo log key describe ${s.connId}\n`) +
        `  Describe the log API key '${s.logApiKeyId}' and print it in JSON format:\n` +
        c.command(
          `  $ frodo log key describe -i ${s.logApiKeyId} --json ${s.connId}\n`
        )
    )
    .action(
      // implement command logic inside action handler
      async (host, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          user,
          password,
          options,
          command
        );
        if (await getTokens(true, true, deploymentTypes)) {
          // the outcome decides the exit code (record 0033)
          let outcome: boolean;
          if (options.keyId) {
            verboseMessage(`Describing log API key ${options.keyId}...`);
            outcome = await describeLogApiKey(options.keyId, options.json);
          } else {
            verboseMessage('Describing log API keys...');
            outcome = await describeLogApiKeys(options.json);
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
