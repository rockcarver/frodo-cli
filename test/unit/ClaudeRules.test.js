import { describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COMMAND,
  SOURCE_DIR,
  TARGET_DIR,
  parseInstructionFile,
  renderRule,
  syncRules,
  translateGlob,
} from '../../tools/generate-claude-rules.mjs';

/**
 * Claude Code reads scoped rules from `.claude/rules/`, GitHub Copilot from
 * `.github/instructions/` (core 0026). The instruction files are the one source
 * and every file of `.claude/rules/` is a generated twin of one of them, made
 * by `tools/generate-claude-rules.mjs`. This test keeps the two folders from
 * drifting, keeps every twin scoped (an unscoped rule loads at launch and costs
 * context in every session) and holds AGENTS.md to its budget and its five laws.
 *
 * It cannot say whether Claude Code matches a pattern: that is checked by
 * opening a session on a matching file (the pull request that added this test
 * says how).
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GENERATOR = path.join(ROOT, 'tools/generate-claude-rules.mjs');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const lf = (text) => text.replace(/\r\n/g, '\n');
/** The bytes that every session of Claude Code loads: AGENTS.md and the CLAUDE.md that imports it. */
const ALWAYS_LOADED_CEILING = 7500;
const LAW_CEILING = 450;

const sourceNames = fs
  .readdirSync(path.join(ROOT, SOURCE_DIR))
  .filter((f) => f.endsWith('.instructions.md'))
  .sort();
const twinFiles = (dir) =>
  fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.relative(dir, path.join(e.parentPath, e.name))).sort();

/** The items of the `paths` list of a twin and the line that follows the front matter. */
function readTwin(text) {
  const match = /^---\npaths:\n((?:  - .*\n)+)---\n(.*)\n/.exec(lf(text));
  if (!match) return undefined;
  return { paths: match[1].trimEnd().split('\n').map((l) => l.slice(4)), header: match[2] };
}

describe('parseInstructionFile', () => {
  const file = (applyTo) => `---\napplyTo: ${applyTo}\n---\n\n# Title\n`;

  it.each([
    ["'a/b/**/*.ts,c.json'", ['a/b/**/*.ts', 'c.json']],
    ['"a/b"', ['a/b']],
    ['a/b', ['a/b']],
    ["' a/b , c '", ['a/b', 'c']],
  ])('accepts %s', (value, expected) => {
    expect(parseInstructionFile(file(value)).applyTo).toEqual(expected);
  });

  it('returns the body unchanged, and reads a CRLF file as LF', () => {
    expect(parseInstructionFile(file("'a/b'")).body).toBe('\n# Title\n');
    expect(parseInstructionFile(file("'a/b'").replace(/\n/g, '\r\n')).body).toBe('\n# Title\n');
  });

  it.each([
    ['no front matter', '# Title\n', /no front matter/],
    ['a second key', "---\napplyTo: 'a/b'\nexcludeAgent: 'code-review'\n---\n", /only applyTo.*excludeAgent/],
    ['another key only', "---\ndescription: 'x'\n---\n", /only applyTo/],
    ['an empty value', file("''"), /empty/],
    ['a missing value', file(''), /empty/],
    ['an empty item', file("'a/b,,c'"), /empty item/],
    ['a trailing comma', file("'a/b,'"), /empty item/],
    ['a brace', file("'src/**/*.{ts,js}'"), /not translated/],
    ['a negation', file("'!src/a'"), /not translated/],
    ['a bracket', file("'src/[ab].ts'"), /not translated/],
    ['a leading slash', file("'/package.json'"), /starts with a slash/],
  ])('rejects %s', (_name, text, message) => {
    expect(() => parseInstructionFile(text)).toThrow(message);
  });
});

describe('translateGlob', () => {
  it.each([
    ['src/cli/**/*.ts', 'src/cli/**/*.ts'],
    ['src/index.ts', 'src/index.ts'],
    ['test/**', 'test/**'],
    ['.github/README.md', '.github/README.md'],
    ['scripts/**', 'scripts/**'],
    ['.github/**', '.github/**'],
    ['package.json', '/package.json'],
    ['MIGRATION.md', '/MIGRATION.md'],
    ['*.md', '/*.md'],
  ])('%s becomes %s', (glob, expected) => {
    expect(translateGlob(glob)).toBe(expected);
  });
});

describe('renderRule', () => {
  const options = { source: '.github/instructions/a.instructions.md', command: 'node tools/x.mjs' };
  const source = "---\napplyTo: 'src/a/**/*.ts,package.json'\n---\n\n# A rule\n\n- **Keep** it `short`.\n";

  it('writes the paths, one double quoted item each, the header, and the body as it is', () => {
    expect(renderRule(source, options)).toBe(
      [
        '---',
        'paths:',
        '  - "src/a/**/*.ts"',
        '  - "/package.json"',
        '---',
        '<!-- Generated: do not edit. Source: .github/instructions/a.instructions.md. Regenerate with: node tools/x.mjs -->',
        '',
        '# A rule',
        '',
        '- **Keep** it `short`.',
        '',
      ].join('\n')
    );
  });

  it('gives the LF twin for a CRLF source', () => {
    expect(renderRule(source.replace(/\n/g, '\r\n'), options)).toBe(renderRule(source, options));
  });

  it('names the command of this repository by default', () => {
    expect(COMMAND).toBe('node tools/generate-claude-rules.mjs');
    expect(renderRule(source, { source: options.source })).toContain(`Regenerate with: ${COMMAND} -->`);
  });
});

describe('the generator on a temporary tree', () => {
  const SOURCES = {
    'a.instructions.md': "---\napplyTo: 'src/a/**/*.ts'\n---\n\n# A\n",
    'b.instructions.md': "---\napplyTo: 'package.json,test/**'\n---\n\n# B\n",
  };

  /** A tree with the sources and, when `generated`, the twins that the generator wrote for them. */
  function tree(sources = SOURCES, generated = true) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-rules-'));
    fs.mkdirSync(path.join(root, SOURCE_DIR), { recursive: true });
    for (const [name, text] of Object.entries(sources)) fs.writeFileSync(path.join(root, SOURCE_DIR, name), text);
    if (generated) syncRules(root, { write: true });
    return root;
  }

  const run = (root, ...args) => {
    const result = spawnSync(process.execPath, [GENERATOR, ...args, '--root', root], { encoding: 'utf8', env: { ...process.env, HOME: root } });
    return { status: result.status, out: result.stdout + result.stderr };
  };

  it('--check exits 0 when every twin is what its source generates', () => {
    const root = tree();
    expect(run(root, '--check')).toMatchObject({ status: 0 });
    expect(twinFiles(path.join(root, TARGET_DIR))).toEqual(Object.keys(SOURCES));
  });

  it('--check exits 1 and names a twin that was edited by one byte', () => {
    const root = tree();
    const twin = path.join(root, TARGET_DIR, 'a.instructions.md');
    fs.writeFileSync(twin, fs.readFileSync(twin, 'utf8').replace('# A', '# a'));
    const { status, out } = run(root, '--check');
    expect(status).toBe(1);
    expect(out).toContain(`${TARGET_DIR}/a.instructions.md: differs`);
    expect(out).not.toContain('b.instructions.md');
    expect(out).toContain(COMMAND);
  });

  it('--check exits 1 for a twin that is stale after its source changed', () => {
    const root = tree();
    fs.writeFileSync(path.join(root, SOURCE_DIR, 'b.instructions.md'), "---\napplyTo: 'package.json'\n---\n\n# B\n");
    const { status, out } = run(root, '--check');
    expect(status).toBe(1);
    expect(out).toContain(`${TARGET_DIR}/b.instructions.md: differs`);
  });

  it('--check exits 1 for a missing twin', () => {
    const root = tree();
    fs.rmSync(path.join(root, TARGET_DIR, 'b.instructions.md'));
    const { status, out } = run(root, '--check');
    expect(status).toBe(1);
    expect(out).toContain(`${TARGET_DIR}/b.instructions.md: missing`);
  });

  it('--check exits 1 for a file in the rules folder that has no source, also in a subfolder', () => {
    const root = tree();
    fs.mkdirSync(path.join(root, TARGET_DIR, 'sub'));
    fs.writeFileSync(path.join(root, TARGET_DIR, 'x.md'), '# x\n');
    fs.writeFileSync(path.join(root, TARGET_DIR, 'sub', 'y.md'), '# y\n');
    const { status, out } = run(root, '--check');
    expect(status).toBe(1);
    expect(out).toContain(`${TARGET_DIR}/x.md: has no source`);
    expect(out).toContain(`${TARGET_DIR}/sub/y.md: has no source`);
  });

  it('--check exits 1 and names the source it cannot read', () => {
    const root = tree();
    fs.writeFileSync(path.join(root, SOURCE_DIR, 'a.instructions.md'), "---\napplyTo: 'src/{a,b}/**'\n---\n");
    const { status, out } = run(root, '--check');
    expect(status).toBe(1);
    expect(out).toContain('not translated');
  });

  it('--check accepts a twin that a Windows checkout turned into CRLF', () => {
    const root = tree();
    const twin = path.join(root, TARGET_DIR, 'a.instructions.md');
    fs.writeFileSync(twin, fs.readFileSync(twin, 'utf8').replace(/\n/g, '\r\n'));
    expect(run(root, '--check')).toMatchObject({ status: 0 });
  });

  it('writes the missing and changed twins, removes the orphans, and leaves nothing for --check', () => {
    const root = tree(SOURCES, false);
    fs.mkdirSync(path.join(root, TARGET_DIR), { recursive: true });
    fs.writeFileSync(path.join(root, TARGET_DIR, 'orphan.md'), '# orphan\n');
    expect(run(root)).toMatchObject({ status: 0 });
    expect(twinFiles(path.join(root, TARGET_DIR))).toEqual(Object.keys(SOURCES));
    expect(run(root, '--check')).toMatchObject({ status: 0 });
  });

  it('ignores a file of the instructions folder that is not an instruction file', () => {
    const root = tree({ ...SOURCES, 'README.md': '# not a source\n' });
    expect(twinFiles(path.join(root, TARGET_DIR))).toEqual(Object.keys(SOURCES));
    expect(run(root, '--check')).toMatchObject({ status: 0 });
  });
});

describe('the twins of this repository', () => {
  const twins = twinFiles(path.join(ROOT, TARGET_DIR));

  it('are exactly the instruction files, by name', () => {
    expect(sourceNames.length).toBeGreaterThan(0);
    expect(twins).toEqual(sourceNames);
  });

  it('are what the generator makes of their sources (run `npm run generate:claude-rules`)', () => {
    expect(syncRules(ROOT)).toEqual([]);
    for (const name of sourceNames) {
      const source = `${SOURCE_DIR}/${name}`;
      expect(lf(read(`${TARGET_DIR}/${name}`))).toBe(renderRule(read(source), { source }));
    }
  });

  it.each(sourceNames)('%s is scoped and says that it is generated', (name) => {
    const twin = readTwin(read(`${TARGET_DIR}/${name}`));
    expect(twin).toBeDefined();
    expect(twin.paths.length).toBeGreaterThan(0);
    for (const item of twin.paths) {
      expect(item).toMatch(/^"[^"\s{}![\]][^"{}![\]]*"$/);
      expect(item).not.toMatch(/^"\*/);
    }
    expect(twin.header).toBe(
      `<!-- Generated: do not edit. Source: ${SOURCE_DIR}/${name}. Regenerate with: ${COMMAND} -->`
    );
  });

  it('anchor a name without a slash at the root', () => {
    const paths = readTwin(read(`${TARGET_DIR}/dependencies.instructions.md`)).paths;
    expect(paths).toContain('"/package.json"');
    expect(paths).not.toContain('"package.json"');
  });

  it.each(sourceNames)('%s links to files that exist, the same files as its source', (name) => {
    const links = [...read(`${TARGET_DIR}/${name}`).matchAll(/\]\(([^)\s]+)\)/g)]
      .map((m) => m[1].split('#')[0])
      .filter((l) => l !== '' && !/^[a-z][a-z0-9+.-]*:/i.test(l));
    // A link to a sibling instruction file reaches the sibling twin, which has the same name.
    const asSource = (file) => file.replace(path.join(ROOT, TARGET_DIR), path.join(ROOT, SOURCE_DIR));
    for (const link of links) {
      const fromTwin = path.resolve(ROOT, TARGET_DIR, link);
      expect(fs.existsSync(fromTwin)).toBe(true);
      expect(asSource(fromTwin)).toBe(path.resolve(ROOT, SOURCE_DIR, link));
    }
  });

  it('import nothing: no file of the rules or AGENTS.md has an @ import line', () => {
    for (const file of ['AGENTS.md', ...sourceNames.map((n) => `${TARGET_DIR}/${n}`)]) {
      expect(read(file)).not.toMatch(/^@\S+\.md\s*$/m);
    }
    expect(read('CLAUDE.md').split('\n').filter((l) => l.startsWith('@'))).toEqual(['@AGENTS.md']);
  });
});

describe('AGENTS.md', () => {
  const agents = read('AGENTS.md');
  const laws = (agents.split(/^## The five laws that get broken most$/m)[1] ?? '').split(/^## /m)[0].split('\n').filter((l) => /^\d+\. /.test(l));

  it('opens with five numbered laws, each with its reason and its check, in 450 bytes at most', () => {
    expect(agents.split(/^## /m)[1]).toMatch(/^The five laws that get broken most/);
    expect(laws).toHaveLength(5);
    laws.forEach((law, i) => {
      expect(law).toMatch(new RegExp(`^${i + 1}\\. \\*\\*`));
      expect(law).toContain(' Why: ');
      expect(law).toContain(' Check: ');
      expect(Buffer.byteLength(law)).toBeLessThanOrEqual(LAW_CEILING);
    });
  });

  it('keeps the rule that a maintainer is the last lever', () => {
    expect(agents).toContain('core/0002-a-maintainer-stays-the-last-lever-on-agent-work.md');
  });

  it('says how to answer which instruction files were loaded', () => {
    expect(agents).toMatch(/If asked which instruction files you loaded, list AGENTS\.md and each rule you have actually read this session; do not guess\./);
  });

  it('says where Claude Code reads its scoped rules, and never that it reads the instruction folder', () => {
    expect(agents).toContain('.claude/rules/');
    expect(agents).not.toMatch(/Claude[^.\n]*\.github\/instructions/);
  });

  it(`stays within ${ALWAYS_LOADED_CEILING} bytes together with CLAUDE.md, which every session loads`, () => {
    expect(Buffer.byteLength(agents) + Buffer.byteLength(read('CLAUDE.md'))).toBeLessThanOrEqual(ALWAYS_LOADED_CEILING);
  });
});

describe('the guidance tests', () => {
  it('list this test, so that a pull request that changes only a rule file runs it', () => {
    expect(read('tools/run-guidance-tests.mjs')).toContain("'test/unit/ClaudeRules.test.js',");
  });
});
