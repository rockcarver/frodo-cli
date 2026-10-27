import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { staleBuildWarnings } from '../../tools/StaleBuildCheck.mjs';

/**
 * The test wrapper warns when a build is older than its source: a linked
 * frodo-lib whose dist/ was never rebuilt after a pull (the tests then run
 * code CI does not), and this checkout's own dist/, which the test scripts
 * build only when it is missing. See .claude/skills/run-the-tests/SKILL.md.
 */

const HOUR = 3600 * 1000;
const BASE = Date.now() - 24 * HOUR;

let tmp;
let root;
let lib;

/** Writes a file with a fixed modification time (hours after BASE). */
function write(file, hoursAfterBase, content = 'x') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  const t = new Date(BASE + hoursAfterBase * HOUR);
  fs.utimesSync(file, t, t);
}

/** A checkout whose node_modules links frodo-lib to a clone next to it. */
function linkLib() {
  lib = path.join(tmp, 'frodo-lib');
  fs.mkdirSync(path.join(root, 'node_modules', '@rockcarver'), {
    recursive: true,
  });
  fs.symlinkSync(
    lib,
    path.join(root, 'node_modules', '@rockcarver', 'frodo-lib')
  );
}

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'stale-build-')));
  root = path.join(tmp, 'frodo-cli');
  fs.mkdirSync(root, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('staleBuildWarnings: the linked frodo-lib', () => {
  it('says nothing when the library is a plain installed package', () => {
    fs.mkdirSync(path.join(root, 'node_modules', '@rockcarver', 'frodo-lib'), {
      recursive: true,
    });
    expect(staleBuildWarnings({ root, env: {} })).toEqual([]);
  });

  it('says nothing when the linked dist/ is newer than its source', () => {
    linkLib();
    write(path.join(lib, 'src', 'ops', 'A.ts'), 1);
    write(path.join(lib, 'dist', 'index.js'), 2);
    expect(staleBuildWarnings({ root, env: {} })).toEqual([]);
  });

  it('warns, naming the clone, the count and the newest file, when the source is newer', () => {
    linkLib();
    write(path.join(lib, 'dist', 'index.js'), 1);
    write(path.join(lib, 'src', 'ops', 'A.ts'), 2);
    write(path.join(lib, 'src', 'utils', 'B.ts'), 3);
    const [warning, ...rest] = staleBuildWarnings({ root, env: {} });
    expect(rest).toEqual([]);
    expect(warning).toContain(lib);
    expect(warning).toContain('2 source files newer');
    expect(warning).toContain(path.join('src', 'utils', 'B.ts'));
    expect(warning).toContain('npm run build');
    expect(warning).toContain('.claude/skills/run-the-tests/SKILL.md');
  });

  it('ignores tests, snapshots and the test folder, which are not build input', () => {
    linkLib();
    write(path.join(lib, 'dist', 'index.js'), 1);
    write(path.join(lib, 'src', 'ops', 'A.unit.test.ts'), 5);
    write(path.join(lib, 'src', 'ops', 'A.test.ts'), 5);
    write(path.join(lib, 'src', 'test', 'snapshots', 'A.snap'), 5);
    write(path.join(lib, 'src', 'test', 'helper.ts'), 5);
    write(path.join(lib, 'src', 'ops', 'notes.md'), 5);
    expect(staleBuildWarnings({ root, env: {} })).toEqual([]);
  });

  it('does not count a source that is only milliseconds newer (build writes generated files first)', () => {
    linkLib();
    write(path.join(lib, 'dist', 'index.js'), 1);
    const source = path.join(lib, 'src', 'lib', 'Help.ts');
    write(source, 1);
    const t = new Date(BASE + HOUR + 500);
    fs.utimesSync(source, t, t);
    expect(staleBuildWarnings({ root, env: {} })).toEqual([]);
  });

  it('warns when the linked library was never built', () => {
    linkLib();
    write(path.join(lib, 'src', 'ops', 'A.ts'), 1);
    const [warning] = staleBuildWarnings({ root, env: {} });
    expect(warning).toContain('has no dist/index.js');
    expect(warning).toContain('npm run build');
  });
});

describe("staleBuildWarnings: this checkout's dist/", () => {
  it('warns when src/ is newer than dist/launch.cjs', () => {
    write(path.join(root, 'dist', 'launch.cjs'), 1);
    write(path.join(root, 'src', 'cli', 'a.ts'), 2);
    const [warning, ...rest] = staleBuildWarnings({ root, env: {} });
    expect(rest).toEqual([]);
    expect(warning).toContain("This checkout's dist/ is older than src/");
    expect(warning).toContain('1 source file newer');
    expect(warning).toContain(path.join('src', 'cli', 'a.ts'));
    expect(warning).toContain('npx tsdown');
  });

  it('says nothing for a fresh dist/, or when dist/ is missing (the scripts build it then)', () => {
    write(path.join(root, 'src', 'cli', 'a.ts'), 1);
    expect(staleBuildWarnings({ root, env: {} })).toEqual([]);
    write(path.join(root, 'dist', 'launch.cjs'), 2);
    expect(staleBuildWarnings({ root, env: {} })).toEqual([]);
  });

  it('reports both builds when both are stale', () => {
    linkLib();
    write(path.join(lib, 'dist', 'index.js'), 1);
    write(path.join(lib, 'src', 'a.ts'), 2);
    write(path.join(root, 'dist', 'launch.cjs'), 1);
    write(path.join(root, 'src', 'b.ts'), 2);
    expect(staleBuildWarnings({ root, env: {} })).toHaveLength(2);
  });

  it('in SEA mode (npm run test:binary) also checks dist-sea/frodo and points at build:binary', () => {
    write(path.join(root, 'dist', 'launch.cjs'), 2);
    write(path.join(root, 'dist-sea', 'frodo'), 1);
    write(path.join(root, 'src', 'cli', 'a.ts'), 3);
    const env = { FRODO_TEST_BINARY: 'sea' };
    const warnings = staleBuildWarnings({ root, env });
    expect(warnings).toHaveLength(2);
    expect(warnings.every((w) => w.includes('npm run build:binary'))).toBe(
      true
    );
    expect(
      warnings.some((w) => w.includes("This checkout's dist-sea/ is older"))
    ).toBe(true);
  });

  it('in SEA mode says nothing for a fresh binary, or when it is missing (the scripts build it then)', () => {
    const env = { FRODO_TEST_BINARY: 'sea' };
    write(path.join(root, 'src', 'cli', 'a.ts'), 1);
    write(path.join(root, 'dist', 'launch.cjs'), 2);
    expect(staleBuildWarnings({ root, env })).toEqual([]);
    write(path.join(root, 'dist-sea', 'frodo'), 2);
    expect(staleBuildWarnings({ root, env })).toEqual([]);
  });

  it('looks for frodo.exe on Windows', () => {
    write(path.join(root, 'dist', 'launch.cjs'), 4);
    write(path.join(root, 'dist-sea', 'frodo.exe'), 1);
    write(path.join(root, 'src', 'cli', 'a.ts'), 3);
    const env = { FRODO_TEST_BINARY: 'sea' };
    expect(staleBuildWarnings({ root, env, platform: 'win32' })).toHaveLength(
      1
    );
    expect(staleBuildWarnings({ root, env, platform: 'linux' })).toHaveLength(
      0
    );
  });

  it('keeps the dev-mode advice (npx tsdown) when the SEA binary is not selected', () => {
    write(path.join(root, 'dist', 'launch.cjs'), 1);
    write(path.join(root, 'dist-sea', 'frodo'), 1);
    write(path.join(root, 'src', 'cli', 'a.ts'), 2);
    const warnings = staleBuildWarnings({ root, env: {} });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('npx tsdown');
  });
});

describe('staleBuildWarnings: opting out', () => {
  beforeEach(() => {
    linkLib();
    write(path.join(lib, 'dist', 'index.js'), 1);
    write(path.join(lib, 'src', 'a.ts'), 2);
    write(path.join(root, 'dist', 'launch.cjs'), 1);
    write(path.join(root, 'src', 'b.ts'), 2);
  });

  it('is silenced by FRODO_SKIP_STALE_CHECK=1', () => {
    expect(
      staleBuildWarnings({ root, env: { FRODO_SKIP_STALE_CHECK: '1' } })
    ).toEqual([]);
  });

  it('is skipped in CI, where the build is fresh and the library is the published package', () => {
    expect(staleBuildWarnings({ root, env: { CI: 'true' } })).toEqual([]);
  });

  it('still warns without the opt-outs, so the fixtures are really stale', () => {
    expect(staleBuildWarnings({ root, env: {} })).toHaveLength(2);
  });
});
