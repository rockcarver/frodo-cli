import { beforeAll, describe, expect, it } from '@jest/globals';
import { frodo, state } from '@rockcarver/frodo-lib';
import { AM_DEVICE_TYPES, AM_METHOD_DOCS, createAmApi } from './ShellAmOps';
import { ShellRestError, ShellRestResult } from './ShellRestOps';

/**
 * Unit tests for the AM identity/device/session functions (ShellAmOps).
 * Pinned here: the URL shapes composed from the session's realm (the
 * wrapper's core value), the version headers, method-to-verb mapping,
 * null-on-404, membership edits, and the synchronous validation. The
 * credential and realm resolution behind them is exercised against a
 * live fake in the PTY layer.
 */

function makeRest() {
  const calls: Array<{
    method: string;
    url: string;
    data?: unknown;
    headers?: Record<string, string>;
  }> = [];
  let nextResponse: unknown = { ok: true };
  let nextError: ShellRestError | undefined;
  const rest = {
    async get(url: string, headers?: Record<string, string>) {
      calls.push({ method: 'GET', url, headers });
      if (nextError) throw nextError;
      return nextResponse;
    },
    async post(url: string, data?: unknown, headers?: Record<string, string>) {
      calls.push({ method: 'POST', url, data, headers });
      if (nextError) throw nextError;
      return nextResponse;
    },
    async put(url: string, data?: unknown, headers?: Record<string, string>) {
      calls.push({ method: 'PUT', url, data, headers });
      if (nextError) throw nextError;
      return nextResponse;
    },
    async patch(url: string, data?: unknown, headers?: Record<string, string>) {
      calls.push({ method: 'PATCH', url, data, headers });
      if (nextError) throw nextError;
      return nextResponse;
    },
    async delete(url: string, headers?: Record<string, string>) {
      calls.push({ method: 'DELETE', url, headers });
      if (nextError) throw nextError;
      return nextResponse;
    },
  };
  return {
    calls,
    rest: rest as never,
    respond(value: unknown) {
      nextResponse = value;
    },
    fail(status: number) {
      const result = {
        status,
        statusText: '',
        headers: {},
        data: { message: 'nope' },
      } as ShellRestResult;
      nextError = new ShellRestError(result);
      nextResponse = undefined;
    },
  };
}

beforeAll(() => {
  // Pin the session's realm so the realm-path composition is exact.
  state.setRealm('/alpha');
});

describe('am identity URL composition', () => {
  it('composes the realm JSON base from the session realm', async () => {
    const t = makeRest();
    const am = createAmApi(t.rest);
    await am.users.read('bjensen');
    expect(t.calls[0].url).toBe(
      'am/json/realms/root/realms/alpha/users/bjensen'
    );
    expect(t.calls[0].headers).toMatchObject({
      'Accept-API-Version': 'protocol=2.0,resource=4.0',
    });
  });

  it('sends the default query filter when params has none', async () => {
    const t = makeRest();
    const am = createAmApi(t.rest);
    await am.users.query();
    expect(t.calls[0].url).toBe(
      'am/json/realms/root/realms/alpha/users?_queryFilter=true'
    );
    await am.groups.query({ _pageSize: 10 });
    // A params object without a selector still gets the default filter
    // appended (all objects).
    expect(t.calls[1].url).toBe(
      'am/json/realms/root/realms/alpha/groups?_pageSize=10&_queryFilter=true'
    );
  });

  it('leaves a typed filter raw in the query string', async () => {
    const t = makeRest();
    const am = createAmApi(t.rest);
    await am.users.query({ _queryFilter: 'userName eq "bjensen"' });
    expect(t.calls[0].url).toBe(
      'am/json/realms/root/realms/alpha/users?_queryFilter=userName eq "bjensen"'
    );
  });

  it('counts users with _pageSize=0 and the exact policy', async () => {
    const t = makeRest();
    const am = createAmApi(t.rest);
    t.respond({ totalPagedResults: 7 });
    await expect(am.users.count()).resolves.toBe(7);
    expect(t.calls[0].url).toContain('_pageSize=0');
    expect(t.calls[0].url).toContain('_totalPagedResultsPolicy=EXACT');
  });

  it('falls back through resultCount and result.length for counts', async () => {
    const t = makeRest();
    const am = createAmApi(t.rest);
    t.respond({ resultCount: 3 });
    await expect(am.users.count()).resolves.toBe(3);
    t.respond({ result: [1, 2] });
    await expect(am.users.count()).resolves.toBe(2);
  });

  it('creates with _action=create for a null id and PUT+If-None-Match for an id', async () => {
    const t = makeRest();
    const am = createAmApi(t.rest);
    await am.users.create(null, { userName: 'x' });
    expect(t.calls[0]).toMatchObject({
      method: 'POST',
      url: 'am/json/realms/root/realms/alpha/users?_action=create',
    });
    await am.users.create('jdoe', { userName: 'jdoe' });
    expect(t.calls[1]).toMatchObject({
      method: 'PUT',
      url: 'am/json/realms/root/realms/alpha/users/jdoe',
      headers: expect.objectContaining({ 'If-None-Match': '*' }),
    });
  });

  it('sends If-Match only for a given rev', async () => {
    const t = makeRest();
    const am = createAmApi(t.rest);
    await am.users.update('jdoe', 'rev-1', { userName: 'x' });
    expect(t.calls[0].headers).toMatchObject({ 'If-Match': 'rev-1' });
    await am.users.delete('jdoe', null);
    expect(t.calls[1].headers?.['If-Match']).toBeUndefined();
  });

  it('resolves null on 404 for reads', async () => {
    const t = makeRest();
    const am = createAmApi(t.rest);
    t.fail(404);
    await expect(am.groups.read('ghost')).resolves.toBeNull();
  });

  it('throws synchronously on a missing id (not a rejected promise)', () => {
    const t = makeRest();
    const am = createAmApi(t.rest);
    expect(() => am.users.read(undefined as unknown as string)).toThrow(
      /am\.users\.read: userId is required/
    );
    expect(t.calls).toHaveLength(0);
  });
});

describe('am group membership', () => {
  it('appends the member DN and PUTs the group back with its rev', async () => {
    const t = makeRest();
    const am = createAmApi(t.rest);
    // First call (read) returns the group (holding member 'a'); the PUT
    // response is queued only after the read resolved (one slot).
    t.respond({
      _id: 'admins',
      _rev: 'r1',
      uniqueMember: ['uid=a,ou=people,x'],
    });
    const putPromise = am.groups.addMember('admins', 'b');
    t.respond({
      _id: 'admins',
      uniqueMember: ['uid=a,ou=people,x', 'uid=b,ou=people,dc=alpha,dc=root'],
    });
    await putPromise;
    expect(t.calls[0].method).toBe('GET');
    expect(t.calls[1]).toMatchObject({ method: 'PUT' });
    const body = t.calls[1].data as { uniqueMember: string[] };
    // The existing member plus the newly composed DN for 'b'.
    expect(body.uniqueMember).toHaveLength(2);
    expect(body.uniqueMember.some((m) => m.startsWith('uid=b,'))).toBe(true);
    expect(t.calls[1].headers).toMatchObject({ 'If-Match': 'r1' });
  });

  it('removes a member by suffix match', async () => {
    const t = makeRest();
    const am = createAmApi(t.rest);
    t.respond({
      _id: 'admins',
      _rev: 'r2',
      uniqueMember: ['uid=a,ou=people,dc=x', 'uid=b,ou=people,dc=x'],
    });
    const putPromise = am.groups.removeMember('admins', 'b');
    t.respond({ _id: 'admins', uniqueMember: ['uid=a,ou=people,dc=x'] });
    await putPromise;
    const body = t.calls[1].data as { uniqueMember: string[] };
    expect(body.uniqueMember).toEqual(['uid=a,ou=people,dc=x']);
  });
});

describe('am devices', () => {
  it('composes the device collection URL under the user', async () => {
    const t = makeRest();
    const am = createAmApi(t.rest);
    await am.devices.list('bjensen', 'oath');
    expect(t.calls[0].url).toBe(
      'am/json/realms/root/realms/alpha/users/bjensen/devices/2fa/oath?_queryFilter=true'
    );
    await am.devices.read('bjensen', 'push', 'uuid-1');
    expect(t.calls[1].url).toBe(
      'am/json/realms/root/realms/alpha/users/bjensen/devices/2fa/push/uuid-1'
    );
  });

  it('rejects an unknown device type synchronously', () => {
    const t = makeRest();
    const am = createAmApi(t.rest);
    expect(() => am.devices.list('bjensen', 'toaster' as never)).toThrow(
      /device type must be one of/
    );
    expect(t.calls).toHaveLength(0);
  });

  it('exposes the fixed device-type set', () => {
    expect(AM_DEVICE_TYPES).toEqual([
      'binding',
      'oath',
      'push',
      'webauthn',
      'profile',
      'trusted',
    ]);
  });
});

describe('am sessions', () => {
  it('posts the session actions with the session API version', async () => {
    const t = makeRest();
    const am = createAmApi(t.rest);
    await am.sessions.validate('tok-1');
    expect(t.calls[0]).toMatchObject({
      method: 'POST',
      url: 'am/json/realms/root/realms/alpha/sessions?_action=validate',
      data: { tokenId: 'tok-1' },
      headers: expect.objectContaining({
        'Accept-API-Version': 'resource=4.0',
      }),
    });
    await am.sessions.refresh('tok-1');
    expect(t.calls[1].url).toContain('_action=refresh');
  });

  it('info without a token asks about the carried credential', async () => {
    const t = makeRest();
    const am = createAmApi(t.rest);
    await am.sessions.info();
    expect(t.calls[0]).toMatchObject({
      url: 'am/json/realms/root/realms/alpha/sessions?_action=getSessionInfo',
      data: { tokenId: '' },
    });
  });

  it('logout rides the cookie-name header', async () => {
    const t = makeRest();
    const am = createAmApi(t.rest);
    await am.sessions.logout('tok-9');
    expect(t.calls[0].url).toContain('_action=logout');
    expect(t.calls[0].headers?.['iPlanetDirectoryPro']).toBe('tok-9');
    expect(t.calls[0].headers).toMatchObject({
      'Accept-API-Version': 'resource=3.1, protocol=1.0',
    });
  });
});

describe('AM_METHOD_DOCS', () => {
  it('documents every function the object exposes, per namespace', () => {
    const am = createAmApi(makeRest().rest);
    const byType: Record<string, string[]> = {
      'am.users': Object.keys(am.users).sort(),
      'am.groups': Object.keys(am.groups).sort(),
      'am.devices': Object.keys(am.devices).sort(),
      'am.sessions': Object.keys(am.sessions).sort(),
    };
    for (const [typeName, methods] of Object.entries(byType)) {
      const docMethods = [
        ...new Set(
          AM_METHOD_DOCS.filter((d) => d.typeName === typeName).map(
            (d) => d.methodName
          )
        ),
      ].sort();
      expect(docMethods).toEqual(methods);
    }
  });
});
