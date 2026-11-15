import { jest } from '@jest/globals';
import { FrodoError } from '@rockcarver/frodo-lib';
import {
  accessAdviceFor,
  hasAccessErrorCode,
  resetAccessAdviceForTests,
} from '../../src/utils/AccessErrorAdvice.ts';
import { ACCESS_MATRIX_DOC } from '../../src/utils/AccessProfileText.ts';
import { printError } from '../../src/utils/Console.ts';
import {
  browserProfile,
  deviceProfile,
  serviceAccountProfile,
} from '../utils/AccessProfileFixtures.js';

// When a command fails because the login cannot reach what it needs, the
// error names the login that was used and says what to use instead. The
// library states the facts and sets the code; the session is the real
// library state of a browser login, a device login or a service account.

const scopeError = (code = 'INSUFFICIENT_SCOPE') =>
  new FrodoError('Error exporting', new FrodoError('the facts', null, code));

beforeEach(() => resetAccessAdviceForTests());

describe('the advice after a scope error of an interactive login', () => {
  test('1: a browser login: names it, what it reaches, and a service account', () => {
    browserProfile();
    const advice = accessAdviceFor(scopeError());
    expect(advice).toMatch(/^This session is a browser login \(it reaches /);
    expect(advice).toContain('use a service account');
    expect(advice).toContain(ACCESS_MATRIX_DOC);
  });

  test('2: a device login that cannot reach Access Management: also names the browser login', () => {
    deviceProfile();
    const advice = accessAdviceFor(scopeError('NO_AM_SESSION'));
    expect(advice).toMatch(/^This session is a device login/);
    expect(advice).toContain("a browser login ('frodo login --browser')");
  });

  test('3: a service account gets no advice: the error already names the scope it lacks', () => {
    serviceAccountProfile();
    expect(accessAdviceFor(scopeError())).toBeUndefined();
  });

  test('4: an error that is not about reach gets none', () => {
    browserProfile();
    expect(
      accessAdviceFor(new FrodoError('x', null, 'AIR_GAPPED'))
    ).toBeUndefined();
    expect(accessAdviceFor(new FrodoError('plain'))).toBeUndefined();
    expect(accessAdviceFor(new Error('INSUFFICIENT_SCOPE'))).toBeUndefined();
  });

  test('5: the code is found in the errors that an error wraps', () => {
    expect(hasAccessErrorCode(scopeError())).toBe(true);
    expect(
      hasAccessErrorCode(new FrodoError('outer', scopeError('NO_AM_SESSION')))
    ).toBe(true);
    expect(hasAccessErrorCode(undefined)).toBe(false);
  });

  test('6: it is given once per process: a bulk operation does not repeat it for every section', () => {
    browserProfile();
    expect(accessAdviceFor(scopeError())).toBeDefined();
    expect(accessAdviceFor(scopeError())).toBeUndefined();
  });
});

describe('printError', () => {
  let written;
  let spy;

  beforeEach(() => {
    written = [];
    spy = jest.spyOn(console, 'error').mockImplementation((message) => {
      written.push(String(message));
    });
  });

  afterEach(() => spy.mockRestore());

  test('7: prints the advice after the error of a login that lacks reach', () => {
    deviceProfile();
    printError(scopeError('NO_AM_SESSION'));
    const out = written.join('\n');
    expect(out).toContain('This session is a device login');
    expect(out.indexOf('the facts')).toBeLessThan(
      out.indexOf('This session is a device login')
    );
  });

  test('8: prints nothing extra for an error of a service account', () => {
    serviceAccountProfile();
    printError(scopeError());
    expect(written.join('\n')).not.toContain('This session is');
  });
});
