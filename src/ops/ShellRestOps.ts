import { frodo, state } from '@rockcarver/frodo-lib';

/*
 * jQuery-style REST facade for the frodo JS console (`frodo shell`).
 *
 * Exposes the jQuery API surface ($.ajax, $.get, $.post, $.put, $.patch,
 * $.delete, $.head) over frodo-lib's own request instances, so scripts typed
 * in the console authenticate and travel exactly like frodo commands do:
 *
 * - /openidm calls use the IDM instance, /am calls the AM instance, and both
 *   resolve their credential (bearer token, session cookie, browser-login
 *   provider, refresh of a stale token, one renewal after a 401) in
 *   frodo-lib, in one place;
 * - a call to another host uses the instance that carries no credential;
 * - header overrides, insecure TLS, proxies, retries and --curlirize all
 *   apply, because they are properties of those instances.
 *
 * What stays here is what only the console decides: which instance a URL
 * gets, how the URL is encoded, the console's own User-Agent and transaction
 * id, the session-cookie fallback for IDM calls, and the shape of the result.
 */

/** The part of a response that the console reads. */
type RestResponse = {
  status: number;
  statusText?: string;
  headers?: object;
  data: unknown;
};
/** What a request instance rejects with when it got an answer or none at all. */
type RestFailure = {
  isAxiosError?: boolean;
  message: string;
  response?: RestResponse;
};

export type ShellRestResult = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
};

/** Result of the last completed request in the console. */
let lastResult: ShellRestResult | undefined;

const timeoutMs = 30000;
const userAgent = `@rockcarver/frodo-cli (frodo shell)`;
const transactionId = `frodo-console-${Date.now()}`;

/**
 * The headers that mark a request as coming from the console: its User-Agent
 * and its transaction id (frodo-lib sends its own for every other command).
 * A header that the state's authentication or configuration header overrides
 * define, in any letter case, is left out: the user's override wins.
 *
 * @param overrides the header overrides of the state (names matter, values do not)
 */
export function consoleHeaders(
  overrides: Record<string, string> = {}
): Record<string, string> {
  const defined = new Set(
    Object.keys(overrides).map((name) => name.toLowerCase())
  );
  const marks: Record<string, string> = {
    'User-Agent': userAgent,
    'X-ForgeRock-TransactionId': transactionId,
  };
  return Object.fromEntries(
    Object.entries(marks).filter(([name]) => !defined.has(name.toLowerCase()))
  );
}

/**
 * The session cookie as a credential for an IDM call. frodo-lib's IDM
 * instance is bearer-only: on session-cookie-only deployments it sends no
 * credential on IDM calls. The browser console authenticates to IDM through
 * same-origin cookies; the closest equivalent here is to offer the AM session
 * cookie when there is no bearer token, which works where IDM trusts the AM
 * session. frodo-lib's instance leaves a request alone that already carries
 * Authorization or Cookie, so this is passed as a header of the request. It
 * returns nothing when there is a bearer token, no session cookie, or when a
 * header override already names Authorization or Cookie.
 *
 * @param session the credentials of the state
 * @param overrides the header overrides of the state (names matter, values do not)
 */
export function idmCookieFallback(
  session: { bearerToken?: string; cookieName?: string; cookieValue?: string },
  overrides: Record<string, string> = {}
): Record<string, string> {
  if (session.bearerToken) return {};
  if (!session.cookieName || !session.cookieValue) return {};
  const defined = new Set(
    Object.keys(overrides).map((name) => name.toLowerCase())
  );
  if (defined.has('authorization') || defined.has('cookie')) return {};
  return { Cookie: `${session.cookieName}=${session.cookieValue}` };
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
 * the path of the URL: /openidm segments mean IDM, anything else (AM's /json,
 * the authenticate tree endpoints, oauth2, ...) means AM. Only the path counts,
 * not the query or the host.
 */
function guessDomain(url: string): 'idm' | 'am' {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    // not parseable: judge the text as it is
  }
  return /\/openidm(\/|$)/i.test(path) ? 'idm' : 'am';
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
 *   policy a browser applies), judged on the URL as it is sent.
 *
 * @param url the URL as typed in the console
 */
export function resolveUrl(url: string): {
  absoluteUrl: string;
  domain: 'idm' | 'am' | 'none';
} {
  const host = state.getHost();

  if (/^https?:\/\//i.test(url)) {
    // Judge the URL as it is sent, not as it was typed: the request is made to
    // the encoded form (see `request`), and the encoding can move the host
    // (`https://tenant\@other.example/` has the host `tenant` as typed and
    // `other.example` once the backslash is encoded).
    const sent = encodeUrlPathAndQuery(url);
    const sameHost = hostOf(sent) !== '' && hostOf(sent) === hostOf(host ?? '');
    return { absoluteUrl: url, domain: sameHost ? guessDomain(sent) : 'none' };
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
 * Open the frodo-lib request instance for one console request, one instance
 * per request: the header overrides are read when it is made.
 *
 * - idm: the IDM instance (bearer token; the session cookie when there is none)
 * - am: the AM instance (session cookie or bearer token, browser-login provider)
 * - none: another host. The instance that frodo-lib makes for requests to
 *   hosts that are not the tenant: it carries no credential, and the
 *   authentication and configuration header overrides of the state, which
 *   belong to the tenant, are not sent either.
 */
function openInstance(domain: 'idm' | 'am' | 'none') {
  if (domain === 'none') {
    return frodo.factory.generateReleaseApi('', {
      timeout: timeoutMs,
      headers: consoleHeaders(),
    });
  }
  const overrides = {
    ...(state.getAuthenticationHeaderOverrides() ?? {}),
    ...(state.getConfigurationHeaderOverrides() ?? {}),
  };
  const override = {
    timeout: timeoutMs,
    // A redirect to another origin drops Authorization and Cookie by itself;
    // the header overrides and the session cookie's header name are the
    // tenant's secrets as well, so they are dropped too.
    sensitiveHeaders: [...Object.keys(overrides), state.getCookieName()].filter(
      (name): name is string => !!name
    ),
    headers: {
      ...consoleHeaders(overrides),
      ...(domain === 'idm'
        ? idmCookieFallback(
            {
              bearerToken: state.getBearerToken(),
              cookieName: state.getCookieName(),
              cookieValue: state.getCookieValue(),
            },
            overrides
          )
        : {}),
    },
  };
  return domain === 'idm'
    ? frodo.factory.generateIdmApi(override)
    : frodo.factory.generateAmApi({}, override);
}

async function request(
  method: string,
  url: string,
  data?: unknown,
  options: { headers?: Record<string, string> } = {}
): Promise<ShellRestResult> {
  const { absoluteUrl, domain } = resolveUrl(url);
  const encoded = encodeUrlPathAndQuery(absoluteUrl);
  const instance = openInstance(domain);

  let response: RestResponse;
  try {
    response = await instance.request({
      url: encoded,
      method,
      data,
      headers: options.headers,
    });
  } catch (error) {
    const failure = error as RestFailure | undefined;
    if (failure?.isAxiosError === true) {
      if (failure.response) {
        const result = toResult(failure.response);
        lastResult = result;
        throw new ShellRestError(result, { cause: error });
      }
      throw new Error(
        `${method.toUpperCase()} ${url} failed: ${failure.message}`,
        {
          cause: error,
        }
      );
    }
    throw error;
  }
  const result = toResult(response);
  lastResult = result;
  return result;
}

function toResult(response: RestResponse): ShellRestResult {
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
