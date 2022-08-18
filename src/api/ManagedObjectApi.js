import util from 'util';
import { generateIdmApi } from './BaseApi.js';
import { getTenantURL } from './utils/ApiUtils.js';
import { state } from '@rockcarver/frodo-lib';

const managedObjectURLTemplate = '%s/openidm/managed/%s';
const managedObjectByIdURLTemplate = '%s/openidm/managed/%s/%s';
const managedObjectQueryAllURLTemplate = `${managedObjectURLTemplate}?_queryFilter=true&_pageSize=10000`;

/**
 * Get managed object
 * @param {String} id managed object id
 * @returns {Promise} a promise that resolves to an object containing a managed object
 */
export async function getManagedObject(type, id, fields) {
  const fieldsParam =
    fields.length > 0 ? `_fields=${fields.join(',')}` : '_fields=*';
  const urlString = util.format(
    `${managedObjectByIdURLTemplate}?${fieldsParam}`,
    getTenantURL(state.default.session.getTenant()),
    type,
    id
  );
  return generateIdmApi().get(urlString);
}

/**
 * Put managed object
 * @param {String} id managed object id
 * @param {String} data managed object
 * @returns {Promise} a promise that resolves to an object containing a managed object
 */
export async function putManagedObject(type, id, data) {
  const urlString = util.format(
    managedObjectByIdURLTemplate,
    getTenantURL(state.default.session.getTenant()),
    type,
    id
  );
  return generateIdmApi().put(urlString, data);
}

/**
 * Query managed objects
 * @param {String} type managed object type
 * @param {String} fields fields to retrieve
 * @param {String} pageCookie paged results cookie
 * @returns {Promise} a promise that resolves to an object containing managed objects of the desired type
 */
export async function queryAllManagedObjectsByType(type, fields, pageCookie) {
  const fieldsParam =
    fields.length > 0 ? `&_fields=${fields.join(',')}` : '&_fields=_id';
  const urlTemplate = pageCookie
    ? `${managedObjectQueryAllURLTemplate}${fieldsParam}&_pagedResultsCookie=${pageCookie}`
    : `${managedObjectQueryAllURLTemplate}${fieldsParam}`;
  const urlString = util.format(
    urlTemplate,
    getTenantURL(state.default.session.getTenant()),
    type
  );
  return generateIdmApi().get(urlString);
}
