import { describe, expect, test } from '@jest/globals';
import { isNotFoundError } from '../../src/utils/ErrorCause';

/**
 * `isNotFoundError` answers "did the server say 404?" for an error of the library, which wraps the
 * error that caused it, sometimes twice. Only a confirmed 404 counts.
 */

const wrapped = (httpStatus, ...originalErrors) =>
  Object.assign(new Error('Error reading something'), {
    httpStatus,
    originalErrors,
  });
const axiosError = (status) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status },
  });

describe('isNotFoundError', () => {
  test('a status on the error itself, with nothing wrapped', () => {
    expect(isNotFoundError({ httpStatus: 404 })).toBe(true);
  });

  test('an axios-shaped response on the error itself, with nothing wrapped', () => {
    expect(isNotFoundError({ response: { status: 404 } })).toBe(true);
  });

  test('a FrodoError that carries the status', () => {
    expect(isNotFoundError(wrapped(404, axiosError(404)))).toBe(true);
  });

  test('a bare axios error', () => {
    expect(isNotFoundError(axiosError(404))).toBe(true);
  });

  test('a status that only the wrapped error has, at any depth', () => {
    expect(isNotFoundError(wrapped(null, axiosError(404)))).toBe(true);
    expect(isNotFoundError(wrapped(null, wrapped(null, axiosError(404))))).toBe(
      true
    );
  });

  test('a 404 at a later index of the wrapped errors', () => {
    expect(
      isNotFoundError(wrapped(500, axiosError(500), axiosError(404)))
    ).toBe(true);
  });

  test.each([401, 403, 409, 500, 503])('%i is not "not found"', (status) => {
    expect(isNotFoundError(wrapped(status, axiosError(status)))).toBe(false);
  });

  test.each([
    ['a plain error', new Error('socket hang up')],
    ['an error with the status as text', { httpStatus: '404' }],
    ['undefined', undefined],
    ['null', null],
    ['a string', '404'],
    ['a number', 404],
  ])('%s is not "not found"', (_what, error) => {
    expect(isNotFoundError(error)).toBe(false);
  });

  test('an error that wraps itself does not loop', () => {
    const error = wrapped(500);
    error.originalErrors = [error];
    expect(isNotFoundError(error)).toBe(false);
  });
});
