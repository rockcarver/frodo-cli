/**
 * Returns true if value is treated as enabled for opt-in checks.
 * @param value Value to evaluate.
 * @returns Truthy opt-in interpretation.
 */
export function isTruthyOptInValue(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }
  return false;
}
