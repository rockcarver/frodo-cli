import axios from 'axios';
import axiosRetry from 'axios-retry';
import * as https from 'https';
import HttpsProxyAgent from 'https-proxy-agent';
import url from 'url';
import fs from 'fs';
import { state } from '@rockcarver/frodo-lib';
import { getTenantURL } from './utils/ApiUtils.js';
// import pkg from '../../package.json' assert { type: 'json' };

const pkg = JSON.parse(
  fs.readFileSync(new URL('../../package.json', import.meta.url))
);

axiosRetry(axios, {
  retries: 3,
  shouldResetTimeout: true,
  // eslint-disable-next-line no-unused-vars
  retryCondition: (_error) => true, // retry no matter what
});

const timeout = 30000;
const userAgent = `${pkg.name}/${pkg.version}`;
let httpsAgent;

/**
 * Helper method to create properly configured httpsAgent
 * @returns {any} appropriate httpsAgent
 */
function getHttpsAgent() {
  if (httpsAgent) return httpsAgent;
  const options = {
    rejectUnauthorized: !state.default.session.getAllowInsecureConnection(),
  };
  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (httpsProxy) {
    // https://github.com/axios/axios/issues/3459
    console.error(`Using proxy ${httpsProxy}`.yellow);
    const parsed = url.parse(httpsProxy);
    options.host = parsed.hostname;
    options.port = parsed.port;
    options.protocol = parsed.protocol;
    options.rejectUnauthorized =
      !state.default.session.getAllowInsecureConnection();
    httpsAgent = new HttpsProxyAgent(options);
    return httpsAgent;
  }
  httpsAgent = new https.Agent(options);
  return httpsAgent;
}

function getProxy() {
  if (process.env.HTTPS_PROXY || process.env.https_proxy) return false;
  return null;
}

/**
 * Generates an AM Axios API instance
 * @param {object} resource Takes an object takes a resource object. example:
 * @param {object} requestOverride Takes an object of AXIOS parameters that can be used to either
 * add on extra information or override default properties https://github.com/axios/axios#request-config
 *
 * @returns {AxiosInstance}
 */
export function generateAmApi(resource, requestOverride = {}) {
  let headers = {
    'User-Agent': userAgent,
    'Content-Type': 'application/json',
    'Accept-API-Version': resource.apiVersion,
    Cookie: `${state.default.session.raw.cookieName}=${state.default.session.raw.cookieValue}`,
  };
  if (requestOverride.headers) {
    headers = {
      ...headers,
      ...requestOverride.headers,
    };
  }

  const requestDetails = {
    baseURL: `${state.default.session.getTenant()}/json${resource.path}`,
    timeout,
    ...requestOverride,
    headers,
    httpsAgent: getHttpsAgent(),
    proxy: getProxy(),
  };

  const request = axios.create(requestDetails);

  return request;
}

/**
 * Generates an OAuth2 Axios API instance
 * @param {object} resource Takes an object takes a resource object. example:
 * @param {object} requestOverride Takes an object of AXIOS parameters that can be used to either
 * add on extra information or override default properties https://github.com/axios/axios#request-config
 *
 * @returns {AxiosInstance}
 */
export function generateOauth2Api(resource, requestOverride = {}) {
  let headers = {
    'User-Agent': userAgent,
    'Accept-API-Version': resource.apiVersion,
    Cookie: `${state.default.session.raw.cookieName}=${state.default.session.raw.cookieValue}`,
  };
  if (requestOverride.headers) {
    headers = {
      ...headers,
      ...requestOverride.headers,
    };
  }

  const requestDetails = {
    baseURL: `${state.default.session.getTenant()}/json${resource.path}`,
    timeout,
    ...requestOverride,
    headers,
    httpsAgent: getHttpsAgent(),
    proxy: getProxy(),
  };

  const request = axios.create(requestDetails);

  return request;
}

/**
 * Generates an IDM Axios API instance
 * @param {object} requestOverride Takes an object of AXIOS parameters that can be used to either add
 * on extra information or override default properties https://github.com/axios/axios#request-config
 *
 * @returns {AxiosInstance}
 */
export function generateIdmApi(requestOverride = {}) {
  const requestDetails = {
    baseURL: getTenantURL(state.default.session.getTenant()),
    timeout,
    headers: {
      'User-Agent': userAgent,
      'Content-Type': 'application/json',
    },
    ...requestOverride,
    httpsAgent: getHttpsAgent(),
    proxy: getProxy(),
  };

  if (state.default.session.getBearerToken()) {
    requestDetails.headers.Authorization = `Bearer ${state.default.session.getBearerToken()}`;
  }

  const request = axios.create(requestDetails);

  return request;
}

/**
 * Generates a LogKeys API Axios instance
 * @param {object} requestOverride Takes an object of AXIOS parameters that can be used to either add
 * on extra information or override default properties https://github.com/axios/axios#request-config
 *
 * @returns {AxiosInstance}
 */
export function generateLogKeysApi(requestOverride = {}) {
  const headers = {
    'User-Agent': userAgent,
    'Content-Type': 'application/json',
  };
  const requestDetails = {
    baseURL: getTenantURL(state.default.session.getTenant()),
    timeout,
    headers,
    ...requestOverride,
    httpsAgent: getHttpsAgent(),
    proxy: getProxy(),
  };

  if (state.default.session.getBearerToken()) {
    requestDetails.headers.Authorization = `Bearer ${state.default.session.getBearerToken()}`;
  }

  const request = axios.create(requestDetails);

  return request;
}

/**
 * Generates a Log API Axios instance
 * @param {object} requestOverride Takes an object of AXIOS parameters that can be used to either add
 * on extra information or override default properties https://github.com/axios/axios#request-config
 *
 * @returns {AxiosInstance}
 */
export function generateLogApi(requestOverride = {}) {
  const headers = {
    'User-Agent': userAgent,
    'X-API-Key': state.default.session.getLogApiKey(),
    'X-API-Secret': state.default.session.getLogApiSecret(),
  };
  const requestDetails = {
    baseURL: getTenantURL(state.default.session.getTenant()),
    timeout,
    headers,
    ...requestOverride,
    httpsAgent: getHttpsAgent(),
    proxy: getProxy(),
  };

  const request = axios.create(requestDetails);

  return request;
}

/**
 * Generates an ESV Axios API instance for Environment Secrets and Variables
 * @param {object} requestOverride Takes an object of AXIOS parameters that can be used to either add
 * on extra information or override default properties https://github.com/axios/axios#request-config
 *
 * @returns {AxiosInstance}
 */
export function generateESVApi(resource, requestOverride = {}) {
  const headers = {
    'User-Agent': userAgent,
    'Content-Type': 'application/json',
    'Accept-API-Version': resource.apiVersion,
  };
  const requestDetails = {
    baseURL: getTenantURL(state.default.session.getTenant()),
    timeout,
    headers,
    ...requestOverride,
    httpsAgent: getHttpsAgent(),
    proxy: getProxy(),
  };

  if (state.default.session.getBearerToken()) {
    requestDetails.headers.Authorization = `Bearer ${state.default.session.getBearerToken()}`;
  }

  const request = axios.create(requestDetails);

  return request;
}
