import { createDebugTailTopicCommand } from './debug-tail-topic';

export default function setup() {
  return createDebugTailTopicCommand(
    'frodo debug sync',
    'sync',
    'Debug IDM sync/reconciliation activity — a best-effort passive log tail.',
    `Notes:\n` +
      `  A best-effort passive tail: recognized by naming convention only, not yet verified against a real IDM reconciliation run. Unrecognized events still print a short generic summary — never silently dropped, never raw JSON.\n`
  );
}
