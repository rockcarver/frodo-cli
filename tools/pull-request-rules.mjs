// The rules a pull request must follow, as pure functions: no git, no file
// system, no environment, no console. tools/check-pull-request.mjs reads the
// facts from git and the pull request event and asks these functions what is
// wrong. `npm run check` runs it, so a contributor sees the answer before CI
// does, and the required `Build` check fails a pull request that breaks a rule.
//
// One rule today: CHANGELOG.md is written at release time from the titles and
// descriptions of what merged (the `Generate and promote AI changelog` step of
// .github/workflows/pipeline.yml), never by a pull request. See AGENTS.md and
// docs/CONTRIBUTE.md. Each rule is one entry of RULES, so one can be dropped
// without touching the others.

/**
 * The subject of the commit that the Release job pushes to main, for example
 * `Updated changelog and version for release v5.0.0-30 [skip ci]`. A person who
 * finishes a half-done release by hand through a pull request uses the same
 * subject. Older releases wrote the same line without `and version` and
 * without `[skip ci]`.
 */
export const RELEASE_SUBJECT =
  /^Updated changelog(?: and version)? for release v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?: \[skip ci\])?$/;

/** The only files a release commit changes (`git add` of the Release job). */
export const RELEASE_FILES = [
  'CHANGELOG.md',
  'package.json',
  'package-lock.json',
];

/**
 * Is this commit the release commit? The shape decides, never the author: a
 * name or an e-mail address can be set by anyone, and a pull request opened
 * by a workflow would carry the same name. `files` is every path the commit
 * changes (a rename counts as the old and the new path).
 */
export function isReleaseCommit({ subject, files }) {
  if (typeof subject !== 'string' || !RELEASE_SUBJECT.test(subject)) {
    return false;
  }
  if (!Array.isArray(files) || files.length === 0) {
    return false;
  }
  return files.every((file) => RELEASE_FILES.includes(file));
}

/**
 * Does `file` (a path from the top of the repository, as git prints it) belong
 * to one of `paths`? A path that ends in a slash is a folder, any other is one
 * file; nothing else matches (`CHANGELOG.md.orig` is not `CHANGELOG.md`).
 */
export function matchesPaths(file, paths) {
  return paths.some((path) =>
    path.endsWith('/') ? file.startsWith(path) : file === path
  );
}

/**
 * What is wrong with CHANGELOG.md in this pull request.
 *
 * `netChanged`: the file differs between the merge base and the head (the net
 * result, so an edit that a later commit reverts does not count).
 * `commits`: the non-merge commits of the branch that touch the file, as
 * `{ sha, subject, files }`.
 *
 * Returns one problem per commit that is not a release commit. A net change
 * that no commit explains (a merge commit that resolved a conflict by editing
 * the file) is one problem without a sha: it fails closed.
 */
export function changelogProblems({ netChanged, commits }) {
  if (!netChanged) {
    return [];
  }
  const touching = Array.isArray(commits) ? commits : [];
  if (touching.length === 0) {
    return [
      {
        rule: 'changelog',
        sha: '',
        subject: 'a merge commit or a history rewrite changed the file',
      },
    ];
  }
  return touching
    .filter((commit) => !isReleaseCommit(commit))
    .map(({ sha, subject }) => ({ rule: 'changelog', sha, subject }));
}

/** The text of a violation of the `changelog` rule. */
function changelogMessage({ mergeBase, problems }) {
  const base = mergeBase || '<merge-base>';
  const lines = [
    'This branch changes CHANGELOG.md, and a pull request must leave it alone.',
    '',
    'CHANGELOG.md is generated at release time from the titles and descriptions of what merged. Write a clear pull request title and description instead, and undo the change:',
    `  git checkout ${base} -- CHANGELOG.md`,
    '  git commit -m "chore: leave CHANGELOG.md to the release"',
    '',
    'Commits that change it:',
    ...problems.map(({ sha, subject }) =>
      sha ? `  ${sha.slice(0, 9)} ${subject}` : `  (${subject})`
    ),
    '',
    'The one exception is the release commit: the subject "Updated changelog and version for release v<version>", changing only CHANGELOG.md, package.json and package-lock.json.',
    'The rule is written in AGENTS.md and docs/CONTRIBUTE.md.',
  ];
  return lines.join('\n');
}

/**
 * The rules, in the order they are checked. `paths` are the files a rule looks
 * at (a path that ends in a slash is a folder); the runner asks git for the net
 * change and the commits that touch them. `check` returns the problems,
 * `message` the text for the contributor, `summary` the one line that the
 * pipeline shows as an annotation.
 */
export const RULES = [
  {
    id: 'changelog',
    paths: ['CHANGELOG.md'],
    check: changelogProblems,
    message: changelogMessage,
    summary:
      'CHANGELOG.md is generated at release time. Undo the change and write a clear pull request title and description.',
  },
];

/**
 * The text to print for a list of problems, one block per rule that has any.
 * Empty when there is nothing wrong.
 */
export function formatProblems(problems, { mergeBase } = {}) {
  const blocks = [];
  for (const rule of RULES) {
    const own = problems.filter((problem) => problem.rule === rule.id);
    if (own.length > 0) {
      blocks.push(rule.message({ mergeBase, problems: own }));
    }
  }
  return blocks.join('\n\n');
}
