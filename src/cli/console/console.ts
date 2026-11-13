/* eslint-disable no-console */
import repl from 'node:repl';
import util from 'util';
import { state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  createFrodoCompleter,
  registerOpenParenHint,
} from '../../ops/ShellAutoCompleteOps';
import {
  createConsoleBindings,
  installConsoleContext,
} from '../../ops/ShellContextOps';
import {
  collapsedPreview,
  createObjectViewer,
  isCollapsibleResult,
  isExplorableValue,
} from '../../ops/ShellExploreOps';
import { ShellHistory } from '../../ops/ShellHistoryOps';
import { createConsoleInput } from '../../ops/ShellHistorySearchOps';
import { createLogBus, startWebConsole } from '../../ops/ShellWebServerOps';
import c from '../../utils/ColorTheme';
import { printMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const DIM_HINT = '\x1b[2m';
const RESET_HINT = '\x1b[0m';

/**
 * The editor the web page loads from a CDN, pinned to exact files with their
 * content hashes (the integrity attribute): the browser refuses anything the
 * CDN serves but these bytes, and the CSP names only these URLs. The page
 * keeps its plain textarea whenever the scripts do not arrive, so an offline
 * start loses polish, not function. Changing a URL means recomputing the
 * hash of the new file.
 */
const WEB_EDITOR_ASSETS = {
  styles: [
    {
      url: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.20/codemirror.min.css',
      integrity:
        'sha384-zaeBlB/vwYsDRSlFajnDd7OydJ0cWk+c2OWybl3eSUf6hW2EbhlCsQPqKr3gkznT',
    },
  ],
  scripts: [
    {
      url: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.20/codemirror.min.js',
      integrity:
        'sha384-C7K/Pjo6rtJFtYWv792/hBOrCLhjcAa319ZhwjrDE8zCMEWglI7+S1CUEKD+q6uF',
    },
    {
      url: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.20/mode/javascript/javascript.min.js',
      integrity:
        'sha384-g0o+WW9mdIxA7LaaCKTkRm0M5TVT+Bb4s9eocxPsI2G0Xm0POG9iD6G6qP1IIsfS',
    },
  ],
};

/**
 * Render a result the way the browser console shows one by default:
 * collapsed. Every container prints as a one-line summary with its nested
 * containers collapsed too (`{users: Array(2), meta: {…}}`), and when the
 * line leaves anything out, a dim hint says how to open the full tree.
 */
function formatResult(output: unknown): string {
  if (!isCollapsibleResult(output)) {
    return util.inspect(output, {
      depth: 2,
      colors: true,
      maxStringLength: 200,
    });
  }
  const { text, hidden } = collapsedPreview(output as object, {
    maxKeys: 6,
    maxItems: 6,
    colors: true,
  });
  return hidden
    ? `${text}\n${DIM_HINT}▸ Ctrl+O (or .explore) to expand${RESET_HINT}`
    : text;
}

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

/**
 * Web mode: evaluate in Node, show in the browser. The terminal keeps
 * running only to print the sign-in link and to stop the server on Ctrl+C.
 */
async function startWebMode(host?: string): Promise<void> {
  const logs = createLogBus();
  // Each browser tab gets its own engine process (its own frodo-lib state,
  // REPL world and history), so two tabs can work in two environments at
  // once. The tab connects itself: from the page's profile picker, or
  // straight away when a host was named on the command line (the worker
  // reads FRODO_CONSOLE_HOST).
  process.env.FRODO_CONSOLE_HOST = host ?? '';
  const web = await startWebConsole({
    logs,
    sessionInfo: () => ({
      host: state.getHost(),
      realm: state.getRealm(),
      username: state.getUsername(),
      deploymentType: state.getDeploymentType(),
    }),
    assets: WEB_EDITOR_ASSETS,
    contentSecurityPolicy: {
      scripts: WEB_EDITOR_ASSETS.scripts.map((a) => a.url),
      styles: WEB_EDITOR_ASSETS.styles.map((a) => a.url),
    },
  });
  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    printMessage(`\n${signal}: closing the web console.`);
    await web.close();
    // Tab engines are children of this process; closing the server kills
    // them through closeAllConnections and their own exit handling.
    // Nothing keeps the event loop alive now, so the process ends and the
    // pending output (record 0033) is flushed first.
  };
  process.once('SIGINT', () => void stop('Ctrl+C'));
  process.once('SIGTERM', () => void stop('SIGTERM'));
  // A closed terminal window sends SIGHUP. Without this the default is
  // process death, which is fine, but Node ignores SIGHUP when a handler
  // for it would keep cleanups running; handle it so the worker children
  // and the listening socket are torn down the same way Ctrl+C does.
  process.once('SIGHUP', () => void stop('terminal closed'));

  printMessage(
    'The frodo JS console is running in your browser.\n' +
      'Open this link to sign in (it works once):\n' +
      `\n  ${web.launchUrl}\n\n` +
      'The console runs on your machine with the credentials of this ' +
      'environment; anyone with access to this computer can use it through ' +
      'the browser tab. Ctrl+C here stops it.\n'
  );
  // Keep the process alive while the server listens; the exit handlers above
  // own the shutdown.
  await new Promise<never>(() => undefined);
}

async function startConsole(host?: string): Promise<void> {
  const bindings = createConsoleBindings();
  const { shellRest, rootBindings, docsByMethod } = bindings;

  // The interactive object explorer (Ctrl+O / explore()): a full-screen
  // collapsible tree over the last result or any value. Its io routes bytes
  // through the console's input filter, so the REPL never sees viewer
  // keystrokes.
  let lastResult: unknown;
  const viewer = createObjectViewer({
    subscribe(handler) {
      viewerActive = handler !== null;
      viewerChunkSink = handler;
    },
    write(text) {
      process.stdout.write(text);
    },
    width: () => process.stdout.columns ?? 80,
    height: () => process.stdout.rows ?? 24,
    restorePrompt() {
      // The viewer erased its region and left the cursor on the prompt row;
      // readline redraws the prompt and the draft line there.
      const server = replServer as
        (repl.REPLServer & { _refreshLine?: () => void }) | undefined;
      if (typeof server?._refreshLine === 'function') {
        server._refreshLine();
      } else {
        server?.displayPrompt(true);
      }
    },
  });
  let viewerActive = false;
  let viewerChunkSink: ((chunk: Buffer) => void) | null = null;

  // The value Ctrl+O, `.explore` and a bare `explore()` open: the last
  // displayed result, else the last REST response body (var assignments
  // print nothing, so they never become the last displayed result).
  const pickLastExplorable = (): unknown => {
    if (isExplorableValue(lastResult)) return lastResult;
    const body = shellRest.last?.data;
    return isExplorableValue(body) ? body : undefined;
  };

  // The console's input stream: sits between process.stdin and the REPL so
  // Ctrl+R opens the fuzzy history search instead of readline's built-in
  // reverse search (which cannot be unbound), and Ctrl+O opens the explorer.
  const consoleInput = createConsoleInput(
    () => (replServer as unknown as { history: string[] }).history,
    {
      wantsInput: () => viewerActive,
      handle: (chunk: Buffer) => viewerChunkSink?.(chunk),
      openLast: () => {
        const candidate = pickLastExplorable();
        if (candidate === undefined) {
          printHintAbovePrompt(
            replServer,
            `${DIM_HINT}Nothing to explore yet: run an expression that returns an object or array first.${RESET_HINT}`
          );
          return;
        }
        // The prompt is on screen above the region: draw below it and put
        // the prompt back when the viewer closes.
        void viewer.explore(candidate, { atPrompt: true });
      },
    }
  );

  // Forward reference: replServer is assigned below, but the completer's
  // hint callback fires via setImmediate so it is always defined by the time
  // it runs.
  // eslint-disable-next-line prefer-const
  let replServer: repl.REPLServer | undefined;
  const completer = createFrodoCompleter(
    rootBindings,
    docsByMethod,
    (hint) => {
      printHintAbovePrompt(replServer, hint);
    },
    // The live context: what the user defined completes too.
    () => replServer?.context as Record<string, unknown> | undefined
  );

  const started = repl.start({
    prompt: 'frodo> ',
    ignoreUndefined: true,
    useColors: true,
    completer,
    terminal: true,
    input: consoleInput.input,
    output: process.stdout,
    writer(output: unknown) {
      // Remember the last displayed value for Ctrl+O / explore(). Promises
      // are skipped: the writer sees the promise, not its resolved value.
      if (!util.types.isPromise(output)) {
        lastResult = output;
      }
      return formatResult(output);
    },
    // The default eval is kept deliberately: it supports top-level await
    // natively and persists let/const across lines, which is what gives the
    // browser-console feel (the older frodo shell needed --allow-await and
    // a vm-based eval for the first of these and got neither for the second).
  });
  replServer = started;
  consoleInput.attachHooks({
    getLine: () => started.line,
    setLine: (line: string) => {
      (started as unknown as { line: string }).line = line;
    },
    refresh: () => {
      const refreshLine = (
        started as repl.REPLServer & { _refreshLine?: () => void }
      )._refreshLine;
      if (typeof refreshLine === 'function') {
        refreshLine.call(started);
      } else {
        started.displayPrompt(true);
      }
    },
    sendEscape: () => {
      consoleInput.input.write('\x1b');
    },
    onKeypress: (listener) => {
      const wrapped = (
        _char: string,
        key: { ctrl?: boolean; name?: string } | undefined
      ) => {
        listener(key ?? {});
      };
      started.input.on('keypress', wrapped);
    },
  });
  consoleInput.install();

  const context = started.context;
  // The names scripts use, and frodo-lib's debug/verbose/curlirize output,
  // land in the console (stdout): the Node.js REPL drives its terminal
  // through stdout via readline, so text written only to stderr may not be
  // visible inside the interactive console.
  installConsoleContext(context, bindings, {
    write: (text) => started.output.write(text),
    colors: true,
  });
  // Interactive explorer for any value; with no argument, the last result.
  // Awaits until the viewer closes, so `await explore(x)` returns cleanly.
  context.explore = (...args: unknown[]) => {
    const value = args.length > 0 ? args[0] : pickLastExplorable();
    if (!isExplorableValue(value)) {
      return Promise.resolve(
        args.length > 0
          ? 'Only objects and arrays can be explored.'
          : 'Nothing to explore yet: run an expression that returns an object or array first.'
      );
    }
    return viewer.explore(value);
  };

  // Fallback for terminals or multiplexers that swallow Ctrl+O.
  started.defineCommand('explore', {
    help: 'Explore the last result as a collapsible tree (same as Ctrl+O)',
    action() {
      const value = pickLastExplorable();
      if (value === undefined) {
        started.output.write(
          `${DIM_HINT}Nothing to explore yet: run an expression that returns an object or array first.${RESET_HINT}\n`
        );
        started.displayPrompt();
        return;
      }
      void viewer.explore(value).then(() => started.displayPrompt());
    },
  });

  // How tall the Ctrl+O tree may be. The default suits most terminals; a
  // taller tree shows more rows at once but pushes more of the screen up.
  started.defineCommand('treerows', {
    help: 'Show or set the most rows the Ctrl+O tree uses: .treerows [n]',
    action(text: string) {
      const arg = text.trim();
      if (arg === '') {
        started.output.write(
          `Tree height: up to ${viewer.currentBodyRows()} rows on this terminal. Set with .treerows <n>.\n`
        );
      } else {
        const requested = Number.parseInt(arg, 10);
        if (!Number.isFinite(requested) || requested < 3) {
          started.output.write('Usage: .treerows [n]  (n is at least 3)\n');
        } else {
          const effective = viewer.setMaxBodyRows(requested);
          started.output.write(
            effective < requested
              ? `Tree height set to ${requested}, limited to ${effective} rows by this terminal's height.\n`
              : `Tree height set to ${effective} rows.\n`
          );
        }
      }
      started.displayPrompt();
    },
  });

  // Typed-signature hint when '(' is typed after a known method path.
  registerOpenParenHint(started, rootBindings, docsByMethod, (hint) => {
    printHintAbovePrompt(started, hint);
  });

  // Persistent history per connection profile/host.
  const shellHistory = new ShellHistory(host);
  (started as unknown as { history: string[] }).history = shellHistory.getLines(
    { singleLineOnly: true }
  );

  // Persist executed lines.
  started.on('line', (line: string) => {
    if (line.trim().length > 0) {
      shellHistory.addLine(line);
    }
  });

  started.on('exit', () => {
    shellHistory.save();
    consoleInput.close();
  });

  // Override the built-in .help to include console context alongside the
  // standard dot-command listing.
  started.defineCommand('help', {
    help: 'Show this help (console context + dot-commands)',
    action() {
      printConsoleHelp(started);
    },
  });
}

function printConsoleHelp(replServer: repl.REPLServer): void {
  const BOLD = '\x1b[1m';
  const RESET = '\x1b[0m';
  const CYAN = '\x1b[36m';
  const GREEN = '\x1b[32m';
  const DIM = '\x1b[2m';

  console.log(`${BOLD}${CYAN}Frodo JS Console${RESET}`);
  console.log('');
  console.log(
    `${BOLD}REST calls (authentication attached automatically):${RESET}`
  );
  console.log(
    `  ${GREEN}$.get('/openidm/managed/alpha_user?_queryFilter=userName eq "bjensen"')${RESET}`
  );
  console.log(
    `  ${GREEN}$.post(url, data)${RESET}  ${DIM}also $.put, $.patch, $.delete, $.head${RESET}`
  );
  console.log(
    `  ${GREEN}$.ajax({url, method, data, headers})${RESET}  ${DIM}full control${RESET}`
  );
  console.log(
    `  ${GREEN}$.last${RESET}  ${DIM}status, headers and body of the last response${RESET}`
  );
  console.log(
    `  ${DIM}URLs starting /openidm go to IDM, /am goes to AM; other relative paths go to IDM.${RESET}`
  );
  console.log('');
  console.log(`${BOLD}Explore the frodo API:${RESET}`);
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
  console.log(`${BOLD}Exploring results:${RESET}`);
  console.log(
    `  ${GREEN}Ctrl+O${RESET}  ${DIM}open the last result as a collapsible tree under the prompt${RESET}`
  );
  console.log(
    `  ${GREEN}.explore${RESET}  ${DIM}same as Ctrl+O, for terminals that swallow the key${RESET}`
  );
  console.log(
    `  ${GREEN}await explore(value)${RESET}  ${DIM}explore any value; explore() with no argument opens the last result${RESET}`
  );
  console.log(
    `  ${DIM}Arrows move, right/Enter expands, left collapses. Esc closes and keeps the view in your scrollback; q or Ctrl+O closes and erases it.${RESET}`
  );
  console.log('');
  console.log(`${BOLD}History:${RESET}`);
  console.log(
    `  ${GREEN}Ctrl+R${RESET}  ${DIM}fuzzy-search history; Ctrl+R cycles matches, Enter runs, Esc cancels${RESET}`
  );
  console.log('');
  console.log(`${BOLD}Shell dot-commands:${RESET}`);
  const commands = (
    replServer as unknown as {
      commands: Record<string, { help?: string }>;
    }
  ).commands;
  for (const name of Object.keys(commands).sort()) {
    const helpText = commands[name]?.help ?? '';
    console.log(`  ${GREEN}.${name}${RESET}  ${DIM}${helpText}${RESET}`);
  }

  replServer.displayPrompt();
}

export default function setup() {
  // The console runs without a connection: the terminal console works
  // bare, and --web picks its environment in the page's profile picker.
  const program = new FrodoCommand('console')
    .withStability('experimental')
    .runsUnconnected();
  program
    .description(
      'Launch the frodo JS console, a browser-console-style environment for running JavaScript and REST calls against the connected environment.'
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Launch a JS console using explicit login parameters:\n` +
        c.command(
          `  $ frodo console ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        ) +
        `  Launch a JS console using a connection profile (identified by the full AM base URL):\n` +
        c.command(`  $ frodo console ${s.amBaseUrl}\n`) +
        `  Launch a JS console using a connection profile (identified by a unique substring of the AM base URL or a saved alias):\n` +
        c.command(`  $ frodo console ${s.connId}\n`) +
        `  Serve the same console as a local web page (a one-time sign-in link is printed):\n` +
        c.command(`  $ frodo console ${s.amBaseUrl} --web\n`)
    )
    .addOption(
      new Option(
        '--web',
        'Serve the JS console as a local web page and open it in a browser.'
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
      if (host) {
        const loggedIn = await getTokens();
        if (!loggedIn) {
          process.exitCode = 1;
          return;
        }
      }
      if (options.web) {
        await startWebMode(host);
        return;
      }
      printMessage(
        'Welcome to the frodo JS console!\nType "$" REST calls or frodo API expressions; ".help" for help, ".exit" to quit.\n'
      );
      await startConsole(host);
    });
  return program;
}
