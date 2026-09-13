import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { debugTail, type DebugTopic } from '../../ops/DebugLogOps';
import { ensureLogApiCredentials } from '../../ops/LogOps';
import { printMessage } from '../../utils/Console';
import { runJourneyDebugPrompt } from '../../utils/interactive/JourneyDebugPrompt';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'debug',
    ['realm'],
    deploymentTypes
  ).withStability('experimental');

  program
    .description(
      'Interactively debug Identity Cloud activity for one functional area — for journeys, this launches a live, self-updating list of in-flight/recent journey executions (detected from the log stream) to drill into; other topics print a smart-filtered log tail instead.'
    )
    .addOption(
      new Option('--topic <topic>', 'Functional area to debug.')
        .choices(['journey', 'oauth', 'saml', 'sync', 'all'])
        .default('all')
    )
    .addHelpText(
      'after',
      `Notes:\n` +
        `  'journey' is interactive: a live, color-coded list of journey executions (running/finished/failed/abandoned), built from the log stream and each tree's own definition. Select one to drill into its node-by-node history. Press Space to pin a session so it's never auto-evicted (e.g. a long-running IDV or magic-link flow); Esc backs out one level, then exits.\n` +
        `  'oauth' is a smart-filtered passive log tail, verified against real log traffic on a live tenant.\n` +
        `  'saml' and 'sync' are best-effort passive tails: recognized by naming convention only, not yet verified against a real SAML SSO flow or IDM reconciliation run. Unrecognized events still print a short generic summary — never silently dropped, never raw JSON.\n`
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

      const topic = options.topic as DebugTopic;
      if (topic === 'journey') {
        // Unlike the other (purely log-tail) topics, the journey debugger
        // also reads realm authentication settings and per-tree journey
        // definitions to drive abandoned-detection -- both need a real AM
        // admin session, not just Log API credentials. `ensureLogApiCredentials`
        // only guarantees the latter: when the connection profile already has
        // a cached Log API key (the normal case after first use), it returns
        // early without ever calling `getTokens()`, silently leaving those
        // reads to 401 and abandoned-detection stuck on the generic fallback
        // for the whole session. Confirmed live against volker-dev.
        if (!(await getTokens(false, true, deploymentTypes))) {
          printMessage(
            'Unable to establish an authenticated session!',
            'error'
          );
          process.exitCode = 1;
          return;
        }
        await runJourneyDebugPrompt();
        return;
      }
      printMessage(`Debugging topic '${topic}'...`, 'info');
      await debugTail(topic);
    });

  return program;
}
