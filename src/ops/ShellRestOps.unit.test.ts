import { describe, expect, it } from '@jest/globals';
import { frodo, state } from '@rockcarver/frodo-lib';
import { encodeUrlPathAndQuery, resolveUrl } from './ShellRestOps';

/**
 * Unit tests for the console's URL router and encoder (ShellRestOps).
 *
 * The credential resolution path is exercised through the live $ facade in
 * the PTY/e2e layer against recorded traffic; these tests pin the pure
 * routing and encoding behavior.
 */

// the character that ends the user information of a URL, kept apart so that
// no test URL reads as an e-mail address
const AT = '@';

describe('ShellRestOps resolveUrl', () => {
  it('routes /openidm paths to the IDM base URL and strips the prefix', () => {
    state.setHost('https://openam.example.com/am');
    const { absoluteUrl, domain } = resolveUrl(
      '/openidm/managed/alpha_user?_queryFilter=true'
    );
    expect(absoluteUrl).toBe(
      'https://openam.example.com/openidm/managed/alpha_user?_queryFilter=true'
    );
    expect(domain).toBe('idm');
  });

  it('routes bare /openidm to the IDM root', () => {
    state.setHost('https://openam.example.com/am');
    const { absoluteUrl, domain } = resolveUrl('/openidm');
    expect(absoluteUrl).toBe('https://openam.example.com/openidm/');
    expect(domain).toBe('idm');
  });

  it('routes /am paths to the AM host (which carries the context path)', () => {
    state.setHost('https://openam.example.com/am');
    const { absoluteUrl, domain } = resolveUrl('/am/json/authenticate');
    expect(absoluteUrl).toBe('https://openam.example.com/am/json/authenticate');
    expect(domain).toBe('am');
  });

  it('routes other relative paths to IDM (console sits on the IDM origin)', () => {
    state.setHost('https://openam.example.com/am');
    const { absoluteUrl, domain } = resolveUrl('/some/endpoint');
    expect(absoluteUrl).toBe(
      'https://openam.example.com/openidm/some/endpoint'
    );
    expect(domain).toBe('idm');
  });

  it('routes absolute URLs to the connected host as AM unless /openidm is in the path', () => {
    state.setHost('https://openam.example.com/am');
    const am = resolveUrl(
      'https://openam.example.com/am/json/realms/root/serverinfo'
    );
    expect(am.domain).toBe('am');
    const idm = resolveUrl('https://openam.example.com/openidm/managed/user');
    expect(idm.domain).toBe('idm');
  });

  it('attaches no credential to absolute URLs on a different host', () => {
    state.setHost('https://openam.example.com/am');
    const other = resolveUrl('https://evil.example.com/openidm/managed/user');
    expect(other.domain).toBe('none');
  });

  it('attaches no credential to a host that only looks like the connected one', () => {
    state.setHost('https://openam.example.com/am');
    for (const url of [
      'https://evil-openam.example.com/openidm/managed/user',
      'https://openam.example.com.evil.test/am/json/x',
      'https://sub.openam.example.com/am/json/x',
      'https://openam.example.com:8443/am/json/x',
      'https://openam.example.com./am/json/x',
      'https://example.com/am/json/x',
      'https://[unreadable/am/json/x',
    ]) {
      expect(resolveUrl(url).domain).toBe('none');
    }
  });

  it('judges the host of a URL as it is sent, after its characters are encoded', () => {
    state.setHost('https://openam.example.com/am');
    // the host as typed is the tenant, the host as sent (a backslash becomes
    // %5C, which ends the user name of the user information) is another one
    for (const url of [
      'https://openam.example.com\\@evil.test/am/json/x',
      'https://openam.example.com\\@evil.test/openidm/managed/user',
      `https://openam.example.com${AT}evil.test/am/json/x`,
      `https://openam.example.com%2f${AT}evil.test/am/json/x`,
    ]) {
      expect(resolveUrl(url).domain).toBe('none');
    }
    // the other way round the request goes to the tenant, and only there
    expect(
      resolveUrl('https://evil.test\\@openam.example.com/am/json/x').domain
    ).toBe('am');
    // the host is the tenant's whatever its letter case or default port
    expect(resolveUrl('HTTPS://OPENAM.EXAMPLE.COM:443/openidm/x').domain).toBe(
      'idm'
    );
    expect(resolveUrl('https://openam.example.com/am/json/x\t').domain).toBe(
      'am'
    );
  });

  it('decides IDM or AM on the path of an absolute URL, not on its query or its fragment', () => {
    state.setHost('https://openam.example.com/am');
    expect(
      resolveUrl('https://openam.example.com/am/json/x?next=/openidm/managed')
        .domain
    ).toBe('am');
    expect(
      resolveUrl('https://openam.example.com/am/json/x#/openidm/y').domain
    ).toBe('am');
    expect(
      resolveUrl(
        'https://openam.example.com/openidm/managed/user?_fields=/am/x'
      ).domain
    ).toBe('idm');
  });

  it('counts the scheme and the port: another origin of the tenant host is not the tenant', () => {
    state.setHost('https://openam.example.com/am');
    // a typed or followed http:// URL for an https tenant would send the
    // credential in clear
    for (const url of [
      'http://openam.example.com/openidm/managed/user',
      'http://openam.example.com:80/openidm/managed/user',
      'http://openam.example.com:443/openidm/managed/user',
      'https://openam.example.com:80/openidm/managed/user',
      'HTTP://OPENAM.EXAMPLE.COM/am/json/x',
    ]) {
      expect(resolveUrl(url).domain).toBe('none');
    }
    // the default port, written or not, is the tenant's own origin
    for (const url of [
      'https://openam.example.com/openidm/managed/user',
      'https://openam.example.com:443/openidm/managed/user',
      'HTTPS://OPENAM.EXAMPLE.COM:00443/openidm/managed/user',
    ]) {
      expect(resolveUrl(url).domain).toBe('idm');
    }
    state.setHost('http://openam.example.com/am');
    for (const url of [
      'https://openam.example.com/openidm/managed/user',
      'https://openam.example.com:80/openidm/managed/user',
      'http://openam.example.com:8080/openidm/managed/user',
    ]) {
      expect(resolveUrl(url).domain).toBe('none');
    }
    for (const url of [
      'http://openam.example.com/am/json/x',
      'http://openam.example.com:80/am/json/x',
      'HTTP://OPENAM.EXAMPLE.COM:80/am/json/x',
    ]) {
      expect(resolveUrl(url).domain).toBe('am');
    }
  });

  it('knows the /openidm path in any letter case', () => {
    state.setHost('https://openam.example.com/am');
    expect(
      resolveUrl('https://openam.example.com/OPENIDM/managed/user').domain
    ).toBe('idm');
    expect(resolveUrl('/OpenIDM/managed/user')).toMatchObject({
      domain: 'idm',
    });
  });

  it('honors an explicit IDM host override', () => {
    state.setHost('https://openam.example.com/am');
    state.setIdmHost('https://openidm.example.com');
    const { absoluteUrl, domain } = resolveUrl('/openidm/managed/user');
    expect(absoluteUrl).toBe('https://openidm.example.com/managed/user');
    expect(domain).toBe('idm');
    state.setIdmHost(undefined);
  });

  it('rejects relative URLs with no connected host', () => {
    const savedHost = state.getHost();
    state.setHost(undefined);
    expect(() => resolveUrl('/openidm/managed/user')).toThrow(/Not connected/);
    if (savedHost) state.setHost(savedHost);
  });
});

describe('ShellRestOps encodeUrlPathAndQuery', () => {
  it('encodes spaces and quotes in query filters without touching reserved characters', () => {
    const input =
      'https://host/openidm/managed/alpha_user?_queryFilter=userName eq "bjensen"';
    const encoded = encodeUrlPathAndQuery(input);
    expect(encoded).toBe(
      'https://host/openidm/managed/alpha_user?_queryFilter=userName+eq+%22bjensen%22'
    );
  });

  it('leaves already-encoded input intact', () => {
    const input = 'https://host/openidm/managed/alpha_user?_fields=_id,name';
    expect(encodeUrlPathAndQuery(input)).toBe(input);
  });

  it('leaves a valid %XX escape triplet as written (a paged-results cookie echoes back unchanged)', () => {
    // The defect of the old implementation (encodeURI doubled the %):
    // https://github.com/rockcarver/frodo-cli/issues/1453
    const input =
      'https://host/openidm/system/ldap/account?_pagedResultsCookie=AQAAAOACAAD%2F%2Fabc%3D';
    expect(encodeUrlPathAndQuery(input)).toBe(input);
  });

  it('sends a value + as %2B so it survives the server form decoding', () => {
    // The raw (decoded) paged-results cookie form: base64 with a +.
    expect(
      encodeUrlPathAndQuery('https://host/x?_pagedResultsCookie=AQIC//abc+dEF=')
    ).toBe('https://host/x?_pagedResultsCookie=AQIC//abc%2BdEF=');
  });

  it('encodes a bare % (not an escape triplet) so the caller cannot be swallowed by the server decode', () => {
    expect(encodeUrlPathAndQuery('https://host/x?a=100% done')).toBe(
      'https://host/x?a=100%25+done'
    );
    expect(encodeUrlPathAndQuery('https://host/x?a=%2')).toBe(
      'https://host/x?a=%252'
    );
    expect(encodeUrlPathAndQuery('https://host/x?a=%%2F')).toBe(
      'https://host/x?a=%25%2F'
    );
  });

  it('encodes the characters of the issue-report table (#1428)', () => {
    // a backslash in a path is not allowed raw
    expect(encodeUrlPathAndQuery('https://host.example.com/a\\b')).toBe(
      'https://host.example.com/a%5Cb'
    );
    // lowercase escapes are preserved with their case
    expect(encodeUrlPathAndQuery('https://host.example.com/a/%2f/b')).toBe(
      'https://host.example.com/a/%2f/b'
    );
    // non-ASCII is encoded, an existing é escape survives
    expect(
      encodeUrlPathAndQuery('https://host.example.com/a/%2F/b%C3%A9')
    ).toBe('https://host.example.com/a/%2F/b%C3%A9');
    expect(encodeUrlPathAndQuery('https://host.example.com/café')).toBe(
      'https://host.example.com/caf%C3%A9'
    );
    // a malformed-escape cluster: every lone % doubles, every triplet survives
    expect(encodeUrlPathAndQuery('https://host.example.com/%2 %2g %%2f')).toBe(
      'https://host.example.com/%252+%252g+%25%2f'
    );
    // an existing %25 (a literal %) survives as written; the + in the value
    // travels as %2B (it would form-decode to a space otherwise)
    expect(encodeUrlPathAndQuery('https://host.example.com/%2520+%20')).toBe(
      'https://host.example.com/%2520%2B%20'
    );
  });

  it('encodes brackets in array syntax', () => {
    expect(encodeUrlPathAndQuery('https://host/x?a[0]=1')).toBe(
      'https://host/x?a%5B0%5D=1'
    );
  });
});
