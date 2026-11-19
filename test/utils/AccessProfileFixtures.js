import { frodo, state } from '@rockcarver/frodo-lib';

/**
 * Real access profiles of real library sessions, for the tests that check the
 * words the command line says about them. The library builds the profile from
 * the access token and its state (`frodo.login.getAccessProfile()`); these
 * helpers put a token and the state of the kind of login in question into the
 * library's own `state` and ask it, so a wording test cannot drift from what
 * the library knows (the library test of the same profile is its record 0018).
 */

export const ALL_INTERACTIVE_SCOPES =
  'fr:am:* fr:idm:* fr:idc:esv:read fr:idc:esv:update fr:idc:monitoring:*';

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** A JWT with the claims of a token of the built-in interactive client; the signature is not checked by the profile. */
export function accessToken({
  clientId = 'AICMCPClient',
  exchange = true,
  sessionToken = false,
} = {}) {
  return `${b64({ alg: 'none' })}.${b64({
    client_id: clientId,
    ...(exchange ? { may_act: { client_id: 'AICMCPExchangeClient' } } : {}),
    ...(sessionToken ? { sessionToken: 'a-session' } : {}),
  })}.signature`;
}

/**
 * Puts a session of the given kind into the library state and returns the
 * library's access profile of it.
 * @param {object} options what the session looks like
 * @param {'browser'|'device'|'service-account'} options.flow the kind of login
 * @param {string} [options.scope] the scopes the token carries (default: all five of the built-in client for a browser login, the same without fr:am:* for a device login)
 * @param {string} [options.requestedScope] the scopes the library asked for (default: the scope)
 * @param {string[]} [options.adaptations] adaptation codes (a device login: DEVICE_LOGIN_AM_SCOPE_NOT_REQUESTED)
 * @param {boolean} [options.refresh] whether the session holds a refresh token (default: no)
 * @param {number} [options.expiresInMs] how long the token lives from now (default: 29 minutes)
 * @returns {object} the access profile
 */
export function profileOfSession({
  flow,
  scope,
  requestedScope,
  adaptations,
  refresh = false,
  expiresInMs = 29 * 60 * 1000,
}) {
  const interactive = flow !== 'service-account';
  const defaultScope =
    flow === 'device'
      ? 'fr:idm:* fr:idc:esv:read fr:idc:esv:update fr:idc:monitoring:*'
      : ALL_INTERACTIVE_SCOPES;
  const granted = scope ?? defaultScope;
  state.setDeploymentType('cloud');
  state.setUsername('jdoe@example.com');
  state.setActiveCredentialSource(interactive ? 'browser' : 'svcacct');
  state.setBearerTokenMeta({
    access_token: interactive
      ? accessToken({ sessionToken: flow === 'browser' })
      : accessToken({ clientId: 'a-service-account', exchange: false }),
    token_type: 'Bearer',
    scope: granted,
    expires: Date.now() + expiresInMs,
    ...(refresh ? { refresh_token: 'a-refresh-token' } : {}),
    ...(interactive
      ? {
          login: {
            flow,
            requestedScope: requestedScope ?? granted,
            ...(adaptations ? { adaptations } : {}),
          },
        }
      : {}),
  });
  const profile = frodo.login.getAccessProfile();
  if (!profile) throw new Error('the library built no profile');
  return profile;
}

export const browserProfile = () => profileOfSession({ flow: 'browser' });

export const deviceProfile = () =>
  profileOfSession({
    flow: 'device',
    adaptations: ['DEVICE_LOGIN_AM_SCOPE_NOT_REQUESTED'],
  });

/** A browser login that was granted fewer scopes than it asked for. */
export const reducedBrowserProfile = () =>
  profileOfSession({
    flow: 'browser',
    scope: 'fr:am:* fr:idm:*',
    requestedScope: ALL_INTERACTIVE_SCOPES,
  });

export const serviceAccountProfile = () =>
  profileOfSession({
    flow: 'service-account',
    scope: 'fr:am:* fr:idm:* fr:idc:esv:*',
  });
