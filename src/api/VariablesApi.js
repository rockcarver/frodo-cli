import util from 'util';
import { encode } from './utils/Base64.js';
import { getTenantURL, getCurrentRealmPath } from './utils/ApiUtils.js';
import { generateESVApi } from './BaseApi.js';
import { state } from '@rockcarver/frodo-lib';

const variablesListURLTemplate = '%s/environment/variables';
const variableURLTemplate = '%s/environment/variables/%s';
const variableSetDescriptionURLTemplate = `${variableURLTemplate}?_action=setDescription`;

const apiVersion = 'protocol=1.0,resource=1.0';
const getApiConfig = () => {
  const configPath = getCurrentRealmPath();
  return {
    path: `${configPath}/environment/secrets`,
    apiVersion,
  };
};

/**
 * Get all variables
 * @returns {Promise} a promise that resolves to an object containing an array of variable objects
 */
export async function getVariables() {
  const urlString = util.format(
    variablesListURLTemplate,
    getTenantURL(state.default.session.getTenant())
  );
  return generateESVApi(getApiConfig()).get(urlString, {
    withCredentials: true,
  });
}

/**
 * Get variable by id/name
 * @param {String} id variable id/name
 * @returns {Promise} a promise that resolves to an object containing a variable object
 */
export async function getVariable(id) {
  const urlString = util.format(
    variableURLTemplate,
    getTenantURL(state.default.session.getTenant()),
    id
  );
  return generateESVApi(getApiConfig()).get(urlString, {
    withCredentials: true,
  });
}

/**
 * Put variable by id/name
 * @param {String} id variable id/name
 * @param {String} value variable value
 * @param {String} description variable description
 * @returns {Promise} a promise that resolves to an object containing a variable object
 */
export async function putVariable(id, value, description) {
  const data = {};
  if (value) data.valueBase64 = encode(value);
  if (description) data.description = description;
  const urlString = util.format(
    variableURLTemplate,
    getTenantURL(state.default.session.getTenant()),
    id
  );
  return generateESVApi(getApiConfig()).put(urlString, data, {
    withCredentials: true,
  });
}

/**
 * Set variable description
 * @param {*} id variable id/name
 * @param {*} description variable description
 * @returns {Promise} a promise that resolves to an object containing a status object
 */
export async function setVariableDescription(id, description) {
  const urlString = util.format(
    variableSetDescriptionURLTemplate,
    getTenantURL(state.default.session.getTenant()),
    id
  );
  return generateESVApi(getApiConfig()).post(
    urlString,
    { description },
    { withCredentials: true }
  );
}

/**
 * Delete variable by id/name
 * @param {String} id variable id/name
 * @returns {Promise} a promise that resolves to an object containing a variable object
 */
export async function deleteVariable(id) {
  const urlString = util.format(
    variableURLTemplate,
    getTenantURL(state.default.session.getTenant()),
    id
  );
  return generateESVApi(getApiConfig()).delete(urlString, {
    withCredentials: true,
  });
}
