import { isDeepStrictEqual } from 'node:util';
import { causeOf } from '../utils/ErrorCause';

/**
 * The helpers that a reference-aware delete shares, whatever the type it
 * deletes: copying and comparing the data of a holder, naming the fields that
 * differ, the error of a clearing that went wrong, and the lines for the
 * sources that a lookup could not read. They know nothing about journeys or any
 * other type, and they call no library function.
 */

/** A copy of data that came from JSON, made of plain objects of this module. */
export function jsonCopy<T>(data: T): T {
  return JSON.parse(JSON.stringify(data)) as T;
}

/** Whether two pieces of JSON data are the same, whatever the order of the keys. */
export function sameJson(a: unknown, b: unknown): boolean {
  return isDeepStrictEqual(jsonCopy(a ?? null), jsonCopy(b ?? null));
}

/** Where a holder differs from what it should be: the dotted paths of the fields. */
export function differences(
  expected: unknown,
  actual: unknown,
  path = '',
  found: string[] = []
): string[] {
  const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
  if (isObject(expected) && isObject(actual)) {
    for (const name of new Set([
      ...Object.keys(expected),
      ...Object.keys(actual),
    ])) {
      // the revision changes with every write
      if (path === '' && name === '_rev') continue;
      differences(
        expected[name],
        actual[name],
        path ? `${path}.${name}` : name,
        found
      );
    }
  } else if (!sameJson(expected, actual)) {
    found.push(path);
  }
  return found;
}

/**
 * The fields that differ, for a message: their paths, never their values (a
 * message goes to the logs of a pipeline, and the old values are still in the
 * holder).
 * @param {string[]} paths the dotted paths that differ
 * @returns {string} one text for a message, at most twelve paths
 */
export function describeFields(paths: string[]): string {
  const shown = paths.slice(0, 12);
  return (
    shown.join(', ') +
    (paths.length > shown.length
      ? `, and ${paths.length - shown.length} more`
      : '')
  );
}

/** An error that says whether the holder may have been changed by the step that failed. */
export type ClearingError = Error & {
  /** True when the holder was written and may not be as it was before. */
  holderChanged?: boolean;
};

/** An error with the flag of a holder that was written. */
export function clearingError(
  message: string,
  holderChanged: boolean
): ClearingError {
  return Object.assign(new Error(message), { holderChanged });
}

/** The first line of what was thrown, for a message. */
export function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message.split('\n')[0] : String(error);
}

/**
 * The sources a failed lookup could not read, by name, from the error that
 * `findJourneyReferences` throws (one nested error per source).
 * @param {unknown} error the error the library threw
 * @returns {string[]} one line per source that could not be read
 */
export function unreadableSources(error: unknown): string[] {
  const nested = (error as { originalErrors?: unknown })?.originalErrors;
  if (Array.isArray(nested) && nested.length > 0) {
    return nested.map((item) => {
      const text = (item instanceof Error ? item.message : String(item))
        .split('\n')[0]
        .trim();
      // the message of the library names the source ("Error reading themes"), the
      // cause at the bottom of the error says why it could not be read
      const cause = causeOf(item);
      return cause && cause !== text ? `${text}: ${cause}` : text;
    });
  }
  return [
    error instanceof Error ? error.message.split('\n')[0] : String(error),
  ];
}
