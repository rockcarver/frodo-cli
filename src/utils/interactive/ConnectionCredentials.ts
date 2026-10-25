import type { Command } from 'commander';

const credentialSelectors = ['svcacct', 'amster', 'browser', 'user'];

/**
 * The credential type the command line or the environment selects, if any.
 * The option beats the variable, and an unknown variable value selects
 * nothing.
 */
function selectedCredential(command: Command): string | undefined {
  const envCredential = process.env.FRODO_CREDENTIAL;
  return (
    command.getOptionValue('credential') ??
    (credentialSelectors.includes(envCredential ?? '')
      ? envCredential
      : undefined)
  );
}

/**
 * Whether the command line or the environment forces a plain username and
 * password login: `--credential user` or `--force-login-as-user`, or their
 * variables. A selected credential beats the legacy flag.
 */
export function forcesUserLogin(command: Command): boolean {
  const credential = selectedCredential(command);
  if (credential) return credential === 'user';
  return !!(
    command.getOptionValue('forceLoginAsUser') ??
    !!process.env.FRODO_FORCE_LOGIN_AS_USER
  );
}

/**
 * Options reach frodo-lib state only inside the action. Check environment
 * presence without parsing keys: malformed credentials belong to authentication,
 * not interactive resolution.
 */
export function hasExplicitCredentialSource(command: Command): boolean {
  const credential = selectedCredential(command);
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

/** What the credential check needs to know about a saved connection profile. */
export type SavedConnection = {
  username?: string | null;
  password?: string | null;
  svcacctId?: string | null;
  amsterPrivateKey?: string | null;
  defaultCredential?: string | null;
};

/**
 * Whether a saved connection profile, together with what the session cache
 * holds, lets the command run without asking for a username and password
 * (record 0031).
 *
 * It does when the profile holds a username with a password, a service
 * account or an Amster key, when its saved default credential is `browser`,
 * `svcacct` or `amster`, or when a fresh browser session is cached for the
 * host and the profile does not prefer the plain user login. A command that
 * forces a user login only counts what a user login can use. A username
 * alone completes nothing.
 * @param profile the saved profile for the host
 * @param cachedBrowserSession true if a fresh browser session is cached for the host (the library decides what fresh means)
 * @param forcedUser true if the command line forces a plain user login
 */
export function savedConnectionIsComplete(
  profile: SavedConnection,
  cachedBrowserSession: boolean,
  forcedUser = false
): boolean {
  if (
    (profile.username && profile.password) ||
    profile.svcacctId ||
    profile.amsterPrivateKey
  ) {
    return true;
  }
  if (forcedUser) return false;
  const preferred = profile.defaultCredential ?? '';
  if (['browser', 'svcacct', 'amster'].includes(preferred)) return true;
  // A saved preference for the plain user login is not served by a cached
  // browser session: the library does not reuse it then.
  if (preferred === 'user') return false;
  return cachedBrowserSession;
}
