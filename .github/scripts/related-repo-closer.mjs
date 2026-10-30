// Related-repo closer for Issue Concierge.
//
// Deterministic: no LLM. A split-repo link has two issues: the ORIGINAL, which the reporter filed,
// and the CANONICAL issue in the repository that holds the work (record 0019). When the canonical
// issue is closed as completed, this updates the original, in the other repository:
//   - if the original's related-repos.md says that a release of ITS repository is needed before
//     the fix reaches the reporter (`release.requires_consumer_release`), the original stays open
//     and gets `waiting-for-release` and a comment;
//   - otherwise it gets a comment and is closed.
// Rules and the reasons for them: docs/multi-phase-design.md, "Split-repo routing"; record 0027.
//
// It used to be a model run. The model was given the closed issue and had to name the original in
// its outputs, and on frodo-lib#806 it named the closed issue itself, so the write to the other
// repository was refused (HTTP 403). Everything this does is decided by data: code decides what
// code can decide (record 0011).
//
// Trust. The closed issue's text is not trusted: the `Reported from` line only names a candidate.
// The candidate must be in this repository's related-repos.md, must carry `related-repo`, and must
// have a comment by `github-actions[bot]` that names this issue, the same proof reporter-notify
// uses. Who opened the canonical issue is not asked: GitHub reports an author's association relative to what the
// reading token can see, and the workflow token does not see a private organization membership, so an issue that
// a maintainer opened looked like a stranger's (frodo-lib#806, found on the first live run). The proof of the link
// is what stops a forged one: a stranger's issue cannot make a comment from the harness name it.
//
// Reads use the workflow token (public repositories only, like reporter-notify). Writes to the
// other repository use CROSS_REPO_TOKEN, which the updater generates from related-repos.md into
// the workflow (`# concierge:cross-repo-env`); without it nothing is written.
//
// What the reporter reads on the original is the resolution of the canonical issue: the text the Waiting for
// Release workflow posted there (copied from the pull request that closed it), or, when that has not been posted
// yet because both workflows start on the same close, the same text read from the pull request
// (scripts/resolution.mjs, record 0029). References like `#12` are qualified, because they name issues of this
// repository and the original lives in another. Without a resolution the comments are the short ones.
//
// Install: copy workflows/related-repo-closer.yml to .github/workflows/related-repo-closer.yml and
// scripts/related-repo-closer.mjs to .github/scripts/related-repo-closer.mjs. It imports
// dependency-watch.mjs, opt-out.mjs, reporter-notify.mjs (which imports janitor.mjs) and resolution.mjs, so install them too.
// An issue that carries `no-auto-processing`, canonical or original, is left alone ("Opting an item out").
import { execFileSync } from 'node:child_process';
import { parseRelatedRepos } from './dependency-watch.mjs';
import { configViaApi } from './issue-concierge-paths.mjs';
import { isOptedOut, optedOutReason } from './opt-out.mjs';
import { ghApi, namesRef, parseLinks } from './reporter-notify.mjs';
import { closingFix, ghGraphql, qualifyRefs, textOfComment } from './resolution.mjs';

export const LABEL_CANONICAL = 'original-in-related-repo';
export const LABEL_ORIGINAL = 'related-repo';
export const LABEL_WAITING = 'waiting-for-release';
export const MARKER = '<!-- related-repo-closer:';
const BOT = 'github-actions[bot]';
const MAX_PAGES = 5;

const lower = (s) => String(s || '').toLowerCase();

/** Every comment of an issue (a few pages at most), or null when GitHub says no. */
export function readComments(api, base) {
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = api(`${base}/comments?per_page=100&page=${page}`);
    if (!r || r.status !== 200 || !Array.isArray(r.data)) return page === 1 ? null : all;
    all.push(...r.data);
    if (r.data.length < 100) break;
  }
  return all;
}

/** The text of a file of a repository through the contents API, or { status } when it cannot be read. */
/** A file of the folder of another repository: { status, text }, from the new folder or else the old one. */
function readConfigFile(api, repo, name) {
  return configViaApi(name, (file) => readFile(api, repo, file)).result;
}

function readFile(api, repo, file) {
  const r = api(`repos/${repo}/contents/${file}`);
  if (!r || r.status !== 200 || !r.data || typeof r.data.content !== 'string') return { status: r ? r.status : 0 };
  return { status: 200, text: Buffer.from(r.data.content, 'base64').toString('utf8') };
}

/**
 * The comments this script writes. The marker names the closed issue, so a second run finds them. `resolution` is the
 * text that tells the reporter how the issue was resolved (empty when there is none): without it the comments are
 * the short ones they have always been.
 */
export function waitingComment(thisRepo, number, originalRepo, resolution = '') {
  const lead = `The fix is in ${thisRepo}#${number}.`;
  const rest = `This stays open until a release of ${originalRepo} pins a ${thisRepo} version that contains that fix.`;
  return `${resolution ? `${lead}\n\n${resolution}\n\n${rest}` : `${lead} ${rest}`}\n\n${MARKER}waiting ${thisRepo}#${number} -->`;
}
export function closingComment(thisRepo, number, resolution = '') {
  const lead = `The work tracked in ${thisRepo}#${number} is complete.`;
  return `${resolution ? `${lead}\n\n${resolution}\n\nClosing this issue.` : `${lead} Closing this issue.`}\n\n${MARKER}closed ${thisRepo}#${number} -->`;
}

/**
 * The text to give the original: what the harness posted on the closed canonical issue, else what the pull request
 * that closed it says (the two workflows start on the same close, so the first may not have posted yet). Returns
 * { text } (empty when there is none, which is fine) or { error } when GitHub could not be asked, in which case the
 * caller writes nothing: an original must not be closed without the explanation because of a failed read.
 */
export async function resolutionFor(issue, ctx) {
  const comments = readComments(ctx.api, `repos/${ctx.thisRepo}/issues/${issue.number}`);
  if (!comments) return { error: `the comments of ${ctx.thisRepo}#${issue.number} could not be read` };
  for (const cm of [...comments].reverse()) {
    if (!cm.user || cm.user.login !== BOT || cm.user.type !== 'Bot') continue;
    const text = textOfComment(cm.body);
    if (text) return { text: qualifyRefs(text, ctx.thisRepo) };
  }
  const fix = await closingFix(issue, ctx);
  if (fix.error) return { error: fix.error };
  return { text: fix.resolution ? qualifyRefs(fix.resolution.text, ctx.thisRepo) : '' };
}

/**
 * The original issue a canonical issue points at, with the proof of the link. The `Reported from` line only names a
 * candidate: it must be in the related repository this deployment is configured for, carry `related-repo`, not be
 * opted out, and have a comment from the harness that names the canonical issue. Shared with route-back.mjs, which
 * needs the same proof before it writes to the other repository. Returns { original } with
 * { repo, number, ref, labels, data, comments }, or { skip: reason }. The original may be open or closed: the caller asks.
 * An opted-out original is refused because the caller would write to it; with `allowOptedOut` the caller only reads it
 * (the status page asks who reported it), and the opt-out says nothing about that.
 */
export function verifyOriginal(issue, ctx, { allowOptedOut = false } = {}) {
  const thisRef = `${ctx.thisRepo}#${issue.number}`;
  if (!ctx.relatedRepo) return { skip: 'no related repository with a secret is configured here' };

  const candidates = parseLinks(issue.body).filter((l) => lower(`${l.owner}/${l.repo}`) === lower(ctx.relatedRepo));
  if (candidates.length === 0) return { skip: `no link to an original issue in ${ctx.relatedRepo}` };

  const verified = [];
  const why = [];
  for (const c of candidates) {
    const repo = `${c.owner}/${c.repo}`;
    const base = `repos/${repo}/issues/${c.number}`;
    const r = ctx.api(base);
    if (!r || r.status !== 200 || !r.data) {
      why.push(`${c.ref} could not be read (HTTP ${r ? r.status : 0})`);
      continue;
    }
    const o = r.data;
    if (o.pull_request) {
      why.push(`${c.ref} is a pull request`);
      continue;
    }
    // A person handles an original that carries the opt-out label: it gets no comment and is not closed.
    if (!allowOptedOut && isOptedOut(o)) {
      why.push(`${c.ref}: ${optedOutReason('issue')}`);
      continue;
    }
    const oLabels = new Set((o.labels || []).map((l) => l.name || l));
    if (!oLabels.has(LABEL_ORIGINAL)) {
      why.push(`${c.ref} does not carry ${LABEL_ORIGINAL}`);
      continue;
    }
    const comments = readComments(ctx.api, base);
    if (!comments) {
      why.push(`the comments of ${c.ref} could not be read`);
      continue;
    }
    // Anyone can write a link; only the harness writes the comment that points back at this issue.
    const pointsBack = comments.some((cm) => cm.user && cm.user.login === BOT && cm.user.type === 'Bot' && namesRef(cm.body, thisRef));
    if (!pointsBack) {
      why.push(`${c.ref} has no comment from the harness that names ${thisRef}`);
      continue;
    }
    verified.push({ repo, number: c.number, ref: c.ref, labels: oLabels, data: o, comments });
  }
  if (verified.length === 0) return { skip: `no original issue confirms this one: ${why.join('; ')}` };
  if (verified.length > 1) return { skip: 'more than one linked original issue: ambiguous' };
  return { original: verified[0] };
}

/**
 * Decide what to do about a closed canonical issue. `issue` is the closed issue (this repository),
 * `ctx.thisRepo` is `owner/repo`, `ctx.relatedRepo` is the related repository the updater generated
 * (or empty), `ctx.api(path)` is a read-only GitHub GET returning { status, data } and never throws.
 * Returns one of
 *   { action: 'skip', reason }                   nothing to do, and nothing wrong
 *   { action: 'error', reason }                  something that should be looked at; nothing was changed
 *   { action: 'waiting' | 'close', original, comments, labelled } what to do to the original
 * where `original` is { repo, number, labels, data } and `comments` its comments.
 */
export function decide(issue, ctx) {
  const skip = (reason) => ({ action: 'skip', reason });
  const error = (reason) => ({ action: 'error', reason });

  if (issue.pull_request) return skip('a pull request');
  if (issue.state !== 'closed') return skip('the issue is not closed');
  if (issue.user && issue.user.type === 'Bot') return skip('opened by a bot');
  if (isOptedOut(issue)) return skip(optedOutReason('issue'));
  const labels = new Set((issue.labels || []).map((l) => l.name || l));
  if (!labels.has(LABEL_CANONICAL)) return skip(`the issue does not carry ${LABEL_CANONICAL}`);
  // A canonical issue closed as not planned or as a duplicate has no fix to wait for, and what the
  // original should say then is a maintainer's call.
  if (issue.state_reason && issue.state_reason !== 'completed') {
    return skip(`closed as ${String(issue.state_reason).replace(/_/g, ' ')}, not as completed: the original is left to a maintainer`);
  }
  const found = verifyOriginal(issue, ctx);
  if (found.skip) return skip(found.skip);
  const original = found.original;
  if (original.data.state !== 'open') return skip(`${original.ref} is already closed`);

  // The original's repository may be on either side of the move of the folder: the new place first, the old one when it is not there.
  const cfg = readConfigFile(ctx.api, original.repo, 'related-repos.md');
  if (cfg.status !== 200) {
    return error(`could not read related-repos.md of ${original.repo} (HTTP ${cfg.status}), so whether it waits for a release is unknown`);
  }
  const entry = parseRelatedRepos(cfg.text).related.find((r) => lower(r.repo) === lower(ctx.thisRepo));
  if (!entry) return skip(`related-repos.md of ${original.repo} does not list ${ctx.thisRepo}`);

  return { action: entry.requiresConsumerRelease ? 'waiting' : 'close', original };
}

/**
 * Do what `decide` found, through the injected write functions. Each step checks first whether it
 * was done already, so a run that stopped half way is finished by the next one. Returns a summary.
 */
export function apply(verdict, issue, ctx) {
  const { original } = verdict;
  const thisRef = `${ctx.thisRepo}#${issue.number}`;
  const did = [];
  const posted = (kind) => original.comments.some((cm) => (cm.body || '').includes(`${MARKER}${kind} ${thisRef} -->`));

  if (verdict.action === 'waiting') {
    if (!original.labels.has(LABEL_WAITING)) {
      if (!ctx.dryRun) ctx.addLabel(original.repo, original.number, LABEL_WAITING);
      did.push(`labelled ${original.ref} ${LABEL_WAITING}`);
    }
    if (!posted('waiting')) {
      if (!ctx.dryRun) ctx.comment(original.repo, original.number, waitingComment(ctx.thisRepo, issue.number, original.repo, ctx.resolution));
      did.push(`commented on ${original.ref}`);
    }
  } else {
    if (!posted('closed')) {
      if (!ctx.dryRun) ctx.comment(original.repo, original.number, closingComment(ctx.thisRepo, issue.number, ctx.resolution));
      did.push(`commented on ${original.ref}`);
    }
    if (!ctx.dryRun) ctx.close(original.repo, original.number);
    did.push(`closed ${original.ref}`);
  }
  return did;
}

/** Write through the gh CLI with the cross-repository token. Throws on an HTTP error, with its text. */
function ghWrite(args, token) {
  return execFileSync('gh', ['api', ...args], {
    env: { ...process.env, GH_TOKEN: token },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const thisRepo = env.GITHUB_REPOSITORY;
  const number = Number(env.ISSUE_NUMBER);
  if (!thisRepo || !Number.isInteger(number) || number <= 0) {
    console.error('GITHUB_REPOSITORY and ISSUE_NUMBER are required');
    return 1;
  }
  const readToken = env.GH_TOKEN;
  const writeToken = env.CROSS_REPO_TOKEN;
  const api = (path) => ghApi(path, readToken);
  const issue = api(`repos/${thisRepo}/issues/${number}`);
  if (issue.status !== 200 || !issue.data) {
    console.log(`::error::#${number}: could not read the issue (HTTP ${issue.status}); nothing changed`);
    return 1;
  }
  const dryRun = argv.includes('--dry-run');
  const ctx = {
    thisRepo,
    relatedRepo: env.CROSS_REPO || '',
    api,
    // for the resolution: the closing event can lag the `closed` webhook by a few seconds
    graphql: (query, variables) => ghGraphql(query, variables, readToken),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    attempts: 6,
    waitMs: 5000,
    resolution: '',
    dryRun,
    addLabel: (repo, n, label) => ghWrite([`repos/${repo}/issues/${n}/labels`, '--method', 'POST', '-f', `labels[]=${label}`], writeToken),
    comment: (repo, n, body) => ghWrite([`repos/${repo}/issues/${n}/comments`, '--method', 'POST', '-f', `body=${body}`], writeToken),
    close: (repo, n) => ghWrite([`repos/${repo}/issues/${n}`, '--method', 'PATCH', '-f', 'state=closed', '-f', 'state_reason=completed'], writeToken),
  };
  if (!dryRun && ctx.relatedRepo && !writeToken) {
    console.log(`::error::${ctx.relatedRepo} is configured but its token (CROSS_REPO_TOKEN) is empty: is the secret set? Nothing changed.`);
    return 1;
  }

  const verdict = decide(issue.data, ctx);
  if (verdict.action === 'skip') {
    console.log(`#${number}: skipped (${verdict.reason})`);
    return 0;
  }
  if (verdict.action === 'error') {
    console.log(`::error::#${number}: ${verdict.reason}. Nothing changed.`);
    return 1;
  }
  const found = await resolutionFor(issue.data, ctx);
  if (found.error) {
    console.log(`::error::#${number}: ${found.error}, so what to tell the original is unknown. Nothing changed.`);
    return 1;
  }
  ctx.resolution = found.text;
  try {
    const did = apply(verdict, issue.data, ctx);
    console.log(`#${number}: ${verdict.action === 'waiting' ? 'waits for a release' : 'closes the original'}${dryRun ? ' (dry run, nothing written)' : ''}: ${did.join(', ') || 'already done'}`);
    return 0;
  } catch (e) {
    console.log(`::error::#${number}: ${String((e.stderr || e.message || e)).trim().split('\n')[0]}`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
