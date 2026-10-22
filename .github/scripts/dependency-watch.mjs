// Dependency watcher for the agentic-workflows harness.
//
// Deterministic: no LLM. Resolves the dependencies an issue declares with
// "Depends on:", "Blocked by:" or "Requires:" lines and resumes the issue's
// gates when every dependency is satisfied. Rules: shared/dependencies.md.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

export const BOT_MARKER = '<!-- dependency-watch -->';
export const LABEL_REQUIRED = 'dependency-required';
export const LABEL_SATISFIED = 'dependency-satisfied';
export const LABEL_GATE = 'issue-worker-ready';

// ---------------------------------------------------------------- parsing

const DECLARATION = /^\s*(?:[-*]\s+)?(?:depends on|blocked by|requires)\s*:\s*(.+)$/gim;
const REFERENCE =
  /https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(?:issues|pull)\/(\d+)|([\w.-]+\/[\w.-]+)#(\d+)|(?<![\w/])#(\d+)/g;

/** Extract declared dependencies from text. Returns [{repo, number}] (repo may be null = this repo). */
export function parseDependencies(text) {
  const found = [];
  for (const line of String(text || '').matchAll(DECLARATION)) {
    for (const m of line[1].matchAll(REFERENCE)) {
      const repo = m[1] || m[3] || null;
      const number = Number(m[2] || m[4] || m[5]);
      found.push({ repo, number });
    }
  }
  return found;
}

/** Minimal parser for the fixed related-repos.md schema. */
export function parseRelatedRepos(text) {
  const out = { this: null, related: [] };
  if (!text) return out;
  const thisMatch = text.match(/^this:\s*(\S+)/m);
  if (thisMatch) out.this = thisMatch[1];
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '');
    if (/^\s*-\s+role:/.test(line)) {
      current = { repo: null, secret: null, requiresConsumerRelease: false, pins: null };
      out.related.push(current);
    } else if (current) {
      let m;
      if ((m = line.match(/^\s+repo:\s*(\S+)/))) current.repo = m[1];
      else if ((m = line.match(/^\s+secret:\s*(\S+)/))) current.secret = m[1];
      else if (/^\s+requires_consumer_release:\s*true\b/.test(line))
        current.requiresConsumerRelease = true;
      else if ((m = line.match(/^\s+pins:\s*["']?([^"'\s]+)["']?/)))
        current.pins = m[1];
    }
  }
  return out;
}

// ----------------------------------------------------------------- semver

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseSemver(v) {
  const m = String(v).match(SEMVER);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] ? m[4].split('.') : [],
  };
}

/** Semver precedence. Returns -1, 0, 1 or null when either side is not semver. */
export function compareSemver(a, b) {
  const x = parseSemver(a);
  const y = parseSemver(b);
  if (!x || !y) return null;
  for (const k of ['major', 'minor', 'patch']) {
    if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  }
  if (!x.pre.length && !y.pre.length) return 0;
  if (!x.pre.length) return 1;
  if (!y.pre.length) return -1;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn) return Number(p) < Number(q) ? -1 : 1;
    if (pn) return -1;
    if (qn) return 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

// ------------------------------------------------------------- resolution

export const STATUS = {
  SATISFIED: 'satisfied',
  UNMERGED: 'unmerged',
  NOT_RELEASED: 'not-released',
  NOT_INSTALLABLE: 'not-installable',
  NOT_PINNED: 'not-pinned',
  PIN_UNREADABLE: 'pin-unreadable',
  CLOSED_UNMERGED: 'closed-unmerged',
  NO_LINKED_CHANGE: 'no-linked-change',
  UNREADABLE: 'unreadable',
  CYCLE: 'cycle',
};

/** Statuses that need a human; the watcher never auto-resumes these. */
export const NEEDS_MAINTAINER = new Set([
  STATUS.CLOSED_UNMERGED,
  STATUS.NO_LINKED_CHANGE,
  STATUS.PIN_UNREADABLE,
  STATUS.CYCLE,
]);

class LookupError extends Error {}

/**
 * Resolve one dependency.
 * ctx: { thisRepo, issueNumber, related (parsed config), api(path)->json|null on 404,
 *        registryHasVersion(pkg, version)->bool, readPinnedVersion(pkg)->string|null }
 * Throws LookupError for transient failures (caller keeps the label).
 */
export async function resolveDependency(dep, ctx) {
  const repo = dep.repo || ctx.thisRepo;
  const number = dep.number;
  if (repo === ctx.thisRepo && number === ctx.issueNumber) return null; // self-reference: ignored

  const issue = await ctx.api(`repos/${repo}/issues/${number}`);
  if (!issue) return { status: STATUS.UNREADABLE };

  const related = ctx.related.related.find((r) => r.repo === repo);
  const needsRelease = !!(related && related.requiresConsumerRelease);

  // Direct two-party cycle: the dependency declares a dependency back on us.
  const back = parseDependencies(issue.body).some(
    (d) => (d.repo || repo) === ctx.thisRepo && d.number === ctx.issueNumber
  );
  if (back) return { status: STATUS.CYCLE };

  let mergeSha = null;
  if (issue.pull_request) {
    const pr = await ctx.api(`repos/${repo}/pulls/${number}`);
    if (!pr) return { status: STATUS.UNREADABLE };
    if (!pr.merged) {
      return {
        status: pr.state === 'closed' ? STATUS.CLOSED_UNMERGED : STATUS.UNMERGED,
      };
    }
    mergeSha = pr.merge_commit_sha;
  } else {
    if (issue.state !== 'closed') return { status: STATUS.UNMERGED };
    if (issue.state_reason === 'not_planned')
      return { status: STATUS.CLOSED_UNMERGED };
    if (!needsRelease) return { status: STATUS.SATISFIED };
    mergeSha = await findClosingCommit(repo, number, ctx);
    if (!mergeSha) return { status: STATUS.NO_LINKED_CHANGE };
  }

  if (!needsRelease) return { status: STATUS.SATISFIED };

  const release = await findReleaseContaining(repo, mergeSha, ctx);
  if (!release) return { status: STATUS.NOT_RELEASED };
  const version = release.tag_name.replace(/^v/, '');

  if (related.pins) {
    if (!(await ctx.registryHasVersion(related.pins, version)))
      return { status: STATUS.NOT_INSTALLABLE, version };
    const pinned = ctx.readPinnedVersion(related.pins);
    if (pinned === null) return { status: STATUS.NOT_PINNED, version };
    const cmp = compareSemver(pinned, version);
    if (cmp === null) return { status: STATUS.PIN_UNREADABLE, version };
    if (cmp < 0) return { status: STATUS.NOT_PINNED, version };
  }
  return { status: STATUS.SATISFIED, version };
}

async function findClosingCommit(repo, number, ctx) {
  const events = (await ctx.api(`repos/${repo}/issues/${number}/timeline?per_page=100`)) || [];
  const closed = [...events].reverse().find((e) => e.event === 'closed' && e.commit_id);
  if (closed) return closed.commit_id;
  for (const e of [...events].reverse()) {
    const src = e.event === 'cross-referenced' && e.source?.issue;
    if (src && src.pull_request) {
      const pr = await ctx.api(
        `repos/${src.repository?.full_name || repo}/pulls/${src.number}`
      );
      if (pr?.merged) return pr.merge_commit_sha;
    }
  }
  return null;
}

/** Oldest release (prereleases included) whose tag contains the commit. */
async function findReleaseContaining(repo, sha, ctx) {
  const releases = (await ctx.api(`repos/${repo}/releases?per_page=100`)) || [];
  const published = releases
    .filter((r) => !r.draft && r.published_at)
    .sort((a, b) => a.published_at.localeCompare(b.published_at));
  for (const r of published) {
    // The compare payload can be very large (file diffs); only the status is needed.
    const cmp = await ctx.api(
      `repos/${repo}/compare/${sha}...${encodeURIComponent(r.tag_name)}?per_page=1`,
      { jq: '{status: .status}' }
    );
    if (cmp && (cmp.status === 'ahead' || cmp.status === 'identical')) return r;
  }
  return null;
}

// ---------------------------------------------------------------- wording

const WORDING = {
  [STATUS.UNMERGED]: (r) => `${r} isn't finished yet.`,
  [STATUS.NOT_RELEASED]: (r) => `${r} has been merged but is not in a release yet.`,
  [STATUS.NOT_INSTALLABLE]: (r) =>
    `${r} is in a release, but that release is not available to install yet.`,
  [STATUS.NOT_PINNED]: (r) =>
    `${r} is in a release, but this project does not use that release yet.`,
  [STATUS.PIN_UNREADABLE]: (r) =>
    `${r} is released, but I can't tell which version this project uses. A maintainer needs to check.`,
  [STATUS.CLOSED_UNMERGED]: (r) =>
    `The work ${r} was closed without being completed. A maintainer needs to decide how to proceed.`,
  [STATUS.NO_LINKED_CHANGE]: (r) =>
    `${r} was closed, but I can't find the change that completed it. A maintainer needs to confirm.`,
  [STATUS.UNREADABLE]: (r) => `I can't read ${r}. Check that the reference is correct.`,
  [STATUS.CYCLE]: (r) =>
    `${r} depends on this issue as well, so neither can start. A maintainer needs to untangle this.`,
};

export function renderComment(results) {
  const lines = results
    .filter((r) => r.status !== STATUS.SATISFIED)
    .map((r) => `- ${WORDING[r.status](r.ref)}`);
  return `${BOT_MARKER}\nThis issue has to wait for the following before work can start:\n\n${lines.join('\n')}`;
}

// -------------------------------------------------------- orchestration

/** Decide what to do with one gated issue. Pure given ctx. */
export async function evaluateIssue(issue, comments, ctx) {
  const text = [issue.body, ...comments.filter((c) => !String(c.body).includes(BOT_MARKER)).map((c) => c.body)].join('\n');
  const deps = parseDependencies(text);
  const results = [];
  const seen = new Set();
  for (const dep of deps) {
    const key = `${dep.repo || ctx.thisRepo}#${dep.number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const res = await resolveDependency(dep, { ...ctx, issueNumber: issue.number });
    if (res) results.push({ ref: key, ...res });
  }
  const waiting = results.filter((r) => r.status !== STATUS.SATISFIED);
  return {
    results,
    satisfied: waiting.length === 0,
    needsMaintainer: waiting.some((r) => NEEDS_MAINTAINER.has(r.status)),
  };
}

// ------------------------------------------------------------------ main

function ghJson(path, token, { method = 'GET', body, jq } = {}) {
  const args = ['api', path, '--method', method];
  if (jq) args.push('--jq', jq);
  if (body) for (const [k, v] of Object.entries(body)) args.push('-f', `${k}=${v}`);
  try {
    const out = execFileSync('gh', args, {
      env: { ...process.env, GH_TOKEN: token },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 256 * 1024 * 1024,
    });
    return out ? JSON.parse(out) : null;
  } catch (e) {
    const msg = String(e.stderr || e.message);
    if (/HTTP 404|HTTP 410/.test(msg)) return null;
    throw new LookupError(msg.trim());
  }
}

function readPinned(pkg) {
  try {
    const j = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    return (
      j.dependencies?.[pkg] ?? j.devDependencies?.[pkg] ?? j.optionalDependencies?.[pkg] ?? null
    );
  } catch {
    return null;
  }
}

async function registryHasVersion(pkg, version) {
  const res = await fetch(`https://registry.npmjs.org/${pkg.replace('/', '%2F')}/${version}`);
  if (res.status === 404) return false;
  if (!res.ok) throw new LookupError(`registry ${res.status}`);
  return true;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const dryRun = argv.includes('--dry-run');
  const issueArg = argv.includes('--issue') ? Number(argv[argv.indexOf('--issue') + 1]) : null;
  const thisRepo = env.GITHUB_REPOSITORY;
  const readToken = env.GH_TOKEN;
  const signalToken = env.SIGNAL_TOKEN || readToken;
  const related = parseRelatedRepos(
    fs.existsSync('.github/agentic-workflows/related-repos.md')
      ? fs.readFileSync('.github/agentic-workflows/related-repos.md', 'utf8')
      : ''
  );
  const ctx = {
    thisRepo,
    related,
    api: async (p, opts) => ghJson(p, readToken, opts),
    registryHasVersion,
    readPinnedVersion: (pkg) => {
      const spec = readPinned(pkg);
      if (spec === null) return null;
      return /^v?\d+\.\d+\.\d+/.test(spec) && parseSemver(spec) ? spec : `range:${spec}`;
    },
  };

  const issues = issueArg
    ? [ghJson(`repos/${thisRepo}/issues/${issueArg}`, readToken)].filter(Boolean)
    : ghJson(`repos/${thisRepo}/issues?labels=${LABEL_REQUIRED}&state=open&per_page=100`, readToken);

  if (issueArg !== null && !Number.isInteger(issueArg)) {
    console.error('--issue needs an issue number');
    process.exit(1);
  }
  for (const issue of issues) {
    if (issue.pull_request) continue;
    // Only issues that are waiting on a dependency are ever touched.
    if (!(issue.labels || []).some((l) => (l.name || l) === LABEL_REQUIRED)) continue;
    try {
      const comments = ghJson(`repos/${thisRepo}/issues/${issue.number}/comments?per_page=100`, readToken) || [];
      const verdict = await evaluateIssue(issue, comments, ctx);
      console.log(`#${issue.number}: ${verdict.satisfied ? 'satisfied' : 'waiting'} ${JSON.stringify(verdict.results)}`);
      if (dryRun) continue;

      if (verdict.satisfied) {
        // Resume. Remove, then re-add the gate label so triage sees a fresh
        // `labeled` event (re-adding an existing label fires nothing).
        const del = (l) => ghJson(`repos/${thisRepo}/issues/${issue.number}/labels/${encodeURIComponent(l)}`, signalToken, { method: 'DELETE' });
        const add = (l) => ghJson(`repos/${thisRepo}/issues/${issue.number}/labels`, signalToken, { method: 'POST', body: { 'labels[]': l } });
        add(LABEL_SATISFIED);
        del(LABEL_REQUIRED);
        del(LABEL_GATE);
        add(LABEL_GATE);
        continue;
      }

      const body = renderComment(verdict.results);
      const existing = comments.find((c) => String(c.body).includes(BOT_MARKER));
      if (!existing) {
        ghJson(`repos/${thisRepo}/issues/${issue.number}/comments`, readToken, { method: 'POST', body: { body } });
      } else if (existing.body !== body) {
        ghJson(`repos/${thisRepo}/issues/comments/${existing.id}`, readToken, { method: 'PATCH', body: { body } });
      }
    } catch (e) {
      // A failed lookup never changes labels; retry on the next run.
      console.log(`#${issue.number}: skipped (${e.message})`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
