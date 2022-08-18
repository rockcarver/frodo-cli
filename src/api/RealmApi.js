import util from 'util';
import {
  getTenantURL,
  getCurrentRealmPath,
  getRealmName,
} from './utils/ApiUtils.js';
import { generateAmApi } from './BaseApi.js';
import { state } from '@rockcarver/frodo-lib';

const realmsListURLTemplate = '%s/json/global-config/realms/?_queryFilter=true';
const realmURLTemplate = '%s/json/global-config/realms/%s';

const apiVersion = 'protocol=2.0,resource=1.0';
const getApiConfig = () => {
  const configPath = getCurrentRealmPath();
  return {
    path: `${configPath}/am/json/global-config/realms`,
    apiVersion,
  };
};

/**
 * Get all realms
 * @returns {Promise} a promise that resolves to an object containing an array of realm objects
 */
export async function getRealms() {
  const urlString = util.format(
    realmsListURLTemplate,
    state.default.session.getTenant()
  );
  return generateAmApi(getApiConfig()).get(urlString, {
    withCredentials: true,
  });
}

/**
 * Get realm by id
 * @param {String} id realm id
 * @returns {Promise} a promise that resolves to an object containing a realm object
 */
export async function getRealm(id) {
  const urlString = util.format(
    realmURLTemplate,
    state.default.session.getTenant(),
    id
  );
  return generateAmApi(getApiConfig()).get(urlString, {
    withCredentials: true,
  });
}

/**
 * Get realm by name
 * @param {String} name realm name
 * @returns {Promise} a promise that resolves to a realm object
 */
export async function getRealmByName(name) {
  return getRealms().then((realms) => {
    for (const realm of realms.data.result) {
      if (getRealmName(name) === realm.name) {
        return realm;
      }
    }
    throw new Error(`Realm ${name} not found!`);
  });
}

/**
 * Put realm
 * @param {String} id realm id
 * @param {Object} data realm config object
 * @returns {Promise} a promise that resolves to an object containing a realm object
 */
export async function putRealm(id, data) {
  const urlString = util.format(
    realmURLTemplate,
    state.default.session.getTenant(),
    id
  );
  return generateAmApi(getApiConfig()).put(urlString, data, {
    withCredentials: true,
  });
}

/**
 * Delete realm
 * @param {String} id realm id
 * @returns {Promise} a promise that resolves to an object containing a realm object
 */
export async function deleteRealm(id) {
  const urlString = util.format(
    realmURLTemplate,
    getTenantURL(state.default.session.getTenant()),
    id
  );
  return generateAmApi(getApiConfig()).delete(urlString, {
    withCredentials: true,
  });
}
