/* eslint-disable import/prefer-default-export */
import util from 'util';
import { generateAmApi } from './BaseApi.js';
import { getCurrentRealmPath } from './utils/ApiUtils.js';
import { state } from '@rockcarver/frodo-lib';

const oauthProviderServiceURLTemplate =
  '%s/json%s/realm-config/services/oauth-oidc';

const apiVersion = 'protocol=2.1,resource=1.0';
const getApiConfig = () => {
  const configPath = getCurrentRealmPath();
  return {
    path: `${configPath}/authentication/authenticationtrees`,
    apiVersion,
  };
};

/**
 * Get OAuth2 Provider
 * @returns {Promise} a promise that resolves to an object containing an OAuth2Provider object
 */
export async function getOAuth2Provider() {
  const urlString = util.format(
    oauthProviderServiceURLTemplate,
    state.default.session.getTenant(),
    getCurrentRealmPath()
  );
  return generateAmApi(getApiConfig()).get(urlString, {
    withCredentials: true,
  });
}
