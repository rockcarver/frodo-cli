import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { frodo } from '@rockcarver/frodo-lib';
import { ShellHistory } from './ShellHistoryOps';

/**
 * History is one entry per line in a file. A script with line breaks, which
 * the web console produces, must survive a save and a reload as one entry,
 * and history files written before that was possible must read unchanged.
 */

describe('ShellHistory multi-line entries', () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-history-'));
    // The library keeps its files under os.homedir()/.frodo. Jest hands tests
    // a copy of process.env, so setting HOME here would not reach the real
    // environment that os.homedir() reads; replace the function instead.
    jest.spyOn(os, 'homedir').mockReturnValue(home);
    // Guard, in beforeEach so that no test body runs if isolation fails:
    // these tests write history files and must never touch the real ~/.frodo.
    if (frodo.utils.getFrodoHome() !== path.join(home, '.frodo')) {
      throw new Error(
        `History tests are not isolated: frodo home is ${frodo.utils.getFrodoHome()}`
      );
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('keeps one entry per distinct input, moved to newest on repeat', () => {
    const history = new ShellHistory('https://tenant.example.com/am');
    history.addLine('first');
    history.addLine('second');
    history.addLine('first');
    expect(history.getLines()).toEqual(['first', 'second']);
    // A repeat of the newest entry changes nothing.
    history.addLine('first');
    expect(history.getLines()).toEqual(['first', 'second']);
    // And the file follows suit across a reload.
    const reloaded = new ShellHistory('https://tenant.example.com/am');
    expect(reloaded.getLines()).toEqual(['first', 'second']);
  });

  it('caps the file at 10k entries, dropping the oldest first', () => {
    const history = new ShellHistory('https://tenant.example.com/am');
    for (let i = 0; i < 10_050; i++) history.addLine(`cmd-${i}`);
    const lines = history.getLines(); // newest first
    expect(lines).toHaveLength(10_000);
    // The 50 oldest (cmd-0 .. cmd-49) fell off; the newest and the
    // boundary entries survive.
    expect(lines[0]).toBe('cmd-10049');
    expect(lines).not.toContain('cmd-49');
    expect(lines).toContain('cmd-50');
    // The cap also survives a reload (applied at load time too).
    const reloaded = new ShellHistory('https://tenant.example.com/am');
    expect(reloaded.getLines()).toHaveLength(10_000);
    expect(reloaded.getLines()[0]).toBe('cmd-10049');
  });

  it('collapses repeats already in the file from an older version', () => {
    const path = `${frodo.utils.getFrodoHome()}/shell-history/tenant_example_com_am.txt`;
    fs.mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    fs.writeFileSync(path, ['dup', 'dup', 'other', 'dup'].join('\n'));
    const history = new ShellHistory('https://tenant.example.com/am');
    expect(history.getLines()).toEqual(['dup', 'other']);
  });

  it('keeps a multi-line script as one entry across a reload', () => {
    const script = 'const a = 1;\nconst b = 2;\na + b';
    const first = new ShellHistory('https://tenant.example.com/am');
    first.addLine('1 + 1');
    first.addLine(script);

    const reloaded = new ShellHistory('https://tenant.example.com/am');
    expect(reloaded.getLines()).toEqual([script, '1 + 1']);
  });

  it('stores the file with one line per entry', () => {
    const history = new ShellHistory('https://tenant.example.com/am');
    history.addLine('a\nb');
    history.addLine('c');
    const raw = fs.readFileSync(history.getHistoryPath(), 'utf-8');
    expect(raw.split('\n')).toHaveLength(2);
  });

  it('offers single-line entries only to the terminal', () => {
    const history = new ShellHistory('https://tenant.example.com/am');
    history.addLine('one');
    history.addLine('two\nlines');
    history.addLine('three');
    expect(history.getLines({ singleLineOnly: true })).toEqual([
      'three',
      'one',
    ]);
    expect(history.getLines()).toHaveLength(3);
  });

  it('reads a history file written before the encoding existed', () => {
    const history = new ShellHistory('https://tenant.example.com/am');
    fs.writeFileSync(history.getHistoryPath(), 'old one\nold two\n', 'utf-8');
    const reloaded = new ShellHistory('https://tenant.example.com/am');
    expect(reloaded.getLines()).toEqual(['old two', 'old one']);
  });

  it('keeps a line that merely starts like an encoded entry', () => {
    const history = new ShellHistory('https://tenant.example.com/am');
    fs.writeFileSync(history.getHistoryPath(), '#ml:not json\n', 'utf-8');
    const reloaded = new ShellHistory('https://tenant.example.com/am');
    expect(reloaded.getLines()).toEqual(['#ml:not json']);
  });
});

describe('ShellHistory.shared (the web console)', () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-history-'));
    jest.spyOn(os, 'homedir').mockReturnValue(home);
    if (frodo.utils.getFrodoHome() !== path.join(home, '.frodo')) {
      throw new Error(
        `History tests are not isolated: frodo home is ${frodo.utils.getFrodoHome()}`
      );
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('writes one file for every connection, not one per host', () => {
    const first = ShellHistory.shared();
    first.addLine('against tenant one');
    const second = ShellHistory.shared();
    second.addLine('against tenant two');
    // The second instance sees the first's entry, and there is exactly
    // one file carrying both.
    expect(second.getLines()).toEqual([
      'against tenant two',
      'against tenant one',
    ]);
    const files = fs.readdirSync(path.join(home, '.frodo', 'shell-history'));
    expect(files).toEqual(['default.txt']);
  });

  it('folds existing per-host files into the shared one', () => {
    const dir = path.join(home, '.frodo', 'shell-history');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'yyc_dev.txt'),
      'yyc command\nshared command\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(dir, 'sox.txt'),
      'sox command\nshared command\n',
      'utf-8'
    );
    const shared = ShellHistory.shared();
    // Per-host order kept, duplicates collapsed. Files are read in
    // directory order (sox before yyc_dev here), so newest overall is
    // yyc's last entry; getLines() hands them back newest-first.
    expect(shared.getLines().sort()).toEqual([
      'shared command',
      'sox command',
      'yyc command',
    ]);
    // A later entry persists to the shared file with everything folded in.
    shared.addLine('new one');
    const again = ShellHistory.shared();
    expect(again.getLines()[0]).toBe('new one');
    expect(again.getLines().sort()).toEqual([
      'new one',
      'shared command',
      'sox command',
      'yyc command',
    ]);
  });
});
