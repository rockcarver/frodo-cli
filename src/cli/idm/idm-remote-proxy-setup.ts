import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  checkSetupAllowed,
  DEFAULT_TIMEOUT_SECONDS,
  setupRemoteProxy,
} from '../../ops/RemoteProxyWorkflowOps';
import c from '../../utils/ColorTheme';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo idm remote-proxy setup',
    [],
    deploymentTypes
  );

  program
    .summary('Set up an IDM remote proxy between two tenants.')
    .description(
      'Set up an IDM remote proxy from this tenant to another one: the whole workflow in one command, between two saved connection profiles.\n\n' +
        'On the receiving tenant it creates an OAuth2 client with a generated secret and the static user mapping that lets the client act as the IDM administrator, which is admin-equivalent access. ' +
        'On this tenant it creates an ESV secret that holds the secret, an ESV variable that holds the host name of the receiving tenant, and the remote proxy, which refers to both by placeholder so that it can be promoted to another environment. ' +
        'It then applies the ESV changes, which restarts services and takes about three minutes (up to ten), and tests the proxy until it answers. ' +
        'The generated secret is never shown or logged.\n\n' +
        'It is safe to run again: it completes what is missing and leaves what exists as it is, except with --rotate-secret. It asks for confirmation before it starts.'
    )
    .addOption(
      new Option(
        '--target <host url>',
        'Host URL of the receiving tenant. The URL must resolve to an existing connection profile.'
      ).makeOptionMandatory()
    )
    .addOption(
      new Option(
        '-i, --proxy-id <proxy-id>',
        'Name of the remote proxy. Default: the name of the receiving tenant.'
      )
    )
    .addOption(
      new Option(
        '--client-id <client-id>',
        'OAuth2 client on the receiving tenant. Default: frodo-remote-proxy-<name of this tenant>.'
      )
    )
    .addOption(
      new Option(
        '--target-realm <realm>',
        'Realm of the OAuth2 client on the receiving tenant.'
      ).default('alpha', 'alpha')
    )
    .addOption(
      new Option(
        '--rotate-secret',
        'Write a new secret to the OAuth2 client and the ESV secret even if both exist. The proxy fails until the ESV changes are applied.'
      )
    )
    .addOption(
      new Option(
        '--no-apply',
        'Do not apply the ESV changes. Apply them with frodo esv apply, then check the proxy with frodo idm remote-proxy test.'
      )
    )
    .addOption(
      new Option(
        '--no-wait',
        "Don't wait for the ESV changes to finish applying and for the proxy to answer."
      )
    )
    .addOption(
      new Option(
        '--timeout <seconds>',
        'How long to wait for the ESV changes to apply and for the proxy to answer. Only effective without --no-wait.'
      ).default(
        DEFAULT_TIMEOUT_SECONDS,
        `${DEFAULT_TIMEOUT_SECONDS} secs (10 mins)`
      )
    )
    .addOption(
      new Option(
        '--dry-run',
        'Show what would be created on which tenant and change nothing.'
      )
    )
    .addOption(new Option('-y, --yes', 'Do not ask for confirmation.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Show what it would do to set up a remote proxy from the tenant ${s.connId} to the tenant ${s.connId2} (the proxy is named "${s.remoteProxyId}"):\n` +
        c.command(
          `  $ frodo idm remote-proxy setup --target ${s.amBaseUrl2} --dry-run ${s.amBaseUrl}\n`
        ) +
        `  Set it up without asking for confirmation, naming the proxy and its OAuth2 client:\n` +
        c.command(
          `  $ frodo idm remote-proxy setup --target ${s.connId2} -i ${s.remoteProxyId} --client-id ${s.remoteProxyClientId} -y ${s.connId}\n`
        ) +
        `  Leave the ESV changes unapplied, to apply them yourself later:\n` +
        c.command(
          `  $ frodo idm remote-proxy setup --target ${s.connId2} --no-apply -y ${s.connId}\n`
        ) +
        `  Write a new secret to the client and the ESV secret of an existing proxy, and wait up to 20 minutes for it to answer:\n` +
        c.command(
          `  $ frodo idm remote-proxy setup --target ${s.connId2} --rotate-secret --timeout 1200 -y ${s.connId}\n`
        )
    )
    .multiOp()
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
        if (!checkSetupAllowed(options)) {
          process.exitCode = 1;
          return;
        }
        if (await getTokens(false, true, deploymentTypes)) {
          const outcome = await setupRemoteProxy({
            target: options.target,
            proxyId: options.proxyId,
            clientId: options.clientId,
            targetRealm: options.targetRealm,
            rotateSecret: options.rotateSecret,
            apply: options.apply,
            wait: options.wait,
            timeout: Number(options.timeout),
            dryRun: options.dryRun,
            yes: options.yes,
            allowFailures: options.allowFailures,
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
