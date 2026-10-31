import { describe, expect, it } from '@jest/globals';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * The classifier behind the `Detect code changes` job (.github/scripts/
 * classify-changes.sh): which pull requests skip the long test matrix, which
 * run only the fast `guidance` job, and which need everything. The rule that
 * matters most is that it can only ever skip work, never hide it, so most
 * cases here are paths that must count as code. A path that moves between the
 * lists in the script needs its case moved here too (docs/PIPELINE.md).
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(ROOT, '.github/scripts/classify-changes.sh');
const LIMIT = 3000;

// The script is bash; a Windows checkout without bash cannot run these.
const describeIfBash = process.platform === 'win32' ? describe.skip : describe;

/** Runs the script with the given lines on stdin and parses `key=value` output. */
function run(input) {
  const result = spawnSync('bash', [SCRIPT], { input, encoding: 'utf8' });
  const lines = result.stdout.split('\n').filter((l) => l !== '');
  return { status: result.status, stderr: result.stderr, lines };
}

/** `classify(['a', 'b'])` is what the pipeline pipes in: one name per line. */
function classify(files) {
  const { status, lines, stderr } = run(files.map((f) => `${f}\n`).join(''));
  expect(stderr).toBe('');
  expect(status).toBe(0);
  expect(lines.map((l) => l.split('=')[0])).toEqual(['code', 'guidance']);
  const out = Object.fromEntries(lines.map((l) => l.split('=')));
  return { code: out.code, guidance: out.guidance };
}

const NON_CODE_ONLY = { code: 'false', guidance: 'false' };
const GUIDANCE_ONLY = { code: 'false', guidance: 'true' };
const CODE = { code: 'true', guidance: 'false' };

describeIfBash('classify-changes.sh', () => {
  it('prints exactly the two lines code= and guidance=, in that order', () => {
    const { status, lines } = run('docs/PIPELINE.md\n');
    expect(status).toBe(0);
    expect(lines).toEqual(['code=false', 'guidance=false']);
  });

  describe('files that cannot change what the test jobs build or test', () => {
    it.each([
      'docs/PIPELINE.md',
      'docs/images/flow.gif',
      'docs/nested/deeper/page.md',
      'README.md',
      'CHANGELOG.md',
      'MIGRATION.md',
      'CODE_OF_CONDUCT.md',
      'LICENSE',
      '.github/ISSUE_TEMPLATE/bug.yml',
      '.github/issue-concierge/scope.md',
      '.github/aw/actions-lock.json',
      '.github/issue-concierge.yml',
      '.github/scripts/janitor.mjs',
      '.github/workflows/janitor.yml',
      '.github/workflows/plan-worker.lock.yml',
      '.github/workflows/plan-worker.md',
      '.github/CODEOWNERS',
      '.github/dependabot.yml',
      '.github/copilot-instructions.md',
    ])('%s is not code', (file) => {
      expect(classify([file])).toEqual(NON_CODE_ONLY);
    });
  });

  describe('files that a guidance test reads', () => {
    it.each([
      'docs/decisions/0001-realm-picker.md',
      'docs/decisions/README.md',
      'docs/decisions/template.md',
      'AGENTS.md',
      'CLAUDE.md',
      'docs/CONTRIBUTE.md',
      '.claude/skills/add-a-cli-command/SKILL.md',
      '.claude/skills/review-a-copilot-pr/mutation-check.py',
      '.github/instructions/tests.instructions.md',
    ])('%s needs the guidance job and not the test matrix', (file) => {
      expect(classify([file])).toEqual(GUIDANCE_ONLY);
    });
  });

  describe('files that count as code', () => {
    it.each([
      'src/cli/journey/journey-list.ts',
      'src/app.ts',
      'test/unit/Skills.test.js',
      'test/e2e/mocks/journey_1/recording.har',
      'tools/run-guidance-tests.mjs',
      'scripts/build-sea.mjs',
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      'Dockerfile',
      'eslint.config.mjs',
      'notes.txt',
      // the pipeline and the classifier decide what judges a pull request
      '.github/workflows/pipeline.yml',
      '.github/scripts/classify-changes.sh',
      '.github/scripts/classify-changes.test.sh',
      // anything not named on the lists, however docs-like it looks
      '.claude/settings.json',
      '.claude/commands/review.md',
      '.github/workflows/steps/build.sh',
      '.github/workflows/nested/deeper.yml',
      '.github/ISSUE_TEMPLATE.md/extra.ts',
      'LICENSE.js',
      'LICENSEX/payload.js',
      'docs',
      'sub/docs/page.md',
      'sub/README.md',
      'sub/AGENTS.md',
      'decisions/0001-x.md',
    ])('%s is code', (file) => {
      expect(classify([file])).toEqual(CODE);
    });

    it('treats a path with spaces like any other', () => {
      expect(classify(['docs/my notes.md'])).toEqual(NON_CODE_ONLY);
      expect(classify(['src/my file.ts'])).toEqual(CODE);
    });
  });

  describe('pull requests that mix files', () => {
    it('is code when one file is code, even next to guidance and docs', () => {
      expect(classify(['docs/PIPELINE.md', 'src/app.ts'])).toEqual(CODE);
      expect(classify(['AGENTS.md', 'src/app.ts'])).toEqual(CODE);
      expect(classify(['src/app.ts', 'docs/decisions/0001-x.md'])).toEqual(CODE);
    });

    it('is code when the pipeline or the classifier is among the files', () => {
      expect(classify(['AGENTS.md', '.github/workflows/pipeline.yml'])).toEqual(CODE);
      expect(
        classify(['docs/decisions/0001-x.md', '.github/scripts/classify-changes.sh'])
      ).toEqual(CODE);
    });

    it('needs the guidance job when guidance and docs change together', () => {
      expect(
        classify(['docs/PIPELINE.md', '.claude/skills/x/SKILL.md', '.github/workflows/janitor.yml'])
      ).toEqual(GUIDANCE_ONLY);
    });

    it('needs nothing extra for docs, workflows and scripts that no test reads', () => {
      expect(
        classify(['docs/PIPELINE.md', 'README.md', '.github/workflows/janitor.yml', '.github/scripts/janitor.mjs'])
      ).toEqual(NON_CODE_ONLY);
    });

    it('counts a duplicate name once and in either order', () => {
      expect(classify(['AGENTS.md', 'AGENTS.md'])).toEqual(GUIDANCE_ONLY);
      expect(classify(['src/app.ts', 'AGENTS.md'])).toEqual(classify(['AGENTS.md', 'src/app.ts']));
    });
  });

  describe('renamed files list their previous name too', () => {
    it('is code when a code file is renamed into docs', () => {
      expect(classify(['docs/old-code.md', 'src/cli/old.ts'])).toEqual(CODE);
    });

    it('is code when a docs file is renamed into code', () => {
      expect(classify(['src/cli/new.ts', 'docs/old.md'])).toEqual(CODE);
    });

    it('needs the guidance job when a record or skill moves between folders', () => {
      expect(
        classify(['.claude/skills/new/SKILL.md', '.claude/skills/old/SKILL.md'])
      ).toEqual(GUIDANCE_ONLY);
      expect(classify(['docs/archive/0001-x.md', 'docs/decisions/0001-x.md'])).toEqual(GUIDANCE_ONLY);
    });
  });

  describe('fail safe', () => {
    it('is code for an empty list', () => {
      expect(run('').lines).toEqual(['code=true', 'guidance=false']);
    });

    it('is code for a list of blank lines only', () => {
      expect(run('\n\n  \n').lines).toEqual(['code=true', 'guidance=false']);
    });

    it('ignores blank lines between names', () => {
      expect(run('docs/a.md\n\n  \ndocs/b.md\n').lines).toEqual(['code=false', 'guidance=false']);
    });

    it('does not need a trailing newline', () => {
      expect(run('docs/a.md').lines).toEqual(['code=false', 'guidance=false']);
    });

    const names = (n) => Array.from({ length: n }, (_, i) => `docs/page-${i}.md`);

    it(`accepts ${LIMIT - 1} names and treats ${LIMIT} or more as unknown, so as code`, () => {
      expect(classify(names(LIMIT - 1))).toEqual(NON_CODE_ONLY);
      expect(classify(names(LIMIT))).toEqual(CODE);
      expect(classify(names(LIMIT + 1))).toEqual(CODE);
    });

    it('counts previous names toward the limit, because they are lines too', () => {
      const pairs = Array.from({ length: LIMIT / 2 }, (_, i) => [`docs/new-${i}.md`, `docs/old-${i}.md`]).flat();
      expect(classify(pairs)).toEqual(CODE);
    });

    it('does not report guidance for a list that may be cut short', () => {
      expect(classify(['AGENTS.md', ...names(LIMIT)])).toEqual(CODE);
    });
  });
});
