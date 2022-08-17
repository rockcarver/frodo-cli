import util from 'util';
import { generateIdmApi } from './BaseApi.js';
import { getTenantURL } from './utils/ApiUtils.js';
import { state } from '@rockcarver/frodo-lib';

const idmAllConfigURLTemplate = '%s/openidm/config';
const idmConfigURLTemplate = '%s/openidm/config/%s';
const idmConfigEntityQueryTemplate = '%s/openidm/config?_queryFilter=%s';
const idmManagedObjectURLTemplate =
  '%s/openidm/managed/%s?_queryFilter=true&_pageSize=10000';

/**
 * Get all IDM config entities
 * @returns {Promise} a promise that resolves to an object containing all IDM config entities
 */
export async function getAllConfigEntities() {
  const urlString = util.format(
    idmAllConfigURLTemplate,
    getTenantURL(state.default.session.getTenant())
  );
  return generateIdmApi().get(urlString);
}

/**
 * Get IDM config entities by type
 * @param {String} type the desired type of config entity
 * @returns {Promise} a promise that resolves to an object containing all IDM config entities of the desired type
 */
export async function getConfigEntitiesByType(type) {
  const urlString = util.format(
    idmConfigEntityQueryTemplate,
    getTenantURL(state.default.session.getTenant()),
    encodeURIComponent(`_id sw '${type}'`)
  );
  return generateIdmApi().get(urlString);
}

/**
 * Get an IDM config entity
 * @param {String} id the desired config entity
 * @returns {Promise} a promise that resolves to an object containing an IDM config entity
 */
export async function getConfigEntity(id) {
  const urlString = util.format(
    idmConfigURLTemplate,
    getTenantURL(state.default.session.getTenant()),
    id
  );
  return generateIdmApi().get(urlString);
}

/**
 * Put IDM config entity
 * @param {String} id config entity id
 * @param {String} data config entity object
 * @returns {Promise} a promise that resolves to an object containing an IDM config entity
 */
export async function putConfigEntity(id, data) {
  const urlString = util.format(
    idmConfigURLTemplate,
    getTenantURL(state.default.session.getTenant()),
    id
  );
  return generateIdmApi().put(urlString, data);
}

/**
 * Query managed objects
 * @param {String} type managed object type
 * @param {[String]} fields fields to retrieve
 * @param {String} pageCookie paged results cookie
 * @returns {Promise} a promise that resolves to an object containing managed objects of the desired type
 */
export async function queryAllManagedObjectsByType(type, fields, pageCookie) {
  const fieldsParam =
    fields.length > 0 ? `&_fields=${fields.join(',')}` : '&_fields=_id';
  const urlTemplate = pageCookie
    ? `${idmManagedObjectURLTemplate}${fieldsParam}&_pagedResultsCookie=${encodeURIComponent(
        pageCookie
      )}`
    : `${idmManagedObjectURLTemplate}${fieldsParam}`;
  const urlString = util.format(
    urlTemplate,
    getTenantURL(state.default.session.getTenant()),
    type
  );
  return generateIdmApi().get(urlString);
}
