import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { FrodoCommand } from '../FrodoCommand';

const { DEPLOYMENT_TYPES } = frodo.utils.constants;

const deploymentTypes = DEPLOYMENT_TYPES;

export default function setup() {
  const program = new FrodoCommand('frodo something list', [], deploymentTypes);

  program
    .description('List something.')
    .addOption(
      new Option('-l, --long', 'Long with all fields.').default(false, 'false')
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Example command one with params and explanation what it does:\n` +
        `  $ frodo something ${s.amBaseUrl} ${s.username} '${s.password}'\n`[
          'brightCyan'
        ] +
        `  Example command two with params and explanation what it does:\n` +
        `  $ frodo something --sa-id ${s.saId} --sa-jwk-file ${s.saJwkFile} ${s.amBaseUrl}\n`[
          'brightCyan'
        ] +
        `  Example command three with params and explanation what it does:\n` +
        `  $ frodo something --sa-id ${s.saId} --sa-jwk-file ${s.saJwkFile} ${s.connId}\n`[
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
          // code goes here
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
