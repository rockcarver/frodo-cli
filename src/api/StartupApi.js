import util from 'util';
import { getTenantURL } from './utils/ApiUtils.js';
import { generateESVApi } from './BaseApi.js';
import { state } from '@rockcarver/frodo-lib';

const startupURLTemplate = '%s/environment/startup';
const startupInitiateRestartURLTemplate = `${startupURLTemplate}?_action=restart`;

const apiVersion = 'protocol=1.0,resource=1.0';
const getApiConfig = () => ({
  path: `/environment/startup`,
  apiVersion,
});

/**
 * Get status
 * @returns {Promise} a promise that resolves to a status object
 */
export async function getStatus() {
  const urlString = util.format(
    startupURLTemplate,
    getTenantURL(state.default.session.getTenant())
  );
  return generateESVApi(getApiConfig()).get(urlString, {
    withCredentials: true,
  });
}

/**
 * Initiate restart
 * @returns {Promise} a promise that resolves to a status object
 */
export async function initiateRestart() {
  const { restartStatus } = (await getStatus()).data;
  if (restartStatus === 'ready') {
    const urlString = util.format(
      startupInitiateRestartURLTemplate,
      getTenantURL(state.default.session.getTenant())
    );
    return generateESVApi(getApiConfig()).post(urlString, null, {
      withCredentials: true,
    });
  }
  throw new Error(`Not ready! Current status: ${restartStatus}`);
}
