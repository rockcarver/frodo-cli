// Repo Concierge updater.
//
// Deterministic: no LLM. Keeps a deployment on a released version of Repo
// Concierge. When a newer release exists it rebuilds the desired state on ONE
// branch (`concierge/update`, force-pushed, never merged into) and opens or
// updates ONE pull request. Because the branch is rebuilt from the default
// branch every time, lock-file conflicts between update pull requests cannot
// happen, however long one stays open.
//
// What it trusts: only a release's tag, its `release-manifest.json` asset and
// the files at the tag's commit, verified against the manifest's SHA-256
// digests. It downloads data and never runs it. gh-aw is used only to compile
// the definitions, at the version the manifest names.
//
//   node concierge-updater.mjs                      update to the latest release of the pinned channel
//   node concierge-updater.mjs --dry-run            show what would change, touch nothing
//   node concierge-updater.mjs --target v1.2.0      a specific release (also repairs drift on the pinned one)
//   node concierge-updater.mjs --local              write the working tree and compile, no branch, push or PR
//   node concierge-updater.mjs --local --source owner/repo --target v1.0.0   first adoption
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { compareSemver, parseRelatedRepos } from './dependency-watch.mjs';

export const CONFIG_PATH = '.github/concierge.yml';
export const RELATED_PATH = '.github/agentic-workflows/related-repos.md';
export const BRANCH = 'concierge/update';
export const MANIFEST_ASSET = 'release-manifest.json';
const CROSS_REPO_MARKER = /^([ \t]*)# concierge:cross-repo[ \t]*\n/gm;

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const lockOf = (dest) => dest.replace(/\.md$/, '.lock.yml');
const workflowId = (dest) => path.basename(dest, '.md');

// ------------------------------------------------------------------ config

export function parseConfig(text) {
  const c = {};
  for (const line of String(text).split('\n')) {
    const m = line.match(/^(\w+):\s*(\S+)\s*$/);
    if (m) c[m[1]] = m[2];
  }
  if (!c.source || !c.version) throw new Error(`${CONFIG_PATH} needs source and version`);
  return { source: c.source, version: c.version, sha: c.sha || null, channel: c.channel || 'stable' };
}

export function renderConfig({ source, version, sha, channel = 'stable' }) {
  return [
    '# Repo Concierge pin. concierge-updater rewrites version and sha; change channel by hand',
    '# (stable | prerelease). Do not edit the other lines.',
    `source: ${source}`,
    `version: ${version}`,
    `sha: ${sha}`,
    `channel: ${channel}`,
    '',
  ].join('\n');
}

// ---------------------------------------------------------------- releases

/** Highest release for the channel: no drafts, no prereleases unless asked, tags must be semver. */
export function pickRelease(releases, channel = 'stable') {
  const usable = releases.filter(
    (r) => !r.draft && (channel === 'prerelease' || !r.prerelease) && compareSemver(r.tag_name, r.tag_name) !== null
  );
  usable.sort((a, b) => compareSemver(b.tag_name, a.tag_name));
  return usable[0] || null;
}

/** Download a release's manifest and files and verify them. Throws on any mismatch. */
export async function fetchRelease(ctx, source, release) {
  const tag = release.tag_name;
  const sha = await ctx.tagCommit(source, tag);
  const asset = (release.assets || []).find((a) => a.name === MANIFEST_ASSET);
  if (!asset) throw new Error(`release ${tag} has no ${MANIFEST_ASSET}`);
  const manifest = JSON.parse((await ctx.downloadAsset(source, asset)).toString('utf8'));
  if (manifest.schema !== 1) throw new Error(`release ${tag}: unsupported manifest schema ${manifest.schema}`);
  if (manifest.tag !== tag) throw new Error(`release ${tag}: manifest is for ${manifest.tag}`);
  if (manifest.commit !== sha) throw new Error(`release ${tag}: manifest commit ${manifest.commit} is not the commit of the tag (${sha})`);
  const contents = new Map();
  for (const f of manifest.files) {
    if (!f.dest) continue; // reference files are not installed
    const buf = await ctx.file(source, f.path, sha);
    if (sha256(buf) !== f.sha256) throw new Error(`release ${tag}: digest mismatch for ${f.path}`);
    contents.set(f.path, buf);
  }
  return { tag, sha, manifest, contents, notes: release.body || '' };
}

// ------------------------------------------------------ deployment settings

/** One related repository with a secret is supported (a safe output takes one token). */
export function selectRelated(relatedText) {
  const { related } = parseRelatedRepos(relatedText || '');
  const withSecret = related.filter((r) => r.secret);
  const warnings = related
    .filter((r) => !r.secret)
    .map((r) => `${r.repo} names no secret in related-repos.md, so cross-repository writes are not configured for it`);
  if (withSecret.length > 1) {
    throw new Error(
      `related-repos.md has ${withSecret.length} related repositories with secrets (${withSecret.map((r) => r.repo).join(', ')}); the updater supports one`
    );
  }
  return { related: withSecret[0] || null, warnings };
}

/** Replace each `# concierge:cross-repo` marker with the generated settings, or remove it. */
export function applyCrossRepo(text, related) {
  return text.replace(CROSS_REPO_MARKER, (_m, indent) =>
    related
      ? `${indent}github-token: \${{ secrets.${related.secret} }}\n${indent}allowed-repos: ["${related.repo}"]\n`
      : ''
  );
}

/** What a release installs: dest path -> { content, kind }. */
export function buildDesired({ manifest, contents, related }) {
  const out = new Map();
  for (const f of manifest.files) {
    if (!f.dest) continue;
    let content = contents.get(f.path);
    if (f.kind === 'definition') content = Buffer.from(applyCrossRepo(content.toString('utf8'), related));
    out.set(f.dest, { content, kind: f.kind });
  }
  return out;
}

// ------------------------------------------------------------ working tree

const read = (root, rel) => (fs.existsSync(path.join(root, rel)) ? fs.readFileSync(path.join(root, rel)) : null);

/** Compare the desired state with the working tree. `previous` is the state of the pinned release, if known. */
export function planWrites(root, desired, previous) {
  const plan = { added: [], changed: [], unchanged: [], removed: [] };
  for (const [dest, { content }] of desired) {
    const cur = read(root, dest);
    if (cur === null) plan.added.push(dest);
    else if (Buffer.compare(cur, content) !== 0) plan.changed.push(dest);
    else plan.unchanged.push(dest);
  }
  for (const dest of previous ? previous.keys() : []) {
    if (!desired.has(dest) && read(root, dest) !== null) plan.removed.push(dest);
  }
  return plan;
}

/** Managed files that differ from what the pinned release installs: local edits an update would overwrite. */
export function detectDrift(root, previous) {
  const drift = [];
  for (const [dest, { content }] of previous) {
    const cur = read(root, dest);
    if (cur !== null && Buffer.compare(cur, content) !== 0) drift.push(dest);
  }
  return drift;
}

export function applyWrites(root, desired, plan) {
  for (const dest of [...plan.added, ...plan.changed]) {
    const abs = path.join(root, dest);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, desired.get(dest).content);
  }
  for (const dest of plan.removed) {
    fs.rmSync(path.join(root, dest), { force: true });
    if (dest.endsWith('.md')) fs.rmSync(path.join(root, lockOf(dest)), { force: true });
  }
}

// ------------------------------------------------------------------ report

export function missingLabels(existingNames, required) {
  const have = new Set(existingNames);
  return (required || []).filter((l) => !have.has(l.name));
}

export function renderPrBody({ from, to, notes, plan, drift, labels, requires, ghAw, previousGhAw, warnings }) {
  const list = (items) => items.map((f) => `- \`${f}\``).join('\n');
  const out = [`Updates Repo Concierge ${from ? `from ${from} ` : ''}to **${to}**.`];
  if (notes && notes.trim()) out.push('', '## Release notes', '', notes.trim());
  out.push('', '## Changes in this repository', '');
  const rows = [
    ['Added', plan.added],
    ['Changed', plan.changed],
    ['Removed', plan.removed],
  ].filter(([, v]) => v.length);
  if (rows.length) for (const [label, v] of rows) out.push(`**${label}** (${v.length})`, '', list(v), '');
  else out.push('Only the pinned version changes.', '');
  if (ghAw && previousGhAw && ghAw !== previousGhAw) {
    out.push(`Lock files were regenerated with gh-aw ${ghAw} (was ${previousGhAw}); expect churn in every \`.lock.yml\`.`, '');
  }
  if (drift.length) {
    out.push(
      '## Local changes this update overwrites',
      '',
      'These managed files differ from what the pinned release installs. Keep a customization by moving it to `.github/agentic-workflows/` or `related-repos.md`, or reject this update:',
      '',
      list(drift),
      ''
    );
  }
  if (labels.created.length || labels.missing.length) {
    out.push('## Labels', '');
    if (labels.created.length) out.push(`Created ${labels.created.length} missing label(s): ${labels.created.map((l) => `\`${l}\``).join(', ')}.`, '');
    if (labels.missing.length) out.push(`Still missing (dry run): ${labels.missing.map((l) => `\`${l}\``).join(', ')}.`, '');
  }
  if (requires && requires.secrets && requires.secrets.length) {
    out.push(
      '## Secrets this release needs',
      '',
      'The updater cannot see secrets. Check that these exist and have the access described:',
      '',
      ...requires.secrets.map((s) => `- \`${s.name}\`: ${s.purpose}`),
      ''
    );
  }
  if (warnings.length) out.push('## Warnings', '', ...warnings.map((w) => `- ${w}`), '');
  out.push(
    '---',
    `This pull request is rebuilt from scratch on every run of the Concierge updater. Do not push to \`${BRANCH}\`; merge it or close it.`
  );
  return out.join('\n');
}

// -------------------------------------------------------------------- flow

/**
 * One update run. `ctx` supplies everything external (see realContext); `opts`:
 * { root, dryRun, local, target, source }.
 */
export async function run(opts, ctx) {
  const { root } = opts;
  const log = ctx.log || (() => {});
  const warnings = [];
  const cfgText = read(root, CONFIG_PATH);
  const cfg = cfgText ? parseConfig(cfgText.toString('utf8')) : null;
  const source = cfg ? cfg.source : opts.source;
  if (!source) throw new Error(`${CONFIG_PATH} not found; first adoption needs --source (and optionally --target)`);
  const channel = cfg ? cfg.channel : 'stable';

  const releases = await ctx.releases(source);
  const release = opts.target ? releases.find((r) => r.tag_name === opts.target) : pickRelease(releases, channel);
  if (opts.target && !release) throw new Error(`release ${opts.target} not found in ${source}`);
  if (!release) {
    // A pin means that release existed. An empty or unusable list is a bad read
    // (an API incident answered with an empty list once) or a deleted release;
    // reporting it as a clean "no release" would hide the failure.
    if (cfg) throw new Error(`no ${channel} release of ${source} found, but ${cfg.version} is pinned; the release list may be unavailable or the release was removed`);
    log(`no ${channel} release of ${source} yet`);
    return { status: 'no-release' };
  }
  if (cfg && compareSemver(cfg.version, cfg.version) === null) throw new Error(`pinned version ${cfg.version} in ${CONFIG_PATH} is not a semver tag`);
  if (cfg && !opts.target && compareSemver(release.tag_name, cfg.version) <= 0) {
    log(`up to date at ${cfg.version} (latest ${channel} release is ${release.tag_name})`);
    return { status: 'up-to-date', version: cfg.version };
  }

  const target = await fetchRelease(ctx, source, release);
  let previous = null;
  if (cfg) {
    const prevRelease = releases.find((r) => r.tag_name === cfg.version);
    try {
      if (!prevRelease) throw new Error(`release ${cfg.version} no longer exists`);
      previous = await fetchRelease(ctx, source, prevRelease);
    } catch (e) {
      warnings.push(`cannot compare with the pinned release ${cfg.version} (${e.message}); local changes are not reported`);
    }
  }

  const relatedText = read(root, RELATED_PATH);
  const { related, warnings: relatedWarnings } = selectRelated(relatedText && relatedText.toString('utf8'));
  warnings.push(...relatedWarnings);
  const desired = buildDesired({ manifest: target.manifest, contents: target.contents, related });
  const prevDesired = previous ? buildDesired({ manifest: previous.manifest, contents: previous.contents, related }) : null;
  const plan = planWrites(root, desired, prevDesired);
  const drift = prevDesired ? detectDrift(root, prevDesired) : [];
  const newCfg = renderConfig({ source, version: target.tag, sha: target.sha, channel });
  const cfgChanged = !cfgText || cfgText.toString('utf8') !== newCfg;
  const changed = plan.added.length + plan.changed.length + plan.removed.length;
  const summary = { status: 'update', from: cfg ? cfg.version : null, to: target.tag, plan, drift, warnings };

  const labelState = { created: [], missing: [] };
  if (!opts.local) {
    const need = missingLabels(await ctx.labels(), target.manifest.requires?.labels || []);
    if (opts.dryRun) labelState.missing = need.map((l) => l.name);
    else
      for (const l of need) {
        await ctx.createLabel(l);
        labelState.created.push(l.name);
      }
  }

  log(`update ${summary.from || '(not installed)'} -> ${target.tag}: ${plan.added.length} added, ${plan.changed.length} changed, ${plan.removed.length} removed, ${drift.length} locally modified`);
  if (opts.dryRun) return summary;
  if (!changed && !cfgChanged) return { ...summary, status: 'no-changes' };

  if (!opts.local) ctx.git(['checkout', '-B', BRANCH]);
  applyWrites(root, desired, plan);
  fs.mkdirSync(path.join(root, path.dirname(CONFIG_PATH)), { recursive: true });
  fs.writeFileSync(path.join(root, CONFIG_PATH), newCfg);

  const definitions = [...desired].filter(([, v]) => v.kind === 'definition').map(([d]) => workflowId(d));
  if (definitions.length) {
    ctx.installGhAw(target.manifest.ghAw.version);
    ctx.compile(definitions);
  }
  if (opts.local) return { ...summary, status: 'written' };

  // The branch starts from a clean checkout of the default branch, so staging
  // .github (workflows, scripts, the pin, gh-aw's actions-lock.json) captures exactly this update.
  ctx.git(['add', '-A', '.github']);
  if (fs.existsSync(path.join(root, '.gitattributes'))) ctx.git(['add', '.gitattributes']);
  const title = `chore: update Repo Concierge ${summary.from ? `${summary.from} → ` : 'to '}${target.tag}`;
  ctx.git(['commit', '-m', `chore: update Repo Concierge to ${target.tag}`]);
  ctx.git(['push', '--force', 'origin', `HEAD:refs/heads/${BRANCH}`]);
  const body = renderPrBody({
    from: summary.from,
    to: target.tag,
    notes: target.notes,
    plan,
    drift,
    labels: labelState,
    requires: target.manifest.requires,
    ghAw: target.manifest.ghAw?.version,
    previousGhAw: previous?.manifest.ghAw?.version,
    warnings,
  });
  const pr = await ctx.upsertPr({ head: BRANCH, title, body });
  log(`pull request ${pr.html_url || pr.number}`);
  return { ...summary, status: 'pull-request', pr };
}

// ------------------------------------------------------- real environment

export function realContext(env = process.env, root = process.cwd()) {
  const repo = env.GITHUB_REPOSITORY;
  const readToken = env.GH_TOKEN || env.GITHUB_TOKEN;
  const writeToken = env.CONCIERGE_TOKEN;
  const call = async (url, { method = 'GET', body, accept, token = readToken } = {}) => {
    const res = await fetch(url.startsWith('http') ? url : `https://api.github.com/${url}`, {
      method,
      headers: {
        Accept: accept || 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${method} ${url}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res;
  };
  const json = async (url, opts) => (await call(url, opts)).json();
  const git = (args) => execFileSync('git', ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=github-actions[bot]@users.noreply.github.com', ...args], { cwd: root, stdio: 'inherit' });
  return {
    log: (m) => console.log(m),
    releases: (source) => json(`repos/${source}/releases?per_page=50`),
    tagCommit: async (source, tag) => {
      const ref = await json(`repos/${source}/git/ref/tags/${encodeURIComponent(tag)}`);
      if (ref.object.type !== 'tag') return ref.object.sha;
      return (await json(`repos/${source}/git/tags/${ref.object.sha}`)).object.sha;
    },
    downloadAsset: async (source, asset) =>
      Buffer.from(await (await call(`repos/${source}/releases/assets/${asset.id}`, { accept: 'application/octet-stream' })).arrayBuffer()),
    file: async (source, p, ref) => {
      const j = await json(`repos/${source}/contents/${p}?ref=${ref}`);
      return Buffer.from(j.content, 'base64');
    },
    labels: async () => {
      const names = [];
      for (let page = 1; ; page++) {
        const batch = await json(`repos/${repo}/labels?per_page=100&page=${page}`);
        names.push(...batch.map((l) => l.name));
        if (batch.length < 100) return names;
      }
    },
    createLabel: (l) => json(`repos/${repo}/labels`, { method: 'POST', body: { name: l.name, color: l.color, description: l.description } }),
    upsertPr: async ({ head, title, body }) => {
      const owner = repo.split('/')[0];
      const open = await json(`repos/${repo}/pulls?state=open&head=${owner}:${head}`, { token: writeToken });
      if (open.length) return json(`repos/${repo}/pulls/${open[0].number}`, { method: 'PATCH', body: { title, body }, token: writeToken });
      const base = (await json(`repos/${repo}`)).default_branch;
      return json(`repos/${repo}/pulls`, { method: 'POST', body: { title, body, head, base }, token: writeToken });
    },
    git,
    installGhAw: (version) => {
      try {
        execFileSync('gh', ['extension', 'remove', 'gh-aw'], { stdio: 'ignore' });
      } catch {
        /* not installed */
      }
      execFileSync('gh', ['extension', 'install', 'github/gh-aw', '--pin', version], { stdio: 'inherit' });
    },
    compile: (names) => execFileSync('gh', ['aw', 'compile', ...names], { cwd: root, stdio: 'inherit' }),
  };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const arg = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
  const opts = {
    root: process.cwd(),
    dryRun: argv.includes('--dry-run'),
    local: argv.includes('--local'),
    target: arg('--target'),
    source: arg('--source'),
  };
  if (!opts.dryRun && !opts.local && !env.CONCIERGE_TOKEN) {
    console.log('CONCIERGE_TOKEN is not set: running as a dry run. Create the token and secret (docs/updater.md) to let the updater open the pull request.');
    opts.dryRun = true;
  }
  try {
    const result = await run(opts, realContext(env, opts.root));
    console.log(`result: ${result.status}`);
    return 0;
  } catch (e) {
    console.error(`::error::${e.message}`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
