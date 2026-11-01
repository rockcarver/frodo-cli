import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * How .github/workflows/pipeline.yml uses the classifier (the rules themselves
 * are tested in ClassifyChanges.test.js). The `Detect code changes` step and
 * the `Test gate` step are real bash, so this runs them: the first against a
 * stand-in for the `gh` CLI, the second with every combination of job results
 * that matters. Plus the facts about the file that a ruleset or a record
 * depends on. Nothing here talks to GitHub.
 *
 * Wired in docs/PIPELINE.md ("Detect code changes", "Validate guidance",
 * "Test gate"); core 0012 and core 0016 say why.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORKFLOW = fs.readFileSync(path.join(ROOT, '.github/workflows/pipeline.yml'), 'utf8');
const CLASSIFIER = path.join(ROOT, '.github/scripts/classify-changes.sh');

const describeIfBash = process.platform === 'win32' ? describe.skip : describe;

/** The `run: |` block of the step that follows `marker`, dedented. */
function stepRun(marker) {
  const lines = WORKFLOW.split('\n');
  const at = lines.findIndex((l) => l.includes(marker));
  if (at < 0) throw new Error(`no step with ${marker}`);
  const runAt = lines.findIndex((l, i) => i > at && /^\s+run: \|\s*$/.test(l));
  const indent = lines[runAt].match(/^\s*/)[0].length;
  const body = [];
  for (const line of lines.slice(runAt + 1)) {
    if (line.trim() !== '' && line.match(/^\s*/)[0].length <= indent) break;
    body.push(line.trim() === '' ? '' : line.slice(indent + 2));
  }
  return body.join('\n');
}

/** The lines of one job, from its key to the next job. */
function job(id) {
  const lines = WORKFLOW.split('\n');
  const at = lines.findIndex((l) => l === `  ${id}:`);
  if (at < 0) throw new Error(`no job ${id}`);
  const next = lines.findIndex((l, i) => i > at && /^ {2}[a-z][a-z0-9-]*:/.test(l));
  return lines.slice(at, next < 0 ? undefined : next).join('\n');
}

describe('pipeline.yml facts that rulesets and records rely on', () => {
  it('keeps the required checks under their names', () => {
    expect(job('build')).toContain("name: 'Build'");
    expect(job('test-gate')).toContain("name: 'Test gate'");
    expect(job('linux-x64-binary-release')).toContain('linux-x64-binary-release');
    expect(job('changes')).toContain("name: 'Detect code changes'");
  });

  it('has no paths-ignore on the pull_request trigger (a skipped required check never merges)', () => {
    const on = WORKFLOW.slice(WORKFLOW.indexOf('  pull_request:'), WORKFLOW.indexOf('  push:'));
    expect(on).not.toMatch(/^\s*paths(-ignore)?:/m);
  });

  it('exports both answers of the classifier from the changes job', () => {
    const changes = job('changes');
    expect(changes).toContain('code: ${{ steps.classify.outputs.code }}');
    expect(changes).toContain('guidance: ${{ steps.classify.outputs.guidance }}');
  });

  it('reads the classifier from the base commit of the pull request, not its head', () => {
    const run = stepRun('id: classify');
    expect(run).toContain('classify-changes.sh?ref=${BASE_SHA}');
    expect(job('changes')).toContain('BASE_SHA: ${{ github.event.pull_request.base.sha }}');
    // no checkout of the pull request in this job: its script must not run
    expect(job('changes')).not.toContain('actions/checkout');
  });

  it('runs the guidance job only when no code changed and guidance did, on the PR head', () => {
    const guidance = job('guidance');
    expect(guidance).toContain("name: 'Validate guidance'");
    expect(guidance).toContain('needs: [changes]');
    expect(guidance).toContain(
      "if: needs.changes.outputs.code == 'false' && needs.changes.outputs.guidance == 'true'"
    );
    expect(guidance).toContain('ref: ${{ github.event.pull_request.head.sha }}');
    expect(guidance).toContain('run: npm run test:guidance');
  });

  it('gives the guidance job a read-only token, because it runs the pull request\'s own code', () => {
    expect(job('guidance')).toMatch(/permissions:\n {6}contents: read\n/);
    expect(job('guidance')).not.toContain('write');
    expect(job('guidance')).not.toContain('id-token');
  });

  it('makes the gate wait for the guidance job', () => {
    expect(job('test-gate')).toMatch(/needs: \[build, changes, test, guidance\]/);
    expect(job('test-gate')).toContain('if: ${{ !cancelled() }}');
  });

  it('has the guidance script that the job runs, listing tests that exist', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['test:guidance']).toBe('node tools/run-guidance-tests.mjs');
    const tool = fs.readFileSync(path.join(ROOT, 'tools/run-guidance-tests.mjs'), 'utf8');
    const listed = [...tool.matchAll(/'(test\/[^']+\.test\.js)'/g)].map((m) => m[1]);
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.filter((t) => !fs.existsSync(path.join(ROOT, t)))).toEqual([]);
  });
});

/** The entries of `paths-ignore` under the push trigger (comments left out). */
function pushIgnored() {
  const push = WORKFLOW.slice(WORKFLOW.indexOf('  push:'), WORKFLOW.indexOf('  workflow_dispatch:'));
  return push
    .slice(push.indexOf('paths-ignore:'))
    .split('\n')
    .map((l) => l.match(/^\s+- '(.+)'\s*$/)?.[1])
    .filter(Boolean);
}

/** Whether a `paths-ignore` pattern covers a file, with the two wildcards pipeline.yml uses: `*` stays in a folder, `**` crosses them. */
function ignoredOnPush(file) {
  return pushIgnored().some((pattern) => {
    const wildcards = { '**/': '(?:.*/)?', '**': '.*', '*': '[^/]*' };
    const source = pattern
      .split(/(\*\*\/|\*\*|\*)/)
      .map((part) => wildcards[part] ?? part.replace(/[.+^${}()|[\]\\]/g, '\\$&'))
      .join('');
    return new RegExp(`^${source}$`).test(file);
  });
}

describe('the push trigger of pipeline.yml', () => {
  // What an update of the Issue Concierge changes: the pin, the files of its
  // own folder, the compiled lock data, scripts, workflow sources and locks.
  const CONCIERGE_FILES = [
    '.github/issue-concierge.yml',
    '.github/issue-concierge/related-repos.md',
    '.github/aw/actions-lock.json',
    '.github/scripts/commands.mjs',
    '.github/workflows/commands.yml',
    '.github/workflows/plan-worker.md',
    '.github/workflows/plan-worker.lock.yml',
  ];

  it('does not start the pipeline for a push of the Issue Concierge files alone', () => {
    expect(CONCIERGE_FILES.filter((f) => !ignoredOnPush(f))).toEqual([]);
  });

  it('keeps the earlier entries: documentation and the pipeline itself', () => {
    for (const file of ['docs/PIPELINE.md', 'README.md', 'CODE_OF_CONDUCT.md', '.github/workflows/pipeline.yml']) {
      expect(ignoredOnPush(file)).toBe(true);
    }
  });

  it('still starts it for code, the classifier and files in a deeper folder', () => {
    const mustRun = [
      'package.json',
      'package-lock.json',
      'src/cli/frodo.ts',
      '.github/scripts/classify-changes.sh',
      '.github/workflows/nested/commands.yml',
      '.github/scripts/nested/commands.mjs',
    ];
    expect(mustRun.filter(ignoredOnPush)).toEqual([]);
  });

  describeIfBash('against the classifier', () => {
    function classify(files) {
      const run = spawnSync('bash', [CLASSIFIER], { input: files.map((f) => `${f}\n`).join(''), encoding: 'utf8' });
      return run.stdout.trim().split('\n');
    }

    // The pull request judged these files as not code and skipped its tests; the
    // push may only skip what that judgement allows, or it hides work.
    it('ignores under .github/ only what the classifier calls neither code nor guidance', () => {
      const patterns = pushIgnored().filter((p) => p.startsWith('.github/'));
      expect(patterns.length).toBeGreaterThan(0);
      for (const pattern of patterns) {
        const sample = pattern.replace('**', 'deeper/example').replace('*', 'example');
        expect({ sample, answer: classify([sample]) }).toEqual({ sample, answer: ['code=false', 'guidance=false'] });
      }
    });
  });
});

describeIfBash('Test gate step', () => {
  const script = stepRun('name: Fail if any test matrix leg did not succeed');

  function gate({ build = 'success', changes = 'success', code, guidanceNeeded = 'false', test, guidance }) {
    const values = {
      'needs.build.result': build,
      'needs.changes.result': changes,
      'needs.changes.outputs.code': code,
      'needs.changes.outputs.guidance': guidanceNeeded,
      'needs.test.result': test,
      'needs.guidance.result': guidance,
    };
    const filled = script.replace(/\$\{\{\s*([^}]+?)\s*\}\}/g, (_, expr) => {
      if (!(expr in values)) throw new Error(`the gate uses an expression this test does not set: ${expr}`);
      return values[expr];
    });
    const result = spawnSync('bash', ['-e', '-c', filled], { encoding: 'utf8' });
    return { ok: result.status === 0, out: result.stdout };
  }

  describe('a pull request with code', () => {
    it('passes when the tests passed and the guidance job was skipped', () => {
      expect(gate({ code: 'true', test: 'success', guidance: 'skipped' }).ok).toBe(true);
    });

    it.each(['failure', 'cancelled', 'skipped'])('fails when the tests %s', (test) => {
      expect(gate({ code: 'true', test, guidance: 'skipped' }).ok).toBe(false);
    });

    it('fails when the guidance job ran anyway, because the filter and the job disagree', () => {
      expect(gate({ code: 'true', test: 'success', guidance: 'success' }).ok).toBe(false);
    });
  });

  describe('a pull request without code or guidance files', () => {
    it('passes when the tests and the guidance job were skipped and Build passed', () => {
      expect(gate({ code: 'false', test: 'skipped', guidance: 'skipped' }).ok).toBe(true);
    });

    it.each(['failure', 'skipped', 'cancelled'])('fails when Build %s', (build) => {
      expect(gate({ build, code: 'false', test: 'skipped', guidance: 'skipped' }).ok).toBe(false);
    });

    it('fails when the tests ran although the filter said no code', () => {
      expect(gate({ code: 'false', test: 'success', guidance: 'skipped' }).ok).toBe(false);
    });

    it('fails when the guidance job ran although it was not needed', () => {
      expect(gate({ code: 'false', test: 'skipped', guidance: 'success' }).ok).toBe(false);
    });
  });

  describe('a pull request that only changes guidance files', () => {
    const needed = { code: 'false', guidanceNeeded: 'true', test: 'skipped' };

    it('passes when the guidance job succeeded and Build passed', () => {
      expect(gate({ ...needed, guidance: 'success' }).ok).toBe(true);
    });

    it.each(['failure', 'skipped', 'cancelled'])('fails when the guidance job %s', (guidance) => {
      const { ok, out } = gate({ ...needed, guidance });
      expect(ok).toBe(false);
      expect(out).toContain("Expected guidance result 'success'");
    });

    it('fails when Build did not pass, even if the guidance job did', () => {
      expect(gate({ ...needed, build: 'failure', guidance: 'success' }).ok).toBe(false);
    });
  });

  it('fails when change detection itself failed', () => {
    expect(gate({ changes: 'failure', code: '', test: 'skipped', guidance: 'skipped' }).ok).toBe(false);
  });
});

describeIfBash('Detect code changes step', () => {
  const script = stepRun('id: classify');
  let dir;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'classify-step-'));
    fs.mkdirSync(path.join(dir, 'bin'));
    // A stand-in for `gh`: serves the classifier and the changed files, or fails.
    fs.writeFileSync(
      path.join(dir, 'bin/gh'),
      [
        '#!/usr/bin/env bash',
        'echo "$*" >> "$FAKE_GH_LOG"',
        'case "$*" in',
        '  *contents/.github/scripts/classify-changes.sh*) [ -n "${FAKE_SCRIPT:-}" ] || exit 1; cat "$FAKE_SCRIPT" ;;',
        '  *pulls/*/files*) [ -z "${FAKE_FILES_FAIL:-}" ] || exit 1; printf "%s\\n" "$FAKE_FILES" ;;',
        '  *) echo "unexpected gh call: $*" >&2; exit 2 ;;',
        'esac',
        '',
      ].join('\n'),
      { mode: 0o755 }
    );
    fs.writeFileSync(path.join(dir, 'garbage.sh'), 'echo "code=maybe"\n');
    fs.writeFileSync(path.join(dir, 'half.sh'), 'echo "code=false"\necho "guidance=maybe"\n');
    fs.writeFileSync(path.join(dir, 'fails.sh'), 'echo "code=false"\necho "guidance=false"\nexit 3\n');
  });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  function classify({ event = 'pull_request', files = [], classifier = CLASSIFIER, filesFail = false }) {
    const out = path.join(dir, 'github-output');
    const log = path.join(dir, 'gh-calls');
    fs.writeFileSync(out, '');
    fs.writeFileSync(log, '');
    const result = spawnSync('bash', ['-e', '-c', script], {
      encoding: 'utf8',
      env: {
        PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`,
        GH_TOKEN: 'token',
        EVENT: event,
        PR: '42',
        REPO: 'owner/repo',
        BASE_SHA: '0123abc',
        RUNNER_TEMP: dir,
        GITHUB_OUTPUT: out,
        FAKE_GH_LOG: log,
        FAKE_SCRIPT: classifier ?? '',
        FAKE_FILES: files.join('\n'),
        FAKE_FILES_FAIL: filesFail ? '1' : '',
      },
    });
    const answers = Object.fromEntries(
      fs
        .readFileSync(out, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => l.split('='))
    );
    return { status: result.status, answers, calls: fs.readFileSync(log, 'utf8') };
  }

  const CODE = { code: 'true', guidance: 'false' };

  it('applies the classifier to the changed files of a pull request', () => {
    expect(classify({ files: ['docs/PIPELINE.md'] }).answers).toEqual({ code: 'false', guidance: 'false' });
    expect(classify({ files: ['docs/decisions/0001-x.md'] }).answers).toEqual({ code: 'false', guidance: 'true' });
    expect(classify({ files: ['docs/PIPELINE.md', 'src/app.ts'] }).answers).toEqual(CODE);
  });

  it('asks for the classifier at the base commit, and for the files of the pull request', () => {
    const { calls } = classify({ files: ['docs/PIPELINE.md'] });
    expect(calls).toContain('repos/owner/repo/contents/.github/scripts/classify-changes.sh?ref=0123abc');
    expect(calls).toContain('repos/owner/repo/pulls/42/files');
  });

  it('passes the previous name of a renamed file on', () => {
    const { calls } = classify({ files: ['docs/PIPELINE.md'] });
    expect(calls).toContain('.previous_filename');
  });

  it.each(['push', 'workflow_dispatch', 'release', 'schedule'])('is code for a %s event, without asking GitHub', (event) => {
    const { status, answers, calls } = classify({ event, files: ['docs/PIPELINE.md'] });
    expect(status).toBe(0);
    expect(answers).toEqual(CODE);
    expect(calls).toBe('');
  });

  it('is code when the base commit has no classifier yet', () => {
    expect(classify({ files: ['docs/PIPELINE.md'], classifier: null }).answers).toEqual(CODE);
  });

  it('is code when the list of changed files cannot be read', () => {
    expect(classify({ files: ['docs/PIPELINE.md'], filesFail: true }).answers).toEqual(CODE);
  });

  it.each(['garbage.sh', 'half.sh', 'fails.sh'])('is code when the classifier misbehaves (%s)', (name) => {
    expect(classify({ files: ['docs/PIPELINE.md'], classifier: path.join(dir, name) }).answers).toEqual(CODE);
  });

  it('is code when the pull request lists no files', () => {
    expect(classify({ files: [] }).answers).toEqual(CODE);
  });

  it('always writes both outputs, one line each', () => {
    const { status, answers } = classify({ files: ['AGENTS.md'] });
    expect(status).toBe(0);
    expect(Object.keys(answers)).toEqual(['code', 'guidance']);
  });
});

describeIfBash('tools/run-guidance-tests.mjs', () => {
  const TOOL = path.join(ROOT, 'tools/run-guidance-tests.mjs');
  const listed = [...fs.readFileSync(TOOL, 'utf8').matchAll(/'(test\/[^']+\.test\.js)'/g)].map((m) => m[1]);
  let dir;

  beforeAll(() => {
    // A copy of the tool in a throwaway checkout (the tool finds its root from
    // its own location) and a stand-in for `npx` that records how it is called.
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guidance-tool-'));
    fs.mkdirSync(path.join(dir, 'tools'));
    fs.mkdirSync(path.join(dir, 'bin'));
    fs.copyFileSync(TOOL, path.join(dir, 'tools/run-guidance-tests.mjs'));
    fs.writeFileSync(
      path.join(dir, 'bin/npx'),
      '#!/usr/bin/env bash\necho "$*" > "$FAKE_NPX_LOG"\necho "$NODE_OPTIONS" >> "$FAKE_NPX_LOG"\nexit "${FAKE_NPX_STATUS:-0}"\n',
      { mode: 0o755 }
    );
  });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const runTool = (status = '0') =>
    spawnSync('node', [path.join(dir, 'tools/run-guidance-tests.mjs')], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`,
        FAKE_NPX_LOG: path.join(dir, 'npx-call'),
        FAKE_NPX_STATUS: status,
      },
    });

  const addTests = (names) => {
    for (const t of names) {
      fs.mkdirSync(path.dirname(path.join(dir, t)), { recursive: true });
      fs.writeFileSync(path.join(dir, t), '');
    }
  };

  it('fails, and says which, when a listed test file is missing, without running the others', () => {
    fs.rmSync(path.join(dir, 'test'), { recursive: true, force: true });
    addTests(listed.slice(1));
    const result = runTool();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(listed[0]);
    expect(fs.existsSync(path.join(dir, 'npx-call'))).toBe(false);
  });

  it('runs exactly the listed tests with jest and the settings the suite needs, and passes its status on', () => {
    addTests(listed);
    expect(runTool('0').status).toBe(0);
    const [args, nodeOptions] = fs.readFileSync(path.join(dir, 'npx-call'), 'utf8').split('\n');
    expect(args.split(' ')).toEqual(['jest', '--silent', ...listed]);
    expect(nodeOptions).toContain('--experimental-vm-modules');
    expect(runTool('7').status).toBe(7);
  });

  it('lists the tests that validate decision records and skills', () => {
    expect(listed).toEqual(expect.arrayContaining(['test/unit/DecisionRecords.test.js', 'test/unit/Skills.test.js']));
  });
});

/** The steps of one job, each as its own text (a step starts at `      - `). */
function steps(id) {
  const out = [];
  for (const line of job(id).split('\n')) {
    if (/^ {6}- /.test(line)) out.push([line]);
    else if (out.length) out[out.length - 1].push(line);
  }
  return out.map((s) => s.join('\n'));
}

/** The job ids, in file order. */
function jobIds() {
  const afterJobs = WORKFLOW.slice(WORKFLOW.indexOf('\njobs:\n'));
  return afterJobs
    .split('\n')
    .filter((l) => /^ {2}[a-z][a-z0-9-]*:\s*$/.test(l))
    .map((l) => l.trim().slice(0, -1));
}

describe('pipeline.yml dry run (workflow_dispatch with dry-run = true)', () => {
  it('offers a boolean dry-run input that is off by default', () => {
    const input = WORKFLOW.slice(WORKFLOW.indexOf('      dry-run:'), WORKFLOW.indexOf('# Cancel superseded runs'));
    expect(input).toContain('type: boolean');
    expect(input).toContain('default: false');
  });

  it('pushes, tags and creates a GitHub release only when it is not a dry run', () => {
    const publishes = /git push|git tag|action-gh-release|gh release/;
    const unguarded = [];
    for (const id of jobIds()) {
      const jobGuarded = job(id).split('    steps:')[0].includes('!inputs.dry-run');
      for (const step of steps(id)) {
        if (publishes.test(step) && !jobGuarded && !step.includes('!inputs.dry-run')) {
          unguarded.push(`${id}: ${step.split('\n')[0].trim()}`);
        }
      }
    }
    expect(unguarded).toEqual([]);
  });

  it('hands the flag to the npm publish action, which then publishes nothing', () => {
    const publish = steps('npm-release').find((s) => s.includes('npm-trusted-publish-action'));
    expect(publish).toContain("dry-run: ${{ inputs.dry-run && 'true' || 'false' }}");
  });

  it('skips the Homebrew tap update, because a dry run creates no release zips to read', () => {
    expect(job('homebrew-formula-update')).toContain("if: github.event_name == 'workflow_dispatch' && !inputs.dry-run");
  });

  it('still builds, signs, smoke-tests and runs the release jobs, so the dry run proves them', () => {
    const jobGuard = (id) => job(id).split('    steps:')[0];
    for (const id of [
      'test-live',
      'macos-intel-binary-release',
      'macos-arm64-binary-release',
      'linux-x64-binary-release',
      'linux-arm64-binary-release',
      'windows-x64-binary-release',
      'npm-release',
      'release',
    ]) {
      expect(jobGuard(id)).not.toContain('dry-run');
    }
  });
});

/**
 * The release publishes to npm first and the `Release` job pushes the version
 * commit afterwards. A push to the branch while the tests ran makes that push
 * fail with the package already published (npm refuses a second publish of the
 * version), so the first step of `npm-release` stops the run while nothing is
 * published yet. docs/PIPELINE.md, "Release".
 */
describe('the `npm-release` job', () => {
  const GUARD = 'Refuse to publish when the branch has moved';
  const DISPATCHED = '1111111111111111111111111111111111111111';
  const MOVED = '2222222222222222222222222222222222222222';

  /** The names (or actions) of the steps of a job, in order. */
  function stepNames(id) {
    return job(id)
      .split('\n')
      .filter((l) => /^ {6}- (name|uses): /.test(l))
      .map((l) => l.replace(/^ {6}- (name|uses): /, ''));
  }

  /** Runs the shell of the guard step with a stand-in for the `gh` CLI. */
  function runGuard({ branchAt, apiFails } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-guard-'));
    const calls = path.join(dir, 'calls.txt');
    const stub = apiFails
      ? `#!/bin/sh\necho "$@" >> "${calls}"\necho 'gh: HTTP 502' >&2\nexit 1\n`
      : `#!/bin/sh\necho "$@" >> "${calls}"\necho "${branchAt}"\n`;
    fs.writeFileSync(path.join(dir, 'gh'), stub, { mode: 0o755 });
    const result = spawnSync('bash', ['-c', stepRun(GUARD)], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        GITHUB_REPOSITORY: 'owner/repo',
        DISPATCHED_SHA: DISPATCHED,
        DISPATCHED_REF: 'refs/heads/main',
      },
    });
    const asked = fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8') : '';
    fs.rmSync(dir, { recursive: true, force: true });
    return { ...result, asked };
  }

  it('asks whether the branch has moved, as its first step and before it publishes', () => {
    const names = stepNames('npm-release');
    expect(names[0]).toBe(GUARD);
    expect(names).toContain('Publish package');
    expect(names.indexOf(GUARD)).toBeLessThan(names.indexOf('Publish package'));
  });

  describeIfBash('the guard step', () => {
    it('lets the release go on when the branch is where it was dispatched from', () => {
      const result = runGuard({ branchAt: DISPATCHED });
      expect(result.status).toBe(0);
      expect(result.asked).toContain('repos/owner/repo/git/ref/heads/main');
    });

    it('stops the release when the branch has moved, and says nothing was published', () => {
      const result = runGuard({ branchAt: MOVED });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('::error::');
      expect(result.stdout).toContain(MOVED);
      expect(result.stdout).toContain(DISPATCHED);
      expect(result.stdout).toContain('Nothing was published');
    });

    it('stops the release when the branch cannot be read (it fails closed)', () => {
      const result = runGuard({ apiFails: true });
      expect(result.status).not.toBe(0);
    });
  });
});

/**
 * The audit in the Build job only checks. `npm audit fix` rewrote the
 * lockfile inside the build, the artifact carried it, and the Release job
 * committed it to main, so the locked version of a dependency changed from
 * release to release. docs/PIPELINE.md, "Build".
 */
describe('the `Security Audit` of the `build` job', () => {
  it('checks at the critical level and never fixes', () => {
    // the comment above the step names the command; only a run line counts
    expect(WORKFLOW).not.toMatch(/^\s*run:.*npm audit fix/m);
    const lines = job('build').split('\n');
    const at = lines.findIndex((l) => l.trim() === '- name: Security Audit');
    expect(at).toBeGreaterThan(-1);
    expect(lines[at + 1].replace(/^\s*run:\s*/, '').trim()).toBe('npm audit --audit-level critical');
  });
});
