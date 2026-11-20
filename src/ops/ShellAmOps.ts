import { frodo, state } from '@rockcarver/frodo-lib';
import { MethodHelpDoc } from './ShellAutoCompleteOps';
import { ShellRest, ShellRestError } from './ShellRestOps';

/**
 * The AM identity, device and session functions (`am.*`) for the frodo JS
 * console (`frodo shell`), mirroring the AM JSON APIs a realm administrator
 * uses. Symmetric with the `openidm` binding: thin wrappers over the
 * console's REST facade, so they inherit its credential handling and URL
 * encoding.
 *
 * Paths are realm-aware by construction: every function composes the AM
 * JSON base from the session's current realm
 * (`<host>/json/realms/root/realms/<realm>/...`), so a script passes only
 * ids and filters, never a realm path. The facade routes `am/...`-prefixed
 * URLs to the AM host and attaches AM credentials (bearer or session
 * cookie, whichever the session uses).
 *
 * The AM identity API is versioned; the wrappers send the same
 * Accept-API-Version headers frodo-lib's own calls send
 * (protocol=2.0,resource=4.0 for identities, resource=4.0 for sessions),
 * so behavior does not drift with AM's protocol defaults.
 *
 * All functions are async (type them with `await` in the console). They
 * run with the connected session's credentials, not a script's
 * authorization context.
 */

/** Identity API version header, matching frodo-lib's UserApi. */
const IDENTITY_API_VERSION = 'protocol=2.0,resource=4.0';
/** Session API version header, matching frodo-lib's SessionApi. */
const SESSION_API_VERSION = 'resource=4.0';
/** The version frodo-lib's logout call documents. */
const LOGOUT_API_VERSION = 'resource=3.1, protocol=1.0';

/**
 * The registered MFA (and sibling) device collections on a user, the
 * fixed set AM serves under `/users/<id>/devices/...`. `2fa` types carry
 * a reset/rename lifecycle; `profile` and `trusted` ride the same shape.
 */
export const AM_DEVICE_TYPES = [
  'binding',
  'oath',
  'push',
  'webauthn',
  'profile',
  'trusted',
] as const;

export type AmDeviceType = (typeof AM_DEVICE_TYPES)[number];

/**
 * Compose an AM JSON URL from the session's current realm:
 * `am/<realm-path>/users/...` etc. The facade's resolveUrl sends `am/...`
 * to the configured host (which already carries the context path) with AM
 * credentials.
 */
function realmJsonUrl(...segments: string[]): string {
  return ['am/json', frodo.utils.getCurrentRealmPath(), ...segments]
    .filter((s) => s.length > 0)
    .join('/')
    .replace(/\/{2,}/g, '/');
}

/**
 * Compose the query string for a CREST call. Filter is left raw (the
 * facade percent-encodes what the request line cannot carry, and AM's
 * filters are typed with spaces and quotes); fields are comma-joined.
 */
function crestQuery(
  params?: Record<string, unknown> | null,
  fields?: string[] | string
): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null) continue;
    pairs.push(`${key}=${typeof value === 'string' ? value : String(value)}`);
  }
  if (fields !== undefined) {
    const selection = Array.isArray(fields) ? fields.join(',') : fields;
    if (selection.length > 0) pairs.push(`_fields=${selection}`);
  }
  return pairs.length > 0 ? `?${pairs.join('&')}` : '';
}

/** Default filter: all objects (the CREST convention). */
const ALL = 'true';

/** Does the params object carry a CREST query selector? */
function hasQuerySelector(params?: Record<string, unknown> | null): boolean {
  return !!params && ('_queryFilter' in params || '_queryId' in params);
}

/**
 * Require a non-empty string argument, throwing synchronously (the
 * console renders it as an Uncaught TypeError naming the function; a
 * rejected promise would draw the unhandled-rejection banner).
 */
function requireArg(fn: string, name: string, value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`am.${fn}: ${name} is required.`);
  }
  return value;
}

/**
 * The `am` object installed into the console context.
 */
export type AmApi = {
  users: {
    /** Reads one user by id; null when not found. */
    read(
      userId: string,
      params?: Record<string, unknown>,
      fields?: string[]
    ): Promise<unknown>;
    /** Queries users with _queryFilter or _queryId (default: all). */
    query(
      params?: Record<string, unknown>,
      fields?: string[]
    ): Promise<unknown>;
    /** Counts users (exact total via _pageSize=0). */
    count(params?: Record<string, unknown>): Promise<number>;
    /** Creates a user; a null userId has AM generate one. */
    create(userId: string | null, content: unknown): Promise<unknown>;
    /** Replaces a user. null rev skips the revision check. */
    update(
      userId: string,
      rev: string | null,
      value: unknown
    ): Promise<unknown>;
    /** Deletes a user and returns the deleted object. */
    delete(userId: string, rev: string | null): Promise<unknown>;
  };
  groups: {
    /** Reads one group by id; null when not found. */
    read(
      groupId: string,
      params?: Record<string, unknown>,
      fields?: string[]
    ): Promise<unknown>;
    /** Queries groups with _queryFilter or _queryId (default: all). */
    query(
      params?: Record<string, unknown>,
      fields?: string[]
    ): Promise<unknown>;
    /** Creates a group; a null groupId has AM generate one. */
    create(groupId: string | null, content: unknown): Promise<unknown>;
    /** Replaces a group. null rev skips the revision check. */
    update(
      groupId: string,
      rev: string | null,
      value: unknown
    ): Promise<unknown>;
    /** Deletes a group and returns the deleted object. */
    delete(groupId: string, rev: string | null): Promise<unknown>;
    /**
     * Adds a user to a group via the backing store's membership
     * attribute (uniqueMember): reads the group, appends, PUTs back.
     */
    addMember(groupId: string, userId: string): Promise<unknown>;
    /** Removes a user from a group's uniqueMember list. */
    removeMember(groupId: string, userId: string): Promise<unknown>;
  };
  devices: {
    /** Lists one user's registered devices of a type. */
    list(
      userId: string,
      type: AmDeviceType,
      fields?: string[]
    ): Promise<unknown>;
    /** Reads one device by its uuid within the type collection. */
    read(
      userId: string,
      type: AmDeviceType,
      deviceUuid: string
    ): Promise<unknown>;
    /** Replaces a device (rename/relabel: PUT the modified device). */
    update(
      userId: string,
      type: AmDeviceType,
      deviceUuid: string,
      rev: string | null,
      value: unknown
    ): Promise<unknown>;
    /** Deletes one device (the "reset" of an MFA registration). */
    delete(
      userId: string,
      type: AmDeviceType,
      deviceUuid: string,
      rev: string | null
    ): Promise<unknown>;
  };
  sessions: {
    /** Session details for a token (or the console's own session). */
    info(tokenId?: string): Promise<unknown>;
    /** Validates a session token: {valid:true/false, ...}. */
    validate(tokenId: string): Promise<unknown>;
    /** Refreshes a session's idle time. */
    refresh(tokenId: string): Promise<unknown>;
    /** Ends a session. The token rides the cookie-name header, per AM. */
    logout(tokenId: string): Promise<unknown>;
  };
};

export function createAmApi(rest: ShellRest): AmApi {
  const identityHeaders = (): Record<string, string> => ({
    'Accept-API-Version': IDENTITY_API_VERSION,
  });

  // Non-async on purpose: validation throws synchronously (an Uncaught
  // TypeError in the console), never as a rejected promise with the
  // unhandled-rejection banner.
  const identityRead = (
    fn: string,
    collection: 'users' | 'groups',
    id: string,
    params?: Record<string, unknown>,
    fields?: string[]
  ): Promise<unknown> => {
    requireArg(fn, `${collection === 'users' ? 'userId' : 'groupId'}`, id);
    return rest
      .get(
        `${realmJsonUrl(collection, id)}${crestQuery(params, fields)}`,
        identityHeaders()
      )
      .then(
        (data) => data,
        (error) => {
          if (error instanceof ShellRestError && error.result.status === 404) {
            return null;
          }
          throw error;
        }
      );
  };

  const identityQuery = async (
    collection: 'users' | 'groups',
    params?: Record<string, unknown>,
    fields?: string[]
  ): Promise<unknown> => {
    const effective = { ...(params ?? {}) };
    if (!hasQuerySelector(effective)) effective['_queryFilter'] = ALL;
    return rest.get(
      `${realmJsonUrl(collection)}${crestQuery(effective, fields)}`,
      identityHeaders()
    );
  };

  const identityCreate = async (
    collection: 'users' | 'groups',
    id: string | null,
    content: unknown
  ): Promise<unknown> => {
    if (id === undefined || id === null) {
      return rest.post(
        `${realmJsonUrl(collection)}?_action=create`,
        content,
        identityHeaders()
      );
    }
    requireArg(`${collection}.create`, 'id', id);
    return rest.put(realmJsonUrl(collection, id), content, {
      ...identityHeaders(),
      'If-None-Match': '*',
    });
  };

  const identityUpdate = async (
    collection: 'users' | 'groups',
    id: string,
    rev: string | null,
    value: unknown
  ): Promise<unknown> => {
    requireArg(`${collection}.update`, 'id', id);
    const headers =
      rev === undefined || rev === null
        ? identityHeaders()
        : { ...identityHeaders(), 'If-Match': rev };
    return rest.put(realmJsonUrl(collection, id), value, headers);
  };

  const identityDelete = async (
    collection: 'users' | 'groups',
    id: string,
    rev: string | null
  ): Promise<unknown> => {
    requireArg(`${collection}.delete`, 'id', id);
    const headers =
      rev === undefined || rev === null
        ? identityHeaders()
        : { ...identityHeaders(), 'If-Match': rev };
    return rest.delete(realmJsonUrl(collection, id), headers);
  };

  /** Read the group (for membership edits), preserving its rev. */
  const readGroupForMembership = async (
    fn: string,
    groupId: string
  ): Promise<Record<string, unknown> | null> => {
    requireArg(fn, 'groupId', groupId);
    return identityRead(fn, 'groups', groupId) as Promise<Record<
      string,
      unknown
    > | null>;
  };

  return {
    users: {
      read: (userId, params, fields) =>
        identityRead('users.read', 'users', userId, params, fields),
      query: (params, fields) => identityQuery('users', params, fields),
      async count(params) {
        const effective = { ...(params ?? {}) };
        if (!hasQuerySelector(effective)) effective['_queryFilter'] = ALL;
        effective['_pageSize'] = 0;
        effective['_totalPagedResultsPolicy'] = 'EXACT';
        const data = (await rest.get(
          `${realmJsonUrl('users')}${crestQuery(effective)}`,
          identityHeaders()
        )) as Record<string, unknown>;
        if (
          typeof data?.['totalPagedResults'] === 'number' &&
          data['totalPagedResults'] >= 0
        ) {
          return data['totalPagedResults'];
        }
        if (
          typeof data?.['resultCount'] === 'number' &&
          data['resultCount'] >= 0
        ) {
          return data['resultCount'];
        }
        return Array.isArray(data?.['result'])
          ? (data['result'] as unknown[]).length
          : 0;
      },
      create: (userId, content) => identityCreate('users', userId, content),
      update: (userId, rev, value) =>
        identityUpdate('users', userId, rev, value),
      delete: (userId, rev) => identityDelete('users', userId, rev),
    },

    groups: {
      read: (groupId, params, fields) =>
        identityRead('groups.read', 'groups', groupId, params, fields),
      query: (params, fields) => identityQuery('groups', params, fields),
      create: (groupId, content) => identityCreate('groups', groupId, content),
      update: (groupId, rev, value) =>
        identityUpdate('groups', groupId, rev, value),
      delete: (groupId, rev) => identityDelete('groups', groupId, rev),

      addMember(groupId, userId) {
        requireArg('groups.addMember', 'groupId', groupId);
        requireArg('groups.addMember', 'userId', userId);
        return readGroupForMembership('groups.addMember', groupId).then(
          (group) => {
            if (group === null) {
              throw new Error(
                `am.groups.addMember: group '${groupId}' not found.`
              );
            }
            const members = Array.isArray(group['uniqueMember'])
              ? (group['uniqueMember'] as string[])
              : [];
            const dn = `uid=${userId},ou=people,${realmSuffix()}`;
            if (!members.includes(dn)) members.push(dn);
            group['uniqueMember'] = members;
            return identityUpdate(
              'groups',
              groupId,
              (group['_rev'] as string | null) ?? null,
              group
            );
          }
        );
      },

      removeMember(groupId, userId) {
        requireArg('groups.removeMember', 'groupId', groupId);
        requireArg('groups.removeMember', 'userId', userId);
        return readGroupForMembership('groups.removeMember', groupId).then(
          (group) => {
            if (group === null) {
              throw new Error(
                `am.groups.removeMember: group '${groupId}' not found.`
              );
            }
            const members = Array.isArray(group['uniqueMember'])
              ? (group['uniqueMember'] as string[])
              : [];
            group['uniqueMember'] = members.filter(
              (m) => !m.startsWith(`uid=${userId},`)
            );
            return identityUpdate(
              'groups',
              groupId,
              (group['_rev'] as string | null) ?? null,
              group
            );
          }
        );
      },
    },

    devices: {
      list(userId, type, fields) {
        requireArg('devices.list', 'userId', userId);
        checkDeviceType('devices.list', type);
        return rest.get(
          `${realmJsonUrl('users', userId, 'devices/2fa', type)}${crestQuery({ _queryFilter: ALL }, fields)}`,
          identityHeaders()
        );
      },
      read(userId, type, deviceUuid) {
        requireArg('devices.read', 'userId', userId);
        checkDeviceType('devices.read', type);
        requireArg('devices.read', 'deviceUuid', deviceUuid);
        return rest.get(
          realmJsonUrl('users', userId, 'devices/2fa', type, deviceUuid),
          identityHeaders()
        );
      },
      update(userId, type, deviceUuid, rev, value) {
        requireArg('devices.update', 'userId', userId);
        checkDeviceType('devices.update', type);
        requireArg('devices.update', 'deviceUuid', deviceUuid);
        const headers =
          rev === undefined || rev === null
            ? { ...identityHeaders(), 'If-Match': '*' }
            : { ...identityHeaders(), 'If-Match': rev };
        return rest.put(
          realmJsonUrl('users', userId, 'devices/2fa', type, deviceUuid),
          value,
          headers
        );
      },
      delete(userId, type, deviceUuid, rev) {
        requireArg('devices.delete', 'userId', userId);
        checkDeviceType('devices.delete', type);
        requireArg('devices.delete', 'deviceUuid', deviceUuid);
        const headers =
          rev === undefined || rev === null ? undefined : { 'If-Match': rev };
        return rest.delete(
          realmJsonUrl('users', userId, 'devices/2fa', type, deviceUuid),
          headers
        );
      },
    },

    sessions: {
      async info(tokenId) {
        const body: Record<string, unknown> = {};
        if (tokenId !== undefined && tokenId !== null) {
          body['tokenId'] = tokenId;
        } else {
          // No token given: AM answers for the credential the call
          // carries (the console's own session).
          body['tokenId'] = '';
        }
        return rest.post(
          realmJsonUrl('sessions', '') + '?_action=getSessionInfo',
          body,
          { 'Accept-API-Version': SESSION_API_VERSION }
        );
      },
      validate(tokenId) {
        requireArg('sessions.validate', 'tokenId', tokenId);
        return rest.post(
          realmJsonUrl('sessions', '') + '?_action=validate',
          { tokenId },
          { 'Accept-API-Version': SESSION_API_VERSION }
        );
      },
      refresh(tokenId) {
        requireArg('sessions.refresh', 'tokenId', tokenId);
        return rest.post(
          realmJsonUrl('sessions', '') + '?_action=refresh',
          { tokenId },
          { 'Accept-API-Version': SESSION_API_VERSION }
        );
      },
      logout(tokenId) {
        requireArg('sessions.logout', 'tokenId', tokenId);
        // AM's logout is special: the session token rides the header
        // named like the session cookie, and no instance credential is
        // attached (the session to end IS the credential).
        const cookieName = state.getCookieName() || 'iPlanetDirectoryPro';
        return rest.post(
          realmJsonUrl('sessions', '') + '?_action=logout',
          {},
          {
            [cookieName]: tokenId,
            'Accept-API-Version': LOGOUT_API_VERSION,
          }
        );
      },
    },
  };
}

/** The base DN suffix for member DNs, from the current realm. */
function realmSuffix(): string {
  // AM's uniqueMember values are full DNs. Composing them exactly the
  // way the realm's backend does is deployment-specific (base DN differs
  // across embedded DS, external DS, cloud). The console builds the DN
  // from the realm path, which matches AM's default backend layout;
  // deployments with custom base DNs can pass the full DN in the value
  // instead.
  const realmPath = frodo.utils.getCurrentRealmPath(); // e.g. /realms/root/realms/alpha
  const parts = realmPath.split('/').filter((p) => p && p !== 'realms');
  const rdns: string[] = [];
  for (let i = parts.length - 1; i >= 0; i--) {
    rdns.push(`dc=${parts[i]}`);
  }
  if (rdns.length === 0) rdns.push('dc=openam', 'dc=forgerock', 'dc=org');
  return rdns.join(',');
}

function checkDeviceType(fn: string, type: AmDeviceType): void {
  if (!AM_DEVICE_TYPES.includes(type)) {
    throw new TypeError(
      `am.${fn}: device type must be one of ${AM_DEVICE_TYPES.join(', ')} (got '${String(type)}').`
    );
  }
}

/**
 * Hand-written help docs for the am.* functions, in the same shape as the
 * openidm ones. Merged into the console's doc index, so method completion
 * and help(am.users.read) work on both surfaces.
 */
export const AM_METHOD_DOCS: MethodHelpDoc[] = [
  ...identityDocs('am.users', 'users'),
  ...identityDocs('am.groups', 'groups'),
  {
    typeName: 'am.groups',
    methodName: 'addMember',
    signature: 'addMember(groupId, userId): Promise<object>',
    description:
      "Adds a user to a group via the backing store's membership attribute (uniqueMember).",
    params: [
      {
        name: 'groupId',
        type: 'string',
        description: 'id of the group',
        required: true,
      },
      {
        name: 'userId',
        type: 'string',
        description: 'id of the user to add',
        required: true,
      },
    ],
    returns: '{Promise<object>} the updated group',
  },
  {
    typeName: 'am.groups',
    methodName: 'removeMember',
    signature: 'removeMember(groupId, userId): Promise<object>',
    description: "Removes a user from a group's membership.",
    params: [
      {
        name: 'groupId',
        type: 'string',
        description: 'id of the group',
        required: true,
      },
      {
        name: 'userId',
        type: 'string',
        description: 'id of the user to remove',
        required: true,
      },
    ],
    returns: '{Promise<object>} the updated group',
  },
  ...deviceDocs(),
  ...sessionDocs(),
];

function identityDocs(typeName: string, collection: string): MethodHelpDoc[] {
  const label = collection === 'users' ? 'user' : 'group';
  const idName = collection === 'users' ? 'userId' : 'groupId';
  const countDoc: MethodHelpDoc[] =
    collection === 'users'
      ? [
          {
            typeName,
            methodName: 'count',
            signature: 'count(params?): Promise<number>',
            description:
              'Counts users (exact total via _pageSize=0 and the EXACT policy).',
            params: [
              {
                name: 'params',
                type: 'object',
                description:
                  'query parameters; _queryFilter default: all users',
                required: false,
              },
            ],
            returns: '{Promise<number>} the exact count when AM provides it',
          },
        ]
      : [];
  return [
    ...countDoc,
    {
      typeName,
      methodName: 'read',
      signature: `read(${idName}, params?, fields?): Promise<object | null>`,
      description: `Fetches one ${label} in the current realm by id. Returns null when not found.`,
      params: [
        {
          name: idName,
          type: 'string',
          description: `id of the ${label}`,
          required: true,
        },
        {
          name: 'params',
          type: 'object',
          description: 'additional query parameters',
          required: false,
        },
        {
          name: 'fields',
          type: 'string[]',
          description: 'fields to return',
          required: false,
        },
      ],
      returns: `{Promise<object | null>} the ${label}, or null when not found`,
    },
    {
      typeName,
      methodName: 'query',
      signature: 'query(params?, fields?): Promise<object>',
      description: `Queries ${collection} in the current realm. Default: all (when params has no _queryFilter/_queryId).`,
      params: [
        {
          name: 'params',
          type: 'object',
          description:
            'query parameters: _queryFilter or _queryId, _pageSize, _pagedResultsOffset, _sortKeys, ...',
          required: false,
        },
        {
          name: 'fields',
          type: 'string[]',
          description: 'fields to return',
          required: false,
        },
      ],
      returns: `{Promise<object>} the query result`,
    },
    {
      typeName,
      methodName: 'create',
      signature: `create(${idName} | null, content): Promise<object>`,
      description: `Creates a ${label}. A null id has AM generate one.`,
      params: [
        {
          name: idName,
          type: 'string | null',
          description: `id of the new ${label}; null generates one`,
          required: true,
        },
        {
          name: 'content',
          type: 'object',
          description: 'the new object',
          required: true,
        },
      ],
      returns: `{Promise<object>} the created ${label}`,
    },
    {
      typeName,
      methodName: 'update',
      signature: `update(${idName}, rev, value): Promise<object>`,
      description: `Replaces a ${label}. A null rev skips the revision check.`,
      params: [
        {
          name: idName,
          type: 'string',
          description: `id of the ${label}`,
          required: true,
        },
        {
          name: 'rev',
          type: 'string | null',
          description: 'revision the update is based on',
          required: true,
        },
        {
          name: 'value',
          type: 'object',
          description: 'the replacement object',
          required: true,
        },
      ],
      returns: `{Promise<object>} the updated ${label}`,
    },
    {
      typeName,
      methodName: 'delete',
      signature: `delete(${idName}, rev): Promise<object>`,
      description: `Deletes a ${label} and returns the deleted object.`,
      params: [
        {
          name: idName,
          type: 'string',
          description: `id of the ${label}`,
          required: true,
        },
        {
          name: 'rev',
          type: 'string | null',
          description: 'revision the delete is based on',
          required: true,
        },
      ],
      returns: `{Promise<object>} the deleted ${label}`,
    },
  ];
}

function deviceDocs(): MethodHelpDoc[] {
  const typeDoc = {
    name: 'type',
    type: `'binding' | 'oath' | 'push' | 'webauthn' | 'profile' | 'trusted'`,
    description: 'device collection under the user',
    required: true,
  };
  return [
    {
      typeName: 'am.devices',
      methodName: 'list',
      signature: 'list(userId, type, fields?): Promise<object>',
      description:
        "Lists a user's registered devices of a type (OATH, push, WebAuthn, device binding, profile devices, trusted devices).",
      params: [
        {
          name: 'userId',
          type: 'string',
          description: 'id of the user',
          required: true,
        },
        typeDoc,
        {
          name: 'fields',
          type: 'string[]',
          description: 'fields to return',
          required: false,
        },
      ],
      returns: '{Promise<object>} the query result',
    },
    {
      typeName: 'am.devices',
      methodName: 'read',
      signature: 'read(userId, type, deviceUuid): Promise<object>',
      description: 'Reads one registered device by its uuid.',
      params: [
        {
          name: 'userId',
          type: 'string',
          description: 'id of the user',
          required: true,
        },
        typeDoc,
        {
          name: 'deviceUuid',
          type: 'string',
          description: 'uuid of the device',
          required: true,
        },
      ],
      returns: '{Promise<object>} the device',
    },
    {
      typeName: 'am.devices',
      methodName: 'update',
      signature:
        'update(userId, type, deviceUuid, rev, value): Promise<object>',
      description:
        'Replaces a device (rename/relabel: PUT the modified device). A null rev sends If-Match: *.',
      params: [
        {
          name: 'userId',
          type: 'string',
          description: 'id of the user',
          required: true,
        },
        typeDoc,
        {
          name: 'deviceUuid',
          type: 'string',
          description: 'uuid of the device',
          required: true,
        },
        {
          name: 'rev',
          type: 'string | null',
          description: 'revision the update is based on',
          required: true,
        },
        {
          name: 'value',
          type: 'object',
          description: 'the replacement device',
          required: true,
        },
      ],
      returns: '{Promise<object>} the updated device',
    },
    {
      typeName: 'am.devices',
      methodName: 'delete',
      signature: 'delete(userId, type, deviceUuid, rev): Promise<object>',
      description:
        'Deletes a registered device (the reset of an MFA registration) and returns the deleted object.',
      params: [
        {
          name: 'userId',
          type: 'string',
          description: 'id of the user',
          required: true,
        },
        typeDoc,
        {
          name: 'deviceUuid',
          type: 'string',
          description: 'uuid of the device',
          required: true,
        },
        {
          name: 'rev',
          type: 'string | null',
          description: 'revision the delete is based on',
          required: true,
        },
      ],
      returns: '{Promise<object>} the deleted device',
    },
  ];
}

function sessionDocs(): MethodHelpDoc[] {
  return [
    {
      typeName: 'am.sessions',
      methodName: 'info',
      signature: 'info(tokenId?): Promise<object>',
      description:
        'Reads session details for a token; without a token, for the credential this console session carries.',
      params: [
        {
          name: 'tokenId',
          type: 'string',
          description: 'session token; omit for the current session',
          required: false,
        },
      ],
      returns:
        '{Promise<object>} the session info (username, realm, latestAccessTime, ...)',
    },
    {
      typeName: 'am.sessions',
      methodName: 'validate',
      signature: 'validate(tokenId): Promise<object>',
      description: 'Validates a session token.',
      params: [
        {
          name: 'tokenId',
          type: 'string',
          description: 'session token',
          required: true,
        },
      ],
      returns: '{Promise<object>} {valid: boolean, ...}',
    },
    {
      typeName: 'am.sessions',
      methodName: 'refresh',
      signature: 'refresh(tokenId): Promise<object>',
      description: "Refreshes a session's idle time.",
      params: [
        {
          name: 'tokenId',
          type: 'string',
          description: 'session token',
          required: true,
        },
      ],
      returns: '{Promise<object>} the refreshed session info',
    },
    {
      typeName: 'am.sessions',
      methodName: 'logout',
      signature: 'logout(tokenId): Promise<object>',
      description:
        'Ends a session. The token rides the header named like the session cookie; no other credential is attached.',
      params: [
        {
          name: 'tokenId',
          type: 'string',
          description: 'session token to end',
          required: true,
        },
      ],
      returns: '{Promise<object>} {result: "Successfully logged out"}',
    },
  ];
}
