// Reporter notify for Repo Concierge.
//
// Deterministic: no LLM. When a linked (canonical) issue in a related repository is waiting for
// information, the person who reported the ORIGINAL issue is not a participant of it, so GitHub
// never tells them. This posts one comment that @mentions them; being mentioned also subscribes
// them to the thread. Rules and the reasons for them: docs/multi-phase-design.md, "Split-repo
// routing".
//
// The login is never taken from text. It is the author of the original issue as GitHub returns
// it, and only after the original issue proves it is the one this issue was opened from: it
// carries `related-repo` and has a comment by `github-actions[bot]` that points back at this
// issue. Issue text is attacker-controlled; a bot comment is not.
import { execFileSync } from 'node:child_process';
import { isCodingAgent } from './janitor.mjs';

export const LABEL_WAITING = 'needs-info';
export const LABEL_LINKED = 'related-repo';
export const MARKER_PREFIX = '<!-- reporter-notify:';
const BOT = 'github-actions[bot]';
const MAX_LINKS = 3;
const MAX_PAGES = 5;

// The line the issue worker writes: `Reported from owner/repo#123`, alone on its line.
const LINK_LINE = /^[ \t]*Reported from ([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})#([1-9][0-9]{0,8})[ \t]*$/gm;

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

/** The `repo: owner/name` entries of `.github/agentic-workflows/related-repos.md`, lower-cased. */
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
 * Decide whether to notify, and post the comment through `ctx.comment`.
 * `issue` is the canonical issue (this repository), `ctx.thisRepo` is `owner/repo`,
 * `ctx.api(path)` is a read-only GitHub GET returning { status, data }.
 * Returns { notified, reason, login?, comment? }. Every skip says why.
 */
export function notify(issue, ctx) {
  const skip = (reason) => ({ notified: false, reason });
  const labels = new Set((issue.labels || []).map((l) => l.name || l));
  if (issue.pull_request) return skip('pull request');
  if (issue.state !== 'open') return skip('issue is closed');
  if (!labels.has(LABEL_WAITING)) return skip('the issue is not waiting for information');

  const links = parseLinks(issue.body);
  if (links.length === 0) return skip('no link to an original report');

  const cfg = ctx.api(`repos/${ctx.thisRepo}/contents/.github/agentic-workflows/related-repos.md`);
  if (!cfg || cfg.status !== 200 || !cfg.data || typeof cfg.data.content !== 'string') {
    return skip('no related-repos.md to confirm the linked repository');
  }
  const allowed = relatedRepos(Buffer.from(cfg.data.content, 'base64').toString('utf8'));
  const candidates = links.filter((l) => allowed.has(lower(`${l.owner}/${l.repo}`)));
  if (candidates.length === 0) return skip('the linked repository is not a related repository');

  const thisRef = `${ctx.thisRepo}#${issue.number}`;
  const verified = [];
  for (const c of candidates) {
    const base = `repos/${c.owner}/${c.repo}/issues/${c.number}`;
    const original = ctx.api(base);
    if (!original || original.status !== 200 || !original.data) continue; // private, deleted or an API error
    const o = original.data;
    if (o.pull_request) continue;
    const oLabels = new Set((o.labels || []).map((l) => l.name || l));
    if (!oLabels.has(LABEL_LINKED)) continue; // not linked, or unlinked by a maintainer
    const comments = readAll(ctx.api, `${base}/comments`);
    if (!comments) continue;
    const pointsBack = comments.some((cm) => cm.user && cm.user.login === BOT && cm.user.type === 'Bot' && namesRef(cm.body, thisRef));
    if (!pointsBack) continue; // anyone can write a link; only the harness writes this comment
    verified.push({ o, ref: c.ref });
  }
  if (verified.length === 0) return skip('no linked original report confirms this issue');
  if (verified.length > 1) return skip('more than one linked original report: ambiguous');

  const author = verified[0].o.user || {};
  const login = author.login;
  if (!login) return skip('the original report has no author');
  if (isBotLogin(login, author.type)) return skip(`the original reporter is a bot (${login})`);

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
    `@${login}, thanks for your report (${verified[0].ref}). ` +
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
  const result = notify(issue.data, {
    thisRepo: repo,
    api,
    dryRun: argv.includes('--dry-run'),
    comment: (body) =>
      execFileSync('gh', ['api', `repos/${repo}/issues/${number}/comments`, '--method', 'POST', '-f', `body=${body}`], {
        env: { ...process.env, GH_TOKEN: token },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
  });
  console.log(`#${number}: ${result.notified ? `notified @${result.login}` : 'skipped'} (${result.reason})`);
  if (result.notified && argv.includes('--dry-run')) console.log(`--- would post:\n${result.comment}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
