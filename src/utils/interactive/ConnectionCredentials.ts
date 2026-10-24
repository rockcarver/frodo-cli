import type { Command } from 'commander';

/**
 * Options reach frodo-lib state only inside the action. Check environment
 * presence without parsing keys: malformed credentials belong to authentication,
 * not interactive resolution.
 */
export function hasExplicitCredentialSource(command: Command): boolean {
  return (
    ['browser', 'device', 'saId', 'saJwkFile', 'privateKey'].some(
      (name) => !!command.getOptionValue(name)
    ) ||
    ['FRODO_SA_ID', 'FRODO_SA_JWK', 'FRODO_AMSTER_PRIVATE_KEY'].some(
      (name) => !!process.env[name]
    )
  );
}
