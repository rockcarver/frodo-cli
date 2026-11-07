import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { createRemoteProxy } from '../../ops/RemoteProxyOps';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand, SecretOption } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo idm remote-proxy create',
    [],
    deploymentTypes
  );

  program
    .summary('Create an IDM remote proxy.')
    .description(
      'Create an IDM remote proxy.\n\n' +
        'Choose a name that tells the remote environment apart. The tenant name in its URL is a good choice: ' +
        `for ${new URL(s.amBaseUrl2).origin}/ that is "${s.remoteProxyId}". ` +
        'The name is the id of the proxy configuration (external.idm/<proxy-id>) and the part of the URL that reaches the receiving tenant: /openidm/external/idm/<proxy-id>/.'
    )
    .addOption(
      new Option(
        '-i, --proxy-id <proxy-id>',
        'Remote proxy name. Letters, digits, ".", "_" and "-".'
      ).makeOptionMandatory()
    )
    .addOption(
      new Option('--auth-type <type>', 'How the proxy authenticates.')
        .choices(['basic', 'bearer'])
        .makeOptionMandatory()
    )
    .addOption(
      new Option(
        '--instance-url <url>',
        'IDM URL of the receiving tenant, for example https://openam-zion.id.forgerock.io/openidm/.'
      ).makeOptionMandatory()
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
    .addOption(new Option('--disabled', 'Create the remote proxy disabled.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Create a remote proxy that authenticates to "${s.remoteProxyId}" with an OAuth2 client, its secret an ESV placeholder:\n` +
        c.command(
          `  $ frodo idm remote-proxy create -i ${s.remoteProxyId} --auth-type bearer --instance-url ${s.remoteProxyInstanceUrl} --client-id ${s.remoteProxyClientId} --client-secret '${s.remoteProxySecretPlaceholder}' --token-endpoint ${s.remoteProxyTokenEndpoint} --scope 'fr:idm:*' ${s.amBaseUrl}\n`
        ) +
        `  Create one that uses basic authentication, disabled until you need it:\n` +
        c.command(
          `  $ frodo idm remote-proxy create -i ${s.remoteProxyId} --auth-type basic --instance-url ${s.remoteProxyInstanceUrl} --basic-user-name ${s.remoteProxyClientId} --basic-password '&{esv.zion.proxy.password}' --disabled ${s.connId}\n`
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
          verboseMessage(`Creating remote proxy "${options.proxyId}"...`);
          const outcome = await createRemoteProxy(options.proxyId, options);
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
