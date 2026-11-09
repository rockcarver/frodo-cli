/**
 * Ends the sessions that an MCP server created, when it shuts down
 * (frodo-cli#1057).
 *
 * The server logs in once at startup (the singleton `frodo` instance), and
 * every request that overrides the realm gets a request-scoped instance of
 * its own. Nothing logs these sessions out, so each run used to leave them to
 * expire at AM. This module holds the instances the server created and ends
 * their sessions with the library's `login.dispose()`: it ends a session only
 * when the instance created it and did not share it (core 0021), so with the
 * token cache on (the default) a shutdown ends nothing, and with `--no-cache`
 * it ends what the process created. The decision is the library's; this module
 * does not look at the cache setting.
 *
 * Split out of McpServerOps.ts (whose import graph cannot load under jest's
 * ESM runtime) and typed structurally, so that the rules have direct unit
 * coverage.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/** How long a shutdown waits for the sessions it ends, in total. */
export const MCP_SESSION_END_TIMEOUT_MS = 3000;

/** What a Frodo instance reports when it is disposed of (`LogoutResult`). */
type DisposeResult = {
  userSession: string;
  error?: { message?: string; getCombinedMessage?: () => string };
};

/**
 * Why a logout failed, in one line (the message) and in detail (a
 * `FrodoError` also carries the request that failed and the answer). The
 * detail never shows credentials that a host URL may embed.
 */
function describeFailure(error: DisposeResult['error']): {
  summary: string;
  detail?: string;
} {
  const summary = error?.message || 'no reason given';
  const detail = (error?.getCombinedMessage?.() ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' - ')
    .replace(/(\w+:\/\/)[^/\s@]*@/g, '$1');
  return detail && detail !== summary ? { summary, detail } : { summary };
}

/** The part of a Frodo instance that ending its session touches. */
export type McpSessionHolder = {
  login: { dispose(): Promise<DisposeResult> };
};

/** Where the keeper says what it did; `warn` is for a session left behind. */
export type McpSessionReport = (
  level: 'debug' | 'warn',
  message: string
) => void;

/** What a transport needs to end the sessions of the server. */
export type McpSessionEnder = {
  /**
   * Ends the sessions the server created: the singleton's and those of the
   * request-scoped instances it still holds. Never rejects, and settles within
   * the keeper's time limit, so a shutdown that awaits it cannot hang or fail
   * because of a logout. Ends the sessions once, however often it is called.
   */
  endAll(): Promise<void>;
};

/** The sessions of one MCP server. */
export type McpSessionKeeper = McpSessionEnder & {
  /**
   * Remembers a request-scoped instance that the server created, so that its
   * session is ended when the request is over (or at shutdown, if it still
   * runs). The singleton is never remembered. Returns the instance.
   */
  adopt<T extends McpSessionHolder>(instance: T): T;
  /**
   * Runs one request. The instances adopted while it runs are disposed of
   * when it is over, whether it succeeded or failed. The response does not
   * wait for that: the logout runs in the background, and a shutdown waits
   * for it.
   */
  runRequest<T>(request: () => Promise<T>): Promise<T>;
};

/**
 * Creates the keeper of an MCP server.
 *
 * @param singleton The instance the server logged in with at startup.
 * @param options.timeoutMs How long {@linkcode McpSessionEnder.endAll} waits
 *   in total before it lets the shutdown go on.
 * @param options.report Where the keeper reports what it did.
 */
export function createMcpSessionKeeper(
  singleton: McpSessionHolder,
  options: { timeoutMs?: number; report?: McpSessionReport } = {}
): McpSessionKeeper {
  const timeoutMs = options.timeoutMs ?? MCP_SESSION_END_TIMEOUT_MS;
  const report = (level: 'debug' | 'warn', message: string): void => {
    try {
      options.report?.(level, message);
    } catch {
      // A failing log sink must not hold up a shutdown.
    }
  };
  const held = new Set<McpSessionHolder>();
  const ending = new Set<Promise<void>>();
  const requests = new AsyncLocalStorage<Set<McpSessionHolder>>();
  let ended: Promise<void> | undefined;

  const end = (holder: McpSessionHolder, label: string): Promise<void> => {
    const done = (async () => {
      try {
        const result = await holder.login.dispose();
        if (result.userSession === 'failed') {
          const { summary, detail } = describeFailure(result.error);
          report('warn', `Could not end the ${label} session: ${summary}`);
          if (detail) {
            report(
              'debug',
              `Why the ${label} session was not ended: ${detail}`
            );
          }
        } else if (result.userSession === 'ended') {
          report('debug', `Ended the ${label} session.`);
        } else if (result.userSession === 'kept') {
          report(
            'debug',
            `Left the ${label} session alone: it may be in use by another process.`
          );
        } else {
          report('debug', `There is no ${label} user session to end.`);
        }
      } catch (error) {
        report(
          'warn',
          `Could not end the ${label} session: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })();
    ending.add(done);
    void done.then(() => ending.delete(done));
    return done;
  };

  const endAll = async (): Promise<void> => {
    end(singleton, 'server');
    for (const instance of [...held]) {
      held.delete(instance);
      end(instance, 'request-scoped');
    }
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs);
    });
    const outcome = await Promise.race([
      Promise.all([...ending]).then(() => 'done' as const),
      timeout,
    ]);
    clearTimeout(timer);
    if (outcome === 'timeout') {
      report(
        'warn',
        `Ending the sessions took more than ${timeoutMs} ms; shutting down without waiting for it.`
      );
    }
  };

  return {
    adopt<T extends McpSessionHolder>(instance: T): T {
      if (instance !== singleton) {
        held.add(instance);
        requests.getStore()?.add(instance);
      }
      return instance;
    },
    async runRequest<T>(request: () => Promise<T>): Promise<T> {
      const mine = new Set<McpSessionHolder>();
      try {
        return await requests.run(mine, request);
      } finally {
        for (const instance of mine) {
          // Taken out of `held` first, so that a shutdown does not end it twice.
          if (held.delete(instance)) {
            end(instance, 'request-scoped');
          }
        }
      }
    },
    endAll(): Promise<void> {
      ended ??= endAll();
      return ended;
    },
  };
}
