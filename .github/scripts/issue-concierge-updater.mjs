// Issue Concierge updater.
//
// Deterministic: no LLM. Keeps a deployment on a released version of Issue
// Concierge. When a newer release exists it rebuilds the desired state on ONE
// branch (`issue-concierge/update`, force-pushed, never merged into) and opens or
// updates ONE pull request. Because the branch is rebuilt from the default
// branch every time, lock-file conflicts between update pull requests cannot
// happen, however long one stays open.
//
// What it trusts: only a release's tag, its `release-manifest.json` asset and
// the files at the tag's commit, verified against the manifest's SHA-256
// digests. It downloads data and never runs it. gh-aw is used only to compile
// the definitions, at the version the manifest names.
//
// It also moves what the product used to call something else: the pin file
// `.github/concierge.yml` becomes `.github/issue-concierge.yml`, and the files in
// `.github/agentic-workflows/` move to `.github/issue-concierge/`. They move in the
// update's pull request, or, when the version is already current, in a pull
// request of their own (docs/decisions/0038). Nothing is asked of a person.
//
//   node issue-concierge-updater.mjs                      update to the latest release of the pinned channel
//   node issue-concierge-updater.mjs --dry-run            show what would change, touch nothing
//   node issue-concierge-updater.mjs --target v1.2.0      a specific release (also repairs drift on the pinned one)
//   node issue-concierge-updater.mjs --local              write the working tree and compile, no branch, push or PR
//   node issue-concierge-updater.mjs --local --source owner/repo --target v1.0.0   first adoption
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { compareSemver, parseRelatedRepos } from './dependency-watch.mjs';
import { LEGACY_DIR, LEGACY_PIN_PATH, PIN_PATH, configPath, plannedMoves, readConfig, readPin } from './issue-concierge-paths.mjs';

export const CONFIG_PATH = PIN_PATH;
export const LEGACY_CONFIG_PATH = LEGACY_PIN_PATH;
export const RELATED_PATH = configPath('related-repos.md');
export const BRANCH = 'issue-concierge/update';
// The branch the updater used before the product was named for its kind. A pull request still open from it is closed.
export const LEGACY_BRANCH = 'concierge/update';
export const MOVE_TITLE = "chore: move the Issue Concierge's files to their new places";
export const MANIFEST_ASSET = 'release-manifest.json';
// Both spellings of both markers. The delivered workflow files carry the older one (`# concierge:cross-repo`) until every
// deployment's updater reads both: an update is made by the updater the deployment already has, and one that does not know
// the newer spelling would leave the line in the file and write no CROSS_REPO. The newer spelling is for the release after.
const CROSS_REPO_MARKER = /^([ \t]*)# (?:issue-)?concierge:cross-repo[ \t]*\n/gm;
// The same settings for a plain workflow, as the environment of a step instead of safe-output keys.
const CROSS_REPO_ENV_MARKER = /^([ \t]*)# (?:issue-)?concierge:cross-repo-env[ \t]*\n/gm;

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
    '# Issue Concierge pin. issue-concierge-updater rewrites version and sha; change channel by hand',
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

/**
 * Replace each `# concierge:cross-repo` marker (in a definition) with the generated safe-output settings, and each
 * `# concierge:cross-repo-env` marker (in a plain workflow) with the generated environment, or remove it. A marker with
 * the product's name in front (`# issue-concierge:cross-repo`) is the same marker.
 */
export function applyCrossRepo(text, related) {
  return text
    .replace(CROSS_REPO_MARKER, (_m, indent) =>
      related
        ? `${indent}github-token: \${{ secrets.${related.secret} }}\n${indent}allowed-repos: ["${related.repo}"]\n`
        : ''
    )
    .replace(CROSS_REPO_ENV_MARKER, (_m, indent) =>
      related
        ? `${indent}CROSS_REPO: ${related.repo}\n${indent}CROSS_REPO_TOKEN: \${{ secrets.${related.secret} }}\n`
        : ''
    );
}

/** What a release installs: dest path -> { content, kind }. */
export function buildDesired({ manifest, contents, related }) {
  const out = new Map();
  for (const f of manifest.files) {
    if (!f.dest) continue;
    let content = contents.get(f.path);
    if (f.kind === 'definition' || f.kind === 'workflow') content = Buffer.from(applyCrossRepo(content.toString('utf8'), related));
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

/**
 * Moves the files that the product used to keep elsewhere. `moves` is the output of plannedMoves; a legacy pin is moved
 * by name. Content is not touched, only the place. The old folder is removed when it is left empty.
 */
export function applyMoves(root, moves, { pin = false } = {}) {
  const move = (from, to) => {
    fs.mkdirSync(path.dirname(path.join(root, to)), { recursive: true });
    fs.renameSync(path.join(root, from), path.join(root, to));
  };
  for (const m of moves) move(m.from, m.to);
  if (pin) move(LEGACY_PIN_PATH, PIN_PATH);
  try {
    fs.rmdirSync(path.join(root, LEGACY_DIR));
  } catch {
    /* not there, or not empty: a file the updater does not know stays where it is */
  }
}

/** The warnings for files that exist in both places: the new one is read, the old one is ignored and can be deleted. */
export const bothWarnings = (both) =>
  both.map((b) => `\`${b.from}\` and \`${b.to}\` both exist. The one in the new place is read and the old one is ignored; delete \`${b.from}\` once you have checked that nothing in it is missing from the new one.`);

/** The section of a pull request body that lists what moved. Empty when nothing did. */
export function renderMoved(moves, pin) {
  const all = [...moves.map((m) => [m.from, m.to]), ...(pin ? [[LEGACY_PIN_PATH, PIN_PATH]] : [])];
  if (!all.length) return [];
  return [
    '## Moved',
    '',
    'The Issue Concierge is named for its kind, because more than one kind of concierge may share a repository. It keeps a repository\'s own files in `.github/issue-concierge/` and its pin in `.github/issue-concierge.yml`. This pull request moves what is still in the old places; the content is not changed:',
    '',
    ...all.map(([from, to]) => `- \`${from}\` → \`${to}\``),
    '',
    'Nothing is asked of you. Until the files are moved, the old places are still read.',
    '',
  ];
}

export function missingLabels(existingNames, required) {
  const have = new Set(existingNames);
  return (required || []).filter((l) => !have.has(l.name));
}

export function renderPrBody({ from, to, notes, plan, drift, labels, requires, ghAw, previousGhAw, warnings, moves = [], pinMoved = false }) {
  const list = (items) => items.map((f) => `- \`${f}\``).join('\n');
  const out = [`Updates Issue Concierge ${from ? `from ${from} ` : ''}to **${to}**.`];
  if (notes && notes.trim()) out.push('', '## Release notes', '', notes.trim());
  out.push('', '## Changes in this repository', '');
  const rows = [
    ['Added', plan.added],
    ['Changed', plan.changed],
    ['Removed', plan.removed],
  ].filter(([, v]) => v.length);
  if (rows.length) for (const [label, v] of rows) out.push(`**${label}** (${v.length})`, '', list(v), '');
  else out.push('Only the pinned version changes.', '');
  out.push(...renderMoved(moves, pinMoved));
  if (ghAw && previousGhAw && ghAw !== previousGhAw) {
    out.push(`Lock files were regenerated with gh-aw ${ghAw} (was ${previousGhAw}); expect churn in every \`.lock.yml\`.`, '');
  }
  if (drift.length) {
    out.push(
      '## Local changes this update overwrites',
      '',
      'These managed files differ from what the pinned release installs. Keep a customization by moving it to `.github/issue-concierge/` or `related-repos.md`, or reject this update:',
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
    `This pull request is rebuilt from scratch on every run of the Issue Concierge updater. Do not push to \`${BRANCH}\`; merge it or close it.`
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
  const exists = (p) => fs.existsSync(path.join(root, p));
  const pin = readPin((p) => read(root, p));
  const cfgText = pin.value;
  const cfg = cfgText ? parseConfig(cfgText.toString('utf8')) : null;
  // What the product used to keep elsewhere moves in the next pull request: the files of the folder, and a pin file in the old place.
  const { moves, both } = plannedMoves(exists);
  warnings.push(...bothWarnings(both));
  if (!pin.legacy && exists(LEGACY_PIN_PATH)) warnings.push(`\`${LEGACY_PIN_PATH}\` and \`${PIN_PATH}\` both exist. The one in the new place is read and the old one is ignored; delete \`${LEGACY_PIN_PATH}\`.`);
  const pending = moves.length > 0 || pin.legacy;
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
    if (pending) return moveOnly({ opts, ctx, cfg, warnings, moves, pin, log });
    log(`up to date at ${cfg.version} (latest ${channel} release is ${release.tag_name})`);
    for (const w of warnings) log(`warning: ${w}`);
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

  const relatedText = readConfig('related-repos.md', (p) => read(root, p)).value;
  const { related, warnings: relatedWarnings } = selectRelated(relatedText && relatedText.toString('utf8'));
  warnings.push(...relatedWarnings);
  const desired = buildDesired({ manifest: target.manifest, contents: target.contents, related });
  const prevDesired = previous ? buildDesired({ manifest: previous.manifest, contents: previous.contents, related }) : null;
  const plan = planWrites(root, desired, prevDesired);
  const drift = prevDesired ? detectDrift(root, prevDesired) : [];
  const newCfg = renderConfig({ source, version: target.tag, sha: target.sha, channel });
  const cfgChanged = !cfgText || cfgText.toString('utf8') !== newCfg || pin.legacy;
  const changed = plan.added.length + plan.changed.length + plan.removed.length + moves.length;
  const summary = { status: 'update', from: cfg ? cfg.version : null, to: target.tag, plan, drift, warnings, moves, pinMoved: pin.legacy };

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

  log(`update ${summary.from || '(not installed)'} -> ${target.tag}: ${plan.added.length} added, ${plan.changed.length} changed, ${plan.removed.length} removed, ${moves.length} to move, ${drift.length} locally modified`);
  if (opts.dryRun) return summary;
  if (!changed && !cfgChanged) return { ...summary, status: 'no-changes' };

  if (!opts.local) ctx.git(['checkout', '-B', BRANCH]);
  applyWrites(root, desired, plan);
  applyMoves(root, moves);
  fs.mkdirSync(path.join(root, path.dirname(CONFIG_PATH)), { recursive: true });
  fs.writeFileSync(path.join(root, CONFIG_PATH), newCfg);
  if (pin.legacy) fs.rmSync(path.join(root, LEGACY_PIN_PATH), { force: true });

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
  const title = `chore: update Issue Concierge ${summary.from ? `${summary.from} → ` : 'to '}${target.tag}`;
  ctx.git(['commit', '-m', `chore: update Issue Concierge to ${target.tag}`]);
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
    moves,
    pinMoved: pin.legacy,
  });
  const pr = await ctx.upsertPr({ head: BRANCH, title, body });
  log(`pull request ${pr.html_url || pr.number}`);
  await retireLegacyBranch(ctx, pr, log);
  return { ...summary, status: 'pull-request', pr };
}

/** A pull request still open from the branch the updater used before closes, pointing at the new one. Never fails the update. */
async function retireLegacyBranch(ctx, pr, log) {
  if (!ctx.retireLegacyBranch) return;
  try {
    await ctx.retireLegacyBranch(LEGACY_BRANCH, pr);
  } catch (e) {
    log(`could not retire the old branch ${LEGACY_BRANCH}: ${e.message}`);
  }
}

/**
 * The version is current but files are still in their old places: move them in a pull request of their own, on the same
 * branch as an update, so there is never more than one. The content is not changed, only the place.
 */
async function moveOnly({ opts, ctx, cfg, warnings, moves, pin, log }) {
  const { root } = opts;
  const summary = { status: 'moves', version: cfg.version, moves, pinMoved: pin.legacy, warnings };
  log(`up to date at ${cfg.version}; ${moves.length} file(s)${pin.legacy ? ' and the pin' : ''} are still in their old places`);
  if (opts.dryRun) return summary;
  if (!opts.local) ctx.git(['checkout', '-B', BRANCH]);
  applyMoves(root, moves, { pin: pin.legacy });
  if (opts.local) return { ...summary, status: 'written' };
  ctx.git(['add', '-A', '.github']);
  ctx.git(['commit', '-m', MOVE_TITLE]);
  ctx.git(['push', '--force', 'origin', `HEAD:refs/heads/${BRANCH}`]);
  const body = [
    `Moves what the Issue Concierge keeps in this repository to its new places. The pinned version stays **${cfg.version}**.`,
    '',
    ...renderMoved(moves, pin.legacy),
    ...(warnings.length ? ['## Warnings', '', ...warnings.map((w) => `- ${w}`), ''] : []),
    '---',
    `This pull request is rebuilt from scratch on every run of the Issue Concierge updater. Do not push to \`${BRANCH}\`; merge it or close it.`,
  ].join('\n');
  const pr = await ctx.upsertPr({ head: BRANCH, title: MOVE_TITLE, body });
  log(`pull request ${pr.html_url || pr.number}`);
  await retireLegacyBranch(ctx, pr, log);
  return { ...summary, status: 'pull-request', pr };
}

// ------------------------------------------------------- real environment

export function realContext(env = process.env, root = process.cwd()) {
  const repo = env.GITHUB_REPOSITORY;
  const readToken = env.GH_TOKEN || env.GITHUB_TOKEN;
  // The secret was called CONCIERGE_TOKEN before the product was named for its kind; the old name still works.
  const writeToken = env.ISSUE_CONCIERGE_TOKEN || env.CONCIERGE_TOKEN;
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
    retireLegacyBranch: async (legacy, pr) => {
      const owner = repo.split('/')[0];
      const open = await json(`repos/${repo}/pulls?state=open&head=${owner}:${legacy}`, { token: writeToken });
      for (const old of open) {
        await json(`repos/${repo}/issues/${old.number}/comments`, {
          method: 'POST',
          body: { body: `Replaced by #${pr.number}: the updater now builds its pull request on \`${BRANCH}\`. Closing this one.` },
          token: writeToken,
        });
        await json(`repos/${repo}/pulls/${old.number}`, { method: 'PATCH', body: { state: 'closed' }, token: writeToken });
      }
      try {
        await call(`repos/${repo}/git/refs/heads/${legacy}`, { method: 'DELETE', token: writeToken });
      } catch {
        /* the branch is not there */
      }
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
  if (!opts.dryRun && !opts.local && !env.ISSUE_CONCIERGE_TOKEN && !env.CONCIERGE_TOKEN) {
    console.log('ISSUE_CONCIERGE_TOKEN is not set (the old name, CONCIERGE_TOKEN, still works): running as a dry run. Create the token and secret (docs/updater.md) to let the updater open the pull request.');
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
