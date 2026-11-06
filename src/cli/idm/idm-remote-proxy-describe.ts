import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { describeRemoteProxy } from '../../ops/RemoteProxyOps';
import c from '../../utils/ColorTheme';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo idm remote-proxy describe',
    [],
    deploymentTypes
  );

  program
    .description('Describe an IDM remote proxy.')
    .addOption(
      new Option(
        '-i, --proxy-id <proxy-id>',
        'Remote proxy name: the name of the receiving tenant.'
      ).makeOptionMandatory()
    )
    .addOption(new Option('--json', 'Output in JSON format.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Describe the remote proxy "${s.remoteProxyId}" and say which of its secrets only this tenant can use:\n` +
        c.command(
          `  $ frodo idm remote-proxy describe -i ${s.remoteProxyId} ${s.amBaseUrl}\n`
        ) +
        `  Describe it in JSON format, as IDM returns it:\n` +
        c.command(
          `  $ frodo idm remote-proxy describe -i ${s.remoteProxyId} --json ${s.connId}\n`
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
        if (await getTokens(false, true, deploymentTypes)) {
          const outcome = await describeRemoteProxy(
            options.proxyId,
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
