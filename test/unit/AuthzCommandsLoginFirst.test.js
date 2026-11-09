import { jest } from '@jest/globals';
import { Command } from 'commander';

// Decision record 0038: the framework resolves a missing entity option (a pick
// from the family registry) inside getTokens, after the login. A command that
// reads the option before it has logged in never sees the picked value. These
// tests make getTokens set the option the way the framework does and check
// that every authz command acts on it, and that a failed login (a declined or
// failed pick) runs nothing and exits 1.

const getTokens = jest.fn();
const verboseMessage = jest.fn();
const printMessage = jest.fn();
const checkBulkDelete = jest.fn();
const confirmBulkDelete = jest.fn();

const policyOps = {
  describePolicy: jest.fn(),
  deletePolicies: jest.fn(),
  deletePoliciesByPolicySet: jest.fn(),
  deletePolicyById: jest.fn(),
  exportPoliciesByPolicySetToFile: jest.fn(),
  exportPoliciesByPolicySetToFiles: jest.fn(),
  exportPoliciesToFile: jest.fn(),
  exportPoliciesToFiles: jest.fn(),
  exportPolicyToFile: jest.fn(),
};
const policySetOps = {
  deletePolicySetById: jest.fn(),
  deletePolicySets: jest.fn(),
  describePolicySet: jest.fn(),
  exportPolicySetsToFile: jest.fn(),
  exportPolicySetsToFiles: jest.fn(),
  exportPolicySetToFile: jest.fn(),
};
const resourceTypeOps = {
  deleteResourceTypeById: jest.fn(),
  deleteResourceTypes: jest.fn(),
  deleteResourceTypeUsingName: jest.fn(),
  describeResourceType: jest.fn(),
  describeResourceTypeByName: jest.fn(),
  exportResourceTypeByNameToFile: jest.fn(),
  exportResourceTypesToFile: jest.fn(),
  exportResourceTypesToFiles: jest.fn(),
  exportResourceTypeToFile: jest.fn(),
};

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  frodo: { utils: { constants: {} } },
  state: {},
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
jest.unstable_mockModule('../../src/utils/Console.js', () => ({
  printMessage,
  verboseMessage,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  verboseMessage,
}));
jest.unstable_mockModule('../../src/utils/BulkDeleteGuard', () => ({
  checkBulkDelete,
  confirmBulkDelete,
}));
jest.unstable_mockModule('../../src/ops/PolicyOps', () => policyOps);
jest.unstable_mockModule('../../src/ops/PolicySetOps', () => policySetOps);
jest.unstable_mockModule(
  '../../src/ops/ResourceTypeOps',
  () => resourceTypeOps
);

const setups = {
  'policy delete': (await import('../../src/cli/authz/authz-policy-delete'))
    .default,
  'policy describe': (await import('../../src/cli/authz/authz-policy-describe'))
    .default,
  'policy export': (await import('../../src/cli/authz/authz-policy-export'))
    .default,
  'set delete': (await import('../../src/cli/authz/authz-set-delete')).default,
  'set describe': (await import('../../src/cli/authz/authz-set-describe'))
    .default,
  'set export': (await import('../../src/cli/authz/authz-set-export')).default,
  'type delete': (await import('../../src/cli/authz/authz-type-delete'))
    .default,
  'type describe': (await import('../../src/cli/authz/authz-type-describe'))
    .default,
  'type export': (await import('../../src/cli/authz/authz-type-export'))
    .default,
};

async function invoke(program, options) {
  process.exitCode = 0;
  // `export` ends in program.help() for an unrecognized combination; it must not exit the test
  program.help = jest.fn();
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

// [command, the option the pick fills, its value, the operation that must get it]
const CASES = [
  ['policy delete', 'policyId', 'matrix-policy', policyOps.deletePolicyById],
  ['policy describe', 'policyId', 'matrix-policy', policyOps.describePolicy],
  ['policy export', 'policyId', 'matrix-policy', policyOps.exportPolicyToFile],
  ['set delete', 'setId', 'zion-set', policySetOps.deletePolicySetById],
  ['set describe', 'setId', 'zion-set', policySetOps.describePolicySet],
  ['set export', 'setId', 'zion-set', policySetOps.exportPolicySetToFile],
  ['type delete', 'typeId', 'uuid-1', resourceTypeOps.deleteResourceTypeById],
  [
    'type delete',
    'typeName',
    'URL',
    resourceTypeOps.deleteResourceTypeUsingName,
  ],
  ['type describe', 'typeId', 'uuid-1', resourceTypeOps.describeResourceType],
  [
    'type describe',
    'typeName',
    'URL',
    resourceTypeOps.describeResourceTypeByName,
  ],
  ['type export', 'typeId', 'uuid-1', resourceTypeOps.exportResourceTypeToFile],
  [
    'type export',
    'typeName',
    'URL',
    resourceTypeOps.exportResourceTypeByNameToFile,
  ],
];

const allOperations = [
  ...Object.values(policyOps),
  ...Object.values(policySetOps),
  ...Object.values(resourceTypeOps),
];

describe('authz commands log in before they read the options', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    for (const operation of allOperations) operation.mockResolvedValue(true);
    checkBulkDelete.mockReturnValue(true);
    confirmBulkDelete.mockResolvedValue(true);
  });

  test.each(CASES)(
    '%s acts on the %s that the pick sets during the login',
    async (command, option, value, operation) => {
      const program = setups[command]();
      getTokens.mockImplementation(async () => {
        program.setOptionValue(option, value);
        return true;
      });
      await invoke(program, {});
      expect(getTokens).toHaveBeenCalledTimes(1);
      expect(operation).toHaveBeenCalledTimes(1);
      expect(operation.mock.calls[0][0]).toBe(value);
      expect(process.exitCode).toBe(0);
    }
  );

  test.each(CASES)(
    '%s runs nothing and exits 1 when the login fails or the pick is declined (%s)',
    async (command, option, value) => {
      const program = setups[command]();
      getTokens.mockResolvedValue(false);
      await invoke(program, { [option]: value });
      for (const operation of allOperations) {
        expect(operation).not.toHaveBeenCalled();
      }
      expect(process.exitCode).toBe(1);
    }
  );

  test('policy delete -a still asks once and deletes everything', async () => {
    const program = setups['policy delete']();
    getTokens.mockResolvedValue(true);
    await invoke(program, { all: true, yes: true });
    expect(checkBulkDelete).toHaveBeenCalledTimes(1);
    expect(confirmBulkDelete).toHaveBeenCalledTimes(1);
    expect(policyOps.deletePolicies).toHaveBeenCalledTimes(1);
    expect(policyOps.deletePolicyById).not.toHaveBeenCalled();
  });

  test('policy delete -a with --set-id deletes the policies of that set', async () => {
    const program = setups['policy delete']();
    getTokens.mockResolvedValue(true);
    await invoke(program, { all: true, setId: 'zion-set', yes: true });
    expect(policyOps.deletePoliciesByPolicySet).toHaveBeenCalledWith(
      'zion-set'
    );
    expect(policyOps.deletePolicies).not.toHaveBeenCalled();
  });

  test('policy delete refuses -a without a terminal before it logs in', async () => {
    const program = setups['policy delete']();
    checkBulkDelete.mockReturnValue(false);
    await invoke(program, { all: true });
    expect(getTokens).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  // frodo-cli#1163: --set-id narrows -a. The option rules reject it without -a
  // before the action runs; if it ever got here, it must not delete anything.
  test.each([
    ['--set-id alone', { setId: 'zion-set' }],
    ['--set-id alone with --yes', { setId: 'zion-set', yes: true }],
    ['no -a and no -i', {}],
  ])(
    'policy delete with %s deletes nothing and exits 1',
    async (_, options) => {
      const program = setups['policy delete']();
      getTokens.mockResolvedValue(true);
      await invoke(program, options);
      for (const operation of allOperations) {
        expect(operation).not.toHaveBeenCalled();
      }
      expect(confirmBulkDelete).not.toHaveBeenCalled();
      expect(printMessage).toHaveBeenCalledTimes(1);
      expect(printMessage.mock.calls[0][1]).toBe('error');
      expect(process.exitCode).toBe(1);
    }
  );

  test('policy delete -a names all policies in the refusal and in the question', async () => {
    const program = setups['policy delete']();
    getTokens.mockResolvedValue(true);
    await invoke(program, { all: true, yes: true });
    expect(checkBulkDelete.mock.calls[0][0].what).toBe('all policies');
    expect(confirmBulkDelete.mock.calls[0][0].what).toBe('all policies');
    expect(policyOps.deletePoliciesByPolicySet).not.toHaveBeenCalled();
  });

  test('policy delete -a --set-id names the policy set in the refusal and in the question', async () => {
    const program = setups['policy delete']();
    getTokens.mockResolvedValue(true);
    await invoke(program, { all: true, setId: 'zion-set', yes: true });
    expect(checkBulkDelete).toHaveBeenCalledTimes(1);
    expect(checkBulkDelete.mock.calls[0][0].what).toBe(
      'all policies in policy set zion-set'
    );
    expect(confirmBulkDelete).toHaveBeenCalledTimes(1);
    expect(confirmBulkDelete.mock.calls[0][0].what).toBe(
      'all policies in policy set zion-set'
    );
  });

  test('policy delete -a --set-id deletes nothing when the question is declined', async () => {
    const program = setups['policy delete']();
    getTokens.mockResolvedValue(true);
    confirmBulkDelete.mockResolvedValue(false);
    await invoke(program, { all: true, setId: 'zion-set' });
    expect(confirmBulkDelete).toHaveBeenCalledTimes(1);
    for (const operation of allOperations) {
      expect(operation).not.toHaveBeenCalled();
    }
    expect(process.exitCode).toBe(1);
  });

  test('policy delete -a --set-id fails when deleting the policies of the set fails', async () => {
    const program = setups['policy delete']();
    getTokens.mockResolvedValue(true);
    policyOps.deletePoliciesByPolicySet.mockResolvedValue(false);
    await invoke(program, { all: true, setId: 'zion-set', yes: true });
    expect(policyOps.deletePolicies).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
