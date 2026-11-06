import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { updateRemoteProxy } from '../../ops/RemoteProxyOps';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand, SecretOption } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo idm remote-proxy update',
    [],
    deploymentTypes
  );

  program
    .description(
      'Update properties of an IDM remote proxy. Properties that are not given stay as they are.'
    )
    .addOption(
      new Option(
        '-i, --proxy-id <proxy-id>',
        'Remote proxy name: the name of the receiving tenant.'
      ).makeOptionMandatory()
    )
    .addOption(
      new Option('--instance-url <url>', 'IDM URL of the receiving tenant.')
    )
    .addOption(
      new Option(
        '--basic-user-name <user-name>',
        'Basic authentication: user name.'
      )
    )
    .addOption(
      new SecretOption(
        '--basic-password [secret]',
        'Basic authentication: password. Prefer an ESV placeholder such as &{esv.zion.proxy.password}.'
      )
    )
    .addOption(
      new Option(
        '--client-id <client-id>',
        'Bearer authentication: OAuth2 client id on the receiving tenant.'
      )
    )
    .addOption(
      new SecretOption(
        '--client-secret [secret]',
        'Bearer authentication: client secret. Prefer an ESV placeholder such as &{esv.zion.proxy.secret}.'
      )
    )
    .addOption(
      new Option(
        '--token-endpoint <url>',
        'Bearer authentication: token endpoint of the receiving tenant.'
      )
    )
    .addOption(
      new Option(
        '--scope <scopes>',
        'Bearer authentication: scopes, separated by commas or spaces.'
      )
    )
    .addOption(
      new Option('--enabled', 'Enable the remote proxy.').conflicts([
        'disabled',
      ])
    )
    .addOption(
      new Option('--disabled', 'Disable the remote proxy.').conflicts([
        'enabled',
      ])
    )
    .requireOneOf({
      options: [
        'instanceUrl',
        'basicUserName',
        'basicPassword',
        'clientId',
        'clientSecret',
        'tokenEndpoint',
        'scope',
        'enabled',
        'disabled',
      ],
      purpose: 'what to change',
    })
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Disable the remote proxy "${s.remoteProxyId}":\n` +
        c.command(
          `  $ frodo idm remote-proxy update -i ${s.remoteProxyId} --disabled ${s.amBaseUrl}\n`
        ) +
        `  Point its client secret at another ESV secret:\n` +
        c.command(
          `  $ frodo idm remote-proxy update -i ${s.remoteProxyId} --client-secret '${s.remoteProxySecretPlaceholder}' ${s.connId}\n`
        ) +
        `  Change the instance URL and the scopes:\n` +
        c.command(
          `  $ frodo idm remote-proxy update -i ${s.remoteProxyId} --instance-url ${s.remoteProxyInstanceUrl} --scope 'fr:idm:*' ${s.connId}\n`
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
          verboseMessage(`Updating remote proxy "${options.proxyId}"...`);
          const outcome = await updateRemoteProxy(options.proxyId, options);
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
