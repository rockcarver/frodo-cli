import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * The decision records in docs/decisions/ (docs/decisions/README.md): one file
 * per decision, `NNNN-short-title.md`, with front matter and fixed sections.
 * This test keeps the records well formed and the index honest: required keys,
 * valid statuses, contiguous numbering, supersede links that point at a newer
 * record, paths in `applies-to` that exist, an index row per record whose title
 * and status match, and the two tool-neutral entry points (AGENTS.md and
 * CLAUDE.md) that lead to them. The core records in docs/decisions/core/ (the
 * decisions that bind more than one repository, kept as the same file in each
 * of them) have their own checks at the end. It does not judge what a decision
 * says.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'docs/decisions');
const MAX_LINES = 60;
const KEYS = ['status', 'date', 'decision-makers', 'applies-to', 'issues'];
const REQUIRED_KEYS = ['status', 'date', 'decision-makers'];
const STATUS = /^(proposed|accepted|rejected|deprecated|superseded by (\d{4}))$/;
const SECTIONS = [
  'Context and problem statement',
  'Decision',
  'Consequences',
  'Alternatives considered',
];
const TOOL_NAMES = /\b(copilot|claude|grok|chatgpt|codex)\b/i;
// Core records (docs/decisions/core/): the same file serves every repository it binds.
const CORE_DIR = path.join(DIR, 'core');
const THIS_REPOSITORY = 'rockcarver/frodo-cli';
const CORE_KEYS = [...KEYS, 'repos'];
const CORE_REQUIRED_KEYS = [...REQUIRED_KEYS, 'repos'];
const CORE_SECTIONS = [...SECTIONS.slice(0, 3), 'Known deviations', SECTIONS[3]];

const read = (file, dir = DIR) => fs.readFileSync(path.join(dir, file), 'utf8');

/** Front matter of the small YAML subset the records use: `key: value` and `key:` followed by `  - item` lines. */
function parse(file, dir = DIR) {
  const text = read(file, dir);
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { file, text, error: 'no front matter' };
  const data = {};
  let key;
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z-]+):\s*(.*)$/);
    const item = line.match(/^\s+-\s+(.+)$/);
    if (kv) {
      key = kv[1];
      data[key] = kv[2] === '' ? [] : kv[2];
    } else if (item && Array.isArray(data[key])) {
      data[key].push(item[1].trim());
    } else if (line.trim() !== '') {
      return { file, text, error: `cannot parse front matter line: ${line}` };
    }
  }
  const body = m[2];
  const title = (body.match(/^\s*# (.+)$/m) || [])[1];
  const headings = [...body.matchAll(/^## (.+)$/gm)].map((h) => h[1]);
  return { file, text, data, body, title, headings };
}

const files = fs
  .readdirSync(DIR)
  .filter(
    (f) =>
      !f.startsWith('.') &&
      f !== 'README.md' &&
      f !== 'template.md' &&
      fs.statSync(path.join(DIR, f)).isFile()
  )
  .sort();
const records = files.map((f) => parse(f));
const byNumber = new Map(records.map((r) => [r.file.slice(0, 4), r]));
const pathPrefixExists = (glob) => {
  const parts = glob.split('/');
  const fixed = [];
  for (const part of parts) {
    if (part.includes('*')) break;
    fixed.push(part);
  }
  return fs.existsSync(path.join(ROOT, ...fixed));
};

describe('decision records', () => {
  it('has the README and the template, and at least one record', () => {
    expect(fs.existsSync(path.join(DIR, 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(DIR, 'template.md'))).toBe(true);
    expect(records.length).toBeGreaterThan(0);
  });

  it('names every file NNNN-short-title.md, numbered from 0001 without gaps', () => {
    const bad = files.filter((f) => !/^\d{4}-[a-z0-9]+(-[a-z0-9]+)*\.md$/.test(f));
    expect(bad).toEqual([]);
    expect(files.map((f) => Number(f.slice(0, 4)))).toEqual(
      files.map((_, i) => i + 1)
    );
  });

  describe.each(records)('$file', (record) => {
    const { data } = record;

    it('has parseable front matter with only known keys and the required ones', () => {
      expect(record.error).toBeUndefined();
      expect(Object.keys(data).filter((k) => !KEYS.includes(k))).toEqual([]);
      expect(REQUIRED_KEYS.filter((k) => !(k in data))).toEqual([]);
    });

    it('has a valid status; a superseded record points at a newer record', () => {
      const m = String(data.status).match(STATUS);
      expect(m).not.toBeNull();
      if (m[2]) {
        expect(byNumber.has(m[2])).toBe(true);
        expect(Number(m[2])).toBeGreaterThan(Number(record.file.slice(0, 4)));
      }
    });

    it('has a real date and a non-empty role in decision-makers', () => {
      const date = String(data.date);
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(date);
      expect(String(data['decision-makers']).trim()).not.toBe('');
    });

    it('lists issues as owner/repo#number and applies-to as paths that exist', () => {
      for (const issue of data.issues ?? []) {
        expect(issue).toMatch(/^[\w.-]+\/[\w.-]+#\d+$/);
      }
      if ('applies-to' in data) {
        expect(data['applies-to'].length).toBeGreaterThan(0);
        // A superseded or deprecated record may outlive its paths.
        if (data.status === 'accepted') {
          expect(data['applies-to'].filter((g) => !pathPrefixExists(g))).toEqual([]);
        }
      }
    });

    it('has a title and the fixed sections in order, and nothing else', () => {
      expect(record.title && record.title.trim()).toBeTruthy();
      const required = SECTIONS.slice(0, 3);
      expect(record.headings.slice(0, 3)).toEqual(required);
      expect(
        record.headings.slice(3).every((h) => h === SECTIONS[3])
      ).toBe(true);
      expect(record.headings.length).toBeLessThanOrEqual(4);
    });

    it(`stays short (at most ${MAX_LINES} lines), names no tool and holds no e-mail address`, () => {
      expect(record.text.split('\n').length).toBeLessThanOrEqual(MAX_LINES);
      expect(record.text).not.toMatch(TOOL_NAMES);
      expect(record.text).not.toMatch(/\S+@\S+\.\S+/);
    });
  });

  describe('README index', () => {
    const readme = read('README.md');
    const index = readme.split(/^## Index$/m)[1] ?? '';
    const rows = index
      .split('\n')
      .filter((l) => /^\|\s*\[\d{4}\]\(/.test(l))
      .map((l) => {
        const cells = l.split('|').slice(1, -1).map((c) => c.trim());
        const link = cells[0].match(/^\[(\d{4})\]\(([^)]+)\)$/);
        return { number: link?.[1], target: link?.[2], title: cells[1], status: cells[2], appliesTo: cells[3] };
      });

    it('lists every record exactly once and nothing else', () => {
      expect(rows.map((r) => r.target)).toEqual(files);
      expect(rows.every((r, i) => r.number === files[i].slice(0, 4))).toBe(true);
    });

    it('shows each record\'s title and status as the record says', () => {
      for (const record of records) {
        const row = rows.find((r) => r.target === record.file);
        expect(row.title).toBe(record.title.trim());
        expect(row.status).toBe(String(record.data.status));
      }
    });

    it('shows what each record applies to', () => {
      for (const record of records) {
        const row = rows.find((r) => r.target === record.file);
        const globs = record.data['applies-to'];
        if (globs) {
          for (const glob of globs) expect(row.appliesTo).toContain(`\`${glob}\``);
        } else {
          expect(row.appliesTo).toMatch(/repository-wide/i);
        }
      }
    });
  });

  describe('entry points for every tool', () => {
    it('AGENTS.md points at the records and states that they bind', () => {
      const agents = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
      expect(agents).toContain('docs/decisions/README.md');
      expect(agents).toMatch(/accepted record is binding/i);
    });

    it('CLAUDE.md only imports AGENTS.md', () => {
      const claude = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
      expect(claude.split('\n')).toContain('@AGENTS.md');
    });

    it('the template has the same sections', () => {
      const template = read('template.md');
      for (const section of SECTIONS) expect(template).toContain(`## ${section}`);
    });
  });
});

describe('core decision records', () => {
  const coreFiles = fs.existsSync(CORE_DIR)
    ? fs
        .readdirSync(CORE_DIR)
        .filter((f) => f.endsWith('.md'))
        .sort()
    : [];
  const coreRecords = coreFiles.map((f) => parse(f, CORE_DIR));
  const coreByNumber = new Map(coreRecords.map((r) => [r.file.slice(0, 4), r]));

  it('has a core folder with at least one record', () => {
    expect(fs.existsSync(CORE_DIR)).toBe(true);
    expect(coreRecords.length).toBeGreaterThan(0);
  });

  it('names every file NNNN-short-title.md, numbered from 0001 without gaps', () => {
    const bad = coreFiles.filter((f) => !/^\d{4}-[a-z0-9]+(-[a-z0-9]+)*\.md$/.test(f));
    expect(bad).toEqual([]);
    expect(coreFiles.map((f) => Number(f.slice(0, 4)))).toEqual(
      coreFiles.map((_, i) => i + 1)
    );
  });

  describe.each(coreRecords)('core $file', (record) => {
    const { data } = record;
    const number = record.file.slice(0, 4);

    it('has parseable front matter with only known keys and the required ones', () => {
      expect(record.error).toBeUndefined();
      expect(Object.keys(data).filter((k) => !CORE_KEYS.includes(k))).toEqual([]);
      expect(CORE_REQUIRED_KEYS.filter((k) => !(k in data))).toEqual([]);
    });

    it('has a valid status; a superseded record points at a newer core record', () => {
      const m = String(data.status).match(STATUS);
      expect(m).not.toBeNull();
      if (m[2]) {
        expect(coreByNumber.has(m[2])).toBe(true);
        expect(Number(m[2])).toBeGreaterThan(Number(number));
      }
    });

    it('has a real date and a non-empty role in decision-makers', () => {
      const date = String(data.date);
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(date);
      expect(String(data['decision-makers']).trim()).not.toBe('');
    });

    it('lists the repositories it binds, this one among them, and issues as owner/repo#number', () => {
      expect(Array.isArray(data.repos)).toBe(true);
      expect(data.repos.length).toBeGreaterThan(0);
      for (const repo of data.repos) expect(repo).toMatch(/^[\w.-]+\/[\w.-]+$/);
      expect(data.repos).toContain(THIS_REPOSITORY);
      for (const issue of data.issues ?? []) {
        expect(issue).toMatch(/^[\w.-]+\/[\w.-]+#\d+$/);
      }
      // One file serves repositories with different layouts, so the globs are not checked against this tree.
      if ('applies-to' in data) expect(data['applies-to'].length).toBeGreaterThan(0);
    });

    it('has a title and the allowed sections in order, the first three required', () => {
      expect(record.title && record.title.trim()).toBeTruthy();
      expect(record.headings.slice(0, 3)).toEqual(CORE_SECTIONS.slice(0, 3));
      const order = record.headings.map((h) => CORE_SECTIONS.indexOf(h));
      expect(order.every((i) => i >= 0)).toBe(true);
      expect(order.every((i, n) => n === 0 || i > order[n - 1])).toBe(true);
    });

    it(`stays short (at most ${MAX_LINES} lines) and holds no e-mail address`, () => {
      expect(record.text.split('\n').length).toBeLessThanOrEqual(MAX_LINES);
      // Stricter than for the repository's own records: scoped package names such as `@scope/name` are not addresses.
      expect(record.text).not.toMatch(/\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i);
    });

    it('links only to files that exist', () => {
      const links = [...record.body.matchAll(/\]\(([^)\s]+)\)/g)]
        .map((m) => m[1])
        .filter((l) => !/^(https?:|mailto:|#)/.test(l))
        .map((l) => l.split('#')[0]);
      expect(links.filter((l) => !fs.existsSync(path.resolve(CORE_DIR, l)))).toEqual([]);
    });
  });

  describe('README "Core decisions" table', () => {
    const readme = read('README.md');
    const section = (readme.split(/^## Core decisions$/m)[1] ?? '').split(/^## /m)[0];
    const rows = section
      .split('\n')
      .filter((l) => /^\|\s*\[core \d{4}\]\(/.test(l))
      .map((l) => {
        const cells = l.split('|').slice(1, -1).map((c) => c.trim());
        const link = cells[0].match(/^\[core (\d{4})\]\(([^)]+)\)$/);
        return {
          number: link?.[1],
          target: link?.[2],
          title: cells[1],
          status: cells[2],
          appliesTo: cells[3],
          rule: cells[4],
        };
      });

    it('lists every core record exactly once, in order, and nothing else', () => {
      expect(rows.map((r) => r.target)).toEqual(coreFiles.map((f) => `core/${f}`));
      expect(rows.every((r, i) => r.number === coreFiles[i].slice(0, 4))).toBe(true);
    });

    it("shows each core record's title and status as the record says", () => {
      for (const record of coreRecords) {
        const row = rows.find((r) => r.target === `core/${record.file}`);
        expect(row.title).toBe(record.title.trim());
        expect(row.status).toBe(String(record.data.status));
      }
    });

    it('shows what each core record applies to, because the gates select records by it', () => {
      for (const record of coreRecords) {
        const row = rows.find((r) => r.target === `core/${record.file}`);
        const globs = record.data['applies-to'];
        if (globs) {
          for (const glob of globs) expect(row.appliesTo).toContain(`\`${glob}\``);
        } else {
          expect(row.appliesTo).toMatch(/repository-wide/i);
        }
      }
    });

    it('gives every row a one-sentence rule', () => {
      expect(rows.filter((r) => !r.rule || r.rule.length < 20)).toEqual([]);
    });
  });

  describe('living documents', () => {
    const living = [
      'AGENTS.md',
      'docs/CONTRIBUTE.md',
      ...fs
        .readdirSync(path.join(ROOT, '.github/instructions'))
        .map((f) => `.github/instructions/${f}`),
      ...fs
        .readdirSync(path.join(ROOT, '.claude/skills'), { recursive: true })
        .filter((f) => f.endsWith('SKILL.md'))
        .map((f) => `.claude/skills/${f}`),
    ];

    it.each(living)('%s cites no umbrella record by URL', (file) => {
      const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
      expect(text).not.toMatch(/github\.com\/rockcarver\/frodo\/(blob|tree)\//);
      expect(text).not.toMatch(/\bumbrella (records? )?\d{4}\b/);
    });

    it.each(living)('%s links only core records that exist', (file) => {
      const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
      const targets = [...text.matchAll(/\]\(([^)\s#]*core\/\d{4}-[^)\s#]+)/g)].map((m) => m[1]);
      const missing = targets.filter(
        (l) => !fs.existsSync(path.resolve(path.dirname(path.join(ROOT, file)), l))
      );
      expect(missing).toEqual([]);
    });
  });
});
