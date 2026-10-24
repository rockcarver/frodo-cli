import type { Command } from 'commander';

/**
 * Options reach frodo-lib state only inside the action. Check environment
 * presence without parsing keys: malformed credentials belong to authentication,
 * not interactive resolution.
 */
export function hasExplicitCredentialSource(command: Command): boolean {
  const envCredential = process.env.FRODO_CREDENTIAL;
  const credential =
    command.getOptionValue('credential') ??
    (['svcacct', 'amster', 'browser', 'user'].includes(envCredential ?? '')
      ? envCredential
      : undefined);
  if (credential) return credential !== 'user';
  if (
    command.getOptionValue('forceLoginAsUser') ??
    !!process.env.FRODO_FORCE_LOGIN_AS_USER
  ) {
    return false;
  }

  return (
    process.env.FRODO_BROWSER_LOGIN === 'true' ||
    process.env.FRODO_LOGIN_DEVICE_FLOW === 'true' ||
    ['browser', 'device', 'saId', 'saJwkFile', 'privateKey'].some(
      (name) => !!command.getOptionValue(name)
    ) ||
    ['FRODO_SA_ID', 'FRODO_SA_JWK', 'FRODO_AMSTER_PRIVATE_KEY'].some(
      (name) => !!process.env[name]
    )
  );
}
