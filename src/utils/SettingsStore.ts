import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * CLI-level settings persisted at ~/.frodo/Settings.json. Deliberately
 * tiny and separate from connection profiles (frodo-lib's encrypted
 * Connections.json): these are plain user preferences, not secrets.
 * Currently two settings -- the invocation editor's guided mode and the
 * per-command defaults store's neighbors live here (see
 * docs/INTERACTIVE-COMMANDS.md) -- plus the layout of a new config-manager
 * tree. Missing/corrupt file = defaults, so the CLI never fails over a bad
 * settings file.
 */

/**
 * How a config-manager tree keeps the objects that belong to an application:
 * `folders` = one folder per application holding the application and the
 * objects it owns; `kind-paths` = every object at the path of its own kind,
 * the layout config-manager used before applications (decision record 0042).
 */
export type ConfigManagerApplicationLayout = 'folders' | 'kind-paths';

export const CONFIG_MANAGER_APPLICATION_LAYOUTS: ConfigManagerApplicationLayout[] =
  ['folders', 'kind-paths'];

/** The layout of a NEW config-manager tree when the user has not chosen one. */
export const DEFAULT_CONFIG_MANAGER_APPLICATION_LAYOUT: ConfigManagerApplicationLayout =
  'folders';

export type FrodoSettings = {
  /**
   * When true, every interactive-session command runs the optional-options
   * invocation editor by default (same as passing --edit each time).
   */
  guidedMode?: boolean;
  /**
   * The layout of a NEW config-manager tree (decision record 0042). It is
   * never read for a tree that exists: the marker in the tree decides there.
   * Absent or unknown = `folders`.
   */
  configManagerApplicationLayout?: ConfigManagerApplicationLayout;
};

const SETTINGS_FILENAME = 'Settings.json';

export function getSettingsPath(): string {
  return path.join(os.homedir(), '.frodo', SETTINGS_FILENAME);
}

export function readSettings(): FrodoSettings {
  try {
    const parsed = JSON.parse(fs.readFileSync(getSettingsPath(), 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function writeSettings(settings: FrodoSettings): void {
  const file = getSettingsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(settings, null, 2));
}

/**
 * Whether the invocation editor should run by default on this invocation:
 * the persisted guided-mode toggle, with --no-prompt / FRODO_NO_PROMPT /
 * FRODO_TEST still gating everything downstream (the editor itself runs
 * behind canPrompt, so those environments ignore guided mode exactly as
 * they ignore --edit).
 */
export function guidedModeEnabled(): boolean {
  return readSettings().guidedMode === true;
}

export function setGuidedMode(enabled: boolean): void {
  const settings = readSettings();
  settings.guidedMode = enabled;
  writeSettings(settings);
}

/**
 * The layout a NEW config-manager tree gets: the persisted choice, or
 * `folders` when none was made. A stored value that is not one of the two
 * layouts is ignored, like any other unreadable setting.
 */
export function getConfigManagerApplicationLayout(): ConfigManagerApplicationLayout {
  const stored = readSettings().configManagerApplicationLayout;
  return CONFIG_MANAGER_APPLICATION_LAYOUTS.includes(stored)
    ? stored
    : DEFAULT_CONFIG_MANAGER_APPLICATION_LAYOUT;
}

export function setConfigManagerApplicationLayout(
  layout: ConfigManagerApplicationLayout
): void {
  const settings = readSettings();
  settings.configManagerApplicationLayout = layout;
  writeSettings(settings);
}
