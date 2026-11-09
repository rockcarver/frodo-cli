import { jest } from '@jest/globals';
import { Command } from 'commander';

// Decision record 0038: the framework runs the entity picker of a command
// family inside `getTokens`, after the login. A command that decides what to
// do BEFORE it logs in never sees the picked value: with `-i` missing it falls
// through to its "nothing to do" branch. These tests run the export and delete
// commands of the app, idp, oauth client, realm, role and saml families the way
// the framework does: `getTokens` is the point where the option gets its value.

const getTokens = jest.fn();
const verboseMessage = jest.fn();
const printMessage = jest.fn();
const checkBulkDelete = jest.fn();
const confirmBulkDelete = jest.fn();
const deleteSaml2Provider = jest.fn();

/** A jest.fn for every name, so that a module's named imports link. */
const fns = (...names) =>
  Object.fromEntries(names.map((name) => [name, jest.fn()]));

const ops = {
  application: fns(
    'exportApplicationsToFile',
    'exportApplicationsToFiles',
    'exportApplicationToFile',
    'deleteApplication',
    'deleteApplications'
  ),
  idp: fns(
    'exportSocialIdentityProvidersToFile',
    'exportSocialIdentityProvidersToFiles',
    'exportSocialIdentityProviderToFile',
    'deleteSocialIdentityProviderById'
  ),
  oauth: fns(
    'exportOAuth2ClientsToFile',
    'exportOAuth2ClientsToFiles',
    'exportOAuth2ClientToFile',
    'deleteOauth2ClientById',
    'deleteOauth2Clients'
  ),
  realm: fns(
    'exportRealmById',
    'exportRealmByName',
    'exportRealmsToFile',
    'exportRealmsToFiles'
  ),
  role: fns(
    'exportInternalRolesToFile',
    'exportInternalRolesToFiles',
    'exportInternalRoleToFile'
  ),
  saml: fns(
    'exportSaml2ProvidersToFile',
    'exportSaml2ProvidersToFiles',
    'exportSaml2ProviderToFile',
    'exportSaml2MetadataToFile',
    'deleteSaml2Providers'
  ),
  cot: fns(
    'exportCircleOfTrustToFile',
    'exportCirclesOfTrustToFile',
    'exportCirclesOfTrustToFiles'
  ),
};

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  frodo: {
    utils: {
      constants: {
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
        FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
      },
    },
    saml2: { entityProvider: { deleteSaml2Provider } },
  },
  state: { getRealm: () => 'alpha', getDirectory: () => '/tmp' },
}));
jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(...args) {
      super(...args);
      this.argument('[host]')
        .argument('[realm]')
        .argument('[username]')
        .argument('[password]');
    }

    handleDefaultArgsAndOpts() {}
    requireOneOf() {
      return this;
    }
    multiOp() {
      return this;
    }
  },
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  verboseMessage,
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: new Proxy({}, { get: () => (text) => text }),
}));
jest.unstable_mockModule('../../src/utils/BulkDeleteGuard', () => ({
  checkBulkDelete,
  confirmBulkDelete,
}));
jest.unstable_mockModule('../../src/ops/ApplicationOps', () => ops.application);
jest.unstable_mockModule('../../src/ops/IdpOps', () => ops.idp);
jest.unstable_mockModule('../../src/ops/OAuth2ClientOps', () => ops.oauth);
jest.unstable_mockModule('../../src/ops/RealmOps', () => ops.realm);
jest.unstable_mockModule('../../src/ops/InternalRoleOps', () => ops.role);
jest.unstable_mockModule('../../src/ops/Saml2Ops', () => ops.saml);
jest.unstable_mockModule('../../src/ops/CirclesOfTrustOps', () => ops.cot);

const load = async (path) => (await import(`../../src/cli/${path}`)).default;

/**
 * [command file, the option the picker fills, the operation that must receive
 * the picked value, and the position of that argument (default: the first)]
 */
const CASES = [
  ['app/app-export', 'appId', ops.application.exportApplicationToFile],
  ['app/app-delete', 'appId', ops.application.deleteApplication],
  ['app/app-delete', 'appName', ops.application.deleteApplication, 1],
  ['idp/idp-export', 'idpId', ops.idp.exportSocialIdentityProviderToFile],
  ['idp/idp-delete', 'idpId', ops.idp.deleteSocialIdentityProviderById],
  ['oauth/oauth-client-export', 'appId', ops.oauth.exportOAuth2ClientToFile],
  ['oauth/oauth-client-delete', 'appId', ops.oauth.deleteOauth2ClientById],
  ['realm/realm-export', 'realmId', ops.realm.exportRealmById],
  ['realm/realm-export', 'realmName', ops.realm.exportRealmByName],
  ['role/role-export', 'roleId', ops.role.exportInternalRoleToFile],
  ['saml/saml-export', 'entityId', ops.saml.exportSaml2ProviderToFile],
  ['saml/saml-cot-export', 'cotId', ops.cot.exportCircleOfTrustToFile],
  ['saml/saml-metadata-export', 'entityId', ops.saml.exportSaml2MetadataToFile],
  ['saml/saml-delete', 'entityId', deleteSaml2Provider],
];

async function invoke(program, options = {}) {
  process.exitCode = 0;
  for (const [key, value] of Object.entries(options)) {
    program.setOptionValue(key, value);
  }
  return program._actionHandler.call(program, [
    undefined,
    'alpha',
    undefined,
    undefined,
  ]);
}

const everyOp = () => [
  ...Object.values(ops).flatMap((module) => Object.values(module)),
  deleteSaml2Provider,
];

describe('commands log in before they branch, so the framework picker can fill the option', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    checkBulkDelete.mockReturnValue(true);
    confirmBulkDelete.mockResolvedValue(true);
    for (const op of everyOp()) op.mockResolvedValue(true);
    process.exitCode = 0;
  });

  afterAll(() => {
    process.exitCode = 0;
  });

  test.each(CASES)(
    '%s runs on the %s that the picker sets during the login',
    async (file, option, operation, position = 0) => {
      const program = (await load(file))();
      getTokens.mockImplementation(async () => {
        program.setOptionValue(option, 'matrix');
        return true;
      });
      await invoke(program);
      expect(getTokens).toHaveBeenCalledTimes(1);
      expect(operation).toHaveBeenCalledTimes(1);
      expect(operation.mock.calls[0][position]).toBe('matrix');
      expect(process.exitCode).toBe(0);
    }
  );

  test.each(CASES)(
    '%s does nothing and fails when the login fails or the pick is declined (%s)',
    async (file, option, operation) => {
      const program = (await load(file))();
      getTokens.mockResolvedValue(false);
      await invoke(program);
      expect(getTokens).toHaveBeenCalledTimes(1);
      for (const op of everyOp()) expect(op).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    }
  );

  test.each([
    ['idp/idp-delete', ops.idp.deleteSocialIdentityProviderById],
    ['oauth/oauth-client-delete', ops.oauth.deleteOauth2ClientById],
  ])(
    '%s deletes nothing when the picker had nothing to offer',
    async (file) => {
      const program = (await load(file))();
      getTokens.mockResolvedValue(true);
      await invoke(program);
      for (const op of everyOp()) expect(op).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    }
  );

  test('an option given on the command line is used as it was, and a bulk option still runs the bulk operation', async () => {
    const one = (await load('app/app-export'))();
    getTokens.mockResolvedValue(true);
    await invoke(one, { appName: 'zion' });
    expect(ops.application.exportApplicationToFile.mock.calls[0][1]).toBe(
      'zion'
    );

    const all = (await load('saml/saml-cot-export'))();
    await invoke(all, { all: true });
    expect(ops.cot.exportCircleOfTrustToFile).not.toHaveBeenCalled();
    expect(ops.cot.exportCirclesOfTrustToFile).toHaveBeenCalledTimes(1);
  });

  test('a bulk delete still asks before it deletes everything', async () => {
    const program = (await load('oauth/oauth-client-delete'))();
    getTokens.mockResolvedValue(true);
    await invoke(program, { all: true });
    expect(confirmBulkDelete).toHaveBeenCalledTimes(1);
    expect(ops.oauth.deleteOauth2Clients).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();
    confirmBulkDelete.mockResolvedValue(false);
    const declined = (await load('oauth/oauth-client-delete'))();
    await invoke(declined, { all: true });
    expect(ops.oauth.deleteOauth2Clients).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
