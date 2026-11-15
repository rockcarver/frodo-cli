import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import {
  brokenDiagnosis,
  finding,
  repairPlan,
  repairResult,
} from '../utils/FeatureDiagnosisFixtures.js';

/**
 * `frodo feature validate -i <id> --repair` (src/ops/FeatureRepairOps.ts, #1300).
 * The library is a spy that answers with what its source produces (the
 * fixtures); the terminal is a spy; the backup is written for real into a
 * temporary directory, because "the backup is on disk before the first write
 * to the tenant" is the property that matters most. Nothing here reaches a
 * tenant.
 */
const idmFeature = {
  diagnoseIdmFeature: jest.fn(),
  planIdmFeatureRepair: jest.fn(),
  repairIdmFeature: jest.fn(),
};
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: { cloud: { idmFeature } },
  state: { getHost: () => 'https://openam-zion.example.com/am' },
}));

const calls = [];
const printMessage = jest.fn((text, type) => calls.push(['print', type, text]));
const printError = jest.fn((error, title) => calls.push(['error', title]));
const verboseMessage = jest.fn();
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage,
  printError,
  verboseMessage,
  createTable: jest.fn(),
}));

// colors are not what is tested: the words are
const same = (text) => String(text);
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: {
    heading: same,
    positive: same,
    negative: same,
    warning: same,
    muted: same,
    command: same,
  },
}));

let terminal = true;
jest.unstable_mockModule('../../src/utils/interactive/PromptGateState', () => ({
  canPrompt: () => terminal,
}));

let answer = true;
const confirm = jest.fn(async () => {
  calls.push(['question']);
  return answer;
});
jest.unstable_mockModule('@inquirer/confirm', () => ({ default: confirm }));

const {
  checkRepairBeforeLogin,
  planText,
  repairFeature,
  repairOptionsProblem,
} = await import('../../src/ops/FeatureRepairOps');

// eslint-disable-next-line no-control-regex
const plain = (text) => String(text).replace(/\u001b\[[0-9;]*m/g, '');
const printed = (type) =>
  printMessage.mock.calls
    .filter(([, t]) => t === type)
    .map(([text]) => plain(text));
const everything = () =>
  printMessage.mock.calls.map(([text]) => plain(text)).join('\n');

let work;
let backupDir;
beforeEach(() => {
  jest.clearAllMocks();
  calls.length = 0;
  terminal = true;
  answer = true;
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-feature-repair-'));
  backupDir = path.join(work, 'backup');
  idmFeature.diagnoseIdmFeature.mockResolvedValue(brokenDiagnosis);
  idmFeature.planIdmFeatureRepair.mockResolvedValue(repairPlan);
  idmFeature.repairIdmFeature.mockImplementation(async () => {
    calls.push([
      'repair',
      fs.existsSync(backupDir) ? fs.readdirSync(backupDir) : [],
    ]);
    return repairResult;
  });
});
afterEach(() => {
  fs.rmSync(work, { recursive: true, force: true });
});

describe('repairOptionsProblem', () => {
  test.each([
    [{ yes: true }, '--yes requires --repair.'],
    [{ backupDir: 'x' }, '--backup-dir requires --repair.'],
    [{ keepAligned: true }, '--keep-aligned requires --repair.'],
    [{ authService: 'Login' }, '--auth-service requires --repair.'],
    [{ wait: true }, '--wait requires --repair.'],
    [
      { timeoutSeconds: 5 },
      '--timeout requires --wait, and --wait requires --repair.',
    ],
  ])('without --repair, %j is refused', (options, message) => {
    expect(repairOptionsProblem({ ...options })).toBe(message);
  });

  test('with --repair, --timeout needs --wait', () => {
    expect(repairOptionsProblem({ repair: true, timeoutSeconds: 5 })).toBe(
      '--timeout requires --wait.'
    );
  });

  test('a timeout of 0 seconds is still a timeout, and still needs --wait', () => {
    expect(repairOptionsProblem({ repair: true, timeoutSeconds: 0 })).toBe(
      '--timeout requires --wait.'
    );
  });

  test.each([
    [{}],
    [{ repair: true }],
    [{ repair: true, yes: true, backupDir: 'x', keepAligned: true }],
    [{ repair: true, wait: true, timeoutSeconds: 600, authService: 'Login' }],
  ])('%j is fine', (options) => {
    expect(repairOptionsProblem(options)).toBeUndefined();
  });
});

describe('checkRepairBeforeLogin', () => {
  test('without a terminal, --yes and --backup-dir it refuses ONCE and names both, with the command line that works', () => {
    terminal = false;

    expect(checkRepairBeforeLogin('aiagent', {})).toBe(false);

    const errors = printed('error');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Refusing to repair the feature "aiagent"');
    expect(errors[0]).toContain(
      'the confirmation and for the backup directory'
    );
    expect(errors[0]).toContain('-y/--yes');
    expect(errors[0]).toContain('--backup-dir <directory>');
    expect(errors[0]).toContain(
      'frodo feature validate -i aiagent --repair --backup-dir <directory> -y'
    );
    expect(errors[0]).not.toContain('--dry-run');
  });

  test('without a terminal and without --yes it refuses, names --yes, and does not name a --dry-run the command does not have', () => {
    terminal = false;

    expect(checkRepairBeforeLogin('aiagent', { backupDir: 'b' })).toBe(false);

    const error = printed('error').join('\n');
    expect(error).toContain('Refusing to repair the feature "aiagent"');
    expect(error).toContain('-y/--yes');
    expect(error).toContain('without confirmation');
    expect(error).not.toContain('backup directory');
    expect(error).not.toContain('--dry-run');
  });

  test('without a terminal and without --backup-dir it refuses even with --yes: a repair always has a backup', () => {
    terminal = false;

    expect(checkRepairBeforeLogin('aiagent', { yes: true })).toBe(false);

    const error = printed('error').join('\n');
    expect(error).toContain('--backup-dir is required');
    expect(error).not.toContain('confirmation');
  });

  test('without a terminal, --yes and --backup-dir pass', () => {
    terminal = false;

    expect(
      checkRepairBeforeLogin('aiagent', { yes: true, backupDir: 'b' })
    ).toBe(true);
    expect(printMessage).not.toHaveBeenCalled();
  });

  test('on a terminal nothing is refused: the question and the backup directory are asked for later', () => {
    expect(checkRepairBeforeLogin('aiagent', {})).toBe(true);
    expect(printMessage).not.toHaveBeenCalled();
  });
});

describe('repairFeature, what stops it before anything is written', () => {
  test('a feature the library cannot diagnose: "No repair is known", exit 1, no plan, no repair', async () => {
    idmFeature.diagnoseIdmFeature.mockResolvedValue({
      featureId: 'groups',
      supported: false,
      installedVersion: '1',
      availableVersions: ['1'],
      findings: [],
    });

    await expect(
      repairFeature('groups', { backupDir, yes: true })
    ).resolves.toBe(false);

    expect(printed('error')).toEqual([
      'No repair is known for feature "groups".',
    ]);
    expect(idmFeature.planIdmFeatureRepair).not.toHaveBeenCalled();
    expect(idmFeature.repairIdmFeature).not.toHaveBeenCalled();
    expect(fs.existsSync(backupDir)).toBe(false);
  });

  test('a plan with blockers: the blockers are printed, nothing is written, exit 1', async () => {
    idmFeature.planIdmFeatureRepair.mockResolvedValue({
      ...repairPlan,
      repairable: false,
      blockers: [
        {
          id: 'definitions-structural-drift',
          message: '30 definition(s) are missing.',
        },
        {
          id: 'authentication-service-missing',
          message: 'The service Login does not exist.',
        },
      ],
      steps: [],
    });

    await expect(
      repairFeature('aiagent', { backupDir, yes: true })
    ).resolves.toBe(false);

    const error = printed('error').join('\n');
    expect(error).toContain('cannot be repaired');
    expect(error).toContain('  - 30 definition(s) are missing.');
    expect(error).toContain('  - The service Login does not exist.');
    expect(error).toContain('Nothing was changed.');
    // the diagnosis of a repair does not offer the repair it just refused
    expect(everything()).not.toContain('Run "frodo feature validate');
    expect(idmFeature.repairIdmFeature).not.toHaveBeenCalled();
    expect(fs.existsSync(backupDir)).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  test('a plan with nothing to do: says so, exits 0, writes no backup and asks nothing', async () => {
    idmFeature.planIdmFeatureRepair.mockResolvedValue({
      ...repairPlan,
      steps: [],
    });

    await expect(repairFeature('aiagent', { backupDir })).resolves.toBe(true);

    expect(printed('info')).toEqual([
      'Nothing to repair for feature "aiagent".',
    ]);
    expect(everything()).not.toContain('Run "frodo feature validate');
    expect(idmFeature.repairIdmFeature).not.toHaveBeenCalled();
    expect(fs.existsSync(backupDir)).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  test('a failed diagnosis or plan: the error is printed, exit 1', async () => {
    idmFeature.planIdmFeatureRepair.mockRejectedValue(new Error('boom'));

    await expect(
      repairFeature('aiagent', { backupDir, yes: true })
    ).resolves.toBe(false);

    expect(printError).toHaveBeenCalledWith(
      expect.any(Error),
      'Error repairing feature "aiagent"'
    );
    expect(idmFeature.repairIdmFeature).not.toHaveBeenCalled();
  });
});

describe('repairFeature, the backup directory', () => {
  test('is asked for when it is not given, and the answer is where the backup goes', async () => {
    const askBackupDir = jest.fn(async () => backupDir);

    await expect(
      repairFeature('aiagent', { yes: true, askBackupDir })
    ).resolves.toBe(true);

    expect(askBackupDir).toHaveBeenCalledTimes(1);
    expect(fs.readdirSync(backupDir).length).toBeGreaterThan(0);
  });

  test('is not asked for when it is given', async () => {
    const askBackupDir = jest.fn(async () => path.join(work, 'other'));

    await repairFeature('aiagent', { yes: true, backupDir, askBackupDir });

    expect(askBackupDir).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(work, 'other'))).toBe(false);
  });

  test('is not asked for when there is nothing to repair', async () => {
    idmFeature.planIdmFeatureRepair.mockResolvedValue({
      ...repairPlan,
      steps: [],
    });
    const askBackupDir = jest.fn(async () => backupDir);

    await repairFeature('aiagent', { askBackupDir });

    expect(askBackupDir).not.toHaveBeenCalled();
  });

  test('a user who backs out of the question stops the repair before anything is written', async () => {
    const askBackupDir = jest.fn(async () => undefined);

    await expect(
      repairFeature('aiagent', { yes: true, askBackupDir })
    ).resolves.toBe(false);

    expect(printed('error').join('\n')).toContain(
      'A repair needs a directory for the backup'
    );
    expect(idmFeature.repairIdmFeature).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  test('without the option and without a way to ask, the repair does not run', async () => {
    await expect(repairFeature('aiagent', { yes: true })).resolves.toBe(false);

    expect(idmFeature.repairIdmFeature).not.toHaveBeenCalled();
  });

  test('a backup that cannot be written stops the repair: nothing was changed', async () => {
    fs.writeFileSync(backupDir, 'a file where the directory should go');

    await expect(
      repairFeature('aiagent', { backupDir, yes: true })
    ).resolves.toBe(false);

    expect(printError).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('nothing was changed')
    );
    expect(idmFeature.repairIdmFeature).not.toHaveBeenCalled();
  });
});

describe('repairFeature, the order', () => {
  test('the plan is shown, then the question, then the backup is written, then the library repairs', async () => {
    await expect(repairFeature('aiagent', { backupDir })).resolves.toBe(true);

    const order = calls
      .map(([kind, second, third]) =>
        kind === 'print' && /^Repair plan for feature/.test(plain(third))
          ? 'plan'
          : kind === 'print' && /^Backup written/.test(plain(third))
            ? 'backup-reported'
            : kind === 'print' && /warn/.test(second)
              ? 'warning'
              : kind
      )
      .filter((kind) =>
        ['plan', 'warning', 'question', 'backup-reported', 'repair'].includes(
          kind
        )
      );
    expect(order).toEqual([
      'plan',
      'warning',
      'question',
      'backup-reported',
      'repair',
    ]);
  });

  test('the backup files are on disk when the library is called to repair', async () => {
    await repairFeature('aiagent', { backupDir, yes: true });

    const repairCall = calls.find(([kind]) => kind === 'repair');
    expect(repairCall[1].length).toBeGreaterThan(0);
    expect(repairCall[1].join(' ')).toContain('config-managed.json');
  });

  test('the warning names the tenant and the backup directory', async () => {
    await repairFeature('aiagent', { backupDir });

    const warning = printed('warn').join('\n');
    expect(warning).toContain('https://openam-zion.example.com/am');
    expect(warning).toContain(backupDir);
  });

  test('a no to the question changes nothing: no backup, no repair, exit 1', async () => {
    answer = false;

    await expect(repairFeature('aiagent', { backupDir })).resolves.toBe(false);

    expect(printed('warn').join('\n')).toContain('Nothing was changed.');
    expect(fs.existsSync(backupDir)).toBe(false);
    expect(idmFeature.repairIdmFeature).not.toHaveBeenCalled();
  });

  test('--yes asks nothing, and still shows the plan', async () => {
    await expect(
      repairFeature('aiagent', { backupDir, yes: true })
    ).resolves.toBe(true);

    expect(confirm).not.toHaveBeenCalled();
    expect(everything()).toContain('Repair plan for feature "aiagent"');
  });
});

describe('repairFeature, what it hands to the library', () => {
  test('asks for a plan with no options when none is given', async () => {
    await repairFeature('aiagent', { backupDir, yes: true });

    expect(idmFeature.planIdmFeatureRepair).toHaveBeenCalledWith('aiagent', {});
    expect(idmFeature.repairIdmFeature).toHaveBeenCalledWith(
      repairPlan,
      expect.not.objectContaining({ wait: expect.anything() })
    );
    expect(
      idmFeature.repairIdmFeature.mock.calls[0][1].timeout
    ).toBeUndefined();
  });

  test('--keep-aligned and --auth-service go into the plan', async () => {
    await repairFeature('aiagent', {
      backupDir,
      yes: true,
      keepAligned: true,
      authService: 'ZionLogin',
    });

    expect(idmFeature.planIdmFeatureRepair).toHaveBeenCalledWith('aiagent', {
      keepAligned: true,
      authService: 'ZionLogin',
    });
  });

  test('--wait --timeout: the seconds of the command line are milliseconds for the library (core 0020)', async () => {
    await repairFeature('aiagent', {
      backupDir,
      yes: true,
      wait: true,
      timeoutSeconds: 600,
    });

    expect(idmFeature.repairIdmFeature).toHaveBeenCalledWith(
      repairPlan,
      expect.objectContaining({ wait: true, timeout: 600000 })
    );
  });

  test('--wait without --timeout leaves the library its default of 20 minutes', async () => {
    await repairFeature('aiagent', { backupDir, yes: true, wait: true });

    const options = idmFeature.repairIdmFeature.mock.calls[0][1];
    expect(options.wait).toBe(true);
    expect('timeout' in options).toBe(false);
  });

  test('--timeout 0 is passed as 0 milliseconds, not dropped', async () => {
    await repairFeature('aiagent', {
      backupDir,
      yes: true,
      wait: true,
      timeoutSeconds: 0,
    });

    expect(idmFeature.repairIdmFeature.mock.calls[0][1].timeout).toBe(0);
  });
});

describe('repairFeature, the outcome', () => {
  test('prints every step as the library finishes it, with a mark', async () => {
    idmFeature.repairIdmFeature.mockImplementation(async (_plan, options) => {
      options.resultCallback({
        step: { id: 'create-provider' },
        status: 'done',
        message: 'Created the provider of bravo.',
      });
      options.resultCallback({
        step: { id: 'wait-for-gate' },
        status: 'skipped',
        message: 'Not asked to wait.',
      });
      return repairResult;
    });

    await repairFeature('aiagent', { backupDir, yes: true });

    const output = everything();
    expect(output).toContain('  ✔ Created the provider of bravo.');
    expect(output).toContain('  - Not asked to wait.');
    expect(output.indexOf('Created the provider')).toBeLessThan(
      output.indexOf('Not asked to wait.')
    );
  });

  test('a failed step goes to the error output', async () => {
    idmFeature.repairIdmFeature.mockImplementation(async (_plan, options) => {
      options.resultCallback({
        step: { id: 'enable' },
        status: 'failed',
        message: 'The enable action answered 500.',
      });
      return {
        ...repairResult,
        completed: false,
        results: [
          {
            step: { id: 'enable' },
            status: 'failed',
            message: 'The enable action answered 500.',
          },
        ],
      };
    });

    await expect(
      repairFeature('aiagent', { backupDir, yes: true })
    ).resolves.toBe(false);

    const error = printed('error').join('\n');
    expect(error).toContain('✖ The enable action answered 500.');
    expect(error).toContain('The repair stopped at the step "enable"');
    expect(error).toContain(backupDir);
  });

  test('the diagnosis after the repair is printed, without the hint to repair even when it still finds something repairable', async () => {
    idmFeature.repairIdmFeature.mockResolvedValue({
      ...repairResult,
      diagnosis: {
        ...repairResult.diagnosis,
        findings: [
          finding(
            'provider-missing',
            'error',
            'The realm bravo has no OAuth 2.0 provider yet.',
            true
          ),
          finding(
            'gate-closed',
            'error',
            'AM does not accept AI agents in the realm alpha yet.'
          ),
        ],
      },
    });

    await repairFeature('aiagent', { backupDir, yes: true });

    const output = everything();
    expect(output).toContain(
      'AM does not accept AI agents in the realm alpha yet.'
    );
    expect(output).toContain('The realm bravo has no OAuth 2.0 provider yet.');
    expect(output).not.toContain('Run "frodo feature validate');
  });

  test('without --wait, a gate that is still closed after the enable action says to check again later, and exits 0', async () => {
    await expect(
      repairFeature('aiagent', { backupDir, yes: true })
    ).resolves.toBe(true);

    expect(printed('info').join('\n')).toContain(
      'Repaired. AM can take several minutes to open the gate: run "frodo feature validate -i aiagent" to check.'
    );
  });

  test('with --wait a repair that completed is simply Repaired: the note about waiting minutes is only for a run that did not wait', async () => {
    await expect(
      repairFeature('aiagent', { backupDir, yes: true, wait: true })
    ).resolves.toBe(true);

    expect(printed('success')).toEqual(['Repaired.']);
    expect(printed('info').join('\n')).not.toContain(
      'AM can take several minutes'
    );
  });

  test('a repair that finished and left nothing closed says Repaired.', async () => {
    idmFeature.repairIdmFeature.mockResolvedValue({
      ...repairResult,
      diagnosis: { ...repairResult.diagnosis, findings: [] },
    });

    await expect(
      repairFeature('aiagent', { backupDir, yes: true })
    ).resolves.toBe(true);

    expect(printed('success')).toEqual(['Repaired.']);
  });

  test('with --wait, a gate that is not open when the time is up fails, and names the timeout', async () => {
    idmFeature.repairIdmFeature.mockResolvedValue({
      ...repairResult,
      completed: false,
    });

    await expect(
      repairFeature('aiagent', {
        backupDir,
        yes: true,
        wait: true,
        timeoutSeconds: 600,
      })
    ).resolves.toBe(false);

    const error = printed('error').join('\n');
    expect(error).toContain(
      'AM had not opened the gate when the wait ended (600 seconds)'
    );
    expect(error).toContain('frodo feature validate -i aiagent');
  });

  test('--keep-aligned says that the definitions stay aligned', async () => {
    idmFeature.planIdmFeatureRepair.mockResolvedValue({
      ...repairPlan,
      options: { ...repairPlan.options, keepAligned: true },
    });

    await repairFeature('aiagent', { backupDir, yes: true, keepAligned: true });

    expect(printed('info').join('\n')).toContain(
      'The definitions stay aligned with the original, as asked.'
    );
  });

  test('a library error during the repair: printed, exit 1, and the backup is named', async () => {
    idmFeature.repairIdmFeature.mockRejectedValue(
      new Error('read-back mismatch')
    );

    await expect(
      repairFeature('aiagent', { backupDir, yes: true })
    ).resolves.toBe(false);

    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'read-back mismatch' }),
      'Error repairing feature "aiagent"'
    );
    expect(printed('info').join('\n')).toContain(
      `The backup, if it was written, is in ${backupDir}.`
    );
    expect(fs.readdirSync(backupDir).length).toBeGreaterThan(0);
  });
});

describe('planText', () => {
  const text = plain(planText(repairPlan, false));

  test('numbers the steps in the order they run and says what kind each is', () => {
    expect(text).toContain(
      'Repair plan for feature "aiagent" (7 steps, 5 writes to the tenant):'
    );
    expect(text).toMatch(
      /1\. \[write\] Create the OAuth 2\.0 provider of the realm bravo/
    );
    expect(text).toMatch(/4\. \[write\] Run the enable action/);
    expect(text).toMatch(/7\. \[read\] Diagnose the feature again\./);
    expect(text.indexOf('1. [write]')).toBeLessThan(text.indexOf('4. [write]'));
  });

  test('the wait step says it is skipped without --wait, and is a wait with it', () => {
    expect(text).toContain('[wait, skipped without --wait]');
    expect(plain(planText(repairPlan, true))).toContain('[wait]');
    expect(plain(planText(repairPlan, true))).not.toContain('skipped without');
  });

  test("aligning shows the value before and after: the tenant's, then the original", () => {
    const align = text.slice(
      text.indexOf('3. [write]'),
      text.indexOf('4. [write]')
    );

    expect(align).toContain('alpha_aiagent  onDelete.source');
    expect(align).toContain('before: "return value;"');
    expect(align).toContain('after:  "return value;\\n"');
  });

  test('restoring shows it the other way round', () => {
    const restore = text.slice(
      text.indexOf('6. [write]'),
      text.indexOf('7. [read]')
    );

    expect(restore).toContain('before: "return value;\\n"');
    expect(restore).toContain('after:  "return value;"');
  });

  test('a value that is long is cut and sized, and one that is absent says so', () => {
    expect(text).toContain(`${'"' + 'x'.repeat(79)}... (302 characters)`);
    expect(text).toContain('before: (absent)');
  });

  test('a step that writes no definitions has no before and after', () => {
    const enable = text.slice(text.indexOf('4. [write]'), text.indexOf('5. '));

    expect(enable).not.toContain('before:');
  });
});
