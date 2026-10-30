// The repository's own settings for Issue Concierge.
//
// `.github/issue-concierge/settings.yml` is owned by the repository, like `scope.md`: reviewed by pull request,
// read from the default branch, and every setting has a default, so a missing file or a missing line changes
// nothing. The file is flat `key: value` lines and comments, which is all a setting needs, so this reads it
// without a YAML library. A line it cannot use is reported and the default stays; the Concierge never stops
// because of a settings file. The meaning of each setting is in the starter file, shared/settings.yml.
//
// The pause switch is not a setting here: a gate must be able to check it without starting a run, and only a
// repository variable can be read that way (docs/multi-phase-design.md, "The maintainer's view").
//
// Install: copy to .github/scripts/issue-concierge-settings.mjs. The scripts that import it are installed with it.

import { configPath, readConfig } from './issue-concierge-paths.mjs';

export const SETTINGS_PATH = configPath('settings.yml');

/** The text of the settings file, from the new folder or else the old one, or null. `read(path)` returns text or null. */
export const readSettingsText = (read) => readConfig('settings.yml', read).value;

/** Every setting, its type and its default. A setting is added here in the change that gives it an effect. */
export const SCHEMA = {
  'status-issue': { type: 'boolean', default: true },
  commands: { type: 'boolean', default: true },
  'commands-need': { type: 'enum', values: ['triage', 'write', 'maintain', 'admin'], default: 'triage' },
  'reporter-replies-days': { type: 'integer', min: 1, max: 90, default: 14 },
  'mention-after-days': { type: 'integer', min: 0, max: 90, default: 0 },
};

export const DEFAULTS = Object.fromEntries(Object.entries(SCHEMA).map(([key, spec]) => [key, spec.default]));

/** One value, or a message saying why it cannot be used. */
function readValue(key, raw) {
  const spec = SCHEMA[key];
  const text = raw.replace(/^(["'])(.*)\1$/, '$2').trim();
  if (spec.type === 'boolean') {
    if (/^(true|false)$/i.test(text)) return { value: text.toLowerCase() === 'true' };
    return { problem: `${key} must be true or false, not "${text}"` };
  }
  if (spec.type === 'enum') {
    if (spec.values.includes(text.toLowerCase())) return { value: text.toLowerCase() };
    return { problem: `${key} must be one of ${spec.values.join(', ')}, not "${text}"` };
  }
  if (!/^\d+$/.test(text)) return { problem: `${key} must be a whole number from ${spec.min} to ${spec.max}, not "${text}"` };
  const n = Number(text);
  if (n < spec.min || n > spec.max) return { problem: `${key} must be from ${spec.min} to ${spec.max}, not ${n}` };
  return { value: n };
}

/**
 * Read the text of a settings file. Returns { settings, problems }: every setting with its value or its default,
 * and a message for each line that could not be used (an unknown key, a bad value, a nested or malformed line).
 */
export function parseSettings(text) {
  const settings = { ...DEFAULTS };
  const problems = [];
  const seen = new Set();
  for (const [index, line] of String(text ?? '').split(/\r?\n/).entries()) {
    const code = line.replace(/(^|\s)#.*$/, '').trimEnd();
    if (!code.trim()) continue;
    const where = `settings.yml line ${index + 1}`;
    const m = /^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/.exec(code);
    if (!m) {
      problems.push(`${where}: only flat "key: value" lines are supported: ${code.trim().slice(0, 60)}`);
      continue;
    }
    const [, key, raw] = m;
    if (!(key in SCHEMA)) {
      problems.push(`${where}: unknown setting "${key}" (ignored)`);
      continue;
    }
    if (seen.has(key)) {
      problems.push(`${where}: "${key}" is set twice; the first value stays`);
      continue;
    }
    seen.add(key);
    const { value, problem } = readValue(key, raw);
    if (problem) problems.push(`${where}: ${problem}; the default (${DEFAULTS[key]}) is used`);
    else settings[key] = value;
  }
  return { settings, problems };
}
