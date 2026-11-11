/**
 * Display helper for the two shapes in which AM answers a read of a
 * configuration object: a read by id wraps a member as
 * `{ inherited: false, value: ... }` (the wrapper has no `value` for a member
 * that was stored without one), a list returns the member plain. A member can
 * also be missing, or `null`.
 *
 * This only decides what to show. Any rule about the object (validation,
 * defaults) belongs to the library (core 0001, record 0036).
 * @param {unknown} property the member as the server answered it
 * @returns {T | undefined} the value of the member, or undefined when the member is absent, `null`, a wrapper without a value, or a wrapper that says the value is inherited (the server stores it as absent)
 */
export function valueOf<T = unknown>(property: unknown): T | undefined {
  if (property === null || property === undefined) return undefined;
  if (
    typeof property === 'object' &&
    !Array.isArray(property) &&
    typeof (property as { inherited?: unknown }).inherited === 'boolean'
  ) {
    const wrapper = property as { inherited: boolean; value?: T | null };
    if (wrapper.inherited) return undefined;
    return wrapper.value ?? undefined;
  }
  return property as T;
}
