import { frodo } from '@rockcarver/frodo-lib';
import { MethodHelpDoc } from './ShellAutoCompleteOps';
import { ShellRest, ShellRestError } from './ShellRestOps';

/**
 * The IDM scripting functions (`openidm.*`) for the frodo JS console
 * (`frodo shell`), mirroring the functions IDM provides to server-side
 * scripts (see the PingOne AIC "IDM scripting functions" reference).
 *
 * Two execution paths:
 *
 * - CRUDPA (create, read, update, patch, delete, query, action) go over the
 *   console's own REST facade ($-facade request layer), so they inherit its
 *   credential handling, URL encoding and `$.last` tracking. They resolve
 *   with the response body and reject with ShellRestError on HTTP errors,
 *   like the facade does.
 * - The crypto helpers (encrypt, decrypt, hash, matches) are evaluated
 *   through frodo-lib's script evaluation, which posts a small script to
 *   the IDM script endpoint (`/script?_action=eval`). They cannot run
 *   locally: encryption and hashing happen with the tenant's own keys and
 *   salt configuration.
 *
 * Divergence from server-side scripts worth knowing: server-side functions
 * are synchronous and run with the script's authorization context; here
 * they are async (typed in the console with `await`) and run with the
 * connected session's credentials.
 */

/**
 * Alias the script-evaluation helper uses when encrypting without an
 * explicit alias, matching frodo-lib's own crypto ops.
 */
const DEFAULT_ENCRYPT_ALIAS = 'idm.password.encryption';

/**
 * Strip the forms a resource path may arrive in down to what the REST
 * facade resolves against the IDM base URL:
 * `managed/user`, `/openidm/managed/user` and `openidm/managed/user` all
 * become `managed/user`. Absolute URLs pass through untouched. A missing
 * or non-string path throws a TypeError naming the function, so a bare
 * `openidm.read()` fails with a clear message instead of a deep crash
 * inside a rejected promise.
 */
function normalizeResource(
  functionName: string,
  resourceName: unknown
): string {
  if (typeof resourceName !== 'string' || resourceName.length === 0) {
    throw new TypeError(
      `openidm.${functionName}: resourceName is required (e.g. 'managed/user/jdoe').`
    );
  }
  if (/^https?:\/\//i.test(resourceName)) return resourceName;
  return resourceName.replace(/^\/+/, '').replace(/^openidm\//i, '');
}

/**
 * Append query parameters and a _fields selection to a resource path.
 * Values are left raw: the facade's encodeUrlPathAndQuery percent-encodes
 * what the HTTP request line cannot carry (spaces, quotes, brackets), so a
 * filter typed naturally (`userName eq "bjensen"`) arrives encoded without
 * pre-encoding anything. Values that are already percent-encoded survive
 * (encodeURI leaves existing %XX sequences alone).
 */
function appendQuery(
  resource: string,
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
  if (pairs.length === 0) return resource;
  return `${resource}${resource.includes('?') ? '&' : '?'}${pairs.join('&')}`;
}

/** Is the value a single patch operation ({operation, field, ...})? */
function isSinglePatchOperation(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).operation === 'string'
  );
}

/**
 * One of the crypto helpers, run on the tenant through IDM's script
 * endpoint. The helper body references the globals by name; the values
 * travel in the eval request's globals map (undefined entries drop out in
 * JSON, which is exactly how server-side defaults are reached).
 */
async function evaluateOpenIdmFunction(
  expression: string,
  globals: Record<string, unknown>
): Promise<unknown> {
  return frodo.idm.script.evaluateScript(expression, globals);
}

/**
 * The `openidm` object installed into the console context. Resource paths
 * pass through verbatim (`managed/user`, `managed/alpha_user`,
 * `system/ldap/account`, `config/...`), exactly as server-side scripts
 * write them; the facade resolves them against the connected environment.
 */
export type OpenIdm = {
  /** Adds a new object to a container. */
  create(
    resourceName: string,
    newResourceId: string | null,
    content: unknown,
    params?: Record<string, unknown>,
    fields?: string[]
  ): Promise<unknown>;
  /** Fetches one object by its full path; null when not found. */
  read(
    resourceName: string,
    params?: Record<string, unknown> | null,
    fields?: string[]
  ): Promise<unknown>;
  /** Replaces an entire object with the supplied one. */
  update(
    resourceName: string,
    rev: string | null,
    value: unknown,
    params?: Record<string, unknown>,
    fields?: string[]
  ): Promise<unknown>;
  /** Changes only selected attributes, via patch operations. */
  patch(
    resourceName: string,
    rev: string | null,
    value: unknown,
    params?: Record<string, unknown>,
    fields?: string[]
  ): Promise<unknown>;
  /** Removes an object and returns the deleted object. */
  delete(
    resourceName: string,
    rev: string | null,
    params?: Record<string, unknown>,
    fields?: string[]
  ): Promise<unknown>;
  /** Runs a query using _queryFilter or _queryId. */
  query(
    resourceName: string,
    params: Record<string, unknown>,
    fields?: string[]
  ): Promise<unknown>;
  /** Runs an action standard CRUD or query calls do not cover. */
  action(
    resource: string,
    actionName: string,
    content?: unknown,
    params?: Record<string, unknown>,
    fields?: string[]
  ): Promise<unknown>;
  /** Encrypts a value with the tenant's keys (server-side evaluation). */
  encrypt(value: unknown, cipher?: string, alias?: string): Promise<unknown>;
  /** Decrypts a $crypto blob (server-side evaluation). */
  decrypt(value: unknown): Promise<unknown>;
  /** Whether the value carries a $crypto blob. */
  isEncrypted(value: unknown): boolean;
  /** Computes a salted hash (server-side evaluation). */
  hash(
    value: string,
    algorithm?: string,
    options?: Record<string, unknown>
  ): Promise<unknown>;
  /** Whether the value is a salted-hash $crypto blob. */
  isHashed(value: unknown): boolean;
  /** Hashes a string and compares it against an existing salted hash. */
  matches(plain: string, hashed: unknown): Promise<unknown>;
};

export function createOpenIdm(rest: ShellRest): OpenIdm {
  return {
    create(
      resourceName,
      newResourceId,
      content,
      params,
      fields
    ): Promise<unknown> {
      // Validation runs synchronously, before any promise exists: a bad
      // argument is an Uncaught TypeError in the console, not a rejected
      // promise with a stack plus the unhandled-rejection banner.
      const resource = normalizeResource('create', resourceName);
      if (newResourceId === undefined || newResourceId === null) {
        // Server-generated ID: the create action.
        return rest.post(
          appendQuery(`${resource}?_action=create`, params, fields),
          content
        );
      }
      // Client-provided ID: PUT the new path with If-None-Match: * so an
      // existing object is never silently overwritten (a duplicate is an
      // HTTP 412, matching the server-side create's failure on conflict).
      if (typeof newResourceId !== 'string' || newResourceId.length === 0) {
        throw new TypeError(
          'openidm.create: newResourceId must be a string; pass null to have the server generate one.'
        );
      }
      const url = appendQuery(`${resource}/${newResourceId}`, params, fields);
      return rest.put(url, content, { 'If-None-Match': '*' });
    },

    read(resourceName, params, fields): Promise<unknown> {
      const path = normalizeResource('read', resourceName);
      const url = appendQuery(path, params, fields);
      return rest.get(url).then(
        (data) => data,
        (error) => {
          // Server-side read returns null for a missing object.
          if (error instanceof ShellRestError && error.result.status === 404) {
            return null;
          }
          throw error;
        }
      );
    },

    update(resourceName, rev, value, params, fields): Promise<unknown> {
      const url = appendQuery(
        normalizeResource('update', resourceName),
        params,
        fields
      );
      const headers =
        rev === undefined || rev === null ? undefined : { 'If-Match': rev };
      return rest.put(url, value, headers);
    },

    patch(resourceName, rev, value, params, fields): Promise<unknown> {
      const url = appendQuery(
        normalizeResource('patch', resourceName),
        params,
        fields
      );
      const headers =
        rev === undefined || rev === null ? undefined : { 'If-Match': rev };
      // The REST PATCH body is an array of operations; a lone
      // {operation, field, ...} object is accepted and wrapped, which is
      // what server-side scripts routinely pass.
      const body = isSinglePatchOperation(value) ? [value] : value;
      return rest.patch(url, body, headers);
    },

    delete(resourceName, rev, params, fields): Promise<unknown> {
      const url = appendQuery(
        normalizeResource('delete', resourceName),
        params,
        fields
      );
      const headers =
        rev === undefined || rev === null ? undefined : { 'If-Match': rev };
      return rest.delete(url, headers);
    },

    query(resourceName, params, fields): Promise<unknown> {
      const path = normalizeResource('query', resourceName);
      const entries = Object.entries(params ?? {});
      const hasQuery =
        entries.some(([key]) => key === '_queryFilter') ||
        entries.some(([key]) => key === '_queryId');
      if (!hasQuery) {
        throw new Error(
          'openidm.query requires _queryFilter or _queryId in params.'
        );
      }
      return rest.get(appendQuery(path, params, fields));
    },

    action(resource, actionName, content, params, fields): Promise<unknown> {
      const url = appendQuery(
        `${normalizeResource('action', resource)}?_action=${actionName}`,
        params,
        fields
      );
      // Actions generally read a JSON body; an empty object keeps the
      // content-type honest for the actions that ignore it.
      return rest.post(url, content ?? {});
    },

    async encrypt(value, cipher, alias): Promise<unknown> {
      return evaluateOpenIdmFunction('openidm.encrypt(value, cipher, alias)', {
        value:
          typeof value === 'object' && value !== null ? value : String(value),
        cipher: cipher ?? null,
        alias: alias ?? DEFAULT_ENCRYPT_ALIAS,
      });
    },

    async decrypt(value): Promise<unknown> {
      return evaluateOpenIdmFunction('openidm.decrypt(value)', { value });
    },

    isEncrypted(value: unknown): boolean {
      // Same check frodo-lib's own crypto ops make: an encrypted value is
      // an object carrying a $crypto blob.
      if (typeof value !== 'object' || value === null) return false;
      return Boolean((value as Record<string, unknown>)['$crypto']);
    },

    async hash(value, algorithm, options): Promise<unknown> {
      return evaluateOpenIdmFunction(
        'openidm.hash(value, algorithm, options)',
        {
          value,
          algorithm,
          options,
        }
      );
    },

    isHashed(value: unknown): boolean {
      const blob = (value as Record<string, unknown> | null | undefined)?.[
        '$crypto'
      ] as Record<string, unknown> | undefined;
      return typeof blob?.type === 'string' && blob.type.includes('hash');
    },

    async matches(plain, hashed): Promise<unknown> {
      return evaluateOpenIdmFunction('openidm.matches(string, value)', {
        string: plain,
        value: hashed,
      });
    },
  };
}

/**
 * Hand-written help docs for the openidm functions, in the same shape
 * frodo-lib's help metadata arrives in. Merged into the console's doc
 * index, so `openidm.re` completes with a signature and the hint line
 * describes the parameters, on both the terminal and the web console.
 */
export const OPENIDM_METHOD_DOCS: MethodHelpDoc[] = [
  {
    typeName: 'openidm',
    methodName: 'create',
    signature:
      'create(resourceName, newResourceId, content, params?, fields?): Promise<object>',
    description:
      'Adds a new object to a container. Pass null as newResourceId to have the server generate an ID.',
    params: [
      {
        name: 'resourceName',
        type: 'string',
        description: 'container path, e.g. managed/user',
        required: true,
      },
      {
        name: 'newResourceId',
        type: 'string | null',
        description: 'client-provided ID; null lets the server generate one',
        required: true,
      },
      {
        name: 'content',
        type: 'object',
        description: 'the new object',
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
    returns: '{Promise<object>} the created object',
  },
  {
    typeName: 'openidm',
    methodName: 'read',
    signature: 'read(resourceName, params?, fields?): Promise<object | null>',
    description:
      'Fetches one object by its full path. Returns null if it is not found.',
    params: [
      {
        name: 'resourceName',
        type: 'string',
        description: 'full path of the object',
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
    returns: '{Promise<object | null>} the object, or null when not found',
  },
  {
    typeName: 'openidm',
    methodName: 'update',
    signature:
      'update(resourceName, rev, value, params?, fields?): Promise<object>',
    description:
      'Replaces an entire object with the supplied one. Pass null as rev to skip the revision check.',
    params: [
      {
        name: 'resourceName',
        type: 'string',
        description: 'full path of the object',
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
    returns: '{Promise<object>} the updated object',
  },
  {
    typeName: 'openidm',
    methodName: 'patch',
    signature:
      'patch(resourceName, rev, value, params?, fields?): Promise<object>',
    description:
      'Changes only selected attributes, using add, remove, replace or increment operations.',
    params: [
      {
        name: 'resourceName',
        type: 'string',
        description: 'full path of the object',
        required: true,
      },
      {
        name: 'rev',
        type: 'string | null',
        description: 'revision the patch is based on',
        required: true,
      },
      {
        name: 'value',
        type: 'object[]',
        description: 'patch operations (a single operation object is wrapped)',
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
    returns: '{Promise<object>} the patched object',
  },
  {
    typeName: 'openidm',
    methodName: 'delete',
    signature: 'delete(resourceName, rev, params?, fields?): Promise<object>',
    description: 'Removes an object and returns the deleted object.',
    params: [
      {
        name: 'resourceName',
        type: 'string',
        description: 'full path of the object',
        required: true,
      },
      {
        name: 'rev',
        type: 'string | null',
        description: 'revision the delete is based on',
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
    returns: '{Promise<object>} the deleted object',
  },
  {
    typeName: 'openidm',
    methodName: 'query',
    signature: 'query(resourceName, params, fields?): Promise<object>',
    description:
      'Runs a query using _queryFilter or _queryId. Paging and sort parameters are supported.',
    params: [
      {
        name: 'resourceName',
        type: 'string',
        description: 'container path to query',
        required: true,
      },
      {
        name: 'params',
        type: 'object',
        description:
          'query parameters: _queryFilter or _queryId, _pageSize, _pagedResultsOffset, _sortKeys, ...',
        required: true,
      },
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
    typeName: 'openidm',
    methodName: 'action',
    signature:
      'action(resource, actionName, content?, params?, fields?): Promise<unknown>',
    description:
      'Runs an action standard CRUD or query calls do not cover, such as external/email send.',
    params: [
      {
        name: 'resource',
        type: 'string',
        description: 'path of the resource to act on',
        required: true,
      },
      {
        name: 'actionName',
        type: 'string',
        description: 'the action, e.g. send, patch, run',
        required: true,
      },
      {
        name: 'content',
        type: 'object',
        description: 'the action content',
        required: false,
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
    returns: '{Promise<unknown>} the action result',
  },
  {
    typeName: 'openidm',
    methodName: 'encrypt',
    signature: 'encrypt(value, cipher?, alias?): Promise<any>',
    description:
      "Encrypts a value with the tenant's keys, through the IDM script endpoint.",
    params: [
      {
        name: 'value',
        type: 'any',
        description: 'value to encrypt',
        required: true,
      },
      {
        name: 'cipher',
        type: 'string',
        description: 'cipher; default is the server default',
        required: false,
      },
      {
        name: 'alias',
        type: 'string',
        description: 'key alias; default idm.password.encryption',
        required: false,
      },
    ],
    returns: '{Promise<any>} the encrypted value ($crypto object)',
  },
  {
    typeName: 'openidm',
    methodName: 'decrypt',
    signature: 'decrypt(value): Promise<any>',
    description:
      'Returns a deep copy with encrypted values decrypted. Needs an object, not a plain string.',
    params: [
      {
        name: 'value',
        type: 'object',
        description: 'the $crypto object to decrypt',
        required: true,
      },
    ],
    returns: '{Promise<any>} the decrypted value',
  },
  {
    typeName: 'openidm',
    methodName: 'isEncrypted',
    signature: 'isEncrypted(value): boolean',
    description: 'Returns whether the value carries a $crypto blob.',
    params: [
      {
        name: 'value',
        type: 'any',
        description: 'value to test',
        required: true,
      },
    ],
    returns: '{boolean} true if the value is encrypted, false otherwise',
  },
  {
    typeName: 'openidm',
    methodName: 'hash',
    signature: 'hash(value, algorithm?, options?): Promise<string>',
    description:
      'Computes a salted hash. Algorithms: BCRYPT, PBKDF2, SCRYPT, SHA-256 (the default), SHA-384, SHA-512.',
    params: [
      {
        name: 'value',
        type: 'string',
        description: 'the string to hash',
        required: true,
      },
      {
        name: 'algorithm',
        type: 'string',
        description: 'hash algorithm; default SHA-256',
        required: false,
      },
      {
        name: 'options',
        type: 'object',
        description: 'algorithm options (salt size, cost, ...)',
        required: false,
      },
    ],
    returns: '{Promise<string>} the salted hash ($crypto object)',
  },
  {
    typeName: 'openidm',
    methodName: 'isHashed',
    signature: 'isHashed(value): boolean',
    description: 'Returns whether the value is a salted-hash $crypto blob.',
    params: [
      {
        name: 'value',
        type: 'any',
        description: 'value to test',
        required: true,
      },
    ],
    returns: '{boolean} true if the value was produced by a salted hash',
  },
  {
    typeName: 'openidm',
    methodName: 'matches',
    signature: 'matches(plain, hashed): Promise<boolean>',
    description:
      'Hashes a string and checks it against an existing salted-hash $crypto object.',
    params: [
      {
        name: 'plain',
        type: 'string',
        description: 'the string to check',
        required: true,
      },
      {
        name: 'hashed',
        type: 'object',
        description: 'the full $crypto object to compare against',
        required: true,
      },
    ],
    returns: '{Promise<boolean>} true when the string matches the hash',
  },
];
