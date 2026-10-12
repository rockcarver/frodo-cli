import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Command, Option } from 'commander';

/**
 * Persistent per-command defaults (docs/INTERACTIVE-COMMANDS.md):
 * values committed through the invocation editor with --save-defaults
 * land here and become the starting values for FUTURE runs of the same
 * command. Deliberately a sibling of SettingsStore (plain user
 * preferences, not secrets; corrupt file = empty, never a failure):
 * ~/.frodo/Defaults.json, keyed by the command's full path
 * ("journey list"), then by the option's attributeName:
 *
 *   { "journey list": { "long": true }, "esv secret list": { "flat": "all" } }
 *
 * PRECEDENCE (the plan's chain: explicit CLI flag > env var > persisted
 * default > built-in default) is enforced by the RESOLUTION PASS, not
 * here -- this module only reads/writes the store. The pass applies a
 * persisted value only when the option has no value from flag or env
 * (source undefined or 'default'), writing it with source 'cli': a
 * persisted default is user-authored configuration -- the serializer's
 * "only user-provided tokens" rule and the editor's (current: x)
 * display must both see it as real input.
 */

const DEFAULTS_FILENAME = 'Defaults.json';

/** A single command's persisted defaults: attributeName -> value. */
export type CommandDefaults = Record<string, unknown>;

/** The whole store: full command path -> that command's defaults. */
export type DefaultsStore = Record<string, CommandDefaults>;

/**
 * Test seam: overrides the ~/.frodo base directory for the duration of
 * a test (jest workers share process.env.HOME, and os.homedir() can
 * cache -- an env fiddle in one test leaks into its siblings).
 * Production callers never touch this.
 */
let baseDirOverride: string | undefined;

/** FOR TESTS ONLY: redirects the store's base directory (undefined = ~/.frodo). */
export function setDefaultsBaseDirForTests(dir: string | undefined): void {
  baseDirOverride = dir;
}

export function getDefaultsPath(): string {
  return path.join(
    baseDirOverride ?? path.join(os.homedir(), '.frodo'),
    DEFAULTS_FILENAME
  );
}

/** Reads the store; missing/corrupt file = empty store. */
export function readDefaultsStore(): DefaultsStore {
  try {
    const parsed = JSON.parse(fs.readFileSync(getDefaultsPath(), 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** Writes the store (creating ~/.frodo as needed). */
export function writeDefaultsStore(store: DefaultsStore): void {
  const file = getDefaultsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store, null, 2));
}

/**
 * The `frodo x y z` path of the command (root name + ancestors + this) --
 * the store's key. Matches CommandPreview's commandPath; duplicated here
 * to keep this module free of the preview graph (the store must load in
 * tests that mock frodo-lib wholesale, same constraint as the other
 * zero-import modules in this directory).
 */
export function commandStoreKey(command: Command): string {
  const names: string[] = [];
  for (
    let cursor: Command | undefined = command;
    cursor;
    cursor = cursor.parent
  ) {
    names.unshift(cursor.name());
  }
  return names.join(' ');
}

/** The persisted defaults for one command (empty when none). */
export function readCommandDefaults(command: Command): CommandDefaults {
  return readDefaultsStore()[commandStoreKey(command)] ?? {};
}

/**
 * Merges `values` into the command's persisted defaults (a partial
 * save: only the options committed this session change).
 */
export function saveCommandDefaults(
  command: Command,
  values: CommandDefaults
): void {
  const store = readDefaultsStore();
  const key = commandStoreKey(command);
  store[key] = { ...(store[key] ?? {}), ...values };
  writeDefaultsStore(store);
}

/** Drops one command's defaults entirely (frodo settings defaults --clear). */
export function clearCommandDefaults(command: Command): void {
  const store = readDefaultsStore();
  delete store[commandStoreKey(command)];
  writeDefaultsStore(store);
}

/**
 * Drops one command's defaults by its verbatim store path -- the
 * `frodo settings defaults --clear <path>` form. Path-keyed (not
 * Command-keyed) on purpose: clearing must work even when the command's
 * option set changed since the save.
 */
export function clearDefaultsByPath(commandPath: string): void {
  const store = readDefaultsStore();
  delete store[commandPath];
  writeDefaultsStore(store);
}

/**
 * The persisted values that still make sense for this command: keys the
 * command actually declares as options (the store outlives code -- a
 * removed or renamed option's stale entry is skipped, not applied).
 * Returns attributeName -> value.
 */
export function applicableCommandDefaults(command: Command): CommandDefaults {
  const persisted = readCommandDefaults(command);
  const known = new Set(
    command.options.map((option) => option.attributeName())
  );
  return Object.fromEntries(
    Object.entries(persisted).filter(([name]) => known.has(name))
  );
}

/**
 * Whether `option` may take a persisted default this invocation: it has
 * NO value from flag or env. Commander source semantics: an untouched
 * option with a built-in default reads (value, 'default'); one without
 * any default reads (undefined, undefined). Both mean "the user did not
 * provide anything" -- the persisted default may fill the gap. Anything
 * else ('cli', 'env', 'config'...) means the user (or this pass) already
 * authored a value -- the persisted default must NOT override it.
 */
export function optionMissingUserValue(
  command: Command,
  option: Option
): boolean {
  const source = command.getOptionValueSource(option.attributeName());
  return source === undefined || source === 'default';
}
