import https from 'node:https';
import { frodo, state } from '@rockcarver/frodo-lib';
import axios, { AxiosInstance, AxiosResponse } from 'axios';

/*
 * jQuery-style REST facade for the frodo JS console (`frodo console`).
 *
 * Exposes the jQuery API surface ($.ajax, $.get, $.post, $.put, $.patch,
 * $.delete, $.head) over frodo-lib's own credential model, so scripts typed
 * in the console authenticate exactly like frodo commands do:
 *
 * - browser-login sessions get their per-call token exchange through the
 *   state's credential provider;
 * - bearer-token sessions get a staleness check plus on-demand refresh;
 * - AM-domain calls fall back to the session cookie;
 * - header overrides, insecure TLS and retry config all apply.
 *
 * The credential resolution below deliberately mirrors frodo-lib's
 * api/BaseApi.ts (resolveAmRequestCredential / resolveBearerRequestCredential
 * / attachCredentialInterceptor). frodo-lib does not export its axios
 * generators, so this is replicated here for the console only. Known debt:
 * drifts if frodo-lib's interceptors change.
 */

export type ShellRestResult = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
};

/** Result of the last completed request in the console. */
let lastResult: ShellRestResult | undefined;

const timeoutMs = 30000;
const userAgent = `@rockcarver/frodo-cli (frodo console)`;
const transactionId = `frodo-console-${Date.now()}`;

const { AVAILABLE_SCOPES, TOKEN_FRESHNESS_BUFFER_MS } = frodo.utils.constants;

/** Scopes IDM calls require, matching frodo-lib's own IDM api calls. */
const IDM_SCOPES = [AVAILABLE_SCOPES.IdmFullScope];
/** Scopes AM calls require, matching frodo-lib's general AM api calls. */
const AM_SCOPES = [AVAILABLE_SCOPES.AmFullScope];

type CredentialHeader = { header: string; value: string };

function isStale(meta?: { expires?: number }): boolean {
  if (!meta || typeof meta.expires !== 'number') return false;
  return meta.expires - Date.now() <= TOKEN_FRESHNESS_BUFFER_MS;
}

/**
 * Throw the no-refresh-path error for a stale credential, flagging
 * browser-login sessions the way frodo-lib does.
 */
function throwCannotSilentlyRefresh(credentialLabel: string): never {
  if (state.getAuthMode() === 'interactive') {
    state.setNeedsReauthentication(true);
  }
  throw new Error(
    `Cached ${credentialLabel} has expired and cannot be silently refreshed. Re-authenticate to continue.`
  );
}

/**
 * Refresh the credential through the state's refresh handler when one is
 * installed; throw when the credential is stale and no handler exists.
 * Returns true when a refresh ran (the caller re-reads the credential).
 */
async function refreshIfStale(
  meta: { expires?: number } | undefined,
  credentialLabel: string
): Promise<boolean> {
  if (!isStale(meta)) return false;
  const refresh = state.getTokenRefreshHandler();
  if (refresh) {
    await refresh();
    return true;
  }
  throwCannotSilentlyRefresh(credentialLabel);
}

/**
 * Resolve the credential (header name + value) for a request, following
 * frodo-lib's per-domain rules.
 *
 * @param domain `idm` or `am`
 */
async function resolveCredential(
  domain: 'idm' | 'am'
): Promise<CredentialHeader | null> {
  // Browser-login mode short-circuits everything: the provider performs the
  // per-call RFC 8693 exchange and hands back the header to use. AM domain
  // calls pass their required scopes; IDM is a genuine OAuth2 resource
  // server that accepts the primary token directly.
  const provider = state.getAmCredentialProvider();
  if (provider) {
    return provider(domain === 'am' ? AM_SCOPES : IDM_SCOPES);
  }

  if (domain === 'idm') {
    // frodo-lib's IDM resolvers are bearer-only: on session-cookie-only
    // deployments frodo-lib sends no credential on IDM calls. The browser
    // console authenticates to IDM via same-origin cookies; the closest
    // CLI-side equivalent is to offer the AM session cookie as a fallback
    // when there is no bearer token, which works on deployments where IDM
    // trusts the AM session.
    await refreshIfStale(state.getBearerTokenMeta(), 'bearer token');
    const token = state.getBearerToken();
    if (token) {
      return { header: 'Authorization', value: `Bearer ${token}` };
    }
    const cookieName = state.getCookieName();
    const cookieValue = state.getCookieValue();
    if (cookieName && cookieValue) {
      return { header: 'Cookie', value: `${cookieName}=${cookieValue}` };
    }
    return null;
  }

  // AM domain: bearer token when the session was told to use one, else the
  // session cookie. Staleness is checked against whichever credential applies.
  const useBearer = state.getUseBearerTokenForAmApis();
  const meta = useBearer
    ? state.getBearerTokenMeta()
    : state.getUserSessionTokenMeta();
  await refreshIfStale(meta, useBearer ? 'bearer token' : 'session token');
  if (useBearer) {
    const token = state.getBearerToken();
    return token ? { header: 'Authorization', value: `Bearer ${token}` } : null;
  }
  const cookieName = state.getCookieName();
  const cookieValue = state.getCookieValue();
  return cookieName && cookieValue
    ? { header: 'Cookie', value: `${cookieName}=${cookieValue}` }
    : null;
}

/**
 * Host of a URL string, lowercase, or the empty string when unparseable.
 */
function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Guess the credential domain of an absolute URL on the connected host from
 * its path: /openidm segments mean IDM, anything else (AM's /json, the
 * authenticate tree endpoints, oauth2, ...) means AM.
 */
function guessDomain(url: string): 'idm' | 'am' {
  return /\/openidm(\/|$)/i.test(url) ? 'idm' : 'am';
}

/**
 * Resolve a console URL to an absolute URL plus the credential domain.
 *
 * - `/openidm/...`  -> IDM base URL + the path after the prefix
 * - `/am/...`       -> AM base URL + the path after the prefix
 * - any other relative path -> IDM base URL + path (the console sits on the
 *   IDM origin, matching the native IDM admin console)
 * - absolute URL    -> pass through; credential attached only when the
 *   target host is the connected tenant's host (the same cross-origin
 *   policy a browser applies).
 *
 * @param url the URL as typed in the console
 */
export function resolveUrl(url: string): {
  absoluteUrl: string;
  domain: 'idm' | 'am' | 'none';
} {
  const host = state.getHost();

  if (/^https?:\/\//i.test(url)) {
    const sameHost = hostOf(url) !== '' && hostOf(url) === hostOf(host ?? '');
    return { absoluteUrl: url, domain: sameHost ? guessDomain(url) : 'none' };
  }

  if (!host) {
    throw new Error('Not connected to an environment.');
  }

  // Relative path: strip the leading slash, keep the rest raw.
  const path = url.startsWith('/') ? url.slice(1) : url;

  if (/^openidm(\/|$)/i.test(path)) {
    const idmBase = frodo.utils.getIdmBaseUrl();
    return {
      absoluteUrl: `${idmBase}/${path.slice('openidm/'.length)}`,
      domain: 'idm',
    };
  }
  if (/^am(\/|$)/i.test(path)) {
    // The AM base URL is the configured host itself: it already carries the
    // context path (https://host/am on cloud, https://host/openam on
    // classic, https://host/am on forgeops).
    return {
      absoluteUrl: `${host.replace(/\/+$/, '')}/${path.slice(3)}`,
      domain: 'am',
    };
  }
  const idmBase = frodo.utils.getIdmBaseUrl();
  return { absoluteUrl: `${idmBase}/${path}`, domain: 'idm' };
}

/**
 * Percent-encode characters a raw HTTP request line cannot carry. Leaves
 * existing encodings and reserved characters (`?`, `&`, `=`, `/`, `:`)
 * alone, so a query filter typed naturally
 * (`?_queryFilter=userName eq "bjensen"`) arrives encoded without
 * pre-encoding anything.
 */
export function encodeUrlPathAndQuery(url: string): string {
  return encodeURI(url)
    .replace(/%20/g, '+')
    .replace(/"/g, '%22')
    .replace(/'/g, '%27')
    .replace(/\[/g, '%5B')
    .replace(/\]/g, '%5D');
}

/**
 * Build the axios instance for one console request: the same base headers,
 * timeout and insecure-TLS handling frodo-lib's generators apply.
 */
function buildInstance(): AxiosInstance {
  const headers: Record<string, string> = {
    'User-Agent': userAgent,
    'X-ForgeRock-TransactionId': transactionId,
    'Content-Type': 'application/json',
  };
  for (const [key, value] of Object.entries(
    state.getAuthenticationHeaderOverrides()
  )) {
    headers[key] = value;
  }
  return axios.create({
    timeout: timeoutMs,
    headers,
    ...(state.getAllowInsecureConnection()
      ? { httpsAgent: insecureAgent() }
      : {}),
  });
}

let insecureAgentInstance: https.Agent | undefined;

/**
 * One shared insecure HTTPS agent for the console session (rejectUnauthorized
 * false), created lazily and only when --allow-insecure-connection is set.
 */
function insecureAgent(): https.Agent {
  if (!insecureAgentInstance) {
    insecureAgentInstance = new https.Agent({ rejectUnauthorized: false });
  }
  return insecureAgentInstance as https.Agent;
}

/**
 * Attach the credential resolution interceptor to an instance. Skips
 * resolution when the caller already set Authorization/Cookie explicitly
 * (matching frodo-lib's attachCredentialInterceptor).
 */
function attachCredential(
  instance: AxiosInstance,
  domain: 'idm' | 'am' | 'none'
): void {
  instance.interceptors.request.use(async (config) => {
    const headers = config.headers;
    const has = (name: string) => {
      if (headers && typeof (headers as { has?: unknown }).has === 'function') {
        return (headers as unknown as { has: (n: string) => boolean }).has(
          name
        );
      }
      const plain = (headers ?? {}) as Record<string, unknown>;
      return Object.keys(plain).some(
        (key) => key.toLowerCase() === name.toLowerCase()
      );
    };
    if (domain === 'none' || has('Authorization') || has('Cookie')) {
      return config;
    }
    const credential = await resolveCredential(domain);
    if (credential) {
      (config.headers as Record<string, string>)[credential.header] =
        credential.value;
    }
    return config;
  });
}

async function request(
  method: string,
  url: string,
  data?: unknown,
  options: {
    headers?: Record<string, string>;
    domain?: 'idm' | 'am' | 'none';
  } = {}
): Promise<ShellRestResult> {
  const { absoluteUrl, domain } = resolveUrl(url);
  const encoded = encodeUrlPathAndQuery(absoluteUrl);
  const instance = buildInstance();
  attachCredential(instance, options.domain ?? domain);

  let response: AxiosResponse;
  try {
    response = await instance.request({
      url: encoded,
      method,
      data,
      headers: options.headers,
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const result = toResult(error.response);
        lastResult = result;
        throw new ShellRestError(result, { cause: error });
      }
      throw new Error(
        `${method.toUpperCase()} ${url} failed: ${error.message}`,
        { cause: error }
      );
    }
    throw error;
  }
  const result = toResult(response);
  lastResult = result;
  return result;
}

function toResult(response: AxiosResponse): ShellRestResult {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(response.headers ?? {})) {
    headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return {
    status: response.status,
    statusText: response.statusText ?? '',
    headers,
    data: response.data,
  };
}

/**
 * Error carrying the full REST result so scripts can inspect status/body,
 * with a message that surfaces the server's own code/message/reason fields
 * (what IDM and AM error bodies carry) instead of axios noise.
 */
export class ShellRestError extends Error {
  readonly result: ShellRestResult;

  constructor(result: ShellRestResult, options?: { cause?: unknown }) {
    const body = result.data as Record<string, unknown> | undefined;
    const detail =
      body?.['message'] ??
      body?.['reason'] ??
      body?.['error_description'] ??
      body?.['error'] ??
      '';
    super(`HTTP ${result.status}${detail ? `: ${detail}` : ''}`, options);
    this.name = 'ShellRestError';
    this.result = result;
  }
}

export type ShellRestAjaxOptions = {
  url: string;
  method?: string;
  data?: unknown;
  headers?: Record<string, string>;
};

export type ShellRestSettings = {
  method?: string;
  data?: unknown;
  headers?: Record<string, string>;
};

/**
 * The jQuery-style `$` object installed into the console context. All
 * methods resolve with the parsed response body (jQuery semantics) and
 * reject with ShellRestError on HTTP error statuses.
 */
export type ShellRest = {
  ajax(options: ShellRestAjaxOptions): Promise<unknown>;
  ajax(url: string, settings?: ShellRestSettings): Promise<unknown>;
  get(url: string, headers?: Record<string, string>): Promise<unknown>;
  post(
    url: string,
    data?: unknown,
    headers?: Record<string, string>
  ): Promise<unknown>;
  put(
    url: string,
    data?: unknown,
    headers?: Record<string, string>
  ): Promise<unknown>;
  patch(
    url: string,
    data?: unknown,
    headers?: Record<string, string>
  ): Promise<unknown>;
  delete(url: string, headers?: Record<string, string>): Promise<unknown>;
  head(url: string, headers?: Record<string, string>): Promise<unknown>;
  /** The result of the last completed request (status, headers, data). */
  readonly last?: ShellRestResult;
};

function makeShellRest(): ShellRest {
  const rest: ShellRest = {
    async ajax(
      urlOrOptions: string | ShellRestAjaxOptions,
      settings?: ShellRestSettings
    ): Promise<unknown> {
      let url: string;
      let method: string;
      let data: unknown;
      let headers: Record<string, string> | undefined;
      if (typeof urlOrOptions === 'string') {
        url = urlOrOptions;
        method = settings?.method ?? 'GET';
        data = settings?.data;
        headers = settings?.headers;
      } else {
        url = String(urlOrOptions.url ?? '');
        method = String(urlOrOptions.method ?? 'GET');
        data = urlOrOptions.data;
        headers = urlOrOptions.headers;
      }
      const result = await request(method.toUpperCase(), url, data, {
        headers,
      });
      return result.data;
    },
    get: async (url, headers) =>
      (await request('GET', url, undefined, { headers })).data,
    post: async (url, data, headers) =>
      (await request('POST', url, data, { headers })).data,
    put: async (url, data, headers) =>
      (await request('PUT', url, data, { headers })).data,
    patch: async (url, data, headers) =>
      (await request('PATCH', url, data, { headers })).data,
    delete: async (url, headers) =>
      (await request('DELETE', url, undefined, { headers })).data,
    head: async (url, headers) =>
      (await request('HEAD', url, undefined, { headers })).data,
  };
  Object.defineProperty(rest, 'last', {
    get: () => lastResult,
    enumerable: true,
  });
  return rest;
}

/** Build the `$` object for a console session. */
export function createShellRest(): ShellRest {
  return makeShellRest();
}

/**
 * Exposed for unit tests: the last completed request's full result.
 */
export function getLastShellRestResult(): ShellRestResult | undefined {
  return lastResult;
}
