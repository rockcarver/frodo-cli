import util from 'util';
import qs from 'qs';
import { generateOauth2Api } from './BaseApi.js';
import { getCurrentRealmPath } from './utils/ApiUtils.js';
import { state } from '@rockcarver/frodo-lib';
import { encode } from './utils/Base64.js';

const authorizeUrlTemplate = '%s/oauth2%s/authorize';
const accessTokenUrlTemplate = '%s/oauth2%s/access_token';
const apiVersion = 'protocol=2.1,resource=1.0';
const getApiConfig = () => ({
  apiVersion,
});

/**
 * Perform the authorization step of the authorization code grant flow
 * @param {String} data body form data
 * @param {Object} config axios request config object
 * @returns {Promise} a promise resolving to an object containing the authorization server response object
 */
export async function authorize(data, config = {}) {
  const authorizeURL = util.format(
    authorizeUrlTemplate,
    state.default.session.getTenant(),
    ''
  );
  return generateOauth2Api(getApiConfig()).post(authorizeURL, data, config);
}

/**
 * Perform access token request step of the authorization code grant flow
 * @param {*} data body form data
 * @param {*} config config axios request config object
 * @returns {Promise} a promise resolving to an object containing the authorization server response object containing the access token
 */
export async function accessToken(data, config = {}) {
  const accessTokenURL = util.format(
    accessTokenUrlTemplate,
    state.default.session.getTenant(),
    ''
  );
  return generateOauth2Api(getApiConfig()).post(accessTokenURL, data, config);
}

/**
 * Perform client credentials grant flow
 * @param {String} clientId client id
 * @param {String} clientSecret client secret
 * @param {String} scope space-delimited scope list
 * @returns {Promise} a promise resolving to an object containing the authorization server response object
 */
export async function clientCredentialsGrant(clientId, clientSecret, scope) {
  const urlString = util.format(
    accessTokenUrlTemplate,
    state.default.session.getTenant(),
    getCurrentRealmPath()
  );
  const requestOverride = {
    headers: {
      Authorization: `Basic ${encode(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };
  const requestBody = {
    grant_type: 'client_credentials',
    scope,
  };
  return generateOauth2Api(getApiConfig(), requestOverride).post(
    urlString,
    qs.stringify(requestBody),
    { withCredentials: true }
  );
}
