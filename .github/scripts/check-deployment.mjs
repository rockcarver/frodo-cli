// Deployment check for Issue Concierge.
//
// Deterministic: no LLM, no network. Verifies that the compiled workflows can
// do what .github/issue-concierge/related-repos.md promises: for every
// related repository that names a secret, the issue worker may create issues
// there and the related-repo closer may comment, label and close there, with
// that secret. Reads the compiled .lock.yml of the issue worker and the text of
// the closer's plain workflow, because they are what runs.
// It cannot tell whether the secret exists or what the token may do; that is a
// manual check (docs/deployment.md).
//
// It also prints notices, never failures, when the repository gives coding
// agents no guidance file (AGENTS.md or .github/copilot-instructions.md) and
// when it keeps no decision records (docs/decisions/, or decisions/ at the
// repository root when docs/ is generated).
//
// It warns, and never fails, about a line of .github/issue-concierge/settings.yml that the Concierge cannot use
// (an unknown setting, a value out of range): the default stays, so nothing stops, but the setting does not do what
// the file says.
import fs from 'node:fs';
import { parseSettings, readSettingsText } from './issue-concierge-settings.mjs';
import { parseRelatedRepos } from './dependency-watch.mjs';
import { CONFIG_DIR, LEGACY_DIR, configPath, plannedMoves, readConfig } from './issue-concierge-paths.mjs';

/** Warnings about the lines of a settings file that cannot be used; `null` when there is no file. */
export function checkSettings(text) {
  return text == null ? [] : parseSettings(text).problems;
}

/**
 * What to tell a repository whose own files are still in the old folder (`.github/agentic-workflows/`). `exists(path)` says
 * whether a file is there. A file only in the old folder is read from there until the update has moved it, so this is a
 * notice; a file in both folders is read from the new one and the old one is ignored, so that is a warning. Neither fails
 * the check in the 2.x releases. In the next major release, which stops reading the old folder, both become errors: a
 * scope.md or guard.md left in the old place would silently stop applying.
 */
export function checkLegacyFolder(exists) {
  const { moves, both } = plannedMoves(exists);
  const name = (m) => m.from.slice(LEGACY_DIR.length + 1);
  return {
    notices: moves.length
      ? [`${moves.map(name).join(', ')} ${moves.length === 1 ? 'is' : 'are'} still in ${LEGACY_DIR}/. The update moves ${moves.length === 1 ? 'it' : 'them'} to ${CONFIG_DIR}/; until then ${moves.length === 1 ? 'it is' : 'they are'} read from there.`]
      : [],
    warnings: both.map((m) => `${name(m)} is in both ${LEGACY_DIR}/ and ${CONFIG_DIR}/. The one in ${CONFIG_DIR}/ is used and the one in ${LEGACY_DIR}/ is ignored: delete it.`),
  };
}

/** Safe outputs a related repository must be reachable through, per compiled workflow. */
export const REQUIREMENTS = [{ file: 'issue-worker.lock.yml', outputs: ['create_issue'] }];

/**
 * The plain workflow that writes to a related repository with the environment the updater generates
 * (`CROSS_REPO` and `CROSS_REPO_TOKEN`, from the `# concierge:cross-repo-env` marker).
 */
export const CLOSER = 'related-repo-closer.yml';
// Both spellings. The delivered workflow keeps the older one until every deployment's updater reads both; a pull request that
// installed a closer with either line still in it came from an updater that does not know the marker.
const CLOSER_MARKERS = ['# issue-concierge:cross-repo-env', '# concierge:cross-repo-env'];

/** The files that tell coding agents how to work on the repository; either one is enough. */
export const GUIDANCE_FILES = ['AGENTS.md', '.github/copilot-instructions.md'];

/**
 * Notices (never errors) about optional files that make the harness work better.
 * `exists` answers whether a path, relative to the repository root, is a file.
 */
export function checkGuidance(exists) {
  if (GUIDANCE_FILES.some((f) => exists(f))) return [];
  return [
    'Coding agents get no repository guidance: neither AGENTS.md nor .github/copilot-instructions.md exists (template: shared/agents.md in the Issue Concierge repository; see docs/deployment.md)',
  ];
}

/**
 * Where a repository keeps its design decisions as records, in the order the gates look for the index:
 * docs/decisions/ first, then decisions/ at the repository root for a repository whose docs/ is generated
 * (docs/multi-phase-design.md, "Decision records").
 */
export const DECISIONS_DIRS = ['docs/decisions', 'decisions'];

/**
 * Notice (never an error) when the repository keeps no decision records.
 * `isDirectory` answers whether a path, relative to the repository root, is a directory.
 */
export function checkDecisions(isDirectory) {
  if (DECISIONS_DIRS.some((d) => isDirectory(d))) return [];
  return [
    'Design decisions are not preserved for contributors and agents: docs/decisions/ (or decisions/ at the repository root when docs/ is generated) does not exist (template: shared/decision-record.md in the Issue Concierge repository; see docs/deployment.md)',
  ];
}

/** Extract the compiled safe-outputs configuration from a .lock.yml, or null. */
export function readSafeOutputsConfig(lockText) {
  const m = String(lockText || '').match(/GH_AW_SAFE_OUTPUTS_CONFIG:\s*("(?:\\.|[^"\\])*")/);
  if (!m) return null;
  try {
    return JSON.parse(JSON.parse(m[1]));
  } catch {
    return null;
  }
}

/** The value of `NAME: value` in a workflow's text, or undefined. */
const envValue = (text, name) => text.match(new RegExp(`^\\s*${name}:\\s*(.+?)\\s*$`, 'm'))?.[1];

/**
 * Compare related-repos.md with the workflows that write to a related repository.
 * `locks` maps a file name (a compiled .lock.yml, or the closer's plain workflow) to its text
 * (missing files are absent).
 */
export function checkDeployment(relatedText, locks) {
  const errors = [];
  const warnings = [];
  const { related } = parseRelatedRepos(relatedText);
  const mentioned = new Set(related.map((r) => r.repo));
  const configs = {};

  for (const { file } of REQUIREMENTS) {
    if (!(file in locks)) continue;
    configs[file] = readSafeOutputsConfig(locks[file]);
    if (!configs[file]) errors.push(`${file}: cannot read the compiled safe-outputs configuration; run gh aw compile`);
  }

  for (const rel of related) {
    if (!rel.secret) {
      warnings.push(
        `${rel.repo}: related-repos.md names no secret, so the issue worker cannot open issues there and the related-repo closer cannot update it`
      );
      continue;
    }
    if (!(CLOSER in locks)) {
      errors.push(`${CLOSER}: not found; ${rel.repo} needs it`);
    } else {
      const text = String(locks[CLOSER]);
      const leftover = CLOSER_MARKERS.find((m) => text.includes(m));
      if (leftover && envValue(text, 'CROSS_REPO') === undefined && envValue(text, 'CROSS_REPO_TOKEN') === undefined) {
        // The update that first installs the closer is made by the updater of the release before, which does not know
        // the marker yet. That is a state to finish, not a mistake: the next run of the updater writes the lines.
        warnings.push(
          `${CLOSER}: still has the ${leftover} marker, so CROSS_REPO and CROSS_REPO_TOKEN were not written: the updater that installed it predates the marker. Run the Concierge updater again (issue-concierge-updater.yml, with target set to the pinned release); until then the closer updates nothing in ${rel.repo}`
        );
      } else {
        if (envValue(text, 'CROSS_REPO') !== rel.repo) {
          errors.push(`${CLOSER}: CROSS_REPO is not ${rel.repo}, so the closer cannot update issues there; run the Concierge updater, which writes it from related-repos.md`);
        }
        if (envValue(text, 'CROSS_REPO_TOKEN') !== `\${{ secrets.${rel.secret} }}`) {
          errors.push(`${CLOSER}: CROSS_REPO_TOKEN does not use the secret ${rel.secret}; run the Concierge updater, which writes it from related-repos.md`);
        }
      }
    }
    const token = '${GH_AW_SECRET_' + rel.secret + '}';
    for (const { file, outputs } of REQUIREMENTS) {
      if (!(file in locks)) {
        errors.push(`${file}: not found; ${rel.repo} needs it`);
        continue;
      }
      const config = configs[file];
      if (!config) continue;
      for (const output of outputs) {
        const out = config[output];
        const name = output.replace(/_/g, '-');
        if (!out) {
          errors.push(`${file}: safe output ${name} is not enabled, so it cannot act in ${rel.repo}`);
          continue;
        }
        if (!(out.allowed_repos || []).includes(rel.repo)) {
          errors.push(
            `${file}: ${name} does not allow ${rel.repo}; add allowed-repos: ["${rel.repo}"] and recompile (without it the safe output only targets this repository)`
          );
        }
        if (out['github-token'] !== token) {
          errors.push(
            `${file}: ${name} does not use the secret ${rel.secret}; set github-token: \${{ secrets.${rel.secret} }} and recompile`
          );
        }
      }
    }
  }

  for (const [file, config] of Object.entries(configs)) {
    for (const [output, out] of Object.entries(config || {})) {
      for (const repo of (out && out.allowed_repos) || []) {
        if (!mentioned.has(repo)) {
          warnings.push(`${file}: ${output.replace(/_/g, '-')} allows ${repo}, which related-repos.md does not list`);
        }
      }
    }
  }
  return { errors, warnings };
}

const isFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

const isDirectory = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

export function main(cwd = process.cwd()) {
  for (const notice of checkGuidance((f) => isFile(`${cwd}/${f}`))) console.log(`::notice::${notice}`);
  for (const notice of checkDecisions((d) => isDirectory(`${cwd}/${d}`))) console.log(`::notice::${notice}`);
  const readFile = (p) => (isFile(`${cwd}/${p}`) ? fs.readFileSync(`${cwd}/${p}`, 'utf8') : null);
  const legacy = checkLegacyFolder((p) => isFile(`${cwd}/${p}`));
  for (const notice of legacy.notices) console.log(`::notice::${notice}`);
  for (const warning of legacy.warnings) console.log(`::warning::${warning}`);
  for (const problem of checkSettings(readSettingsText(readFile))) console.log(`::warning::${problem}`);
  const related = readConfig('related-repos.md', readFile);
  if (related.value === null) {
    console.log(`No ${configPath('related-repos.md')}: nothing to check.`);
    return 0;
  }
  const locks = {};
  for (const file of [...REQUIREMENTS.map((r) => r.file), CLOSER]) {
    const p = `${cwd}/.github/workflows/${file}`;
    if (fs.existsSync(p)) locks[file] = fs.readFileSync(p, 'utf8');
  }
  const { errors, warnings } = checkDeployment(related.value, locks);
  for (const w of warnings) console.log(`::warning::${w}`);
  for (const e of errors) console.log(`::error::${e}`);
  console.log(`${errors.length} error(s), ${warnings.length} warning(s)`);
  return errors.length ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
