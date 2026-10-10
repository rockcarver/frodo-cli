import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * CLI-level settings persisted at ~/.frodo/Settings.json. Deliberately
 * tiny and separate from connection profiles (frodo-lib's encrypted
 * Connections.json): these are plain user preferences, not secrets.
 * Currently one setting -- the invocation editor's guided mode (Phase 2
 * of INTERACTIVE-COMMANDS-PLAN.md). Missing/corrupt file = defaults, so
 * the CLI never fails over a bad settings file.
 */
export type FrodoSettings = {
  /**
   * When true, every interactive-session command runs the optional-options
   * invocation editor by default (same as passing --edit each time).
   */
  guidedMode?: boolean;
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
