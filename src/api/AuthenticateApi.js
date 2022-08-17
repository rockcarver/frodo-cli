import util from 'util';
import { generateAmApi } from './BaseApi.js';
import { state } from '@rockcarver/frodo-lib';

const authenticateUrlTemplate = '%s/json%s/authenticate';

const apiVersion = 'resource=2.0, protocol=1.0';
const getApiConfig = () => ({
  apiVersion,
});

const realmPathTemplate = '/realms/%s';

export function getRealmUrl(realm) {
  let localRealm = realm;
  if (localRealm.startsWith('/') && localRealm.length > 1) {
    localRealm = localRealm.substring(1);
  }
  let realmPath = util.format(realmPathTemplate, 'root');
  if (localRealm !== '/') {
    realmPath += util.format(realmPathTemplate, localRealm);
  }
  return realmPath;
}

export async function step(data = {}, config = {}) {
  const urlString = util.format(
    authenticateUrlTemplate,
    state.default.session.getTenant(),
    getRealmUrl('/')
  );
  return generateAmApi(getApiConfig()).post(urlString, data, config);
}
