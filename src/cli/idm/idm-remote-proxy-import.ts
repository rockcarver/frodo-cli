import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  importFirstRemoteProxyFromFile,
  importRemoteProxiesFromFile,
  importRemoteProxiesFromFiles,
  importRemoteProxyFromFile,
} from '../../ops/RemoteProxyOps';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo idm remote-proxy import',
    [],
    deploymentTypes
  );

  program
    .description('Import IDM remote proxies.')
    .addOption(
      new Option(
        '-i, --proxy-id <proxy-id>',
        'Remote proxy name: import this one from the file given with -f. Cannot be used with -a or -A.'
      ).conflicts(['all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the import file. Without -i or -a the first remote proxy of the file is imported. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Import all remote proxies from the file given with -f. Cannot be used with -i or -A.'
      ).conflicts(['proxyId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all remote proxies from separate files (*.remoteproxy.idm.json) in the current directory. Cannot be used with -i, -f or -a.'
      ).conflicts(['proxyId', 'file', 'all'])
    )
    .requireOneOf({
      options: ['file', 'allSeparate'],
      purpose: 'what to import',
    })
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Import the remote proxy "${s.remoteProxyId}" from a file; a warning says when its secrets were encrypted for another tenant:\n` +
        c.command(
          `  $ frodo idm remote-proxy import -i ${s.remoteProxyId} -f ${s.remoteProxyId}.remoteproxy.idm.json ${s.amBaseUrl}\n`
        ) +
        `  Import the first remote proxy of a file:\n` +
        c.command(
          `  $ frodo idm remote-proxy import -f ${s.remoteProxyId}.remoteproxy.idm.json ${s.connId}\n`
        ) +
        `  Import all remote proxies from a single file:\n` +
        c.command(
          `  $ frodo idm remote-proxy import -a -f allRemoteProxies.remoteproxy.idm.json ${s.connId}\n`
        ) +
        `  Import all remote proxies from separate files in the current directory:\n` +
        c.command(`  $ frodo idm remote-proxy import -A ${s.connId}\n`)
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
          let outcome: boolean;
          if (options.allSeparate) {
            verboseMessage(
              'Importing all remote proxies from separate files (*.remoteproxy.idm.json) in the current directory...'
            );
            outcome = await importRemoteProxiesFromFiles();
          } else if (options.proxyId) {
            verboseMessage(`Importing remote proxy "${options.proxyId}"...`);
            outcome = await importRemoteProxyFromFile(
              options.proxyId,
              options.file
            );
          } else if (options.all) {
            verboseMessage(
              `Importing all remote proxies from a single file (${options.file})...`
            );
            outcome = await importRemoteProxiesFromFile(options.file);
          } else {
            verboseMessage(
              `Importing the first remote proxy from file "${options.file}"...`
            );
            outcome = await importFirstRemoteProxyFromFile(options.file);
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
