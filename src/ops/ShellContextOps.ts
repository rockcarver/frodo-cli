import util from 'node:util';
import { frodo, state } from '@rockcarver/frodo-lib';
import _ from 'lodash';
import c from '../utils/ColorTheme';
import { buildDocsByMethod, MethodHelpDoc } from './ShellAutoCompleteOps';
import { createHelpContext } from './ShellHelpOps';
import { createShellRest, ShellRest } from './ShellRestOps';

/**
 * What every front end of the frodo JS console shares: the names a script
 * can use (`frodo`, `frodoLib`, `state`, `$`, `_`, `help`) and the routing
 * of frodo-lib's debug/verbose/curlirize output. The terminal console and
 * the web console each create a REPL context and call installConsoleContext
 * on it, so a script behaves the same in both.
 */

export type ConsoleBindings = {
  /** The jQuery-style REST facade installed as `$`. */
  shellRest: ShellRest;
  /** Root names completion and signature hints can resolve. */
  rootBindings: Record<string, object>;
  /** Signature and docs per frodo-lib method, for completion hints. */
  docsByMethod: Map<string, MethodHelpDoc[]>;
};

/** Build the bindings once per console; they do not depend on a REPL. */
export function createConsoleBindings(): ConsoleBindings {
  const shellRest = createShellRest();
  return {
    shellRest,
    // Everything the context installs as a top-level object or function a
    // user may want to tab into. help lands later (installConsoleContext
    // creates it); its completer entry is patched in there so the two
    // cannot disagree.
    rootBindings: {
      frodo,
      frodoLib: frodo,
      $: shellRest as unknown as object,
      state: state as unknown as object,
      _: _ as unknown as object,
    },
    docsByMethod: buildDocsByMethod(frodo),
  };
}

export type ContextOutput = {
  /** Where frodo-lib's console-bound text goes. Called with raw text. */
  write(text: string): void;
  /** Colour the text with ANSI (terminal) or leave it plain (web). */
  colors: boolean;
  /**
   * Also take over frodo-lib's normal print, error and progress output.
   * The terminal leaves these alone (they already reach it); the web
   * console has no terminal to print to, so it must capture them.
   */
  captureAll?: boolean;
};

/** Put the console's names into a REPL context and route frodo-lib output. */
export function installConsoleContext(
  context: Record<string, unknown>,
  bindings: ConsoleBindings,
  output: ContextOutput
): void {
  context.frodo = frodo;
  context.frodoLib = frodo;
  context.state = state;
  context.$ = bindings.shellRest;
  // Pre-binding _ to lodash makes the REPL disable its own "last result"
  // assignment ("Expression assignment to _ now disabled"), so lodash
  // survives every evaluated expression.
  context._ = _;

  const { write, colors } = output;
  state.setDebugHandler((message) => {
    if (!message || !state.getDebug()) return;
    const text =
      typeof message === 'object'
        ? util.inspect(message, { depth: 6, colors })
        : colors
          ? c.debug(String(message))
          : String(message);
    write(text + '\n');
  });
  state.setVerboseHandler((message) => {
    if (!message || !state.getVerbose()) return;
    write(String(message) + '\n');
  });
  state.setCurlirizeHandler((message) => {
    if (!message || !state.getCurlirize()) return;
    write((colors ? c.command(String(message)) : String(message)) + '\n');
  });

  if (output.captureAll) {
    const text = (message: unknown): string =>
      typeof message === 'string'
        ? message
        : util.inspect(message, { depth: 6, colors: false });
    state.setPrintHandler((message, _type, newline) => {
      write(text(message) + (newline === false ? '' : '\n'));
    });
    state.setErrorHandler((error, message) => {
      write(
        `${message ? message + ': ' : ''}${error instanceof Error ? error.message : text(error)}\n`
      );
    });
    // Progress indicators are terminal widgets; in the browser they become
    // plain lines, which is all a script's author needs to follow along.
    let progress = 0;
    state.setCreateProgressHandler((_type, _total, message) => {
      if (message) write(message + '\n');
      return `web-progress-${progress++}`;
    });
    state.setUpdateProgressHandler(() => undefined);
    state.setStopProgressHandler((_id, message) => {
      if (message) write(message + '\n');
    });
  }

  // help() prints text; in the browser that text goes to the log stream.
  const { help } = createHelpContext(
    frodo,
    output.captureAll ? (line) => write(line + '\n') : undefined
  );
  context.help = help;
  // Completion learns the name here, where it is created, so the completer
  // and the context can never drift apart.
  bindings.rootBindings.help = help as unknown as object;
}
