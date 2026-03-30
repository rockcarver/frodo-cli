/* eslint-disable no-console */
import repl from 'node:repl';

import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import util from 'util';
import vm from 'vm';

import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  buildDocsByMethod,
  createFrodoCompleter,
  registerOpenParenHint,
} from '../../ops/ShellAutoCompleteOps';
import { createHelpContext } from '../../ops/ShellHelpOps';
import { ShellHistory } from '../../ops/ShellHistoryOps';
import { printMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

function printHintAbovePrompt(
  replServer: repl.REPLServer | undefined,
  hint: string
): void {
  if (!replServer) return;
  setImmediate(() => {
    process.stdout.write(`\n${hint}\n`);

    const refreshLine = (
      replServer as repl.REPLServer & {
        _refreshLine?: () => void;
      }
    )._refreshLine;

    if (typeof refreshLine === 'function') {
      refreshLine.call(replServer);
      return;
    }

    replServer.displayPrompt(true);
  });
}

async function startRepl(allowAwait = false, host?: string) {
  const docsByMethod = buildDocsByMethod(frodo);

  const rootBindings: Record<string, object> = {
    frodo,
    frodoLib: frodo,
  };

  // Forward reference: _replServer is assigned below, but the hint callback
  // fires via setImmediate so it is always defined by the time it runs.
  // eslint-disable-next-line prefer-const
  let _replServer: repl.REPLServer | undefined;
  const completer = createFrodoCompleter(rootBindings, docsByMethod, (hint) => {
    printHintAbovePrompt(_replServer, hint);
  });

  const baseConfig = {
    prompt: '> ',
    ignoreUndefined: true,
    useGlobal: true,
    useColors: true,
    completer,
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

  _replServer = repl.start(allowAwait ? baseConfig : configWithoutAwait);
  const replServer = _replServer;

  replServer.context.frodoLib = frodo;
  replServer.context.frodo = frodo;

  // Inject the help() function, which surfaces type signatures and JSDoc from
  // the frodo-lib type definitions so users can explore the API without leaving
  // the shell.
  const { help } = createHelpContext(frodo);
  replServer.context.help = help;

  // Register keypress hint: prints a typed-signature comment above the prompt
  // when '(' is typed after a known frodo method path.
  registerOpenParenHint(replServer, rootBindings, docsByMethod, (hint) => {
    printHintAbovePrompt(replServer, hint);
  });

  // Set up persistent shell history per connection profile/host
  const shellHistory = new ShellHistory(host);
  (replServer as any).history = shellHistory.getLines();

  // Register .history dot-command to print, clear, or trim command history.
  // Subcommands are passed as the text argument after the dot-command name:
  //   .history           -> print full history (oldest first)
  //   .history clear     -> delete all history
  //   .history trim <n>  -> keep only the last n commands
  replServer.defineCommand('history', {
    help: 'Manage command history: .history | .history clear | .history trim <n>',
    action(text: string) {
      const args = text.trim().split(/\s+/);
      const sub = args[0];

      if (!sub) {
        // Print history oldest-first
        const hist = [...(replServer as any).history].reverse();
        if (hist.length === 0) {
          console.log('No history yet.');
        } else {
          hist.forEach((line: string, i: number) =>
            console.log(`  ${String(i + 1).padStart(4)}  ${line}`)
          );
        }
      } else if (sub === 'clear') {
        (replServer as any).history = [];
        shellHistory.setLinesFromNewest([]);
        console.log('History cleared.');
      } else if (sub === 'trim') {
        const n = parseInt(args[1], 10);
        if (isNaN(n) || n < 0) {
          console.log('Usage: .history trim <n>  (e.g. .history trim 50)');
        } else {
          (replServer as any).history = (replServer as any).history.slice(0, n);
          shellHistory.setLinesFromNewest((replServer as any).history);
          console.log(
            `History trimmed to last ${(replServer as any).history.length} command(s).`
          );
        }
      } else {
        console.log('Usage: .history | .history clear | .history trim <n>');
      }

      this.displayPrompt();
    },
  });

  // Override the built-in .help to include frodo context alongside the
  // standard dot-command listing. defineCommand('help', ...) replaces the
  // default handler; we reconstruct the commands list from replServer.commands.
  replServer.defineCommand('help', {
    help: 'Show this help (frodo context + dot-commands)',
    action() {
      const BOLD = '\x1b[1m';
      const RESET = '\x1b[0m';
      const CYAN = '\x1b[36m';
      const GREEN = '\x1b[32m';
      const DIM = '\x1b[2m';

      console.log(`${BOLD}${CYAN}Frodo Interactive Shell${RESET}`);
      console.log('');
      console.log(`${BOLD}Explore the Frodo API:${RESET}`);
      console.log(
        `  ${GREEN}help()${RESET}  ${DIM}browse all modules and methods${RESET}`
      );
      console.log(
        `  ${GREEN}help(frodo.<module>)${RESET}  ${DIM}list all methods in module X${RESET}`
      );
      console.log(
        `  ${GREEN}help(frodo.<module>.<method>)${RESET}  ${DIM}show full signature and docs${RESET}`
      );
      console.log(
        `  ${GREEN}help("methodName")${RESET}  ${DIM}search for a method across all modules${RESET}`
      );
      console.log('');
      console.log(`${BOLD}Sample commands:${RESET}`);
      console.log(
        `  ${GREEN}frodo.info.getInfo()${RESET}  ${DIM}print info about the connected environment${RESET}`
      );
      console.log(
        `  ${GREEN}frodo.login.getTokens()${RESET}  ${DIM}get fresh or cached tokens${RESET}`
      );
      console.log(
        `  ${GREEN}frodo${RESET}  ${DIM}show a hierarchy of all Frodo Library commands${RESET}`
      );
      console.log('');
      console.log(`${BOLD}Shell dot-commands:${RESET}`);
      const commands = (replServer as any).commands as Record<
        string,
        { help?: string }
      >;
      for (const name of Object.keys(commands).sort()) {
        const helpText = commands[name]?.help ?? '';
        console.log(`  ${GREEN}.${name}${RESET}  ${DIM}${helpText}${RESET}`);
      }

      this.displayPrompt();
    },
  });

  // Down-to-stash: when Down is pressed on a fresh, unexecuted draft at the
  // current-input position, save the draft to history and clear it. While the
  // user is actively traversing history with Up/Down, preserve readline's
  // native history behavior and do not stash.
  let historyNavigationActive = false;
  process.stdin.on('keypress', (_char, key) => {
    const rl = replServer as unknown as Record<string, unknown>;
    const currentHistIdx = (rl['_historyIndex'] as number) ?? -1;

    if (
      key?.name === 'down' &&
      !historyNavigationActive &&
      currentHistIdx === -1
    ) {
      const currentLine = replServer.line ?? '';
      if (currentLine.trim().length > 0) {
        const replHistory = (rl['history'] as string[]) ?? [];
        if (replHistory[0] !== currentLine) {
          replHistory.unshift(currentLine);
          shellHistory.addLine(currentLine);
        }

        // Move to end-of-line then kill to start, ensuring a full clear
        // regardless of where the cursor currently sits.
        replServer.write(null, { ctrl: true, name: 'e' });
        replServer.write(null, { ctrl: true, name: 'u' });
      }
    }

    if (key?.name === 'up' || key?.name === 'down') {
      historyNavigationActive = true;
      return;
    }

    if (key?.name === 'return' || key?.name === 'enter') {
      historyNavigationActive = false;
      return;
    }

    if (key?.ctrl || key?.meta || typeof key?.name === 'string') {
      historyNavigationActive = false;
    }
  });

  // Listen for new commands and persist them to history
  replServer.on('line', (line: string) => {
    shellHistory.addLine(line);
  });

  // Ensure history is saved when the REPL closes
  replServer.on('exit', () => {
    shellHistory.save();
  });
}

export default function setup() {
  const program = new FrodoCommand('shell').withStability('experimental');
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
        'Welcome to the interactive frodo shell!\nFor help type ".help", to quit shell type ".exit".\n\nType "frodo" to see a hierarchy of all available Frodo Library commands.\n\nType "help()" to explore the Frodo API with full signatures and documentation:\n - "help(frodo.info)" - list all methods in the info module\n - "help(frodo.info.getInfo)" - show signature and docs for getInfo\n - "help(\\"methodName\\")" - search for a method across all modules\n\nSample commands:\n - "frodo.info.getInfo()" - prints information about the currently connected environment\n - "frodo.login.getTokens()" - gets fresh or cached tokens\n'
      );
      startRepl(options.allowAwait, host);
    });
  return program;
}
