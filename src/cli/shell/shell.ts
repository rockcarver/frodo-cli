import repl from 'node:repl';

import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import vm from 'vm';

import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { FrodoCommand } from '../FrodoCommand';

async function startRepl(allowAwait = false) {
  const baseConfig = {
    prompt: '> ',
    ignoreUndefined: true,
    useGlobal: true,
  };

  const configWithoutAwait = {
    ...baseConfig,
    eval: async function myEval(cmd, context, _filename, callback) {
      callback(null, await vm.runInNewContext(cmd, context));
    },
  };

  const replServer = repl.start(allowAwait ? baseConfig : configWithoutAwait);

  replServer.context.frodoLib = frodo;
}

export default function setup() {
  const program = new FrodoCommand('shell');
  program
    .description('Launch the frodo interactive shell.')
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Launch a frodo shell using explicit login parameters:\n` +
        `  $ frodo shell ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`[
          'brightCyan'
        ] +
        `  Launch a frodo shell using a connection profile (identified by the full AM base URL):\n` +
        `  $ frodo shell ${s.amBaseUrl}\n`['brightCyan'] +
        `  Launch a frodo shell using a connection profile (identified by a unique substring of the AM base URL):\n` +
        `  $ frodo shell ${s.connId}\n`['brightCyan']
    )
    .addOption(
      new Option(
        '--allow-await',
        'Allows top-level awaits to be used in the shell.'
      )
    )
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );
      if (host) await getTokens();
      startRepl(options.allowAwait);
    });
  return program;
}
