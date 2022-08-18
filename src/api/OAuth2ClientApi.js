import util from 'util';
import { generateAmApi } from './BaseApi.js';
import { getCurrentRealmPath } from './utils/ApiUtils.js';
import { state } from '@rockcarver/frodo-lib';

const oauth2ClientURLTemplate = '%s/json%s/realm-config/agents/OAuth2Client/%s';
const oauth2ClientListURLTemplate =
  '%s/json%s/realm-config/agents/OAuth2Client?_queryFilter=true';
const apiVersion = 'protocol=2.1,resource=1.0';
const getApiConfig = () => {
  const configPath = getCurrentRealmPath();
  return {
    path: `${configPath}/realm-config/agents/OAuth2Client`,
    apiVersion,
  };
};

/**
 * Get OAuth2 Clients
 * @returns {Promise} a promise that resolves to an object containing an array of oauth2client objects
 */
export async function getOAuth2Clients() {
  const urlString = util.format(
    oauth2ClientListURLTemplate,
    state.default.session.getTenant(),
    getCurrentRealmPath()
  );
  return generateAmApi(getApiConfig()).get(urlString, {
    withCredentials: true,
  });
}

/**
 * Get OAuth2 Client
 * @param {String} id client id
 * @returns {Promise} a promise that resolves to an object containing an oauth2client object
 */
export async function getOAuth2Client(id) {
  const urlString = util.format(
    oauth2ClientURLTemplate,
    state.default.session.getTenant(),
    getCurrentRealmPath(),
    id
  );
  return generateAmApi(getApiConfig()).get(urlString, {
    withCredentials: true,
  });
}

/**
 * Put OAuth2 Client
 * @param {String} id client id
 * @param {Object} data oauth2client object
 * @returns {Promise} a promise that resolves to an object containing an oauth2client object
 */
export async function putOAuth2Client(id, data) {
  const client = data;
  delete client._provider;
  delete client._rev;
  const urlString = util.format(
    oauth2ClientURLTemplate,
    state.default.session.getTenant(),
    getCurrentRealmPath(state.default.session.getRealm()),
    id
  );
  return generateAmApi(getApiConfig()).put(urlString, client, {
    withCredentials: true,
  });
}
