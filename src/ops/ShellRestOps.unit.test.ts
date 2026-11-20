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
