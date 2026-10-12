import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from '@jest/globals';
import { Command, Option } from 'commander';
import { serializeCommand } from '../../src/utils/interactive/CommandPreview';
import {
  applicableCommandDefaults,
  clearCommandDefaults,
  clearDefaultsByPath,
  commandStoreKey,
  getDefaultsPath,
  optionMissingUserValue,
  readCommandDefaults,
  readDefaultsStore,
  saveCommandDefaults,
  setDefaultsBaseDirForTests,
  writeDefaultsStore,
} from '../../src/utils/interactive/DefaultsStore';

/**
 * The store reads/writes ~/.frodo/Defaults.json -- redirected at a temp
 * dir per test via the module's test seam (jest workers share
 * process.env.HOME; an env fiddle would leak across siblings).
 */
let baseDir: string;

function makeJourneyListCommand(): Command {
  const command = new Command('list');
  command.addOption(new Option('--long', 'Long listing').default(false));
  command.addOption(new Option('--flat <all|ids>', 'Flat').default('nothing'));
  command.parent = new Command('journey');
  command.parent.name('journey');
  return command;
}

afterEach(() => {
  setDefaultsBaseDirForTests(undefined);
  if (baseDir) {
    fs.rmSync(baseDir, { recursive: true, force: true });
    baseDir = undefined as unknown as string;
  }
});

function isolateHome(): void {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-defaults-'));
  setDefaultsBaseDirForTests(baseDir);
}

describe('commandStoreKey', () => {
  it('joins the full command path', () => {
    expect(commandStoreKey(makeJourneyListCommand())).toBe('journey list');
  });
});

describe('read/write round trip', () => {
  it('missing file reads as an empty store', () => {
    isolateHome();
    expect(readDefaultsStore()).toEqual({});
    expect(readCommandDefaults(makeJourneyListCommand())).toEqual({});
  });

  it('corrupt file reads as an empty store (never a failure)', () => {
    isolateHome();
    fs.mkdirSync(path.join(baseDir, '.frodo'), { recursive: true });
    fs.writeFileSync(getDefaultsPath(), '{ not json');
    expect(readDefaultsStore()).toEqual({});
  });

  it('saves and reads back per command', () => {
    isolateHome();
    const command = makeJourneyListCommand();
    saveCommandDefaults(command, { long: true, flat: 'ids' });
    expect(readCommandDefaults(command)).toEqual({ long: true, flat: 'ids' });
    // On disk in the isolated home, under the command-path key.
    expect(readDefaultsStore()['journey list']).toEqual({
      long: true,
      flat: 'ids',
    });
  });

  it('merges a partial save without clobbering siblings', () => {
    isolateHome();
    const command = makeJourneyListCommand();
    saveCommandDefaults(command, { long: true, flat: 'ids' });
    saveCommandDefaults(command, { flat: 'all' });
    expect(readCommandDefaults(command)).toEqual({ long: true, flat: 'all' });
  });

  it('keeps other commands untouched', () => {
    isolateHome();
    const list = makeJourneyListCommand();
    saveCommandDefaults(list, { long: true });
    const other = new Command('delete');
    other.parent = new Command('journey');
    other.parent.name('journey');
    saveCommandDefaults(other, { verbose: true });
    expect(readCommandDefaults(list)).toEqual({ long: true });
    expect(readCommandDefaults(other)).toEqual({ verbose: true });
  });

  it('clearCommandDefaults drops only that command', () => {
    isolateHome();
    const command = makeJourneyListCommand();
    saveCommandDefaults(command, { long: true });
    const other = new Command('delete');
    other.parent = new Command('journey');
    other.parent.name('journey');
    saveCommandDefaults(other, { verbose: true });
    clearCommandDefaults(command);
    expect(readCommandDefaults(command)).toEqual({});
    expect(readCommandDefaults(other)).toEqual({ verbose: true });
  });
});

describe('applicableCommandDefaults', () => {
  it('skips stale entries for options the command no longer declares', () => {
    isolateHome();
    const command = makeJourneyListCommand();
    // Hand-write a store carrying an option the command doesn't have
    // (code moved on since the value was saved).
    writeDefaultsStore({ 'journey list': { long: true, retiredOption: 'x' } });
    expect(applicableCommandDefaults(command)).toEqual({ long: true });
  });
});

describe('optionMissingUserValue (the precedence gate)', () => {
  it('untouched option with a built-in default = missing user value', () => {
    const command = makeJourneyListCommand();
    command.parse([], { from: 'user' });
    expect(optionMissingUserValue(command, command.options[0])).toBe(true);
  });

  it('user-provided value (source cli) = NOT missing', () => {
    const command = makeJourneyListCommand();
    command.parse(['--flat', 'ids'], { from: 'user' });
    expect(optionMissingUserValue(command, command.options[1])).toBe(false);
  });

  it('env-sourced value = NOT missing (env beats persisted default)', () => {
    const command = makeJourneyListCommand();
    // No env mapping in this synthetic command -- set it the way the
    // resolver/env fallback does, with the 'env' source.
    command.setOptionValueWithSource('flat', 'ids', 'env');
    expect(optionMissingUserValue(command, command.options[1])).toBe(false);
  });
});
