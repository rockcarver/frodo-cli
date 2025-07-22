import repl from 'node:repl';

import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import util from 'util';
import vm from 'vm';

import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { printMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

async function startRepl(allowAwait = false) {
  const baseConfig = {
    prompt: '> ',
    ignoreUndefined: true,
    useGlobal: true,
    useColors: true,
    writer: function (output) {
      // Check if the output is an object
      if (typeof output === 'object' && output !== null) {
        // Use util.inspect with desired depth
        return util.inspect(output, {
          depth: 10,
          colors: true,
          maxArrayLength: null,
        });
      }
      // For non-object outputs, return as is
      return output;
    },
  };

  const configWithoutAwait = {
    ...baseConfig,
    eval: async function myEval(cmd, context, _filename, callback) {
      callback(null, await vm.runInNewContext(cmd, context));
    },
  };

  const replServer = repl.start(allowAwait ? baseConfig : configWithoutAwait);

  replServer.context.frodoLib = frodo;
  replServer.context.frodo = frodo;
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
        `  Launch a frodo shell using a connection profile (identified by a unique substring of the AM base URL or a saved alias):\n` +
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
      printMessage(
        'Welcome to the interactive frodo shell!\nFor help type ".help", to quit shell type ".exit".\n\nType "frodo" to see a hierarchy of all available Frodo Library commands.\n\nSample commands:\n - "frodo.info.getInfo()" - prints information about the currently connected environment\n - "frodo.login.getTokens()" - gets fresh or cached tokens\n'
      );
      startRepl(options.allowAwait);
    });
  return program;
}
