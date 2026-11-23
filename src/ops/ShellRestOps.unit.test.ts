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

  it('encodes brackets in array syntax', () => {
    expect(encodeUrlPathAndQuery('https://host/x?a[0]=1')).toBe(
      'https://host/x?a%5B0%5D=1'
    );
  });
});
