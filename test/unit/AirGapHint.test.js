import { jest } from '@jest/globals';
import { FrodoError } from '@rockcarver/frodo-lib';
import {
  AIR_GAPPED_HINT,
  airGappedHintFor,
  isAirGappedError,
} from '../../src/utils/AirGapHint.ts';
import { printError } from '../../src/utils/Console.ts';
import {
  ERROR_CODE_HINTS,
  errorHintFor,
} from '../../src/utils/ErrorCodeHints.ts';

// frodo-lib refuses a request to a host that the caller did not name while
// air-gapped mode is on and tags the error with the code AIR_GAPPED. The
// message of the library names no option of this command line; the advice is
// ours (cli#1307), printed after the error by printError.

const refusal = () =>
  new FrodoError(
    'Air-gapped mode is on: the application template catalog was not requested.',
    null,
    'AIR_GAPPED'
  );

describe('recognising an air-gapped refusal', () => {
  test('1: the error itself, and the errors that wrap it, however deep', () => {
    expect(isAirGappedError(refusal())).toBe(true);
    expect(
      isAirGappedError(new FrodoError('Error reading templates', refusal()))
    ).toBe(true);
    expect(
      isAirGappedError(
        new FrodoError(
          'outer',
          new FrodoError('middle', new FrodoError('inner', refusal()))
        )
      )
    ).toBe(true);
    expect(
      isAirGappedError(
        new FrodoError('outer', [new Error('no code'), refusal()])
      )
    ).toBe(true);
  });

  test('2: another code, no code, a plain error and non-errors are not a refusal', () => {
    expect(
      isAirGappedError(new FrodoError('x', null, 'LOG_API_CREDENTIAL_MISSING'))
    ).toBe(false);
    expect(isAirGappedError(new FrodoError('no code'))).toBe(false);
    expect(isAirGappedError(new Error('plain'))).toBe(false);
    expect(isAirGappedError(undefined)).toBe(false);
    expect(isAirGappedError(null)).toBe(false);
    expect(isAirGappedError('AIR_GAPPED')).toBe(false);
    // only a FrodoError carries the code of the library
    expect(
      isAirGappedError(Object.assign(new Error('x'), { code: 'AIR_GAPPED' }))
    ).toBe(false);
  });

  test('3: a chain deeper than the limit, and a cycle, end', () => {
    let deep = refusal();
    for (let i = 0; i < 12; i++) deep = new FrodoError(`wrap ${i}`, deep);
    expect(isAirGappedError(deep)).toBe(false);
    const a = new FrodoError('a');
    const b = new FrodoError('b', a);
    a.originalErrors = [b];
    expect(isAirGappedError(a)).toBe(false);
  });
});

describe('the advice', () => {
  test('4: one line that names the switch and the way out, and no option of the library', () => {
    expect(AIR_GAPPED_HINT).toMatch(/^[^\n]+$/);
    expect(AIR_GAPPED_HINT).toContain('FRODO_AIRGAPPED');
    expect(AIR_GAPPED_HINT).toContain("'frodo settings airgap'");
    expect(AIR_GAPPED_HINT).toMatch(/explicitly/);
  });

  test('5: the hint is given for a refusal at any depth and for nothing else', () => {
    expect(airGappedHintFor(refusal())).toBe(AIR_GAPPED_HINT);
    expect(airGappedHintFor(new FrodoError('x', refusal()))).toBe(
      AIR_GAPPED_HINT
    );
    expect(airGappedHintFor(new Error('plain'))).toBeUndefined();
    expect(airGappedHintFor(new FrodoError('no code'))).toBeUndefined();
  });

  test('6: the table of hints by code (MCP tool results) has it, and the lookup finds it through a wrapper', () => {
    expect(ERROR_CODE_HINTS.AIR_GAPPED).toBe(AIR_GAPPED_HINT);
    expect(errorHintFor(new FrodoError('wrapper', refusal()))).toBe(
      AIR_GAPPED_HINT
    );
  });
});

describe('printError', () => {
  let lines;
  beforeEach(() => {
    lines = [];
    jest.spyOn(console, 'error').mockImplementation((...args) => {
      lines.push(args.map(String).join(' '));
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('7: prints the error of the library, then the advice once', () => {
    printError(new FrodoError('Error reading templates', refusal()));
    const text = lines.join('\n');
    expect(text).toContain('Error reading templates');
    expect(text).toContain('Air-gapped mode is on: the application template');
    expect(lines.filter((l) => l.includes(AIR_GAPPED_HINT))).toHaveLength(1);
    expect(lines.findIndex((l) => l.includes(AIR_GAPPED_HINT))).toBe(
      lines.length - 1
    );
  });

  test('8: another FrodoError and a plain error get no advice', () => {
    printError(new FrodoError('Error reading something'));
    printError(new Error('plain'));
    expect(lines.join('\n')).not.toContain('FRODO_AIRGAPPED');
  });
});
