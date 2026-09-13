import { createDebugTailTopicCommand } from './debug-tail-topic';

export default function setup() {
  return createDebugTailTopicCommand(
    'frodo debug oauth',
    'oauth',
    'Debug OAuth2/OIDC activity — a smart-filtered passive log tail.',
    `Notes:\n` +
      `  A smart-filtered passive log tail, verified against real log traffic on a live tenant.\n`
  );
}
