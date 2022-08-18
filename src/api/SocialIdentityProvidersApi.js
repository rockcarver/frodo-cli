import util from 'util';
import { generateAmApi } from './BaseApi.js';
import { deleteDeepByKey, getCurrentRealmPath } from './utils/ApiUtils.js';
import { state } from '@rockcarver/frodo-lib';

const getAllProviderTypesURLTemplate =
  '%s/json%s/realm-config/services/SocialIdentityProviders?_action=getAllTypes';
const providerByTypeAndIdURLTemplate =
  '%s/json%s/realm-config/services/SocialIdentityProviders/%s/%s';
const getAllProvidersURLTemplate =
  '%s/json%s/realm-config/services/SocialIdentityProviders?_action=nextdescendents';
const getProvidersByTypeURLTemplate =
  '%s/json%s/realm-config/services/SocialIdentityProviders/%s?_queryFilter=true';
const apiVersion = 'protocol=2.1,resource=1.0';
const getApiConfig = () => {
  const configPath = getCurrentRealmPath();
  return {
    path: `${configPath}/realm-config/services/SocialIdentityProviders`,
    apiVersion,
  };
};

/**
 * Get social identity provider types
 * @returns {Promise} a promise that resolves to an object containing an array of social identity provider types
 */
export async function getSocialIdentityProviderTypes() {
  const urlString = util.format(
    getAllProviderTypesURLTemplate,
    state.default.session.getTenant(),
    getCurrentRealmPath()
  );
  return generateAmApi(getApiConfig()).get(urlString, {
    withCredentials: true,
  });
}

/**
 * Get social identity providers by type
 * @param {String} type social identity provider type
 * @returns {Promise} a promise that resolves to an object containing an array of social identity providers of the requested type
 */
export async function getSocialIdentityProvidersByType(type) {
  const urlString = util.format(
    getProvidersByTypeURLTemplate,
    state.default.session.getTenant(),
    getCurrentRealmPath(),
    type
  );
  return generateAmApi(getApiConfig()).get(urlString, {
    withCredentials: true,
  });
}

/**
 * Get all social identity providers
 * @returns {Promise} a promise that resolves to an object containing an array of social identity providers
 */
export async function getSocialIdentityProviders() {
  const urlString = util.format(
    getAllProvidersURLTemplate,
    state.default.session.getTenant(),
    getCurrentRealmPath()
  );
  return generateAmApi(getApiConfig()).post(
    urlString,
    {},
    {
      withCredentials: true,
    }
  );
}

/**
 * Get social identity provider by type and id
 * @param {*} type social identity provider type
 * @param {*} id social identity provider id/name
 * @returns {Promise} a promise that resolves to an object containing a social identity provider
 */
export async function getProviderByTypeAndId(type, id) {
  const urlString = util.format(
    providerByTypeAndIdURLTemplate,
    state.default.session.getTenant(),
    getCurrentRealmPath(),
    type,
    id
  );
  return generateAmApi(getApiConfig()).get(urlString, {
    withCredentials: true,
  });
}

/**
 * Get social identity provider by type and id
 * @param {String} type social identity provider type
 * @param {String} id social identity provider id/name
 * @param {Object} data a social identity provider object
 * @returns {Promise} a promise that resolves to an object containing a social identity provider
 */
export async function putProviderByTypeAndId(type, id, data) {
  // until we figure out a way to use transport keys in Frodo,
  // we'll have to drop those encrypted attributes.
  const providerData = deleteDeepByKey(data, '-encrypted');
  const urlString = util.format(
    providerByTypeAndIdURLTemplate,
    state.default.session.getTenant(),
    getCurrentRealmPath(state.default.session.getRealm()),
    type,
    id
  );
  return generateAmApi(getApiConfig()).put(urlString, providerData, {
    withCredentials: true,
  });
}
