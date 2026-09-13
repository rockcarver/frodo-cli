import { createDebugTailTopicCommand } from './debug-tail-topic';

export default function setup() {
  return createDebugTailTopicCommand(
    'frodo debug saml',
    'saml',
    'Debug SAML activity — a best-effort passive log tail.',
    `Notes:\n` +
      `  A best-effort passive tail: recognized by naming convention only, not yet verified against a real SAML SSO flow. Unrecognized events still print a short generic summary — never silently dropped, never raw JSON.\n`
  );
}
