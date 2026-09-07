import { frodo } from '@rockcarver/frodo-lib';
import type { CachedSessionSummary } from '@rockcarver/frodo-lib/types/ops/TokenCacheOps';

import { createTable, printMessage } from '../utils/Console';

const { getConnectionProfileByHost } = frodo.conn;
const { list: listCachedSessions, deleteHost: deleteHostTokens } = frodo.cache;

/**
 * Formats a millisecond duration as a short, human-readable string, e.g.
 * "23m", "1h 5m", "2d 3h". Rounds down to whole minutes — a session's exact
 * remaining seconds aren't meaningful to a CLI user.
 */
function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(' ');
}

/**
 * Renders a cache entry's status: how much longer it's valid for, then the
 * full expiration in local time (not UTC — matches this codebase's own
 * convention elsewhere, e.g. AdminOps.ts/SecretsOps.ts's toLocaleString()
 * usage). `expires` can be a corrupted/unparseable value left behind by an
 * old, since-fixed bug (frodo-lib's own isExpired computation now treats
 * those as expired, so this should be unreachable going forward — but a
 * listing must never crash on one bad entry, so this stays defensive rather
 * than assuming that invariant holds forever).
 */
function formatSessionStatus(session: CachedSessionSummary): string {
  if (!session.isExpired && Number.isFinite(session.expires)) {
    const remaining = formatDuration(session.expires - Date.now());
    return `expires in ${remaining} (${new Date(session.expires).toLocaleString()})`;
  }
  return Number.isFinite(session.expires) ? 'expired' : 'expired (corrupt cache entry)';
}

/**
 * Resolves a host/alias/substring argument to the canonical host string a
 * session was actually cached under, using the same connection-profile
 * resolution every other command already uses. Falls back to treating the
 * input as a literal host when no saved profile matches — a browser-login
 * session created with `frodo login --browser` (no `--save`) has no
 * connection profile at all, so this must still work for a bare host URL.
 */
async function resolveSessionHost(host: string): Promise<string> {
  try {
    const profile = await getConnectionProfileByHost(host);
    if (profile?.tenant) {
      return profile.tenant;
    }
    // eslint-disable-next-line no-empty
  } catch {}
  return host;
}

/**
 * List every cached session across all hosts.
 */
export function listSessions(): void {
  const sessions = listCachedSessions();
  if (sessions.length === 0) {
    printMessage('No cached sessions.', 'info');
    return;
  }
  const table = createTable([
    'Host',
    'Realm',
    'Token Type',
    'Subject',
    'Status',
  ]);
  for (const session of sessions) {
    table.push([
      session.host,
      session.realm,
      session.tokenType,
      session.subject,
      formatSessionStatus(session),
    ]);
  }
  printMessage(table.toString(), 'data');
}

/**
 * Describe the cached session(s) for one host.
 * @param {string} host Host URL, unique substring, or alias
 */
export async function describeSession(host: string): Promise<void> {
  const resolvedHost = await resolveSessionHost(host);
  const sessions = listCachedSessions().filter(
    (session) => session.host === resolvedHost
  );
  if (sessions.length === 0) {
    printMessage(`No cached session for ${resolvedHost}`, 'info');
    return;
  }
  const table = createTable(['Realm', 'Token Type', 'Subject', 'Status']);
  for (const session of sessions) {
    table.push([
      session.realm,
      session.tokenType,
      session.subject,
      formatSessionStatus(session),
    ]);
  }
  printMessage(`Cached session(s) for ${resolvedHost}:`, 'info');
  printMessage(table.toString(), 'data');
}

/**
 * Delete the cached session(s) for one host. v1 scope: clears the local
 * token cache only — no server-side AM session invalidation or OAuth2
 * token revocation. See docs/BROWSER_LOGIN.md.
 * @param {string} host Host URL, unique substring, or alias
 */
export async function deleteSession(host: string): Promise<void> {
  const resolvedHost = await resolveSessionHost(host);
  const hadInteractiveSession = listCachedSessions().some(
    (session) =>
      session.host === resolvedHost &&
      (session.tokenType === 'browserUserBearer' ||
        session.tokenType === 'browserUserSession')
  );
  const deleted = deleteHostTokens(resolvedHost);
  if (!deleted) {
    printMessage(`No cached session for ${resolvedHost}`, 'info');
    return;
  }
  printMessage(`Deleted cached session for ${resolvedHost}`);
  if (hadInteractiveSession) {
    printMessage(
      'This only cleared the local session cache. It did not invalidate the session or revoke the token on the server.',
      'info'
    );
  }
}
