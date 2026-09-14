import { createDebugTailTopicCommand } from './debug-tail-topic';

export default function setup() {
  return createDebugTailTopicCommand(
    'frodo debug all',
    'all',
    'Debug all Identity Cloud activity — a passive log tail across every log source.',
    `Notes:\n` +
      `  Tails am-everything and idm-everything. Unrecognized events still print a short generic summary — never silently dropped, never raw JSON.\n`
  );
}
