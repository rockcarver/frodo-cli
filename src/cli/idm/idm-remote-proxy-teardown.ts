import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  checkTeardownAllowed,
  DEFAULT_TEARDOWN_TIMEOUT_SECONDS,
  teardownRemoteProxy,
} from '../../ops/RemoteProxyWorkflowOps';
import c from '../../utils/ColorTheme';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo idm remote-proxy teardown',
    [],
    deploymentTypes
  );

  program
    .summary('Take down an IDM remote proxy and what was set up for it.')
    .description(
      'Take down an IDM remote proxy and what frodo idm remote-proxy setup created for it, in the reverse order.\n\n' +
        'It cuts the access first: on the receiving tenant it deletes the static user mapping, which stops the proxy at once, and then the OAuth2 client. ' +
        'Deleting only the client would leave a proxy that already holds a token working until the token expires. ' +
        'Then, on this tenant, it deletes the remote proxy, the ESV variable and the ESV secret. IDM refuses to delete the variable for about a minute after the proxy is gone, so that delete is retried. ' +
        '--keep-client leaves the receiving tenant alone, which also leaves the access in place, and a client that another remote proxy still uses is kept. ' +
        "The receiving tenant is found from the host name the proxy's ESV variable holds, or given with --target.\n\n" +
        'It lists what it will delete and asks for confirmation. It is safe to run again: what is already gone is skipped.'
    )
    .addOption(
      new Option(
        '-i, --proxy-id <proxy-id>',
        'Remote proxy name.'
      ).makeOptionMandatory()
    )
    .addOption(
      new Option(
        '--target <host url>',
        'Host URL of the receiving tenant, if it cannot be found from the proxy. The URL must resolve to an existing connection profile.'
      ).conflicts(['keepClient'])
    )
    .addOption(
      new Option(
        '--keep-client',
        'Leave the receiving tenant alone: its OAuth2 client and static user mapping stay.'
      )
    )
    .addOption(
      new Option(
        '--timeout <seconds>',
        'How long to keep retrying the delete of the ESV secret and variable.'
      ).default(
        DEFAULT_TEARDOWN_TIMEOUT_SECONDS,
        `${DEFAULT_TEARDOWN_TIMEOUT_SECONDS} secs (5 mins)`
      )
    )
    .addOption(
      new Option(
        '--dry-run',
        'Show what would be deleted on which tenant and change nothing.'
      )
    )
    .addOption(
      new Option('-y, --yes', 'Do not ask for confirmation before deleting.')
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Show what it would delete to take down the remote proxy "${s.remoteProxyId}" of the tenant ${s.connId}:\n` +
        c.command(
          `  $ frodo idm remote-proxy teardown -i ${s.remoteProxyId} --dry-run ${s.amBaseUrl}\n`
        ) +
        `  Take it down without asking, naming the receiving tenant:\n` +
        c.command(
          `  $ frodo idm remote-proxy teardown -i ${s.remoteProxyId} --target ${s.connId2} -y ${s.connId}\n`
        ) +
        `  Take it down but leave the OAuth2 client on the receiving tenant:\n` +
        c.command(
          `  $ frodo idm remote-proxy teardown -i ${s.remoteProxyId} --keep-client -y ${s.connId}\n`
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
        if (!checkTeardownAllowed(options)) {
          process.exitCode = 1;
          return;
        }
        if (await getTokens(false, true, deploymentTypes)) {
          const outcome = await teardownRemoteProxy({
            proxyId: options.proxyId,
            target: options.target,
            keepClient: options.keepClient,
            timeout: Number(options.timeout),
            dryRun: options.dryRun,
            yes: options.yes,
          });
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
