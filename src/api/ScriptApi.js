import util from 'util';
import { generateAmApi } from './BaseApi.js';
import { getCurrentRealmPath } from './utils/ApiUtils.js';
import { state } from '@rockcarver/frodo-lib';

const scriptURLTemplate = '%s/json%s/scripts/%s';
const scriptListURLTemplate = '%s/json%s/scripts?_queryFilter=true';
const scriptQueryURLTemplate =
  '%s/json%s/scripts?_queryFilter=name+eq+%%22%s%%22';
const apiVersion = 'protocol=2.0,resource=1.0';
const getApiConfig = () => {
  const configPath = getCurrentRealmPath();
  return {
    path: `${configPath}/authentication/authenticationtrees`,
    apiVersion,
  };
};

/**
 * Get all scripts
 * @returns {Promise} a promise that resolves to an object containing an array of script objects
 */
export async function getScripts() {
  const urlString = util.format(
    scriptListURLTemplate,
    state.default.session.getTenant(),
    getCurrentRealmPath()
  );
  return generateAmApi(getApiConfig()).get(urlString, {
    withCredentials: true,
  });
}

/**
 * Get script by name
 * @param {String} name script name
 * @returns {Promise} a promise that resolves to an object containing a script object
 */
export async function getScriptByName(name) {
  const urlString = util.format(
    scriptQueryURLTemplate,
    state.default.session.getTenant(),
    getCurrentRealmPath(),
    name
  );
  return generateAmApi(getApiConfig()).get(urlString, {
    withCredentials: true,
  });
}

/**
 * Get script by id
 * @param {String} id script uuid/name
 * @returns {Promise} a promise that resolves to an object containing a script object
 */
export async function getScript(id) {
  const urlString = util.format(
    scriptURLTemplate,
    state.default.session.getTenant(),
    getCurrentRealmPath(),
    id
  );
  return generateAmApi(getApiConfig()).get(urlString, {
    withCredentials: true,
  });
}

/**
 * Put script
 * @param {String} id script uuid
 * @param {Object} data script object
 * @returns {Promise} a promise that resolves to an object containing a script object
 */
export async function putScript(id, data) {
  const urlString = util.format(
    scriptURLTemplate,
    state.default.session.getTenant(),
    getCurrentRealmPath(state.default.session.getRealm()),
    id
  );
  return generateAmApi(getApiConfig()).put(urlString, data, {
    withCredentials: true,
  });
}
