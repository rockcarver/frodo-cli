import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import {
  changelogProblems,
  formatProblems,
  isReleaseCommit,
  matchesPaths,
  RELEASE_FILES,
  RULES,
  workflowError,
} from '../../tools/pull-request-rules.mjs';

/**
 * The rule that a pull request leaves CHANGELOG.md alone
 * (tools/pull-request-rules.mjs decides, tools/check-pull-request.mjs reads git
 * and the pull request event; `npm run check` runs it and so does the `Lint`
 * step of the required `Build` job, see docs/PIPELINE.md).
 *
 * The first half tests the pure functions. The second half runs the real
 * runner as a child process in a throw-away git repository, with a fake event
 * file, a fresh HOME and no global git configuration: git is the thing that is
 * easy to get subtly wrong (two-dot against three-dot, renames, a clone that
 * lacks the base commit). Nothing here talks to GitHub or touches a real
 * repository.
 */

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const RUNNER = path.join(ROOT, 'tools/check-pull-request.mjs');
const RELEASE = 'Updated changelog and version for release v5.0.0-30 [skip ci]';

describe('isReleaseCommit', () => {
  it('accepts the commit the Release job makes, with or without [skip ci]', () => {
    for (const subject of [
      RELEASE,
      'Updated changelog and version for release v5.0.0-30',
      'Updated changelog and version for release v4.18.0',
      'Updated changelog for release v4.17.0',
    ]) {
      expect(
        isReleaseCommit({ subject, files: ['CHANGELOG.md', 'package.json'] })
      ).toBe(true);
    }
  });

  it('accepts all three release files together and each of them alone', () => {
    expect(isReleaseCommit({ subject: RELEASE, files: RELEASE_FILES })).toBe(
      true
    );
    expect(RELEASE_FILES).toHaveLength(3);
    for (const file of RELEASE_FILES) {
      expect(isReleaseCommit({ subject: RELEASE, files: [file] })).toBe(true);
    }
  });

  it('rejects a feature subject, even when it only changes the release files', () => {
    expect(
      isReleaseCommit({ subject: 'feat: x', files: ['CHANGELOG.md'] })
    ).toBe(false);
  });

  it('rejects the release subject when the commit also changes any other file', () => {
    for (const other of [
      'src/a.ts',
      'src/index.ts',
      'docs/x.html',
      'MIGRATION.md',
    ]) {
      expect(
        isReleaseCommit({ subject: RELEASE, files: ['CHANGELOG.md', other] })
      ).toBe(false);
    }
  });

  it('rejects a file that merely starts with the name of a release file', () => {
    for (const near of [
      'CHANGELOG.md.bak',
      'package.json.bak',
      'package.json.js',
      'package.jsonx',
      'package-lock.jsonx',
      'package-lock.json.orig',
      'CHANGELOG.mdx',
      'docs/package.json',
    ]) {
      expect(isReleaseCommit({ subject: RELEASE, files: [near] })).toBe(false);
      expect(
        isReleaseCommit({ subject: RELEASE, files: ['CHANGELOG.md', near] })
      ).toBe(false);
    }
  });

  it('rejects a subject with text after the version or before the first word', () => {
    for (const subject of [
      `${RELEASE} and more`,
      'Updated changelog and version for release v5.0.0-30 [skip ci] extra',
      `fix: ${RELEASE}`,
      'Updated changelog and version for release 5.0.0-30',
      'Updated changelog and version for release v5',
      'Updated changelog and version for release',
      'Update changelog and version for release v5.0.0-30',
    ]) {
      expect(isReleaseCommit({ subject, files: ['CHANGELOG.md'] })).toBe(false);
    }
  });

  it('rejects a commit that lists no files and a missing subject', () => {
    expect(isReleaseCommit({ subject: RELEASE, files: [] })).toBe(false);
    expect(
      isReleaseCommit({ subject: undefined, files: ['CHANGELOG.md'] })
    ).toBe(false);
  });

  it('never looks at who wrote the commit', () => {
    const bot = 'github-actions[bot]';
    for (const who of [
      { author: bot },
      { authorName: bot },
      { author: { name: bot } },
      { committer: bot },
    ]) {
      expect(
        isReleaseCommit({ ...who, subject: 'feat: x', files: ['CHANGELOG.md'] })
      ).toBe(false);
      expect(
        isReleaseCommit({
          ...who,
          subject: RELEASE,
          files: ['CHANGELOG.md', 'src/index.ts'],
        })
      ).toBe(false);
    }
  });
});

describe('matchesPaths', () => {
  it('matches a file by its whole name', () => {
    expect(matchesPaths('CHANGELOG.md', ['CHANGELOG.md'])).toBe(true);
    expect(matchesPaths('CHANGELOG.md.orig', ['CHANGELOG.md'])).toBe(false);
    expect(matchesPaths('docs/CHANGELOG.md', ['CHANGELOG.md'])).toBe(false);
    expect(matchesPaths('CHANGELOG.md', [])).toBe(false);
  });

  it('matches everything below a folder, and only that folder', () => {
    expect(matchesPaths('docs/a/b.html', ['docs/'])).toBe(true);
    expect(matchesPaths('docs-old/a.html', ['docs/'])).toBe(false);
    expect(matchesPaths('src/docs/a.html', ['docs/'])).toBe(false);
    expect(matchesPaths('docs', ['docs/'])).toBe(false);
  });

  it('matches when any of the paths does', () => {
    expect(matchesPaths('docs/a.html', ['CHANGELOG.md', 'docs/'])).toBe(true);
  });
});

describe('changelogProblems', () => {
  const feature = {
    sha: 'f'.repeat(40),
    subject: 'feat: add a command and its changelog entry',
    files: ['CHANGELOG.md', 'src/cli/a.ts'],
  };
  const release = {
    sha: 'a'.repeat(40),
    subject: RELEASE,
    files: ['CHANGELOG.md', 'package.json', 'package-lock.json'],
  };

  it('has nothing to say when the net result is clean, whatever the commits did', () => {
    expect(changelogProblems({ netChanged: false, commits: [] })).toEqual([]);
    expect(
      changelogProblems({ netChanged: false, commits: [feature] })
    ).toEqual([]);
  });

  it('has nothing to say when every commit that touches the file is a release commit', () => {
    expect(changelogProblems({ netChanged: true, commits: [release] })).toEqual(
      []
    );
  });

  it('names the sha and the subject of a feature commit', () => {
    expect(changelogProblems({ netChanged: true, commits: [feature] })).toEqual(
      [{ rule: 'changelog', sha: feature.sha, subject: feature.subject }]
    );
  });

  it('names only the commits that are not release commits', () => {
    const problems = changelogProblems({
      netChanged: true,
      commits: [release, feature],
    });
    expect(problems.map((problem) => problem.sha)).toEqual([feature.sha]);
  });

  it('gives one problem per commit', () => {
    const second = { ...feature, sha: 'e'.repeat(40), subject: 'docs: more' };
    expect(
      changelogProblems({ netChanged: true, commits: [feature, second] })
    ).toHaveLength(2);
  });

  it('does not exempt a commit by the name of its author', () => {
    const bot = 'github-actions[bot]';
    for (const who of [
      { author: bot },
      { authorName: bot },
      { author: { name: bot } },
      { committer: bot },
    ]) {
      expect(
        changelogProblems({
          netChanged: true,
          commits: [{ ...feature, ...who }],
        })
      ).toHaveLength(1);
    }
  });

  it('fails closed when the file changed and no commit explains it', () => {
    const problems = changelogProblems({ netChanged: true, commits: [] });
    expect(problems).toHaveLength(1);
    expect(problems[0].sha).toBe('');
    expect(problems[0].subject).toMatch(/merge commit/);
  });

  it('names an uncommitted change, with or without a clean net result', () => {
    const only = changelogProblems({
      netChanged: false,
      commits: [],
      uncommitted: true,
    });
    expect(only).toHaveLength(1);
    expect(only[0].sha).toBe('');
    expect(only[0].subject).toMatch(/uncommitted/);
    // a release commit is no excuse for an edit that is not committed yet
    expect(
      changelogProblems({
        netChanged: true,
        commits: [release],
        uncommitted: true,
      })
    ).toEqual(only);
    // and it is one more problem beside the commits
    expect(
      changelogProblems({
        netChanged: true,
        commits: [feature],
        uncommitted: true,
      })
    ).toHaveLength(2);
  });

  it('says nothing about uncommitted changes unless it is told of them', () => {
    expect(
      changelogProblems({ netChanged: false, commits: [], uncommitted: false })
    ).toEqual([]);
    expect(changelogProblems({ netChanged: false, commits: [] })).toEqual([]);
  });
});

describe('the message for the contributor', () => {
  const problems = [
    {
      rule: 'changelog',
      sha: '0123456789abcdef0123456789abcdef01234567',
      subject: 'feat: add a command',
    },
  ];
  const text = formatProblems(problems, { mergeBase: 'abc123456' });

  it('says what to do and where the rule is written', () => {
    expect(text).toContain('CHANGELOG.md');
    expect(text).toContain('release pipeline');
    expect(text).toContain('title and description');
    expect(text).toContain('git checkout abc123456 -- CHANGELOG.md');
    expect(text).toContain('AGENTS.md');
    expect(text).toContain('docs/PIPELINE.md');
    expect(text).toContain('"Pull request rules"');
  });

  it('does not spell out how the one exemption is passed', () => {
    // whoever is blocked reads this text, and an agent would follow it as a recipe
    expect(text).not.toMatch(/Updated changelog/i);
    expect(text).not.toContain('[skip ci]');
    expect(text).not.toContain('package.json');
    expect(text).not.toContain('package-lock.json');
    expect(text).not.toMatch(/release commit/i);
  });

  it('names the commit and the uncommitted change', () => {
    expect(text).toContain('012345678 feat: add a command');
    const both = formatProblems(
      [
        ...problems,
        { rule: 'changelog', sha: '', subject: 'an uncommitted change' },
      ],
      { mergeBase: 'abc123456' }
    );
    expect(both).toContain('(an uncommitted change)');
  });

  it('is empty when nothing is wrong', () => {
    expect(formatProblems([], { mergeBase: 'abc123456' })).toBe('');
  });

  it('has no mention and no session link', () => {
    expect(text).not.toMatch(/@/);
    expect(text).not.toMatch(/claude\.ai|session/i);
    for (const rule of RULES) {
      expect(rule.summary).not.toMatch(/@/);
      expect(rule.summary.split('\n')).toHaveLength(1);
    }
  });

  it('writes a workflow command whose parts cannot end it early', () => {
    expect(workflowError('Pull request rule changelog', 'one line')).toBe(
      '::error title=Pull request rule changelog::one line'
    );
    expect(workflowError('a,b: c%', '100% of\r\ntwo lines')).toBe(
      '::error title=a%2Cb%3A c%25::100%25 of%0D%0Atwo lines'
    );
  });

  it('has one entry per rule, with the files it looks at', () => {
    expect(RULES.map((rule) => rule.id)).toEqual(['changelog']);
    expect(RULES[0].paths).toEqual(['CHANGELOG.md']);
  });
});

const describeIfGit = process.platform === 'win32' ? describe.skip : describe;

describeIfGit('the runner, in a throw-away git repository', () => {
  /** A folder with a space in its name, as on a Windows home folder. */
  let scratch;
  let counter = 0;

  beforeAll(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pull request rules-'));
  });

  afterAll(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  /** Nothing of the real environment: no HOME, no global or system git configuration, no GITHUB_*. */
  function gitEnv(home) {
    return {
      PATH: process.env.PATH ?? '',
      HOME: home,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
      LC_ALL: 'C',
    };
  }

  /** `git` or `node` in a folder; throws with the output when it fails. */
  function run(command, args, { cwd, env, allowFailure = false }) {
    const result = spawnSync(command, args, { cwd, env, encoding: 'utf8' });
    if (result.status !== 0 && !allowFailure) {
      throw new Error(
        `${command} ${args.join(' ')} failed (${result.status}): ${result.stderr}${result.stdout}`
      );
    }
    return result;
  }

  function makeRepo(label, { from } = {}) {
    counter += 1;
    const id = `${label}-${counter}`;
    const home = path.join(scratch, `home ${id}`);
    const dir = path.join(scratch, `repo ${id}`);
    fs.mkdirSync(home, { recursive: true });
    const repo = {
      dir,
      home,
      author: 'Guard',
      git(...args) {
        const identity = [
          '-c',
          `user.name=${repo.author}`,
          '-c',
          'user.email=',
        ];
        return run('git', [...identity, ...args], {
          cwd: dir,
          env: gitEnv(home),
        }).stdout.trim();
      },
      write(file, text) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), text);
      },
      /** Writes the files, commits everything, returns the sha. */
      commit(subject, files = {}) {
        for (const [file, text] of Object.entries(files)) {
          repo.write(file, text);
        }
        repo.git('add', '--all');
        repo.git('commit', '-q', '-m', subject);
        return repo.git('rev-parse', 'HEAD');
      },
      head() {
        return repo.git('rev-parse', 'HEAD');
      },
      url: pathToFileURL(dir).href,
    };
    if (from) {
      run('git', ['clone', '-q', from.url, dir], {
        cwd: scratch,
        env: gitEnv(home),
      });
    } else {
      fs.mkdirSync(dir, { recursive: true });
      repo.git('init', '-q', '-b', 'main');
      repo.git('config', 'uploadpack.allowAnySHA1InWant', 'true');
      repo.commit('chore: start', {
        'CHANGELOG.md': '# Changelog\n\n## Unreleased\n',
        'package.json': '{ "version": "1.0.0" }\n',
        'src/a.ts': 'export const a = 1;\n',
      });
    }
    return repo;
  }

  /** What the Release job pushes to main. */
  function release(repo, version) {
    const author = repo.author;
    repo.author = 'github-actions[bot]';
    const sha = repo.commit(
      `Updated changelog and version for release v${version} [skip ci]`,
      {
        'CHANGELOG.md': `# Changelog\n\n## [v${version}]\n`,
        'package.json': `{ "version": "${version}" }\n`,
      }
    );
    repo.author = author;
    return sha;
  }

  /**
   * Runs the guard in `cwd` (default: the repository). `base` is the base
   * commit of the fake pull_request event; `eventName: ''` runs it with no
   * event, as a developer does. `env` adds environment variables, `eventPath`
   * names the event file instead of writing one.
   */
  function guard(
    repo,
    {
      base,
      cloneUrl = 'file:///no-such-upstream-for-this-test',
      eventName = 'pull_request',
      eventText,
      eventPath,
      env: extraEnv = {},
      cwd = repo.dir,
    } = {}
  ) {
    const env = { ...gitEnv(repo.home), ...extraEnv };
    if (eventName) {
      const eventFile = eventPath ?? path.join(repo.home, 'event.json');
      if (!eventPath) {
        fs.writeFileSync(
          eventFile,
          eventText ??
            JSON.stringify({
              pull_request: {
                base: { sha: base, repo: { clone_url: cloneUrl } },
              },
            })
        );
      }
      env.GITHUB_EVENT_NAME = eventName;
      env.GITHUB_EVENT_PATH = eventFile;
    }
    const result = run(process.execPath, [RUNNER], {
      cwd,
      env,
      allowFailure: true,
    });
    return {
      status: result.status,
      out: result.stdout,
      err: result.stderr,
      all: result.stdout + result.stderr,
    };
  }

  /** A branch from the current main commit. */
  function branch(repo) {
    const start = repo.head();
    repo.git('checkout', '-q', '-b', 'feature');
    return start;
  }

  it('G1: fails a branch that edits CHANGELOG.md, with the message', () => {
    const repo = makeRepo('g1');
    const base = branch(repo);
    const sha = repo.commit('feat: a command and its changelog entry', {
      'CHANGELOG.md': '# Changelog\n\n## Unreleased\n\n- my entry\n',
    });
    const result = guard(repo, { base });
    expect(result.status).toBe(1);
    expect(result.err).toContain('CHANGELOG.md');
    expect(result.err).toContain('title and description');
    expect(result.err).toContain(
      `git checkout ${base.slice(0, 9)} -- CHANGELOG.md`
    );
    expect(result.err).toContain(
      `${sha.slice(0, 9)} feat: a command and its changelog entry`
    );
    // the way through is not spelled out to whoever is blocked
    expect(result.err).toContain('docs/PIPELINE.md');
    expect(result.err).not.toMatch(/Updated changelog/i);
  });

  it('G2: passes a branch that leaves the file alone', () => {
    const repo = makeRepo('g2');
    const base = branch(repo);
    repo.commit('feat: code only', { 'src/a.ts': 'export const a = 2;\n' });
    const result = guard(repo, { base });
    expect(result.status).toBe(0);
    expect(result.out).toContain('ok');
  });

  it('G3: passes a branch that is behind a release commit on main (the two-dot regression)', () => {
    const repo = makeRepo('g3');
    const base = branch(repo);
    repo.commit('feat: code only', { 'src/a.ts': 'export const a = 2;\n' });
    repo.git('checkout', '-q', 'main');
    const tip = release(repo, '1.0.1');
    repo.git('checkout', '-q', 'feature');
    // the precondition: a plain comparison with the new main WOULD list the file
    expect(repo.git('diff', '--name-only', tip, 'HEAD')).toContain(
      'CHANGELOG.md'
    );
    expect(base).not.toBe(tip);
    const result = guard(repo, { base: tip });
    expect(result.status).toBe(0);
  });

  it('G4: passes a branch that has merged main, release commit included', () => {
    const repo = makeRepo('g4');
    branch(repo);
    repo.commit('feat: code only', { 'src/a.ts': 'export const a = 2;\n' });
    repo.git('checkout', '-q', 'main');
    const tip = release(repo, '1.0.1');
    repo.git('checkout', '-q', 'feature');
    repo.git('merge', '-q', '--no-edit', 'main');
    const result = guard(repo, { base: tip });
    expect(result.status).toBe(0);
  });

  it('G5: passes when a later commit reverts the edit (the net change decides)', () => {
    const repo = makeRepo('g5');
    const base = branch(repo);
    repo.commit('feat: an entry', { 'CHANGELOG.md': '# Changelog\n\nentry\n' });
    repo.commit('fix: take the entry out again', {
      'CHANGELOG.md': '# Changelog\n\n## Unreleased\n',
    });
    expect(repo.git('diff', '--name-only', base, 'HEAD')).toBe('');
    const result = guard(repo, { base });
    expect(result.status).toBe(0);
  });

  it('G6: passes a release-shaped commit on a release branch, and fails the same subject with a source file', () => {
    const repo = makeRepo('g6');
    const base = repo.head();
    repo.git('checkout', '-q', '-b', 'release/v1.0.1');
    release(repo, '1.0.1');
    expect(guard(repo, { base }).status).toBe(0);

    const mixed = makeRepo('g6b');
    const mixedBase = mixed.head();
    mixed.git('checkout', '-q', '-b', 'release/v1.0.1');
    mixed.commit('Updated changelog and version for release v1.0.1 [skip ci]', {
      'CHANGELOG.md': '# Changelog\n\n## [v1.0.1]\n',
      'src/index.ts': 'export const index = 3;\n',
    });
    const result = guard(mixed, { base: mixedBase });
    expect(result.status).toBe(1);
    expect(result.err).toContain('CHANGELOG.md');
  });

  it('G7: fails when the file is renamed or deleted', () => {
    const renamed = makeRepo('g7a');
    const renamedBase = branch(renamed);
    renamed.git('mv', 'CHANGELOG.md', 'HISTORY.md');
    renamed.git('commit', '-q', '-m', 'refactor: move the file');
    expect(guard(renamed, { base: renamedBase }).status).toBe(1);

    const deleted = makeRepo('g7b');
    const deletedBase = branch(deleted);
    deleted.git('rm', '-q', 'CHANGELOG.md');
    deleted.git('commit', '-q', '-m', 'chore: remove the file');
    expect(guard(deleted, { base: deletedBase }).status).toBe(1);
  });

  describe('the base commit is not in the clone (a fork that is behind)', () => {
    /** A clone at the first commit of its upstream, whose main has since moved on. */
    function behind(label) {
      const upstream = makeRepo(`${label}-up`);
      const clone = makeRepo(label, { from: upstream });
      const tip = release(upstream, '1.0.1');
      clone.git('checkout', '-q', '-b', 'feature');
      return { upstream, clone, tip };
    }

    it('G8: fetches it from the base repository by its sha and decides', () => {
      const { upstream, clone, tip } = behind('g8a');
      clone.commit('feat: code only', { 'src/a.ts': 'export const a = 2;\n' });
      expect(
        run('git', ['cat-file', '-e', `${tip}^{commit}`], {
          cwd: clone.dir,
          env: gitEnv(clone.home),
          allowFailure: true,
        }).status
      ).not.toBe(0);
      const result = guard(clone, { base: tip, cloneUrl: upstream.url });
      expect(result.status).toBe(0);
      expect(
        run('git', ['cat-file', '-e', `${tip}^{commit}`], {
          cwd: clone.dir,
          env: gitEnv(clone.home),
          allowFailure: true,
        }).status
      ).toBe(0);
    });

    it('G8: decides the other way when that clone edits the file', () => {
      const { upstream, clone, tip } = behind('g8b');
      clone.commit('feat: an entry', {
        'CHANGELOG.md': '# Changelog\n\nmy entry\n',
      });
      const result = guard(clone, { base: tip, cloneUrl: upstream.url });
      expect(result.status).toBe(1);
    });

    it('G8: fails closed (exit 2) when the base repository cannot be reached', () => {
      const { clone, tip } = behind('g8c');
      clone.commit('feat: code only', { 'src/a.ts': 'export const a = 2;\n' });
      const result = guard(clone, {
        base: tip,
        cloneUrl: pathToFileURL(path.join(scratch, 'no such upstream')).href,
      });
      expect(result.status).toBe(2);
      expect(result.err).toContain('cannot fetch the base commit');
    });

    it('G8: fails closed (exit 2) when the event names no repository to fetch from', () => {
      const { clone, tip } = behind('g8d');
      const result = guard(clone, {
        eventText: JSON.stringify({ pull_request: { base: { sha: tip } } }),
      });
      expect(result.status).toBe(2);
    });
  });

  it('fails closed (exit 2) in a pull_request event that has no usable base', () => {
    const repo = makeRepo('open');
    branch(repo);
    expect(guard(repo, { eventText: '{}' }).status).toBe(2);
    expect(guard(repo, { eventText: 'not json' }).status).toBe(2);
    expect(
      guard(repo, {
        eventText: JSON.stringify({ pull_request: { base: { sha: 'main' } } }),
      }).status
    ).toBe(2);
  });

  it('fails closed (exit 2) when the base has no merge base with HEAD', () => {
    const repo = makeRepo('g8e');
    repo.git('checkout', '-q', '--orphan', 'unrelated');
    const unrelated = repo.commit('chore: another history', {
      'README.md': 'x\n',
    });
    repo.git('checkout', '-q', 'main');
    const result = guard(repo, { base: unrelated });
    expect(result.status).toBe(2);
    expect(result.err).toContain('no merge base');
  });

  it('G9: skips and says so on any event that is not a pull request', () => {
    const repo = makeRepo('g9');
    const base = branch(repo);
    repo.commit('feat: an entry', { 'CHANGELOG.md': '# Changelog\n\nentry\n' });
    for (const eventName of ['push', 'workflow_dispatch']) {
      const result = guard(repo, { base, eventName });
      expect(result.status).toBe(0);
      expect(result.out).toContain(
        `a ${eventName} event is not a pull request`
      );
    }
  });

  describe('without an event (a developer at a terminal)', () => {
    it('G10: compares with origin/main when it exists', () => {
      const upstream = makeRepo('g10-up');
      const clone = makeRepo('g10', { from: upstream });
      clone.git('checkout', '-q', '-b', 'feature');
      clone.commit('feat: code only', { 'src/a.ts': 'export const a = 2;\n' });
      expect(guard(clone, { eventName: '' }).status).toBe(0);
      clone.commit('feat: an entry', {
        'CHANGELOG.md': '# Changelog\n\nentry\n',
      });
      const result = guard(clone, { eventName: '' });
      expect(result.status).toBe(1);
      expect(result.err).toContain('CHANGELOG.md');
    });

    it('G10: prints a note and exits 0 when there is no origin/main, or no repository', () => {
      const repo = makeRepo('g10-alone');
      repo.git('checkout', '-q', '-b', 'feature');
      repo.commit('feat: an entry', {
        'CHANGELOG.md': '# Changelog\n\nentry\n',
      });
      const alone = guard(repo, { eventName: '' });
      expect(alone.status).toBe(0);
      expect(alone.out).toContain('no origin/main');

      const plain = path.join(scratch, 'not a repository');
      fs.mkdirSync(plain, { recursive: true });
      const nothing = guard(repo, { eventName: '', cwd: plain });
      expect(nothing.status).toBe(0);
      expect(nothing.out).toContain('no origin/main');
    });
  });

  it('G12: works from a subfolder of the repository', () => {
    const repo = makeRepo('g12');
    const base = branch(repo);
    const sha = repo.commit('feat: an entry', {
      'CHANGELOG.md': '# Changelog\n\nentry\n',
    });
    const result = guard(repo, { base, cwd: path.join(repo.dir, 'src') });
    expect(result.status).toBe(1);
    expect(result.err).toContain(`${sha.slice(0, 9)} feat: an entry`);
  });

  it('G13: does not exempt a commit by the name of its author', () => {
    const repo = makeRepo('g13');
    const base = branch(repo);
    repo.author = 'github-actions[bot]';
    repo.commit('docs: an entry written by a workflow', {
      'CHANGELOG.md': '# Changelog\n\nentry\n',
    });
    expect(guard(repo, { base }).status).toBe(1);
  });

  it('G14: fails closed when only a merge commit changed the file', () => {
    const repo = makeRepo('g14');
    const base = branch(repo);
    repo.commit('feat: code only', { 'src/a.ts': 'export const a = 2;\n' });
    repo.git('checkout', '-q', 'main');
    repo.commit('chore: main moves', { 'README.md': 'x\n' });
    repo.git('checkout', '-q', 'feature');
    repo.git('merge', '-q', '--no-commit', '--no-ff', 'main');
    repo.write('CHANGELOG.md', '# Changelog\n\nadded while merging\n');
    repo.git('add', '--all');
    repo.git('commit', '-q', '-m', 'Merge branch main into feature');
    const result = guard(repo, { base });
    expect(result.status).toBe(1);
    expect(result.err).toContain('merge commit');
  });

  /** A clone of a repository, on a branch, so that origin/main exists (a person at a terminal). */
  function terminalBranch(label) {
    const clone = makeRepo(label, { from: makeRepo(`${label}-upstream`) });
    clone.git('checkout', '-q', '-b', 'feature');
    return clone;
  }

  it('G15: in GitHub Actions a violation prints an annotation, and so does a refusal to decide', () => {
    const repo = makeRepo('g15');
    const base = repo.git('rev-parse', 'HEAD');
    repo.git('checkout', '-q', '-b', 'feature');
    repo.commit('feat: an entry', { 'CHANGELOG.md': '# Changelog\n\nentry\n' });

    const violation = guard(repo, { base, env: { GITHUB_ACTIONS: 'true' } });
    expect(violation.status).toBe(1);
    expect(violation.err).toMatch(
      /^::error title=Pull request rule changelog::CHANGELOG\.md is generated at release time\./m
    );
    // the long text stays in the log, the annotation is one line
    expect(
      violation.err.split('\n').filter((line) => line.startsWith('::error'))
    ).toHaveLength(1);
    expect(guard(repo, { base }).err).not.toContain('::error');

    // a path with a percent sign: the escaping keeps the command in one piece
    const missing = path.join(repo.home, 'event 100%.json');
    const undecided = guard(repo, {
      eventPath: missing,
      env: { GITHUB_ACTIONS: 'true' },
    });
    expect(undecided.status).toBe(2);
    expect(undecided.err).toMatch(
      /^::error title=Pull request rules::cannot decide: cannot read the event file: .*100%25\.json/m
    );
    expect(guard(repo, { eventPath: missing }).err).not.toContain('::error');
  });

  it('G16: at a terminal a change that is staged or edited but not committed counts', () => {
    const clone = terminalBranch('g16');
    clone.commit('feat: code only', { 'src/a.ts': 'export const a = 2;\n' });
    expect(guard(clone, { eventName: '' }).status).toBe(0);

    // edited, not staged
    clone.write('CHANGELOG.md', '# Changelog\n\nentry\n');
    const edited = guard(clone, { eventName: '' });
    expect(edited.status).toBe(1);
    expect(edited.err).toContain('uncommitted change');
    expect(edited.err).toContain('git checkout');

    // staged
    clone.git('add', 'CHANGELOG.md');
    expect(guard(clone, { eventName: '' }).status).toBe(1);

    // undone with the recipe of the message
    clone.git('checkout', 'origin/main', '--', 'CHANGELOG.md');
    expect(guard(clone, { eventName: '' }).status).toBe(0);

    // an uncommitted edit of another file is no business of this rule
    clone.write('src/a.ts', 'export const a = 9;\n');
    expect(guard(clone, { eventName: '' }).status).toBe(0);

    // deleted in the working tree
    fs.rmSync(path.join(clone.dir, 'CHANGELOG.md'));
    expect(guard(clone, { eventName: '' }).status).toBe(1);
  });

  it('G16: in a pull_request event the commit decides, not the working tree', () => {
    const repo = makeRepo('g16b');
    const base = repo.git('rev-parse', 'HEAD');
    repo.git('checkout', '-q', '-b', 'feature');
    repo.commit('feat: code only', { 'src/a.ts': 'export const a = 2;\n' });
    repo.write('CHANGELOG.md', '# Changelog\n\nedited by a build step\n');
    expect(guard(repo, { base }).status).toBe(0);
  });

  it('G17: a root file named HEAD, like the base commit or like a commit, does not confuse git', () => {
    const repo = makeRepo('g17');
    const base = repo.git('rev-parse', 'HEAD');
    repo.git('checkout', '-q', '-b', 'feature');
    const edit = repo.commit('feat: an entry', {
      'CHANGELOG.md': '# Changelog\n\nentry\n',
    });
    repo.commit('chore: odd file names', {
      HEAD: 'x\n',
      [base]: 'x\n',
      [edit]: 'x\n',
    });
    const result = guard(repo, { base });
    expect(result.status).toBe(1);
    expect(result.err).toContain(`${edit.slice(0, 9)} feat: an entry`);

    const clean = makeRepo('g17b');
    const cleanBase = clean.git('rev-parse', 'HEAD');
    clean.git('checkout', '-q', '-b', 'feature');
    clean.commit('chore: odd file names', { HEAD: 'x\n', [cleanBase]: 'x\n' });
    expect(guard(clean, { base: cleanBase }).status).toBe(0);

    // the same at a terminal, which also compares with the working tree
    const local = terminalBranch('g17c');
    local.commit('chore: odd file names', { HEAD: 'x\n' });
    expect(guard(local, { eventName: '' }).status).toBe(0);
  });
});

describe('G11: the guard is wired into the checks that run for every pull request', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
  );
  const workflow = fs.readFileSync(
    path.join(ROOT, '.github/workflows/pipeline.yml'),
    'utf8'
  );

  /** The lines of one job, from its key to the next job. */
  function job(id) {
    const lines = workflow.split('\n');
    const at = lines.findIndex((l) => l === `  ${id}:`);
    if (at < 0) throw new Error(`no job ${id}`);
    const next = lines.findIndex(
      (l, i) => i > at && /^ {2}[a-z][a-z0-9-]*:/.test(l)
    );
    return lines.slice(at, next < 0 ? undefined : next).join('\n');
  }

  it('can be run alone, and `npm run check` ends with it', () => {
    expect(manifest.scripts['check:pull-request']).toBe(
      'node tools/check-pull-request.mjs'
    );
    expect(
      manifest.scripts.check.endsWith(' && npm run check:pull-request')
    ).toBe(true);
  });

  it('runs in the Lint step of the Build job, which has the whole history', () => {
    const build = job('build');
    expect(build).toContain("name: 'Build'");
    expect(build).toMatch(/- name: Lint\n\s+run: npm run check\n/);
    expect(build).toContain('fetch-depth: 0');
    // the job is not conditional on the event: it runs for every pull request, the Test gate needs it
    expect(build).not.toMatch(/^ {4}if:.*(pull_request|event_name)/m);
  });

  it('starts git without a shell, so that it behaves the same on Windows', () => {
    const source = fs.readFileSync(RUNNER, 'utf8');
    expect(source).toContain("execFileSync('git'");
    expect(source).not.toMatch(/\bexec\(|execSync|\bspawn\(|shell\s*:/);
  });
});
