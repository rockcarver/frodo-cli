// Reporter notify for Issue Concierge.
//
// Deterministic: no LLM. The person who reported the ORIGINAL issue is not a participant of the
// linked (canonical) issue that the issue worker opens in a related repository, so GitHub never
// tells them about it. This posts two kinds of comment that @mention them; being mentioned also
// subscribes them to the thread:
//   - the link notice, once, when the canonical issue is first linked ("Original report: ...");
//   - the request notice, once per request for information, while the issue is `needs-info`.
// Rules and the reasons for them: docs/multi-phase-design.md, "Split-repo routing". Nothing is posted
// for an issue that carries `no-auto-processing`, or whose original does ("Opting an item out").
//
// The login is never taken from text. It is the author of the original issue as GitHub returns
// it, and only after the original issue proves it is the one this issue was opened from: it
// carries `related-repo` and has a comment by `github-actions[bot]` that points back at this
// issue. Issue text is attacker-controlled; a bot comment is not.
import { execFileSync } from 'node:child_process';
import { isCodingAgent } from './janitor.mjs';
import { configViaApi } from './issue-concierge-paths.mjs';
import { isOptedOut, optedOutReason } from './opt-out.mjs';
import { MAINTAINER_ROLES } from './issue-concierge-state.mjs';

export const LABEL_WAITING = 'needs-info';
export const LABEL_LINKED = 'related-repo';
export const MARKER_PREFIX = '<!-- reporter-notify:';
export const LINK_MARKER = `${MARKER_PREFIX}link -->`;
const BOT = 'github-actions[bot]';
// A maintainer of the original repository already follows the work; mentioning them is noise.
const MAINTAINER_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const MAX_LINKS = 3;
const MAX_PAGES = 5;

// The line the issue worker writes: `Reported from owner/repo#123` at the start of a line. The model
// sometimes adds a note after the number ("Reported from rockcarver/frodo-cli#922 (the original report
// ... is there)." on frodo-lib#806), so a note may follow. That costs nothing in safety: the line only
// names a candidate, the login comes from the original issue, and the original must confirm the link.
const LINK_LINE = /^[ \t]*Reported from ([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})#([1-9][0-9]{0,8})[.,;:]?(?:[ \t]+\S.*)?[ \t]*$/gm;

const lower = (s) => String(s || '').toLowerCase();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every distinct `Reported from owner/repo#n` line in the body, at most MAX_LINKS. */
export function parseLinks(body) {
  const seen = new Map();
  for (const m of String(body || '').matchAll(LINK_LINE)) {
    const ref = `${m[1]}/${m[2]}#${m[3]}`;
    if (!seen.has(lower(ref))) seen.set(lower(ref), { owner: m[1], repo: m[2], number: Number(m[3]), ref });
    if (seen.size >= MAX_LINKS) break;
  }
  return [...seen.values()];
}

/** The `repo: owner/name` entries of `.github/issue-concierge/related-repos.md`, lower-cased. */
export function relatedRepos(configText) {
  const out = new Set();
  for (const m of String(configText || '').matchAll(/^\s*(?:-\s*)?repo:\s*([A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+)\s*$/gm)) {
    out.add(lower(m[1]));
  }
  return out;
}

/** True when `text` names `ref` (owner/repo#n) as a whole reference, not as a prefix of another number. */
export function namesRef(text, ref) {
  return new RegExp(`(?<![\\w/-])${esc(ref)}(?![0-9])`, 'i').test(String(text || ''));
}

/**
 * True when the permission API gives this person write or more in THIS repository. The association of the original's author
 * misses a maintainer whose membership is private (the workflow token reads them as a CONTRIBUTOR), and the workflow token
 * cannot ask the permission API about the other repository, so the maintainers of this one stand for the maintainers of
 * both: the repositories of a link are kept by the same people. A refusal or a transport error means no.
 */
function maintainsHere(login, ctx) {
  const r = ctx.api(`repos/${ctx.thisRepo}/collaborators/${encodeURIComponent(login)}/permission`);
  return Boolean(r && r.status === 200 && r.data && MAINTAINER_ROLES.has(String(r.data.role_name || r.data.permission || '').toLowerCase()));
}

/** A bot account or a coding agent: nobody to notify. */
export function isBotLogin(login, type) {
  return type !== 'User' || /\[bot\]$/i.test(String(login || '')) || isCodingAgent(login);
}

/**
 * Read one page of a list; `api` returns { status, data } and never throws. Stops at the first
 * short page or after MAX_PAGES. Returns null when GitHub says no (the caller skips).
 */
function readAll(api, path) {
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    if (!r || r.status !== 200 || !Array.isArray(r.data)) return page === 1 ? null : all;
    all.push(...r.data);
    if (r.data.length < 100) break;
  }
  return all;
}

/**
 * Prove which original report this issue was opened from, and who to tell. Shared by both
 * notices. `issue` is the canonical issue (this repository), `ctx.thisRepo` is `owner/repo`,
 * `ctx.api(path)` is a read-only GitHub GET returning { status, data }.
 * Returns { ok: true, login, ref } or { ok: false, reason, retry }. `retry` is true only when the
 * original can be read but does not confirm the link YET (the harness writes the label and the
 * back-pointer comment a moment after it creates this issue); every other skip is final.
 */
function confirmOriginal(issue, ctx) {
  const no = (reason, retry = false) => ({ ok: false, reason, retry });
  const links = parseLinks(issue.body);
  if (links.length === 0) return no('no link to an original report');

  // The new folder first; the old one only when the file is not in the new one (an error on the new place is the answer).
  const cfg = configViaApi('related-repos.md', (file) => ctx.api(`repos/${ctx.thisRepo}/contents/${file}`)).result;
  if (!cfg || cfg.status !== 200 || !cfg.data || typeof cfg.data.content !== 'string') {
    return no('no related-repos.md to confirm the linked repository');
  }
  const allowed = relatedRepos(Buffer.from(cfg.data.content, 'base64').toString('utf8'));
  const candidates = links.filter((l) => allowed.has(lower(`${l.owner}/${l.repo}`)));
  if (candidates.length === 0) return no('the linked repository is not a related repository');

  const thisRef = `${ctx.thisRepo}#${issue.number}`;
  const verified = [];
  let pending = false;
  for (const c of candidates) {
    const base = `repos/${c.owner}/${c.repo}/issues/${c.number}`;
    const original = ctx.api(base);
    if (!original || original.status !== 200 || !original.data) continue; // private, deleted or an API error
    const o = original.data;
    if (o.pull_request) continue;
    // The original carries the opt-out label: a person handles that report, the Concierge says nothing to its reporter.
    if (isOptedOut(o)) return no(`the linked original report: ${optedOutReason('issue')}`);
    const oLabels = new Set((o.labels || []).map((l) => l.name || l));
    if (!oLabels.has(LABEL_LINKED)) { // not linked yet, or unlinked by a maintainer
      pending = true;
      continue;
    }
    const comments = readAll(ctx.api, `${base}/comments`);
    if (!comments) continue;
    const pointsBack = comments.some((cm) => cm.user && cm.user.login === BOT && cm.user.type === 'Bot' && namesRef(cm.body, thisRef));
    if (!pointsBack) { // anyone can write a link; only the harness writes this comment (and not yet, maybe)
      pending = true;
      continue;
    }
    verified.push({ o, ref: c.ref });
  }
  if (verified.length === 0) {
    return pending ? no('no linked original report confirms this issue (yet)', true) : no('no linked original report confirms this issue');
  }
  if (verified.length > 1) return no('more than one linked original report: ambiguous');

  const original = verified[0].o;
  const author = original.user || {};
  const login = author.login;
  if (!login) return no('the original report has no author');
  if (isBotLogin(login, author.type)) return no(`the original reporter is a bot (${login})`);
  if (MAINTAINER_ASSOCIATIONS.has(String(original.author_association || '').toUpperCase()) || maintainsHere(login, ctx)) {
    return no(`the original reporter is a maintainer (${login})`);
  }
  if (issue.user && lower(issue.user.login) === lower(login)) return no(`@${login} opened this issue`);
  return { ok: true, login, ref: verified[0].ref };
}

/**
 * The link notice: tell the reporter of the original where their report went. Posted once per
 * canonical issue, whether or not the issue is waiting for anything.
 * Returns { notified, reason, retry?, login?, comment? }. Every skip says why.
 */
export function notifyLink(issue, ctx) {
  const skip = (reason, extra = {}) => ({ notified: false, reason, ...extra });
  if (issue.pull_request) return skip('pull request');
  if (issue.state !== 'open') return skip('issue is closed');
  if (isOptedOut(issue)) return skip(optedOutReason('issue'));

  const c = confirmOriginal(issue, ctx);
  if (!c.ok) return skip(c.reason, c.retry ? { retry: true } : {});

  const comments = readAll(ctx.api, `repos/${ctx.thisRepo}/issues/${issue.number}/comments`);
  if (!comments) return skip('the comments of this issue could not be read');
  if (comments.some((cm) => cm.user && lower(cm.user.login) === lower(c.login))) {
    return skip(`@${c.login} already takes part in this issue`);
  }
  // Only the bot's own comment counts as "already told": a person quoting the marker must not
  // be able to switch the notice off.
  if (comments.some((cm) => cm.user && cm.user.login === BOT && cm.user.type === 'Bot' && (cm.body || '').includes(LINK_MARKER))) {
    return skip('already told about the original report');
  }

  const body = `Original report: ${c.ref}, reported by @${c.login}. Updates are posted on both threads.\n\n${LINK_MARKER}`;
  if (!ctx.dryRun) ctx.comment(body);
  return { notified: true, reason: 'told the original reporter where the report went', login: c.login, comment: body };
}

/**
 * The link notice with a short, bounded re-check. The harness creates the canonical issue and
 * only then labels and comments on the original, so the proof may be a few seconds late. Waits
 * only while that is the single reason for skipping; every other skip is final at once.
 */
export function notifyLinkWithRetry(issue, ctx, { attempts = 4, delayMs = 15000, sleep = sleepSync } = {}) {
  let result;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    result = notifyLink(issue, ctx);
    if (!result.retry) return result;
    if (attempt < attempts) sleep(delayMs);
  }
  return { ...result, reason: `${result.reason} after ${attempts} checks` };
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * The request notice: decide whether to notify, and post the comment through `ctx.comment`.
 * The issue must carry `needs-info`. Returns { notified, reason, login?, comment? }.
 */
export function notify(issue, ctx) {
  const skip = (reason) => ({ notified: false, reason });
  const labels = new Set((issue.labels || []).map((l) => l.name || l));
  if (issue.pull_request) return skip('pull request');
  if (issue.state !== 'open') return skip('issue is closed');
  if (isOptedOut(issue)) return skip(optedOutReason('issue'));
  if (!labels.has(LABEL_WAITING)) return skip('the issue is not waiting for information');

  const c = confirmOriginal(issue, ctx);
  if (!c.ok) return skip(c.reason);
  const { login, ref } = c;

  const comments = readAll(ctx.api, `repos/${ctx.thisRepo}/issues/${issue.number}/comments`);
  if (!comments) return skip('the comments of this issue could not be read');
  if (comments.some((cm) => cm.user && lower(cm.user.login) === lower(login))) {
    return skip(`@${login} already takes part in this issue`);
  }
  const worker = new RegExp(`gh-aw-workflow-call-id:\\s*${esc(ctx.thisRepo)}/issue-worker`, 'i');
  const request = [...comments].reverse().find((cm) => cm.user && cm.user.login === BOT && worker.test(cm.body || ''));
  if (!request) return skip('there is no request for information to point at');
  const marker = `${MARKER_PREFIX}${request.id} -->`;
  if (comments.some((cm) => (cm.body || '').includes(marker))) return skip('already notified about this request');

  const body =
    `@${login}, thanks for your report (${ref}). ` +
    `The maintainers need a little more information to continue with it. ` +
    `Please read [the request above](${request.html_url}) and reply on this issue.\n\n${marker}`;
  if (!ctx.dryRun) ctx.comment(body);
  return { notified: true, reason: 'asked the original reporter to look at the request', login, comment: body };
}

/** Read-only GET through the gh CLI. Never throws: { status, data } with status 0 for a transport error. */
export function ghApi(path, token) {
  try {
    const out = execFileSync('gh', ['api', path], {
      env: { ...process.env, GH_TOKEN: token },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 200, data: out ? JSON.parse(out) : null };
  } catch (e) {
    const m = /HTTP (\d{3})/.exec(String(e.stderr || e.message || ''));
    return { status: m ? Number(m[1]) : 0, data: null };
  }
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const repo = env.GITHUB_REPOSITORY;
  const number = Number(env.ISSUE_NUMBER);
  if (!repo || !Number.isInteger(number) || number <= 0) {
    console.error('GITHUB_REPOSITORY and ISSUE_NUMBER are required');
    process.exit(1);
  }
  const token = env.GH_TOKEN;
  const api = (path) => ghApi(path, token);
  const issue = api(`repos/${repo}/issues/${number}`);
  if (issue.status !== 200 || !issue.data) {
    console.log(`::warning::#${number}: could not read the issue (HTTP ${issue.status}); nothing posted`);
    return;
  }
  const dryRun = argv.includes('--dry-run');
  const ctx = {
    thisRepo: repo,
    api,
    dryRun,
    comment: (body) =>
      execFileSync('gh', ['api', `repos/${repo}/issues/${number}/comments`, '--method', 'POST', '-f', `body=${body}`], {
        env: { ...process.env, GH_TOKEN: token },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
  };
  // Link notice first (it needs no label), then the request notice (it needs `needs-info`). Each
  // posts at most one comment, each has its own marker, and a comment written with the workflow
  // token starts no workflow, so the two cannot loop.
  for (const [what, result] of [
    ['link', notifyLinkWithRetry(issue.data, ctx)],
    ['request', notify(issue.data, ctx)],
  ]) {
    console.log(`#${number} ${what}: ${result.notified ? `notified @${result.login}` : 'skipped'} (${result.reason})`);
    if (result.notified && dryRun) console.log(`--- would post:\n${result.comment}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
