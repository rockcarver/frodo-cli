/* eslint-disable no-console */
import repl from 'node:repl';
import util from 'util';
import { state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import {
  getTokens,
  isBrowserOpeningEnabled,
  launchBrowser,
} from '../../ops/AuthenticateOps';
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
import { getIdmCatalog, refreshIdmCatalog } from '../../ops/ShellIdmCatalogOps';
import {
  BrowserLauncher,
  openBrowserThroughLauncherFile,
  removeStaleLauncherFolders,
} from '../../ops/ShellWebLauncher';
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
 * No sign-in happens here: the worker loads the target profile itself, so
 * no username or password is asked for on the command line.
 */
async function startWebMode(host?: string): Promise<void> {
  const logs = createLogBus();
  // Each browser tab gets its own engine process (its own frodo-lib state,
  // REPL world and history), so two tabs can work in two environments at
  // once. The tab connects itself: from the page's profile picker, or
  // straight away when a host was named on the command line (the worker
  // reads FRODO_CONSOLE_HOST).
  process.env.FRODO_CONSOLE_HOST = host ?? '';
  // The launcher file of a browser that is being opened (see ShellWebLauncher).
  let launcher: BrowserLauncher | undefined;
  const web = await startWebConsole({
    logs,
    // Say when a browser signs in, whichever way it came by the link, and tell
    // the launcher file that it is not needed any more. The link is never
    // printed again.
    onSignIn: () => {
      printMessage('A browser signed in to the web console.', 'info');
      launcher?.signedIn();
    },
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
    launcher?.stop();
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

  // The link is always printed, and before the browser is asked to open it:
  // whatever the launcher does, the person has the link.
  const opening = isBrowserOpeningEnabled();
  printMessage(
    'The frodo JS console is running on this machine.\n' +
      (opening
        ? 'Opening it in your default browser. If it does not open, use this ' +
          'link to sign in (it works once):\n'
        : 'Open this link to sign in (it works once):\n') +
      `\n  ${web.launchUrl}\n\n` +
      'The console runs on your machine with the credentials of this ' +
      'environment; anyone with access to this computer can use it through ' +
      'the browser tab. Ctrl+C here stops it.\n'
  );
  // Launcher files of runs that were killed are removed now; this run's is made
  // below, when the browser is to be opened.
  removeStaleLauncherFolders();
  // The browser is not given the link: it is given a private file that sends it
  // there (an address given to an opener is readable by every process of the
  // machine). A browser that cannot be opened (no desktop, a remote or headless
  // session, no browser installed) never stops the console: the link above works.
  if (opening) {
    launcher = openBrowserThroughLauncherFile(web.launchUrl, {
      open: launchBrowser,
      say: (text, type) => printMessage(text, type),
    });
  }
  // Keep the process alive while the server listens; the exit handlers above
  // own the shutdown.
  await new Promise<never>(() => undefined);
}

async function startConsole(): Promise<void> {
  const bindings = createConsoleBindings();
  const { shellRest, rootBindings, docsByMethod } = bindings;

  // Persistent history, shared across connections and surfaces: one
  // history for the person, wherever the command ran (the web console
  // shares it; each entry carries the host it ran against). Declared
  // first: the input filter below closes over it, and the REPL is
  // started later.
  const shellHistory = new ShellHistory();

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
  // Forward reference: replServer is assigned below, but the completer's
  // hint callback fires via setImmediate so it is always defined by the time
  // it runs.
  // eslint-disable-next-line prefer-const
  let replServer: repl.REPLServer | undefined;

  const consoleInput = createConsoleInput(() => shellHistory.getEntries(), {
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
  });
  const completer = createFrodoCompleter(
    rootBindings,
    docsByMethod,
    (hint) => {
      printHintAbovePrompt(replServer, hint);
    },
    // The live context: what the user defined completes too.
    () => replServer?.context as Record<string, unknown> | undefined,
    // Terminal: complete methods to `name(` only. The full scaffold on
    // the line looks runnable, and Enter submits the placeholder param
    // names to the call; the signature shows in the hint line instead.
    true,
    // The IDM resource catalog for openidm.* string completion; filled by
    // the refresh after sign-in, empty (static families only) before.
    () => getIdmCatalog()
  );

  // The prompt says which environment the next input runs against: a
  // question the console exists to answer, and one the fixed `frodo> `
  // left invisible after launch. Readline paints the prompt string it was
  // last given, so the prompt is recomputed and set before every display
  // (on each line and after each eval): a sign-in that happens between
  // lines is on the next prompt with no redraw of its own.
  const consolePrompt = (): string => {
    const host = (state.getHost() || '')
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
    const realm = state.getRealm() || '';
    if (!host) return 'frodo> ';
    // Realms root at '/'; the prompt reads `alpha` or `alpha/child`.
    const realmPart = realm.replace(/^\/+/, '');
    // Long hosts crowd the line: the first labels and an elision.
    const labels = host.split('.');
    const short =
      host.length <= 24 ? host : `${labels.slice(0, 2).join('.')}…`;
    return `frodo[${short}${realmPart ? `/${realmPart}` : ''}]> `;
  };

  const started = repl.start({
    prompt: consolePrompt(),
    ignoreUndefined: true,
    useColors: true,
    completer,
    terminal: true,
    // Node's completion preview paints the completer's common suffix dimly
    // after the cursor ("a" shows as "atob") and, worse, INSERTS that
    // preview into the line when Enter is pressed at the input end
    // (node:internal/repl/utils), so an untouched suggestion "takes
    // effect" on submit. The console shows suggestions itself (the
    // Ctrl+R/Tab surfaces and the signature hint); the painted preview
    // that quietly rewrites input is off.
    preview: false,
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

  // While a paste is in flight, the eval answers with nothing instead
  // of running: readline still hands it one line at a time (an Enter
  // per pasted line is unavoidable in its line model), but the pasted
  // script must run as ONE input, the way the web console runs it. The
  // filter holds the lines; when the paste ends it calls runPastedScript,
  // which goes through the REPL's own (wrapped) eval with the paste no
  // longer in flight. No output, no history entry, no error per
  // fragment. The wrapper replaces the instance property after start:
  // the original (Node's default eval) is captured first.
  const replEval = (
    started as unknown as {
      eval: (
        code: string,
        context: repl.REPLServer['context'],
        file: string,
        cb: (err: Error | null, result?: unknown) => void
      ) => void;
    }
  ).eval;
  (started as unknown as {
    eval: (
      code: string,
      context: repl.REPLServer['context'],
      file: string,
      cb: (err: Error | null, result?: unknown) => void
    ) => void;
  }).eval = (code, context, file, cb) => {
    if (consoleInput.pasteState.pasteInFlight()) {
      cb(null, undefined);
      return;
    }
    replEval(code, context, file, cb);
  };
  consoleInput.attachHooks({
    getLine: () => started.line,
    setLine: (line: string) => {
      (started as unknown as { line: string }).line = line;
      // The search's renders and the Tab-accept both replace the whole
      // line; the cursor must ride to its end, or the next typed char
      // lands mid-line (or at 0) instead of appending where the user
      // expects.
      (started as unknown as { cursor: number }).cursor = line.length;
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
    echo: (text: string) => {
      // The paste arrives while the live prompt row sits under the cursor
      // (with any draft the user had). Erase that row first, or the
      // script's first line glues onto it and the refresh's placeholder
      // then repeats the line twice on screen.
      started.output.write('\x1b[2K\r');
      started.output.write(text);
    },
    hint: (text: string) => {
      // Deferred (setImmediate): the paste path calls this from inside
      // the input filter's write callback, and touching the readline
      // frame there wedges it. Deferred, the hint lands on a clean
      // stack and its line refresh paints the placeholder line too.
      // An empty text only asks for that refresh (the hint line above
      // the prompt scrolls away with the output; there is nothing to
      // erase on the readline frame).
      printHintAbovePrompt(started, text);
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
    promptRows: () => {
      const width = Math.max(process.stdout.columns ?? 80, 1);
      // The prompt the REPL was last given (the displayPrompt proxy
      // keeps it current) plus the line: the visible span that wraps.
      const prompt = lastPrompt ?? consolePrompt();
      const visible =
        // eslint-disable-next-line no-control-regex
        prompt.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').length +
        started.line.length;
      return Math.max(1, Math.ceil(visible / width));
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

  // A prompt refreshed with the connection, whatever refreshes it: the
  // line hook below covers evals; this proxy covers dot-commands and any
  // other display that readline answers between lines. The proxy must
  // not setPrompt when the prompt has not changed: readline answers a
  // setPrompt by redrawing, and a redraw that rides a hint write cuts
  // the hint short (the completion hint above the prompt lost everything
  // past its first characters).
  const displayPrompt = started.displayPrompt.bind(started);
  let lastPrompt: string | undefined;
  started.displayPrompt = (...args: Parameters<typeof displayPrompt>) => {
    const next = consolePrompt();
    if (next !== lastPrompt) {
      lastPrompt = next;
      started.setPrompt(next);
    }
    return displayPrompt(...args);
  };

  (started as unknown as { history: string[] }).history = shellHistory.getLines(
    { singleLineOnly: true }
  );

  // Persist executed lines, stamped with when and (once known) where.
  // A pasted multi-line buffer arrives as one input chunk and readline
  // answers it with one 'line' event per pasted line; stored as-is, the
  // lines enter history newest-first as separate entries and the search
  // reads them bottom-up (the pasted script appears in reverse). Lines
  // that arrive in the same tick belong to one submission: they join
  // into one entry, the way the web console records its multi-line
  // inputs. A human Enter is one line per input chunk, so typing cannot
  // merge.
  //
  // Within that window the REPL's multiline handling also speaks: an
  // input the eval reports as incomplete (an unclosed `do {` mid-paste)
  // keeps its buffer, and the following 'line' events carry the
  // ACCUMULATED text, \r-joined, each a strict extension of the one
  // before. Joined naively, one paste becomes a stack of ever-growing
  // copies of its own prefix. So within the window an event that only
  // extends its predecessor replaces it: what survives is the final,
  // complete input. A CR inside a value (readline's paste path keeps
  // them) normalizes to a newline before storing.
  let pasted: string[] = [];
  let flushPasted: NodeJS.Timeout | undefined;
  started.on('line', (line: string) => {
    const previous = pasted[pasted.length - 1];
    if (previous !== undefined && line.startsWith(`${previous}\r`)) {
      pasted[pasted.length - 1] = line;
    } else if (previous !== undefined && previous.startsWith(`${line}\r`)) {
      // The mirror case (the completion of a block whose earlier
      // fragments already arrived): the shorter is a prefix of what is
      // kept; drop the fragment.
    } else {
      pasted.push(line);
    }
    if (flushPasted) clearTimeout(flushPasted);
    flushPasted = setTimeout(() => {
      const text = pasted
        .join('\n')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/^\n+|\n+$/g, ''); // blank edges of the paste
      pasted = [];
      flushPasted = undefined;
      if (text.trim().length > 0) {
        shellHistory.addLine(text, {
          ts: Date.now(),
          host: state.getHost() || undefined,
        });
      }
    }, 0);
    // The next prompt names the environment as it is now (a sign-in the
    // last eval triggered shows there, not on a stale prompt).
    started.setPrompt(consolePrompt());
  });

  started.on('exit', () => {
    shellHistory.save();
    consoleInput.close();
  });

  // Register .history dot-command to print, clear, or trim command history.
  // Subcommands are passed as the text argument after the dot-command name:
  //   .history           -> print full history (oldest first), with when
  //                         and against which environment each entry ran
  //   .history clear     -> delete all history
  //   .history trim <n>  -> keep only the last n commands
  started.defineCommand('history', {
    help: 'Manage command history: .history | .history clear | .history trim <n>',
    action(text: string) {
      const args = text.trim().split(/\s+/);
      const sub = args[0];
      const lines = () => (started as unknown as { history: string[] }).history;

      if (!sub) {
        // Print history oldest-first: index, the command, and a dim
        // suffix saying when it ran and against which environment. The
        // metadata trails the command (the web search rows do the same)
        // rather than sitting in fixed columns before it: entries without
        // metadata (old files) would otherwise reserve blank columns and
        // push every command far right.
        const entries = [...shellHistory.getEntries()].reverse();
        if (entries.length === 0) {
          console.log('No history yet.');
        } else {
          const when = (ts?: number): string => {
            if (ts === undefined) return '';
            const d = new Date(ts);
            const today = new Date();
            const sameDay =
              d.getFullYear() === today.getFullYear() &&
              d.getMonth() === today.getMonth() &&
              d.getDate() === today.getDate();
            return sameDay
              ? d.toTimeString().slice(0, 5)
              : d.toISOString().slice(0, 10);
          };
          const hostOf = (host?: string): string => {
            if (!host) return '';
            // Keep just the hostname of a URL; aliases pass through.
            return host.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
          };
          const width = process.stdout.columns ?? 80;
          const room = Math.max(width - 8 - 2, 20);
          entries.forEach((e, i) => {
            // The entry's own id, not the position in this listing: the
            // position shifts as entries are added, trimmed or deduped,
            // while the id is the entry's for good. Entries from files
            // written before ids existed fall back to the position, dim,
            // so old rows still read as rows.
            const label =
              e.id !== undefined
                ? String(e.id).padStart(4)
                : `${DIM_HINT}${String(i + 1).padStart(4)}?${RESET_HINT}`;
            // Line breaks read as a dim ¶ (the text-editor convention):
            // the entry's shape stays visible and one command's extent is
            // where its lines run out of marks. The list shows the whole
            // entry only while it fits; past that it truncates, marks
            // included.
            const marked = e.text.replace(/\n/g, `${DIM_HINT}¶${RESET_HINT}`);
            const markedExtra = marked.length - e.text.length;
            const meta: string[] = [];
            const w = when(e.ts);
            if (w) meta.push(w);
            const h = hostOf(e.host);
            if (h) meta.push(h);
            const metaText =
              meta.length > 0
                ? `${DIM_HINT}  · ${meta.join(' · ')}${RESET_HINT}`
                : '';
            // The visible cost of a row is the command plus the metadata;
            // trim the command so the row fits the terminal.
            const budget =
              room - (meta.length > 0 ? meta.join(' · ').length + 4 : 0);
            const max = Math.max(budget, 12);
            const body =
              marked.length > max + markedExtra
                ? `${marked.slice(0, max + markedExtra - 1)}…`
                : marked;
            console.log(
              `  ${label}  ${body}${metaText}`
            );
          });
        }
      } else if (sub === 'clear') {
        (started as unknown as { history: string[] }).history = [];
        shellHistory.setLinesFromNewest([]);
        console.log('History cleared.');
      } else if (sub === 'trim') {
        const n = parseInt(args[1], 10);
        if (isNaN(n) || n < 0) {
          console.log('Usage: .history trim <n>  (e.g. .history trim 50)');
        } else {
          (started as unknown as { history: string[] }).history = lines().slice(
            0,
            n
          );
          shellHistory.setLinesFromNewest(lines());
          console.log(`History trimmed to last ${lines().length} command(s).`);
        }
      } else {
        console.log('Usage: .history | .history clear | .history trim <n>');
      }

      started.displayPrompt();
    },
  });

  // Down-to-stash: when Down is pressed on a fresh, unexecuted draft at the
  // current-input position, save the draft to history and clear it. While the
  // user is actively traversing history with Up/Down, preserve readline's
  // native history behavior and do not stash. The listener sits on the
  // REPL's input stream (not process.stdin): readline emits keypresses on
  // the stream it reads, which is the console's filtered input.
  let historyNavigationActive = false;
  started.input.on('keypress', (_char, key) => {
    const rl = started as unknown as Record<string, unknown>;
    const currentHistIdx = (rl['_historyIndex'] as number) ?? -1;

    if (
      key?.name === 'down' &&
      !historyNavigationActive &&
      currentHistIdx === -1
    ) {
      const currentLine = started.line ?? '';
      if (currentLine.trim().length > 0) {
        const replHistory = (rl['history'] as string[]) ?? [];
        if (replHistory[0] !== currentLine) {
          replHistory.unshift(currentLine);
          shellHistory.addLine(currentLine);
        }

        // Move to end-of-line then kill to start, ensuring a full clear
        // regardless of where the cursor currently sits.
        started.write(null, { ctrl: true, name: 'e' });
        started.write(null, { ctrl: true, name: 'u' });
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
  // The shell runs without a connection: the terminal works bare, and
  // --web picks its environment in the page's profile picker.
  const program = new FrodoCommand('shell')
    .withStability('experimental')
    .runsUnconnected();
  program
    .description(
      'Launch the frodo JS console, a browser-console-style environment for running JavaScript and REST calls against the connected environment. Add --web to serve the same console as a local web page.'
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Launch a JS console using explicit login parameters:\n` +
        c.command(
          `  $ frodo shell ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        ) +
        `  Launch a JS console using a connection profile (identified by the full AM base URL):\n` +
        c.command(`  $ frodo shell ${s.amBaseUrl}\n`) +
        `  Launch a JS console using a connection profile (identified by a unique substring of the AM base URL or a saved alias):\n` +
        c.command(`  $ frodo shell ${s.connId}\n`) +
        `  Serve the same console as a local web page, opened in your default browser (the one-time sign-in link is printed too):\n` +
        c.command(`  $ frodo shell ${s.amBaseUrl} --web\n`) +
        `  Serve it without opening a browser (only the one-time sign-in link is printed):\n` +
        c.command(`  $ frodo shell ${s.amBaseUrl} --web --no-open\n`)
    )
    .addOption(
      new Option(
        '--web',
        'Serve the JS console as a local web page and open it in your default browser. The one-time sign-in link is always printed.'
      )
    )
    .describeDefaultOption(
      '--no-open',
      'Do not launch a local browser, only print the link (with --web, the sign-in link of the web console).'
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
      // Web mode signs in inside the worker (the page's profile picker or
      // the named host); the parent must not prompt or sign in first, so
      // no username or password is needed for --web. Terminal mode signs
      // in here, exactly as the old commands did.
      if (host && !options.web) {
        const loggedIn = await getTokens();
        if (!loggedIn) {
          process.exitCode = 1;
          return;
        }
        // The tenant-shaped completion data (managed types, config
        // instances, connectors) for openidm.* string completion;
        // failures leave the static families.
        await refreshIdmCatalog().catch(() => undefined);
      }
      if (options.web) {
        await startWebMode(host);
        return;
      }
      printMessage(
        'Welcome to the frodo JS console!\nType "$" REST calls or frodo API expressions; ".help" for help, ".exit" to quit.\n'
      );
      await startConsole();
    });
  return program;
}
