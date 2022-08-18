import util from 'util';
import { encode } from './utils/Base64.js';
import { getTenantURL } from './utils/ApiUtils.js';
import { generateESVApi } from './BaseApi.js';
import { state } from '@rockcarver/frodo-lib';

const secretsListURLTemplate = '%s/environment/secrets';
const secretListVersionsURLTemplate = '%s/environment/secrets/%s/versions';
const secretCreateNewVersionURLTemplate = `${secretListVersionsURLTemplate}?_action=create`;
const secretGetVersionURLTemplate = `${secretListVersionsURLTemplate}/%s`;
const secretVersionStatusURLTemplate = `${secretGetVersionURLTemplate}?_action=changestatus`;
const secretURLTemplate = '%s/environment/secrets/%s';
const secretSetDescriptionURLTemplate = `${secretURLTemplate}?_action=setDescription`;

const apiVersion = 'protocol=1.0,resource=1.0';
const getApiConfig = () => ({
  path: `/environment/secrets`,
  apiVersion,
});

export async function getSecrets() {
  const urlString = util.format(
    secretsListURLTemplate,
    getTenantURL(state.default.session.getTenant())
  );
  return generateESVApi(getApiConfig()).get(urlString, {
    withCredentials: true,
  });
}

export async function getSecret(id) {
  const urlString = util.format(
    secretURLTemplate,
    getTenantURL(state.default.session.getTenant()),
    id
  );
  return generateESVApi(getApiConfig()).get(urlString, {
    withCredentials: true,
  });
}

export async function putSecret(
  id,
  value,
  description,
  encoding = 'generic',
  useInPlaceholders = true
) {
  if (encoding !== 'generic')
    throw new Error(`Unsupported encoding: ${encoding}`);
  const data = {
    valueBase64: encode(value),
    description,
    encoding,
    useInPlaceholders,
  };
  const urlString = util.format(
    secretURLTemplate,
    getTenantURL(state.default.session.getTenant()),
    id
  );
  return generateESVApi(getApiConfig()).put(urlString, data, {
    withCredentials: true,
  });
}

export async function setSecretDescription(id, description) {
  const urlString = util.format(
    secretSetDescriptionURLTemplate,
    getTenantURL(state.default.session.getTenant()),
    id
  );
  return generateESVApi(getApiConfig()).post(
    urlString,
    { description },
    { withCredentials: true }
  );
}

export async function deleteSecret(id) {
  const urlString = util.format(
    secretURLTemplate,
    getTenantURL(state.default.session.getTenant()),
    id
  );
  return generateESVApi(getApiConfig()).delete(urlString, {
    withCredentials: true,
  });
}

export async function getSecretVersions(id) {
  const urlString = util.format(
    secretListVersionsURLTemplate,
    getTenantURL(state.default.session.getTenant()),
    id
  );
  return generateESVApi(getApiConfig()).get(urlString, {
    withCredentials: true,
  });
}

export async function createNewVersionOfSecret(id, value) {
  const urlString = util.format(
    secretCreateNewVersionURLTemplate,
    getTenantURL(state.default.session.getTenant()),
    id
  );
  return generateESVApi(getApiConfig()).post(
    urlString,
    { valueBase64: encode(value) },
    { withCredentials: true }
  );
}

export async function getVersionOfSecret(id, version) {
  const urlString = util.format(
    secretGetVersionURLTemplate,
    getTenantURL(state.default.session.getTenant()),
    id,
    version
  );
  return generateESVApi(getApiConfig()).get(urlString, {
    withCredentials: true,
  });
}

export async function setStatusOfVersionOfSecret(id, version, status) {
  const urlString = util.format(
    secretVersionStatusURLTemplate,
    getTenantURL(state.default.session.getTenant()),
    id,
    version
  );
  return generateESVApi(getApiConfig()).post(
    urlString,
    { status },
    { withCredentials: true }
  );
}

export async function deleteVersionOfSecret(id, version) {
  const urlString = util.format(
    secretGetVersionURLTemplate,
    getTenantURL(state.default.session.getTenant()),
    id,
    version
  );
  return generateESVApi(getApiConfig()).delete(urlString, {
    withCredentials: true,
  });
}
