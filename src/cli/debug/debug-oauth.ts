import { createDebugTailTopicCommand } from './debug-tail-topic';

export default function setup() {
  return createDebugTailTopicCommand(
    'frodo debug oauth',
    'oauth',
    'Debug OAuth2/OIDC activity — a live, smart-filtered event tail.',
    `Notes:\n` +
      `  A live, self-updating tail of smart-filtered OAuth2/OIDC events, verified against real log traffic on a live tenant.\n`
  );
}
