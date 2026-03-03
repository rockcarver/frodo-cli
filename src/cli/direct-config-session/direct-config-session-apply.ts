import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { applyDirectConfigurationSession } from '../../ops/cloud/EnvDirectConfigurationSessionOps';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo direct-config-session apply',
    [],
    deploymentTypes
  );

  program
    .description('Apply configuration and end a direct configuration session.')
    .addOption(new Option('--json', 'Output in JSON format.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Apply configuration and end a direct configuration session with full tenant URL, username, and password:\n` +
        `  $ frodo direct-config-session apply ${s.amBaseUrl} ${s.username} '${s.password}'\n`[
          'brightCyan'
        ] +
        `  Apply configuration and end a direct configuration session with connection ID:\n` +
        `  $ frodo direct-config-session apply ${s.connId}\n`['brightCyan'] +
        `  Apply configuration and end a direct configuration session in JSON format with connection ID:\n` +
        `  $ frodo direct-config-session apply --json ${s.connId}\n`[
          'brightCyan'
        ]
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
          const outcome = await applyDirectConfigurationSession(options.json);
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
