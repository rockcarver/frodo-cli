import util from 'util';
import _ from 'lodash';
import { generateAmApi } from './BaseApi.js';
import { getCurrentRealmPath } from './utils/ApiUtils.js';
import { state } from '@rockcarver/frodo-lib';

const providerByLocationAndIdURLTemplate = '%s/json%s/realm-config/saml2/%s/%s';
const createHostedProviderURLTemplate =
  '%s/json%s/realm-config/saml2/hosted/?_action=create';
const createRemoteProviderURLTemplate =
  '%s/json%s/realm-config/saml2/remote/?_action=importEntity';
const queryAllProvidersURLTemplate =
  '%s/json%s/realm-config/saml2?_queryFilter=true';
const queryProvidersByEntityIdURLTemplate =
  '%s/json%s/realm-config/saml2?_queryFilter=%s&_fields=%s';
const metadataByEntityIdURLTemplate =
  '%s/saml2/jsp/exportmetadata.jsp?entityid=%s&realm=%s';
const apiVersion = 'protocol=2.1,resource=1.0';
const getApiConfig = () => {
  const configPath = getCurrentRealmPath();
  return {
    path: `${configPath}/realm-config/saml2`,
    apiVersion,
  };
};

/**
 * Get all SAML2 entity providers
 * @returns {Promise} a promise that resolves to an array of saml2 entity stubs
 */
export async function getProviders() {
  const urlString = util.format(
    queryAllProvidersURLTemplate,
    state.default.session.getTenant(),
    getCurrentRealmPath()
  );
  return generateAmApi(getApiConfig()).get(urlString, {
    withCredentials: true,
  });
}

/**
 * Find all providers matching the filter and return the requested fields
 * @param {String} filter CREST filter string, eg "entityId+eq+'${entityId}'"
 * @param {String} fields Comma-delimited list of fields to include in the response
 * @returns {Promise} a promise that resolves to an array of saml2 entities
 */
export async function findProviders(filter = 'true', fields = '*') {
  const urlString = util.format(
    queryProvidersByEntityIdURLTemplate,
    state.default.session.getTenant(),
    getCurrentRealmPath(),
    encodeURIComponent(filter),
    fields
  );
  return generateAmApi(getApiConfig()).get(urlString, {
    withCredentials: true,
  });
}

/**
 * Geta SAML2 entity provider by location and id
 * @param {String} location Entity provider location (hosted or remote)
 * @param {String} entityId64 Base64-encoded provider entity id
 * @returns {Promise} a promise that resolves to a saml2 entity provider object
 */
export async function getProviderByLocationAndId(location, entityId64) {
  const urlString = util.format(
    providerByLocationAndIdURLTemplate,
    state.default.session.getTenant(),
    getCurrentRealmPath(),
    location,
    entityId64
  );
  return generateAmApi(getApiConfig()).get(urlString, {
    withCredentials: true,
  });
}

/**
 * Get SAML2 entity provider by entity id
 * @param {String} entityId Provider entity id
 * @returns {Promise} a promise that resolves to a saml2 entity provider object or null
 */
export async function getProvider(entityId) {
  const response = await findProviders(`entityId eq '${entityId}'`, 'location');
  switch (response.data.resultCount) {
    case 0:
      throw new Error(`No provider with entity id '${entityId}' found`);
    case 1: {
      const { location } = response.data.result[0];
      const id = response.data.result[0]._id;
      return getProviderByLocationAndId(location, id);
    }
    default:
      throw new Error(`Multiple providers with entity id '${entityId}' found`);
  }
}

/**
 * Get a SAML2 entity provider's metadata URL by entity id
 * @param {String} entityId SAML2 entity id
 * @returns {String} the URL to get the metadata from
 */
export function getProviderMetadataUrl(entityId) {
  return util.format(
    metadataByEntityIdURLTemplate,
    state.default.session.getTenant(),
    encodeURIComponent(entityId),
    state.default.session.getRealm()
  );
}

/**
 * Get a SAML2 entity provider's metadata by entity id
 * @param {String} entityId SAML2 entity id
 * @returns {Promise} a promise that resolves to an object containing a SAML2 metadata
 */
export async function getProviderMetadata(entityId) {
  return generateAmApi(getApiConfig()).get(getProviderMetadataUrl(entityId), {
    withCredentials: true,
  });
}

/**
 * Create a SAML2 entity provider
 * @param {String} location 'hosted' or 'remote'
 * @param {Object} providerData Object representing a SAML entity provider
 * @param {String} metaData Base64-encoded metadata XML. Only required for remote providers
 * @returns {Promise} a promise that resolves to a saml2 entity provider object
 */
export async function createProvider(location, providerData, metaData) {
  let postData = _.cloneDeep(providerData);
  let urlString = util.format(
    createHostedProviderURLTemplate,
    state.default.session.getTenant(),
    getCurrentRealmPath(state.default.session.getRealm())
  );

  if (location === 'remote') {
    /**
     * Remote entity providers must be created using XML metadata
     */
    urlString = util.format(
      createRemoteProviderURLTemplate,
      state.default.session.getTenant(),
      getCurrentRealmPath(state.default.session.getRealm())
    );
    postData = {
      standardMetadata: metaData,
    };
  }

  return generateAmApi(getApiConfig()).post(urlString, postData, {
    withCredentials: true,
  });
}

/**
 * Update SAML2 entity provider
 * @param {String} location Entity provider location (hosted or remote)
 * @param {Object} providerData Object representing a SAML entity provider
 * @returns {Promise} a promise that resolves to a saml2 entity provider object
 */
export async function updateProvider(location, providerData) {
  const urlString = util.format(
    providerByLocationAndIdURLTemplate,
    state.default.session.getTenant(),
    getCurrentRealmPath(),
    location,
    providerData._id
  );
  return generateAmApi(getApiConfig()).put(urlString, providerData, {
    withCredentials: true,
  });
}
