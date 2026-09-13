import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

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
    .addOption(
      new Option(
        '-i, --journey-id <journeyId>',
        'Only track journeys whose tree name matches (case-insensitive substring).'
      )
    )
    .addOption(
      new Option(
        '-u, --user-id <userId>',
        'Only track journeys whose user matches -- accepts either a username or a managed-object uuid, resolving to the other form automatically (case-insensitive substring, checked against both the raw id and any resolved display name).'
      )
    )
    .addHelpText(
      'after',
      `Notes:\n` +
        `  A live, color-coded list of journey executions (running/finished/failed/abandoned), built from the log stream and each tree's own definition. Select one to drill into its node-by-node history. Press Space to pin a session so it's never auto-evicted (e.g. a long-running IDV or magic-link flow); Esc backs out one level, then exits.\n` +
        `  --journey-id/--user-id only narrow what's *displayed* -- every session is still tracked, cached, and swept for abandonment in the background regardless of whether it currently matches (a --user-id filter's match target, in particular, isn't always known until partway through a run).\n` +
        `  --user-id also resolves usernames and uuids to each other in the background (e.g. a plain password login records the human username, while some flows -- FRServiceAccountInternal among them -- record a raw uuid), so either form finds a match no matter which one the session was actually recorded under. The resolved counterpart, once found, shows in the list header next to the filter.\n`
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
      await runJourneyDebugPrompt({
        journeyId: options.journeyId,
        userId: options.userId,
      });
    });

  return program;
}
