import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { testRemoteProxy } from '../../ops/RemoteProxyOps';
import c from '../../utils/ColorTheme';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo idm remote-proxy test',
    [],
    deploymentTypes
  );

  program
    .summary('Test an IDM remote proxy.')
    .description(
      'Test an IDM remote proxy.\n\n' +
        'Makes one read through the proxy to the receiving tenant. A working proxy answers with the identity and roles it is mapped to there, which shows that the token request, the static user mapping and the routing all work. A proxy that does not work is explained: the ESV changes it needs were not applied yet, the token request failed, or the static user mapping is missing. Nothing is changed.'
    )
    .addOption(
      new Option(
        '-i, --proxy-id <proxy-id>',
        'Remote proxy name.'
      ).makeOptionMandatory()
    )
    .addOption(new Option('--json', 'Output in JSON format.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Test the remote proxy "${s.remoteProxyId}" of the tenant:\n` +
        c.command(
          `  $ frodo idm remote-proxy test -i ${s.remoteProxyId} ${s.amBaseUrl}\n`
        ) +
        `  Show the result in JSON format:\n` +
        c.command(
          `  $ frodo idm remote-proxy test -i ${s.remoteProxyId} --json ${s.connId}\n`
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
          const outcome = await testRemoteProxy(options.proxyId, options.json);
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
