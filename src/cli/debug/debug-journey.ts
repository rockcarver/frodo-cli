import { frodo } from '@rockcarver/frodo-lib';

import { getTokens } from '../../ops/AuthenticateOps';
import { ensureLogApiCredentials } from '../../ops/LogOps';
import { printMessage } from '../../utils/Console';
import { runJourneyDebugPrompt } from '../../utils/interactive/JourneyDebugPrompt';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo debug journey',
    ['realm'],
    deploymentTypes
  );

  program
    .description(
      'Interactively debug journey/tree executions — a live, self-updating list of in-flight/recent journey executions (detected from the log stream) to drill into.'
    )
    .addHelpText(
      'after',
      `Notes:\n` +
        `  A live, color-coded list of journey executions (running/finished/failed/abandoned), built from the log stream and each tree's own definition. Select one to drill into its node-by-node history. Press Space to pin a session so it's never auto-evicted (e.g. a long-running IDV or magic-link flow); Esc backs out one level, then exits.\n`
    )
    .action(async (host, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(host, user, password, options, command);

      const foundCredentials = await ensureLogApiCredentials(deploymentTypes);
      if (!foundCredentials) {
        printMessage('No log api credentials found!', 'error');
        process.exitCode = 1;
        program.help();
        return;
      }

      // The journey debugger also reads realm authentication settings and
      // per-tree journey definitions to drive abandoned-detection -- both
      // need a real AM admin session, not just Log API credentials.
      // `ensureLogApiCredentials` only guarantees the latter: when the
      // connection profile already has a cached Log API key (the normal
      // case after first use), it returns early without ever calling
      // `getTokens()`, silently leaving those reads to 401 and
      // abandoned-detection stuck on the generic fallback for the whole
      // session. Confirmed live against volker-dev.
      if (!(await getTokens(false, true, deploymentTypes))) {
        printMessage('Unable to establish an authenticated session!', 'error');
        process.exitCode = 1;
        return;
      }
      await runJourneyDebugPrompt();
    });

  return program;
}
