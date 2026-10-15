import { frodo, state } from '@rockcarver/frodo-lib';
import {
  DEBUG_TOPIC_SOURCES,
  formatDebugEvent,
  type DebugTopic,
} from '../../ops/DebugLogOps';
import { ensureLogApiCredentials } from '../../ops/LogOps';
import { printMessage } from '../../utils/Console';
import {
  runDebugTailPrompt,
  type TailEvent,
} from '../../utils/interactive/DebugTailPrompt';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const { createLogTailStream } = frodo.cloud.log;
const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

/**
 * Builds a `frodo debug <topic>` command for one of the interactive-tail
 * topics (oauth/saml/sync/all) -- every one of those four differs only in
 * which log sources it tails and what its own help text says, so they
 * share this one action body rather than repeating it four times.
 *
 * @remarks
 * `journey` is deliberately NOT built with this factory (see
 * `debug-journey.ts`): it needs a full authenticated session (realm
 * authentication settings, per-tree journey definitions), not just Log API
 * credentials, and launches the interactive session aggregator instead of
 * the tail.
 *
 * The action follows the injected-loader pattern (see DebugTailPrompt):
 * the stream + `formatDebugEvent` mapping close over here, the prompt
 * stays free of `src/ops` imports.
 */
export function createDebugTailTopicCommand(
  fullName: string,
  topic: DebugTopic,
  description: string,
  notes: string
) {
  // Stability is declared once, on the `debug` stub command itself (see
  // debug.ts) -- FrodoCommand's own stability resolution walks the parent
  // chain, so every subcommand added under that stub inherits it without
  // repeating the declaration here.
  const program = new FrodoCommand(fullName, ['realm'], deploymentTypes);

  program
    .description(description)
    .addHelpText('after', notes)
    .action(async (host, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(host, user, password, options, command);

      // Capture what the user typed BEFORE ensureLogApiCredentials: the
      // typed token (alias or unique substring, e.g. `volker-dev`) is
      // what the title should show -- `ensureLogApiCredentials` replaces
      // `state.getHost()` with the full tenant URL, and profiles rarely
      // carry a stored alias (the substring match happens inside
      // frodo-lib), so this capture is the only reliable source.
      const typedHost = state.getHost() || host || '';

      const foundCredentials = await ensureLogApiCredentials(deploymentTypes);
      if (!foundCredentials) {
        printMessage('No log api credentials found!', 'error');
        process.exitCode = 1;
        program.help();
        return;
      }

      // No pre-prompt printMessage: anything printed before the prompt
      // survives as residue above the erased frame.
      const conn = await frodo.conn.getConnectionProfile();
      const hostLabel =
        conn?.alias ??
        typedHost ??
        hostLabelFromTenant(conn?.tenant ?? state.getHost());
      const realmLabel = normalizeRealm(state.getRealm());

      const tailStream = createLogTailStream(DEBUG_TOPIC_SOURCES[topic]);
      await runDebugTailPrompt({
        topic,
        hostLabel,
        realmLabel,
        readEvents: async () => {
          const events = await tailStream.poll();
          const mapped: TailEvent[] = [];
          for (const event of events) {
            const line = formatDebugEvent(event, topic);
            if (line) {
              mapped.push({ timestamp: event.timestamp, line });
            }
          }
          return mapped;
        },
      });
    });

  return program;
}

/** Falls back to the tenant URL's host part (e.g. `openam-frodo-dev.forgeblocks.com`) when no alias exists. */
function hostLabelFromTenant(tenant: string): string {
  try {
    return new URL(tenant).host ?? tenant;
  } catch {
    return tenant;
  }
}

/** Normalizes the realm token for the title: trims slashes, empty -> `root`. */
function normalizeRealm(realm: string | undefined): string {
  const trimmed = (realm ?? '').replace(/^\/+|\/+$/g, '');
  return trimmed || 'root';
}
