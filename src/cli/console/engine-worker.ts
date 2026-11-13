/**
 * One console engine per browser tab, as a child process.
 *
 * The parent (`startWebConsole` in ShellWebServerOps) spawns this file
 * once per tab. A frodo-lib `state` is process-wide, so two tabs could
 * not hold two environments in one process: every eval would read
 * whichever credentials were set last. A child per tab gives each its
 * own state and its own REPL world. History is the exception: it is the
 * person's, not the tenant's, so every worker shares one file
 * (ShellHistory.shared()).
 *
 * The protocol is JSON lines on stdin and stdout. Every request has an
 * id; every response carries that id. Log output (what a script prints)
 * comes out as `{"log": ...}` lines without an id, for the parent to
 * forward to the tab's stream. Anything this process writes to stderr
 * is diagnostics, not protocol.
 *
 * The child is a CLI surface: it runs scripts with the connected
 * environment's credentials inside its own process. It must only ever
 * be spawned by the authenticated local server, never exposed
 * directly.
 */

import { createInterface } from 'node:readline';
import { state } from '@rockcarver/frodo-lib';
import { getTokens } from '../../ops/AuthenticateOps';
import { createWebEngine } from '../../ops/ShellWebEngineOps';
import type { WebEngine } from '../../ops/ShellWebEngineOps';
import { createRemoteRegistry } from '../../ops/ShellWebSerializeOps';

// Same mitigation as app.ts: frodo-lib's bundled proxy-agent parses every
// request URL with the deprecated `url.parse()` (DEP0169), which prints a
// warning on each connect. The parent's `process.noDeprecation` does not
// carry into this child process, so set it here, before frodo-lib loads.
process.noDeprecation = true;

type Request = {
  id?: number;
  op:
    | 'eval'
    | 'complete'
    | 'history'
    | 'connect'
    | 'info'
    | 'children'
    | 'json'
    | 'reset'
    | 'dispose';
  code?: string;
  line?: string;
  host?: string;
  id2?: number;
  offset?: number;
  limit?: number;
};

function emit(message: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const engine: WebEngine = createWebEngine({
  onLog: (text) => emit({ log: text }),
});
const registry = createRemoteRegistry();

// What this tab's connection looks like, straight from this process's own
// state: the parent cannot answer for it (its state never connects).
// The username for a service-account login is the profile's saved account
// name (state's username stays unset for that path).
function sessionInfo(): {
  host?: string;
  realm?: string;
  username?: string;
  deploymentType?: string;
  credentialSource?: string;
} {
  const source = state.getActiveCredentialSource();
  return {
    host: state.getHost() || undefined,
    realm: state.getRealm() || undefined,
    username:
      state.getUsername() ||
      (source === 'svcacct' ? state.getServiceAccountId() : undefined),
    deploymentType: state.getDeploymentType() || undefined,
    credentialSource: source,
  };
}

// Started for a host named on the command line: connect right away, the
// way the CLI would, and report the outcome as a log line the tab shows.
// The browser-login notice frodo prints ("Opening browser to complete
// login...") goes to this process's stderr, which the server forwards to
// the tab's stream, so a sign-in that opens a browser explains itself.
if (process.env.FRODO_CONSOLE_HOST) {
  void (async () => {
    state.setHost(process.env.FRODO_CONSOLE_HOST!);
    const ok = await getTokens();
    emit({
      log: ok
        ? `Connected to ${state.getHost()} as ${state.getUsername() || 'the saved profile'}.`
        : `Sign-in failed for ${state.getHost()}; use the profile picker to connect.`,
    });
  })();
}

const sessions = createInterface({ input: process.stdin });
// Watchdog: a closed stdin pipe means the parent is gone (crashed, killed,
// terminal lost). Exit instead of lingering as an orphan holding this tab's
// frodo-lib state. The clean path is the dispose op; this catches the rest.
process.stdin.once('end', () => process.exit(0));
// Ops run one at a time, in arrival order: a connect must not interleave
// with an eval (the script would read half-switched credentials).
let opQueue: Promise<unknown> = Promise.resolve();
sessions.on('line', (line) => {
  let request: Request;
  try {
    request = JSON.parse(line) as Request;
  } catch {
    return; // not protocol; ignore
  }
  opQueue = opQueue.then(() => handle(request)).catch(() => undefined);
});

async function handle(request: Request): Promise<void> {
  try {
    switch (request.op) {
      case 'eval': {
        const outcome = await engine.evaluate(request.code ?? '');
        // The value lives only in this process; the page explores it
        // through the children/json ops below.
        emit({
          id: request.id,
          op: 'eval',
          outcome:
            outcome.status === 'ok'
              ? {
                  status: 'ok',
                  result: registry.describeResult(outcome.value),
                }
              : outcome.status === 'error'
                ? {
                    status: 'error',
                    name: (outcome.error as Error)?.name ?? 'Thrown',
                    message:
                      (outcome.error as Error)?.message ??
                      String(outcome.error),
                  }
                : outcome,
        });
        break;
      }
      case 'children': {
        const page =
          typeof request.id2 === 'number'
            ? registry.children(
                request.id2,
                request.offset ?? 0,
                request.limit ?? 200
              )
            : undefined;
        emit({ id: request.id, op: 'children', page: page ?? null });
        break;
      }
      case 'json': {
        const json =
          typeof request.id2 === 'number'
            ? registry.json(request.id2)
            : undefined;
        emit({ id: request.id, op: 'json', json: json ?? null });
        break;
      }
      case 'complete': {
        const [candidates, replace] = engine.complete(request.line ?? '');
        emit({ id: request.id, op: 'complete', candidates, replace });
        break;
      }
      case 'history': {
        emit({ id: request.id, op: 'history', lines: engine.history() });
        break;
      }
      case 'connect': {
        const host = request.host ?? '';
        state.setHost(host);
        const ok = await getTokens();
        emit({
          id: request.id,
          op: 'connect',
          ok,
          info: sessionInfo(),
        });
        break;
      }
      case 'info': {
        emit({ id: request.id, op: 'info', info: sessionInfo() });
        break;
      }
      case 'reset': {
        await engine.reset();
        emit({ id: request.id, op: 'reset', ok: true });
        break;
      }
      case 'dispose': {
        engine.dispose();
        emit({ id: request.id, op: 'dispose' });
        // The parent asked this worker to end; a CLI-style exit is the only
        // lifecycle it has (its state and REPL die with it, by design).
        // eslint-disable-next-line no-restricted-syntax
        process.exit(0);
        break;
      }
      default:
        break;
    }
  } catch (error) {
    emit({
      id: request.id,
      op: request.op,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
