/**
 * Unit tests for the guard of a delete that can remove more than the one object
 * it names (src/utils/BulkDeleteGuard.ts, cli record 0037): a terminal is asked,
 * without one the delete is refused, `--yes` and a dry run pass, and the answer
 * defaults to no.
 */
import { jest } from '@jest/globals';

const printed = [];
const messages = (type) =>
  printed.filter((entry) => entry.type === type).map((entry) => entry.msg);

let terminal = true;
let answer = true;
const asked = [];

jest.unstable_mockModule('@inquirer/confirm', () => ({
  default: async (options) => {
    asked.push(options);
    return answer;
  },
}));
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  state: {
    getHost: () => 'https://openam-alpha.example.com/am',
    getRealm: () => '/alpha',
  },
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: (msg, type) => printed.push({ msg: String(msg), type }),
}));
jest.unstable_mockModule('../../src/utils/interactive/PromptGateState', () => ({
  canPrompt: () => terminal,
}));

const {
  bulkDeleteGate,
  checkBulkDelete,
  checkProceed,
  confirmBulkDelete,
  confirmProceed,
} = await import('../../src/utils/BulkDeleteGuard.ts');

beforeEach(() => {
  printed.length = 0;
  asked.length = 0;
  terminal = true;
  answer = true;
});

describe('bulkDeleteGate', () => {
  test.each([
    [{ interactive: true }, 'ask'],
    [{ interactive: false }, 'refuse'],
    [{ yes: true, interactive: false }, 'proceed'],
    [{ yes: true, interactive: true }, 'proceed'],
    [{ dryRun: true, interactive: false }, 'dry-run'],
    [{ dryRun: true, yes: true, interactive: true }, 'dry-run'],
  ])('%j is %s', (options, expected) => {
    expect(bulkDeleteGate(options)).toBe(expected);
  });
});

describe('confirmBulkDelete', () => {
  test('a terminal is asked what is deleted and where, and the default answer is no', async () => {
    expect(await confirmBulkDelete({ what: 'all scripts' })).toBe(true);

    expect(asked).toHaveLength(1);
    expect(asked[0].default).toBe(false);
    expect(asked[0].message).toContain('Delete all scripts?');
    expect(messages('warn').join('\n')).toContain(
      'This permanently deletes all scripts from https://openam-alpha.example.com/am (realm /alpha).'
    );
  });

  test('a no deletes nothing and says so', async () => {
    answer = false;

    expect(await confirmBulkDelete({ what: 'all scripts' })).toBe(false);

    expect(messages('warn').join('\n')).toContain('Delete aborted.');
  });

  test('without a terminal it refuses, names --yes and --dry-run, and asks nothing', async () => {
    terminal = false;

    expect(await confirmBulkDelete({ what: 'all scripts' })).toBe(false);

    expect(asked).toEqual([]);
    const error = messages('error').join('\n');
    expect(error).toContain(
      'Refusing to delete all scripts without confirmation'
    );
    expect(error).toContain('-y/--yes');
    expect(error).toContain('--dry-run');
  });

  test('a command without --dry-run does not name it', async () => {
    terminal = false;

    await confirmBulkDelete({ what: 'all scripts', dryRunAvailable: false });

    expect(messages('error').join('\n')).not.toContain('--dry-run');
  });

  test('a command can name its own preview option instead of --dry-run', async () => {
    terminal = false;

    expect(
      await confirmBulkDelete({
        what: 'all scripts',
        dryRunOption: '--what-if',
      })
    ).toBe(false);
    expect(
      checkBulkDelete({ what: 'all scripts', dryRunOption: '--what-if' })
    ).toBe(false);

    const errors = messages('error');
    expect(errors).toHaveLength(2);
    for (const error of errors) {
      expect(error).toContain(
        'or --what-if to only show what would be deleted'
      );
      expect(error).not.toContain('--dry-run');
    }
  });

  test('--yes passes without a question, with or without a terminal', async () => {
    expect(await confirmBulkDelete({ what: 'all scripts', yes: true })).toBe(
      true
    );
    terminal = false;
    expect(await confirmBulkDelete({ what: 'all scripts', yes: true })).toBe(
      true
    );

    expect(asked).toEqual([]);
    expect(printed).toEqual([]);
  });

  test('a dry run passes without a question and without --yes', async () => {
    terminal = false;

    expect(await confirmBulkDelete({ what: 'all scripts', dryRun: true })).toBe(
      true
    );

    expect(asked).toEqual([]);
  });

  test('the plan is shown before the question, and a plan that fails stops it', async () => {
    const order = [];
    const showPlan = async () => {
      order.push('plan');
      return true;
    };
    answer = false;
    await confirmBulkDelete({ what: 'all scripts', showPlan });
    expect(order).toEqual(['plan']);
    expect(asked).toHaveLength(1);

    asked.length = 0;
    expect(
      await confirmBulkDelete({
        what: 'all scripts',
        showPlan: async () => false,
      })
    ).toBe(false);
    expect(asked).toEqual([]);
  });

  test('the plan is not shown when the delete is refused or passes', async () => {
    let shown = 0;
    const showPlan = async () => {
      shown++;
      return true;
    };
    terminal = false;
    await confirmBulkDelete({ what: 'x', showPlan });
    await confirmBulkDelete({ what: 'x', showPlan, yes: true });
    await confirmBulkDelete({ what: 'x', showPlan, dryRun: true });

    expect(shown).toBe(0);
  });
});

describe('checkBulkDelete, the refusal that happens before the login', () => {
  test('without a terminal and without --yes it refuses and names --yes', () => {
    terminal = false;

    expect(checkBulkDelete({ what: 'all scripts' })).toBe(false);

    expect(messages('error').join('\n')).toContain('-y/--yes');
  });

  test.each([
    ['with a terminal', { terminal: true }],
    ['with --yes', { terminal: false, yes: true }],
    ['for a dry run', { terminal: false, dryRun: true }],
  ])('it lets the run go on %s, without printing anything', (_, scenario) => {
    terminal = scenario.terminal;

    expect(
      checkBulkDelete({
        what: 'all scripts',
        yes: scenario.yes,
        dryRun: scenario.dryRun,
      })
    ).toBe(true);

    expect(printed).toEqual([]);
  });
});

describe('confirmProceed, the same question for an action that is not a delete', () => {
  const what = 'set up a remote proxy';

  test('a terminal is shown the warning and asked, and the default answer is no', async () => {
    expect(
      await confirmProceed({ what, warning: 'This gives admin access.' })
    ).toBe(true);

    expect(asked).toHaveLength(1);
    expect(asked[0].default).toBe(false);
    expect(asked[0].message).toBe('Set up a remote proxy? Continue?');
    expect(messages('warn').join('\n')).toContain('This gives admin access.');
  });

  test('a no changes nothing and says so', async () => {
    answer = false;

    expect(await confirmProceed({ what })).toBe(false);

    expect(messages('warn').join('\n')).toContain('Nothing was changed.');
  });

  test('without a terminal it refuses, names --yes and --dry-run, and asks nothing', async () => {
    terminal = false;

    expect(await confirmProceed({ what })).toBe(false);

    expect(asked).toEqual([]);
    const error = messages('error').join('\n');
    expect(error).toContain(
      'Refusing to set up a remote proxy without confirmation'
    );
    expect(error).toContain('-y/--yes');
    expect(error).toContain('--dry-run');
  });

  test('--yes and a dry run pass without a question, with or without a terminal', async () => {
    expect(await confirmProceed({ what, yes: true })).toBe(true);
    terminal = false;
    expect(await confirmProceed({ what, yes: true })).toBe(true);
    expect(await confirmProceed({ what, dryRun: true })).toBe(true);

    expect(asked).toEqual([]);
    expect(printed).toEqual([]);
  });

  test('the plan is shown before the warning and the question, and a plan that fails stops it', async () => {
    const order = [];
    answer = false;
    await confirmProceed({
      what,
      warning: 'careful',
      showPlan: async () => {
        order.push('plan');
        return true;
      },
    });
    expect(order).toEqual(['plan']);
    expect(asked).toHaveLength(1);

    asked.length = 0;
    expect(await confirmProceed({ what, showPlan: async () => false })).toBe(
      false
    );
    expect(asked).toEqual([]);
  });

  test('the plan is not shown when the action is refused or passes', async () => {
    let shown = 0;
    const showPlan = async () => {
      shown++;
      return true;
    };
    terminal = false;
    await confirmProceed({ what, showPlan });
    await confirmProceed({ what, showPlan, yes: true });
    await confirmProceed({ what, showPlan, dryRun: true });

    expect(shown).toBe(0);
  });
});

describe('checkProceed, the refusal that happens before the login', () => {
  test('without a terminal and without --yes it refuses and names --yes and --dry-run', () => {
    terminal = false;

    expect(checkProceed({ what: 'set up a remote proxy' })).toBe(false);

    expect(messages('error').join('\n')).toContain(
      'Refusing to set up a remote proxy'
    );
    expect(messages('error').join('\n')).toContain('--dry-run');
  });

  test('a terminal, --yes and a dry run pass quietly', () => {
    expect(checkProceed({ what: 'x' })).toBe(true);
    terminal = false;
    expect(checkProceed({ what: 'x', yes: true })).toBe(true);
    expect(checkProceed({ what: 'x', dryRun: true })).toBe(true);

    expect(printed).toEqual([]);
  });
});
