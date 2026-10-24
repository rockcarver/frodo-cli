import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * The agent skills in .claude/skills/ (how-to procedures that Claude Code and
 * the GitHub Copilot cloud agent load on demand; the decisions they must obey
 * are in docs/decisions/). A skill that points at a script, a path, a record
 * or an npm script that is gone is worse than none, so this keeps them honest:
 *
 * - each skill folder has a SKILL.md whose front matter has a `name` equal to
 *   the folder (lowercase words joined by hyphens) and a `description` that is
 *   present, short enough to match on and valid as a plain YAML scalar;
 * - no `allowed-tools` (a skill never pre-approves shell commands) and no
 *   other unknown key;
 * - a skill that has side effects or needs a maintainer's access
 *   (`disable-model-invocation: true`) opens with the stop line;
 * - the body stays under 500 lines, holds nothing sensitive, and every
 *   `npm run` script, repository path, relative link and cited decision record
 *   it names exists;
 * - every file in a skill folder is mentioned by its SKILL.md, and AGENTS.md
 *   and docs/CONTRIBUTE.md lead to the skills.
 *
 * It does not judge whether the steps are right: that is for the reviewer and
 * for whoever runs them.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SKILLS = path.join(ROOT, '.claude/skills');
const MAX_BODY_LINES = 500;
const MAX_DESCRIPTION = 1000;
const KEYS = ['name', 'description', 'disable-model-invocation', 'license'];
const NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const STOP_LINE = /^\*\*Only run when a maintainer asks\./;
const STOP_PHRASE = 'stop and say so in the issue or pull request';
const CORE = 'docs/decisions/core/';
// Repository locations a skill may name inline, and build output that exists
// only after a build or an install.
const REPO_ROOTS = /^(src|test|docs|tools|scripts|\.github|\.claude)\//;
const REPO_FILES = /^(AGENTS|CLAUDE|MIGRATION|CHANGELOG|README)\.md$|^package(-lock)?\.json$/;
const GENERATED = /^(dist|dist-sea|node_modules)\//;
const SENSITIVE = [
  [/\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i, 'an e-mail address'],
  [/\b(ghp_|github_pat_)\w+/, 'a GitHub token'],
  [/PRIVATE KEY/, 'a private key'],
  [/\bopenam-[a-z0-9-]+\./i, 'a tenant host name'],
];

const read = (p) => fs.readFileSync(p, 'utf8');
const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
const decisions = fs.existsSync(path.join(ROOT, 'docs/decisions'))
  ? fs.readdirSync(path.join(ROOT, 'docs/decisions'))
  : [];

/** Front matter of the small YAML subset skills use: single-line `key: value`. */
function parse(dir) {
  const file = path.join(SKILLS, dir, 'SKILL.md');
  if (!fs.existsSync(file)) return { dir, error: 'no SKILL.md' };
  const text = read(file);
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { dir, text, error: 'no front matter' };
  const data = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z-]+):\s*(.*)$/);
    if (!kv) return { dir, text, error: `cannot parse front matter line: ${line}` };
    data[kv[1]] = kv[2];
  }
  return { dir, text, data, body: m[2] };
}

/** Everything outside fenced code blocks, so examples with made-up paths are not checked as real ones. */
const outsideFences = (body) => body.replace(/^```[\s\S]*?^```/gm, '');

const dirs = fs.existsSync(SKILLS)
  ? fs
      .readdirSync(SKILLS, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  : [];
const skills = dirs.map(parse);

describe('agent skills', () => {
  it('has at least one skill, and no loose file next to the skill folders', () => {
    expect(skills.length).toBeGreaterThan(0);
    const loose = fs
      .readdirSync(SKILLS, { withFileTypes: true })
      .filter((e) => !e.isDirectory())
      .map((e) => e.name);
    expect(loose).toEqual([]);
  });

  describe.each(skills)('$dir', (skill) => {
    const { dir, data, body } = skill;
    const text = skill.text ?? '';

    it('has a SKILL.md with parseable front matter and only known keys', () => {
      expect(skill.error).toBeUndefined();
      expect(Object.keys(data).filter((k) => !KEYS.includes(k))).toEqual([]);
      expect(data['allowed-tools']).toBeUndefined();
    });

    it('names itself like its folder, in lowercase words joined by hyphens', () => {
      expect(data.name).toBe(dir);
      expect(dir).toMatch(NAME);
      expect(dir.length).toBeLessThanOrEqual(64);
    });

    it(`has a description under ${MAX_DESCRIPTION} characters that is a valid plain YAML scalar`, () => {
      const description = data.description ?? '';
      expect(description.trim()).not.toBe('');
      expect(description.length).toBeLessThan(MAX_DESCRIPTION);
      // `: ` and ` #` end a plain scalar early in YAML; a quote at the start changes its meaning.
      expect(description).not.toMatch(/: | #/);
      expect(description).not.toMatch(/^["'>|]/);
    });

    it('sets disable-model-invocation only to true', () => {
      if ('disable-model-invocation' in data) {
        expect(data['disable-model-invocation']).toBe('true');
      }
    });

    it('opens a skill that needs a maintainer with the stop line', () => {
      if (data['disable-model-invocation'] !== 'true') return;
      const first = body
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== '' && !l.startsWith('#'))[0];
      expect(first).toMatch(STOP_LINE);
      expect(first).toContain(STOP_PHRASE);
    });

    it(`has a body of at most ${MAX_BODY_LINES} lines`, () => {
      expect(body.split('\n').length).toBeLessThanOrEqual(MAX_BODY_LINES);
    });

    it('holds nothing sensitive', () => {
      const found = SENSITIVE.filter(([re]) => re.test(text)).map(([, what]) => what);
      expect(found).toEqual([]);
    });

    it('names only npm scripts that exist in package.json', () => {
      const named = [...text.matchAll(/npm run ([a-z][a-z0-9:_-]*)/g)].map((m) => m[1]);
      expect(named.filter((s) => !(s in pkg.scripts))).toEqual([]);
    });

    it('names only repository paths that exist', () => {
      const spans = [...outsideFences(body).matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
      const missing = spans
        .filter((s) => !/[\s<>*{}$|]|NNNN|\.\.\./.test(s))
        .map((s) => s.replace(/^\.\//, '').replace(/[,.;:]$/, ''))
        .filter((s) => (REPO_ROOTS.test(s) || REPO_FILES.test(s)) && !GENERATED.test(s))
        .filter((s) => !fs.existsSync(path.join(ROOT, s)));
      expect(missing).toEqual([]);
    });

    it('links only to files that exist', () => {
      const links = [...body.matchAll(/\]\(([^)\s]+)\)/g)]
        .map((m) => m[1])
        .filter((l) => !/^(https?:|mailto:|#)/.test(l))
        .map((l) => l.split('#')[0]);
      const missing = links.filter((l) => !fs.existsSync(path.resolve(SKILLS, dir, l)));
      expect(missing).toEqual([]);
    });

    it('cites only cli records that exist, and links every core record it cites', () => {
      const cited = [...text.matchAll(/\bcli records? ((?:\d{4}(?:,? (?:and )?)?)+)/g)].flatMap(
        (m) => m[1].match(/\d{4}/g)
      );
      const unknown = cited.filter((n) => !decisions.some((f) => f.startsWith(`${n}-`)));
      expect(unknown).toEqual([]);

      // "record 0002" alone is ambiguous: the repository and its core folder both have a 0001.
      const bare = [...text.matchAll(/(\w*)\W{0,2}\brecords? \d{4}/g)]
        .filter((m) => !/^(cli|core)$/i.test(m[1]))
        .map((m) => m[0]);
      expect(bare).toEqual([]);

      const core = [...text.matchAll(/\bcore (?:records? )?(\d{4})\b/g)].map((m) => m[1]);
      const coreFiles = fs.readdirSync(path.join(ROOT, CORE));
      expect(core.filter((n) => !coreFiles.some((f) => f.startsWith(`${n}-`)))).toEqual([]);
      const unlinked = core.filter((n) => !text.includes(`${CORE}${n}-`));
      expect(unlinked).toEqual([]);
    });

    it('mentions every other file in its folder', () => {
      const others = fs
        .readdirSync(path.join(SKILLS, dir), { recursive: true })
        .filter((f) => f !== 'SKILL.md' && fs.statSync(path.join(SKILLS, dir, f)).isFile());
      expect(others.filter((f) => !text.includes(path.basename(f)))).toEqual([]);
    });
  });

  describe('entry points', () => {
    it('AGENTS.md and docs/CONTRIBUTE.md point at the skills', () => {
      for (const file of ['AGENTS.md', 'docs/CONTRIBUTE.md']) {
        expect(read(path.join(ROOT, file))).toContain('.claude/skills/');
      }
    });

    it('AGENTS.md stays short', () => {
      expect(read(path.join(ROOT, 'AGENTS.md')).split('\n').length).toBeLessThan(60);
    });
  });
});
