/**
 * Helpers for the two shapes in which AM answers a read of a configuration
 * object with settings. A read by id wraps each setting in
 * `{ inherited, value }` (`value` is missing when the setting is not set), and
 * a query returns the plain values, `null` for a setting that is not set. The
 * library does not make the two agree, so the code that shows or writes such an
 * object has to take both.
 *
 * These are display and file-shape helpers. A rule about the object itself
 * (validation, defaults, what a value means) belongs to the library (core 0001,
 * record 0036).
 */

/** A setting in the shape of a read by id. */
export type InheritedSetting<T> = { inherited?: boolean; value?: T };

/**
 * True for a setting in the shape of a read by id: an object that has an
 * `inherited` member and nothing but `inherited` and `value`.
 * @param {unknown} property the setting
 * @returns {boolean} true if the setting is wrapped
 */
export function isInheritedSetting(
  property: unknown
): property is InheritedSetting<unknown> {
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
 * The value of a setting, whether it is wrapped (`{ inherited, value }`) or
 * plain. A wrapper without a `value`, `null` and an absent setting have no
 * value.
 * @param {T | InheritedSetting<T> | null | undefined} property the setting
 * @returns {T | undefined} the value, undefined when the setting is not set
 */
export function valueOf<T>(
  property: T | InheritedSetting<T> | null | undefined
): T | undefined {
  if (property === null || property === undefined) return undefined;
  if (isInheritedSetting(property)) return (property.value ?? undefined) as T;
  return property as T;
}

/**
 * A copy of an object in which every wrapped setting is replaced by its value
 * (`null` when the wrapper has no value, the way a query answers a setting that
 * is not set). Everything else is copied as it is: `_id`, `_rev` and `_type`
 * are not wrappers.
 * @param {T} object the object as a read by id answered it, or as a query did
 * @returns {T} the object with plain values
 */
export function unwrapInheritedSettings<T extends object>(object: T): T {
  const plain: Record<string, unknown> = {};
  for (const [key, property] of Object.entries(object)) {
    plain[key] = isInheritedSetting(property)
      ? (property.value ?? null)
      : property;
  }
  return plain as T;
}
