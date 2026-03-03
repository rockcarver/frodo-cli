import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { abortDirectConfigurationSession } from '../../ops/cloud/EnvDirectConfigurationSessionOps';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo direct-config-session abort',
    [],
    deploymentTypes
  );

  program
    .description('Abort a direct configuration session.')
    .addOption(new Option('--json', 'Output in JSON format.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Abort a direct configuration session with full tenant URL, username, and password:\n` +
        `  $ frodo direct-config-session abort ${s.amBaseUrl} ${s.username} '${s.password}'\n`[
          'brightCyan'
        ] +
        `  Abort a direct configuration session with connection ID:\n` +
        `  $ frodo direct-config-session abort ${s.connId}\n`['brightCyan'] +
        `  Abort a direct configuration session in JSON format with connection ID:\n` +
        `  $ frodo direct-config-session abort --json ${s.connId}\n`[
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
          const outcome = await abortDirectConfigurationSession(options.json);
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
