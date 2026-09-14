import { frodo } from '@rockcarver/frodo-lib';

import { debugTail, type DebugTopic } from '../../ops/DebugLogOps';
import { ensureLogApiCredentials } from '../../ops/LogOps';
import { printMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

/**
 * Builds a `frodo debug <topic>` command for one of the plain-tail topics
 * (oauth/saml/sync/all) -- every one of those four differs only in which
 * log sources it tails and what its own help text says, so they share this
 * one action body rather than repeating it four times.
 *
 * @remarks
 * `journey` is deliberately NOT built with this factory (see
 * `debug-journey.ts`): it needs a full authenticated session (realm
 * authentication settings, per-tree journey definitions), not just Log API
 * credentials, and launches the interactive session aggregator instead of
 * a passive tail.
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

      const foundCredentials = await ensureLogApiCredentials(deploymentTypes);
      if (!foundCredentials) {
        printMessage('No log api credentials found!', 'error');
        process.exitCode = 1;
        program.help();
        return;
      }

      printMessage(`Debugging topic '${topic}'...`, 'info');
      await debugTail(topic);
    });

  return program;
}
