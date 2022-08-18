import util from 'util';
import { generateAmApi } from './BaseApi.js';
import { state } from '@rockcarver/frodo-lib';

const serverInfoUrlTemplate = '%s/json/serverinfo/%s';

const serverInfoApiVersion = 'resource=1.1';
const getServerInfoApiConfig = () => ({
  apiVersion: serverInfoApiVersion,
});

const serverVersionoApiVersion = 'resource=1.0';
const getServerVersionApiConfig = () => ({
  apiVersion: serverVersionoApiVersion,
});

/**
 * Get server info
 * @returns {Promise} a promise that resolves to an object containing a server info object
 */
export async function getServerInfo() {
  const urlString = util.format(
    serverInfoUrlTemplate,
    state.default.session.getTenant(),
    '*'
  );
  return generateAmApi(getServerInfoApiConfig()).get(urlString, {});
}

/**
 * Get server version info
 * @returns {Promise} a promise that resolves to an object containing a server version info object
 */
export async function getServerVersionInfo() {
  const urlString = util.format(
    serverInfoUrlTemplate,
    state.default.session.getTenant(),
    'version'
  );
  return generateAmApi(getServerVersionApiConfig()).get(urlString, {});
}
