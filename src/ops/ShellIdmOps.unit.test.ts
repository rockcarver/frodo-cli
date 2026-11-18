import { describe, expect, it } from '@jest/globals';
import { createOpenIdm, OPENIDM_METHOD_DOCS } from './ShellIdmOps';
import { ShellRestError, ShellRestResult } from './ShellRestOps';

/**
 * Unit tests for the console's IDM scripting functions (ShellIdmOps).
 *
 * The REST functions are tested against a stubbed $ facade: what is pinned
 * here is the mapping from the openidm.* call shapes (null IDs, rev
 * headers, patch wrapping, query-param serialization, null-on-404) to HTTP.
 * The crypto helpers route through frodo-lib's script evaluation and are
 * exercised against a live environment in the PTY layer, not here.
 */

/** A facade stub recording the last call: (method, url, data, headers). */
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

describe('openidm resource-path normalization', () => {
  it('strips leading slashes and the openidm prefix', async () => {
    const t = makeRest();
    const openidm = createOpenIdm(t.rest);
    await openidm.read('managed/user/jdoe');
    await openidm.read('/openidm/managed/user/jdoe');
    await openidm.read('openidm/managed/user/jdoe');
    expect(t.calls.map((c) => c.url)).toEqual([
      'managed/user/jdoe',
      'managed/user/jdoe',
      'managed/user/jdoe',
    ]);
  });

  it('leaves absolute URLs alone', async () => {
    const t = makeRest();
    const openidm = createOpenIdm(t.rest);
    await openidm.read('https://other.example.com/openidm/managed/user');
    expect(t.calls[0].url).toBe(
      'https://other.example.com/openidm/managed/user'
    );
  });
});

describe('openidm.read', () => {
  it('serializes params and fields into the query string', async () => {
    const t = makeRest();
    const openidm = createOpenIdm(t.rest);
    await openidm.read('managed/user/jdoe', { _fieldsFallback: undefined }, [
      'userName',
      'mail',
    ]);
    expect(t.calls[0].url).toBe('managed/user/jdoe?_fields=userName,mail');
  });

  it('keeps a params object that also has a filter', async () => {
    const t = makeRest();
    const openidm = createOpenIdm(t.rest);
    await openidm.read('managed/user/jdoe', { a: 1, b: 'x y' });
    expect(t.calls[0].url).toBe('managed/user/jdoe?a=1&b=x y');
  });

  it('resolves null on HTTP 404, like the server-side function', async () => {
    const t = makeRest();
    const openidm = createOpenIdm(t.rest);
    t.fail(404);
    await expect(openidm.read('managed/user/ghost')).resolves.toBeNull();
  });

  it('rethrows other HTTP errors', async () => {
    const t = makeRest();
    const openidm = createOpenIdm(t.rest);
    t.fail(403);
    await expect(openidm.read('managed/user/secret')).rejects.toThrow(
      /HTTP 403/
    );
  });

  it('throws on a missing path before any request', () => {
    const t = makeRest();
    const openidm = createOpenIdm(t.rest);
    // Validation is synchronous: a bad argument is an Uncaught TypeError
    // in the console, not a rejected promise with the report banner.
    // The cast mirrors what a bare openidm.read() hands over.
    expect(() => openidm.read(undefined as unknown as string)).toThrow(
      /openidm\.read: resourceName is required/
    );
    expect(t.calls).toHaveLength(0);
  });
});

describe('openidm.create', () => {
  it('posts ?_action=create when the ID is null', async () => {
    const t = makeRest();
    const openidm = createOpenIdm(t.rest);
    const content = { userName: 'jdoe' };
    await openidm.create('managed/user', null, content, { a: 'b' });
    expect(t.calls[0]).toMatchObject({
      method: 'POST',
      url: 'managed/user?_action=create&a=b',
      data: content,
    });
  });

  it('PUTs the client-provided ID with If-None-Match: *', async () => {
    const t = makeRest();
    const openidm = createOpenIdm(t.rest);
    const content = { userName: 'jdoe' };
    await openidm.create('managed/user', 'jdoe', content);
    expect(t.calls[0]).toMatchObject({
      method: 'PUT',
      url: 'managed/user/jdoe',
      data: content,
      headers: { 'If-None-Match': '*' },
    });
  });

  it('throws on a client ID that is not a string', () => {
    const t = makeRest();
    const openidm = createOpenIdm(t.rest);
    expect(() =>
      openidm.create('managed/user', 42 as unknown as string, {})
    ).toThrow(/newResourceId must be a string/);
    expect(t.calls).toHaveLength(0);
  });
});

describe('openidm.update / patch / delete revision headers', () => {
  it('sends If-Match when a rev is given', async () => {
    const t = makeRest();
    const openidm = createOpenIdm(t.rest);
    await openidm.update('managed/user/jdoe', 'rev-1', { userName: 'x' });
    await openidm.delete('managed/user/jdoe', 'rev-2');
    expect(t.calls[0]).toMatchObject({
      method: 'PUT',
      headers: { 'If-Match': 'rev-1' },
    });
    expect(t.calls[1]).toMatchObject({
      method: 'DELETE',
      headers: { 'If-Match': 'rev-2' },
    });
  });

  it('sends no If-Match when rev is null', async () => {
    const t = makeRest();
    const openidm = createOpenIdm(t.rest);
    await openidm.update('managed/user/jdoe', null, { userName: 'x' });
    await openidm.patch('managed/user/jdoe', null, [
      { operation: 'replace', field: '/mail', value: 'x@y.z' },
    ]);
    expect(t.calls[0].headers).toBeUndefined();
    expect(t.calls[1].headers).toBeUndefined();
  });

  it('wraps a single patch operation object in an array', async () => {
    const t = makeRest();
    const openidm = createOpenIdm(t.rest);
    const single = { operation: 'replace', field: '/mail', value: 'x@y.z' };
    await openidm.patch('managed/user/jdoe', null, single);
    expect(t.calls[0].data).toEqual([single]);
  });

  it('passes an operations array through unwrapped', async () => {
    const t = makeRest();
    const openidm = createOpenIdm(t.rest);
    const ops = [
      { operation: 'replace', field: '/mail', value: 'x@y.z' },
      { operation: 'remove', field: '/description' },
    ];
    await openidm.patch('managed/user/jdoe', null, ops);
    expect(t.calls[0].data).toEqual(ops);
  });
});

describe('openidm.query', () => {
  it('throws on params without a query filter or id', () => {
    const t = makeRest();
    const openidm = createOpenIdm(t.rest);
    expect(() => openidm.query('managed/user', { _pageSize: 10 })).toThrow(
      /_queryFilter or _queryId/
    );
    expect(t.calls).toHaveLength(0);
  });

  it('sends the filter as the raw query string', async () => {
    const t = makeRest();
    const openidm = createOpenIdm(t.rest);
    await openidm.query('managed/user', {
      _queryFilter: 'userName eq "bjensen"',
      _pageSize: 10,
    });
    expect(t.calls[0]).toMatchObject({
      method: 'GET',
      url: 'managed/user?_queryFilter=userName eq "bjensen"&_pageSize=10',
    });
  });

  it('accepts _queryId too', async () => {
    const t = makeRest();
    const openidm = createOpenIdm(t.rest);
    await openidm.query('managed/user', { _queryId: 'query-all' });
    expect(t.calls[0].url).toBe('managed/user?_queryId=query-all');
  });
});

describe('openidm.action', () => {
  it('posts _action=<name> with a body', async () => {
    const t = makeRest();
    const openidm = createOpenIdm(t.rest);
    await openidm.action('external/email', 'send', {
      to: 'x@y.z',
    });
    expect(t.calls[0]).toMatchObject({
      method: 'POST',
      url: 'external/email?_action=send',
      data: { to: 'x@y.z' },
    });
  });

  it('sends an empty object when content is omitted', async () => {
    const t = makeRest();
    const openidm = createOpenIdm(t.rest);
    await openidm.action('config/sync', 'now');
    expect(t.calls[0].data).toEqual({});
  });
});

describe('openidm.isEncrypted / isHashed', () => {
  it('detects $crypto blobs', () => {
    const openidm = createOpenIdm(makeRest().rest);
    expect(openidm.isEncrypted({ $crypto: { value: 'x' } })).toBe(true);
    expect(openidm.isEncrypted({ plain: 1 })).toBe(false);
    expect(openidm.isEncrypted('string')).toBe(false);
    expect(openidm.isEncrypted(null)).toBe(false);
  });

  it('detects salted-hash blobs by their type', () => {
    const openidm = createOpenIdm(makeRest().rest);
    expect(
      openidm.isHashed({ $crypto: { type: 'salted-hash', value: 'x' } })
    ).toBe(true);
    expect(openidm.isHashed({ $crypto: { type: 'cipher', value: 'x' } })).toBe(
      false
    );
    expect(openidm.isHashed('string')).toBe(false);
  });
});

describe('OPENIDM_METHOD_DOCS', () => {
  it('documents all 13 functions the object exposes', () => {
    const docMethods = new Set(OPENIDM_METHOD_DOCS.map((d) => d.methodName));
    const object = createOpenIdm(makeRest().rest);
    const objectMethods = Object.keys(object);
    expect(objectMethods.sort()).toEqual([...docMethods].sort());
    expect(objectMethods).toHaveLength(13);
  });
});
