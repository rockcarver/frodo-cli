import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

/**
 * `frodo config-manager pull iga-workflows` writes a workflow to a directory
 * named after it, with the steps in a `steps` folder inside; the name goes
 * through safeFileName so that it cannot leave the folder. A workflow without
 * steps has no `steps` folder, and `push iga-workflows` imports it as it is.
 */

let root;
const readWorkflows = jest.fn();
const updateWorkflow = jest.fn();
const saveJsonToFile = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    utils: {
      getFilePath: (p) => p,
      getWorkingDirectory: () => root,
      saveJsonToFile,
      readJsonFile: (file) => JSON.parse(fs.readFileSync(file, 'utf8')),
    },
    cloud: { iga: { workflow: { readWorkflows, updateWorkflow } } },
  },
}));
jest.unstable_mockModule('../../src/utils/Config', () => ({
  extractFrConfigDataToFile: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printError: jest.fn(),
  printMessage: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/FrConfig', () => ({
  safeFileName: (name) => name.replace(/[^a-zA-Z0-9 _.-]/g, '_'),
}));

const { configManagerExportIgaWorkflows, configManagerImportIgaWorkflows } =
  await import('../../src/configManagerOps/FrConfigIgaWorkflowsOps');

describe('IGA workflows in the fr-config-manager format', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-iga-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('exports a workflow whose name has a path separator under a safe name', async () => {
    readWorkflows.mockResolvedValue([
      { id: 'w1', name: '../evil/name', mutable: true, steps: [] },
    ]);
    expect(await configManagerExportIgaWorkflows()).toBe(true);
    expect(saveJsonToFile.mock.calls[0][1]).toBe(
      'iga/workflows/.._evil_name/.._evil_name.json'
    );
  });

  it('imports a mutable workflow without a steps folder as it is', async () => {
    const dir = path.join(root, 'iga/workflows/no_steps');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'no_steps.json'),
      JSON.stringify({ id: 'w1', name: 'no_steps', mutable: true })
    );
    expect(await configManagerImportIgaWorkflows()).toBe(true);
    expect(updateWorkflow).toHaveBeenCalledWith('w1', {
      id: 'w1',
      name: 'no_steps',
      mutable: true,
      status: 'published',
    });
  });

  it('imports the steps of a workflow that has them', async () => {
    const dir = path.join(root, 'iga/workflows/with_steps');
    fs.mkdirSync(path.join(dir, 'steps/first'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'with_steps.json'),
      JSON.stringify({ id: 'w2', name: 'with_steps', mutable: true })
    );
    fs.writeFileSync(
      path.join(dir, 'steps/first/first.json'),
      JSON.stringify({ name: 'first', type: 'approvalTask' })
    );
    expect(await configManagerImportIgaWorkflows(undefined, true)).toBe(true);
    expect(updateWorkflow).toHaveBeenCalledWith('w2', {
      id: 'w2',
      name: 'with_steps',
      mutable: true,
      steps: [{ name: 'first', type: 'approvalTask' }],
      status: 'draft',
    });
  });
});
