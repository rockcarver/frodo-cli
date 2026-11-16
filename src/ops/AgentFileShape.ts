/**
 * The shape of the agent files that `config-manager` writes (decision record
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0054-a-config-manager-object-has-one-writer-and-agent-files-are-written-in-the-plain-shape.md,
 * rule 6): files under `realms/<realm>/realm-config/agents/**` hold the plain value of every
 * property that is set on the object, and nothing else.
 *
 * AM answers a read of one object with every property in its "writable" shape: `{ inherited:
 * false, value }` for a property that is set on the object, `{ inherited: false }` for one that is
 * not set, and `{ inherited: true, value }` for one whose value comes from elsewhere (for an
 * agent, its agent group or a default). AM's list read answers plain values and `null` for a
 * property that is not set. {@link toPlainShape} turns either answer into the same object: a
 * property that is set becomes its value; an unset property, an inherited one and a `null` are
 * left out. Left out is the state AM keeps for such a property, so a push of the file (a
 * replace-style write) puts the object back as it was, and a diff of the file shows what is set on
 * the object and nothing that a group or a default changes.
 *
 * This module imports nothing on purpose, like `DedicatedAgentKinds.ts`: the generic kind lives in
 * the deprecated `src/configManagerOps/` layer and many tests mock the library, so it must be
 * possible to import this without the library.
 */

/** What {@link toPlainShape} answers. */
export interface PlainShape {
  /** A new object in the plain shape; the input is not changed. */
  value: Record<string, unknown>;
  /** How many properties were left out (unset, inherited or `null`), for the verbose message. */
  leftOut: number;
}

/** How {@link toPlainShape} reads its input. */
export interface PlainShapeOptions {
  /**
   * Also read `{ value }` without an `inherited` member as a wrapper. Only for an overrides file:
   * the help of the first 5.0.0 prereleases showed overrides in the form `{ "value": ... }`, and
   * those files must keep working. A pulled object is read strictly (a wrapper has a boolean
   * `inherited`), because an object with only a `value` member can be configuration. Default: false.
   */
  lenientWrapper?: boolean;
  /**
   * Treat a `null` property as not set and leave it out. Default: true. An overrides file sets
   * false: a `null` that a person wrote is not a reading from AM and is not second-guessed.
   */
  nullIsUnset?: boolean;
}

/** What is left out of a result: not a value, and not `undefined`, which a value never is. */
const LEFT_OUT = Symbol('left out');

interface Walk {
  lenient: boolean;
  nullIsUnset: boolean;
  leftOut: number;
}

const isObject = (item: unknown): item is Record<string, unknown> =>
  typeof item === 'object' && item !== null && !Array.isArray(item);

/**
 * Whether an object is AM's writable wrapper: it has only the members `inherited` and `value`, and
 * `inherited` is a boolean. An object that merely has a member called `inherited` among others is
 * not a wrapper.
 * @param {Record<string, unknown>} item the object
 * @param {boolean} lenient also accept `{ value }` without `inherited` (an overrides file)
 * @returns {boolean} true for a wrapper
 */
function isWrapper(item: Record<string, unknown>, lenient: boolean): boolean {
  const keys = Object.keys(item);
  if (keys.length === 0) return false;
  if (!keys.every((key) => key === 'inherited' || key === 'value')) {
    return false;
  }
  if (typeof item.inherited === 'boolean') return true;
  return lenient && !('inherited' in item) && 'value' in item;
}

function walk(item: unknown, context: Walk): unknown {
  if (item === undefined) return LEFT_OUT;
  if (item === null) {
    if (!context.nullIsUnset) return null;
    context.leftOut++;
    return LEFT_OUT;
  }
  if (Array.isArray(item)) {
    const result: unknown[] = [];
    for (const element of item) {
      // a position in an array means something: a null element stays, only a wrapper goes
      if (element === null) {
        result.push(null);
        continue;
      }
      const kept = walk(element, context);
      if (kept !== LEFT_OUT) result.push(kept);
    }
    return result;
  }
  if (!isObject(item)) return item;
  if (isWrapper(item, context.lenient)) {
    if (item.inherited === true || !('value' in item)) {
      context.leftOut++;
      return LEFT_OUT;
    }
    if (item.value === null || item.value === undefined) {
      context.leftOut++;
      return LEFT_OUT;
    }
    // what is set on the object may itself hold more wrappers
    return walk(item.value, context);
  }
  const result: Record<string, unknown> = {};
  for (const [key, member] of Object.entries(item)) {
    const kept = walk(member, context);
    // a group whose members were all left out stays as `{}`: whether AM's replace-style write
    // needs the group is not proven without a tenant (frodo-cli#1355)
    if (kept !== LEFT_OUT) result[key] = kept;
  }
  return result;
}

/**
 * The object as it is written to a file: every property that is set on it as its plain value, and
 * no property that is unset, inherited or `null`. One function for every writer of agent files.
 * @param {Record<string, unknown>} object an agent object as AM answers a single read (the writable
 * shape) or the list read (plain values and `null`), or an overrides entry
 * @param {PlainShapeOptions} options how to read the input; the default is for a pulled object
 * @returns {PlainShape} a new object and the number of properties left out; the input is not changed
 */
export function toPlainShape(
  object: Record<string, unknown>,
  options: PlainShapeOptions = {}
): PlainShape {
  const context: Walk = {
    lenient: options.lenientWrapper === true,
    nullIsUnset: options.nullIsUnset !== false,
    leftOut: 0,
  };
  const kept = walk(object, context);
  return {
    value: kept === LEFT_OUT || !isObject(kept) ? {} : kept,
    leftOut: context.leftOut,
  };
}

/**
 * The overrides of an entry of an overrides file, read for a file in the plain shape: an override
 * written for the wrapped files of the first 5.0.0 prereleases (`{ "value": ... }` or `{
 * "inherited": false, "value": ... }`) is the value, so such an overrides file keeps working.
 * @param {Record<string, unknown>} overrides the `overrides` of one entry
 * @returns {Record<string, unknown>} the overrides to merge into the plain object
 */
export function plainOverrides(
  overrides: Record<string, unknown>
): Record<string, unknown> {
  return toPlainShape(overrides, { lenientWrapper: true, nullIsUnset: false })
    .value;
}

/**
 * The sentence of the verbose output that says how much was left out of the files of a pull.
 * @param {number} leftOut the number of properties left out
 * @param {number} objects the number of objects written
 * @param {string} label what one object is called
 * @param {string} plural what several objects are called
 * @returns {string} the sentence
 */
export function leftOutMessage(
  leftOut: number,
  objects: number,
  label: string,
  plural: string
): string {
  return `Left ${leftOut} unset or inherited ${leftOut === 1 ? 'property' : 'properties'} out of ${objects} ${objects === 1 ? label : plural} written: a file holds only what is set on the object.`;
}
