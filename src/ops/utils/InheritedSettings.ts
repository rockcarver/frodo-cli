import { valueOf } from './InheritedValue';

/**
 * True for a setting in the shape of a read by id: an object that has an
 * `inherited` member and nothing but `inherited` and `value`. Used where an
 * object is rewritten, so that a member that only looks like a wrapper is never
 * taken for one (`valueOf` is for display and reads any object with a boolean
 * `inherited`).
 * @param {unknown} property the setting
 * @returns {boolean} true if the setting is wrapped
 */
export function isInheritedSetting(
  property: unknown
): property is { inherited: boolean; value?: unknown } {
  if (
    typeof property !== 'object' ||
    property === null ||
    Array.isArray(property)
  ) {
    return false;
  }
  const keys = Object.keys(property);
  return (
    keys.includes('inherited') &&
    keys.every((key) => key === 'inherited' || key === 'value')
  );
}

/**
 * A copy of an object in which every wrapped setting is replaced by its value
 * (`null` when the wrapper has no value, or says the value is inherited, the
 * way a query answers a setting that is not set). Everything else is copied as
 * it is: `_id`, `_rev` and `_type` are not wrappers.
 *
 * A read by id wraps every setting in `{ inherited, value }` and a query answers
 * plain values, and the library does not make the two agree, so an export of one
 * object would differ from an export of the list without this.
 * @param {T} object the object as a read by id answered it, or as a query did
 * @returns {T} the object with plain values
 */
export function unwrapInheritedSettings<T extends object>(object: T): T {
  const plain: Record<string, unknown> = {};
  for (const [key, property] of Object.entries(object)) {
    plain[key] = isInheritedSetting(property)
      ? (valueOf(property) ?? null)
      : property;
  }
  return plain as T;
}
