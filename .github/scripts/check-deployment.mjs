// Deployment check for Repo Concierge.
//
// Deterministic: no LLM, no network. Verifies that the compiled workflows can
// do what .github/agentic-workflows/related-repos.md promises: for every
// related repository that names a secret, the issue worker may create issues
// there and the related-repo closer may comment, label and close there, with
// that secret. Reads the compiled .lock.yml files, because they are what runs.
// It cannot tell whether the secret exists or what the token may do; that is a
// manual check (docs/deployment.md).
//
// It also prints a notice, never a failure, when the repository gives coding
// agents no guidance file (AGENTS.md or .github/copilot-instructions.md).
import fs from 'node:fs';
import { parseRelatedRepos } from './dependency-watch.mjs';

/** Safe outputs a related repository must be reachable through, per compiled workflow. */
export const REQUIREMENTS = [
  { file: 'issue-worker.lock.yml', outputs: ['create_issue'] },
  { file: 'related-repo-closer.lock.yml', outputs: ['add_comment', 'add_labels', 'close_issue'] },
];

/** The files that tell coding agents how to work on the repository; either one is enough. */
export const GUIDANCE_FILES = ['AGENTS.md', '.github/copilot-instructions.md'];

/**
 * Notices (never errors) about optional files that make the harness work better.
 * `exists` answers whether a path, relative to the repository root, is a file.
 */
export function checkGuidance(exists) {
  if (GUIDANCE_FILES.some((f) => exists(f))) return [];
  return [
    'Coding agents get no repository guidance: neither AGENTS.md nor .github/copilot-instructions.md exists (template: shared/agents.md in the Repo Concierge repository; see docs/deployment.md)',
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

/**
 * Compare related-repos.md with the compiled workflows.
 * `locks` maps a lock file name to its text (missing files are absent).
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

export function main(cwd = process.cwd()) {
  for (const notice of checkGuidance((f) => isFile(`${cwd}/${f}`))) console.log(`::notice::${notice}`);
  const relatedPath = `${cwd}/.github/agentic-workflows/related-repos.md`;
  if (!fs.existsSync(relatedPath)) {
    console.log('No .github/agentic-workflows/related-repos.md: nothing to check.');
    return 0;
  }
  const locks = {};
  for (const { file } of REQUIREMENTS) {
    const p = `${cwd}/.github/workflows/${file}`;
    if (fs.existsSync(p)) locks[file] = fs.readFileSync(p, 'utf8');
  }
  const { errors, warnings } = checkDeployment(fs.readFileSync(relatedPath, 'utf8'), locks);
  for (const w of warnings) console.log(`::warning::${w}`);
  for (const e of errors) console.log(`::error::${e}`);
  console.log(`${errors.length} error(s), ${warnings.length} warning(s)`);
  return errors.length ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
