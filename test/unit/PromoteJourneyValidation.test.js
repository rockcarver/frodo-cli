import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';

const importJourneyFromFile = jest.fn();
const noop = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  frodo: {
    authn: { node: { findOrphanedNodes: noop, removeOrphanedNodes: noop } },
    cloud: { startup: { applyUpdates: noop } },
    utils: {
      saveJsonToFile: noop,
      getFilePath: (file) => file,
      getRealmUsingExportFormat: (realm) => realm,
    },
  },
  state: { setRealm: noop },
}));

jest.unstable_mockModule('../../src/utils/Console', () => ({
  printError: noop,
  verboseMessage: noop,
}));
jest.unstable_mockModule('../../src/ops/AgentOps', () => ({
  deleteAgent: noop,
  deleteIdentityGatewayAgent: noop,
  deleteJavaAgent: noop,
  deleteWebAgent: noop,
  importAgentFromFile: noop,
  importIdentityGatewayAgentFromFile: noop,
  importJavaAgentFromFile: noop,
  importWebAgentFromFile: noop,
}));
jest.unstable_mockModule('../../src/ops/ApplicationOps', () => ({
  deleteApplication: noop,
  importApplicationsFromFile: noop,
}));
jest.unstable_mockModule(
  '../../src/ops/AuthenticationSettingsOps',
  () => ({ importAuthenticationSettingsFromFile: noop })
);
jest.unstable_mockModule('../../src/ops/cloud/VariablesOps', () => ({
  deleteVariableById: noop,
  importVariableFromFile: noop,
}));
jest.unstable_mockModule('../../src/ops/EmailTemplateOps', () => ({
  importEmailTemplateFromFile: noop,
}));
jest.unstable_mockModule('../../src/ops/IdmOps', () => ({
  deleteConfigEntityById: noop,
  importFirstConfigEntityFromFile: noop,
}));
jest.unstable_mockModule('../../src/ops/JourneyOps', () => ({
  deleteJourney: noop,
  importJourneyFromFile,
}));
jest.unstable_mockModule('../../src/ops/MappingOps', () => ({
  deleteMapping: noop,
  importMappingFromFile: noop,
}));
jest.unstable_mockModule('../../src/ops/NodeOps', () => ({
  deleteCustomNode: noop,
  importCustomNodeFromFile: noop,
}));
jest.unstable_mockModule('../../src/ops/OAuth2ClientOps', () => ({
  deleteOauth2ClientById: noop,
  importOAuth2ClientFromFile: noop,
}));
jest.unstable_mockModule('../../src/ops/PolicyOps', () => ({
  deletePolicyById: noop,
  importPolicyFromFile: noop,
}));
jest.unstable_mockModule('../../src/ops/ResourceTypeOps', () => ({
  deleteResourceTypeUsingName: noop,
  importResourceTypesFromFile: noop,
}));
jest.unstable_mockModule('../../src/ops/ScriptOps', () => ({
  deleteScriptId: noop,
  importScriptsFromFile: noop,
}));
jest.unstable_mockModule('../../src/ops/ServiceOps', () => ({
  deleteService: noop,
  importFirstServiceFromFile: noop,
}));

const { effectDifferences } = await import('../../src/ops/PromoteOps');

describe('promote journey validation options', () => {
  let workingDirectory;
  const journeyPath = 'realm/root-alpha/journey/test.journey.json';

  beforeEach(() => {
    workingDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'frodo-promote-validation-')
    );
    fs.mkdirSync(path.join(workingDirectory, 'realm/root-alpha/journey'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(workingDirectory, journeyPath),
      JSON.stringify({ trees: { test: { tree: { _id: 'test' } } } })
    );
    jest.resetAllMocks();
    importJourneyFromFile.mockResolvedValue(true);
  });

  afterEach(() => {
    fs.rmSync(workingDirectory, { recursive: true, force: true });
  });

  test.each([false, true])(
    'forwards validate=%s to journey imports',
    async (validate) => {
      await effectDifferences(
        { added: [journeyPath], changed: [], deleted: [] },
        workingDirectory,
        workingDirectory,
        false,
        validate
      );

      expect(importJourneyFromFile).toHaveBeenCalledWith(
        'test',
        `${workingDirectory}/${journeyPath}`,
        { reUuid: false, deps: true, validate }
      );
    }
  );
});
