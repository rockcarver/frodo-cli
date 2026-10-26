// Spawn work items for Repo Concierge.
//
// Deterministic: no LLM. A fix can need changes in two repositories: a library function and the command that calls it.
// The plan worker, which reads the code on both sides, lists that as `Work item:` lines in its plan; plan triage holds
// such a plan, and a maintainer who agrees with the split runs this by hand for the issue that holds the plan (the
// ORIGIN). For each line that names the related repository it
//   - creates the work item there as an issue of its own (held for plan approval, and marked `Part of {origin}` so the
//     issue worker there never routes it away), and
//   - posts one comment on the origin that names it; when the plan says it must come first, the comment carries a
//     `Depends on:` line and the origin gets `dependency-required`, so the dependency watcher (merged, released,
//     installable, pinned) holds the origin back and starts it again when the work item is done.
// The origin stays the tracker and the last link of the chain: it is planned again once the first part exists, and its
// own change goes through the PR gate as usual. Rules: docs/multi-phase-design.md, "Work in more than one repository";
// record 0032.
//
// Trust. The plan is model output written from an untrusted report, so nothing in it is believed beyond what it can be
// checked against: the repository must be the related repository this deployment is configured for (one, with its
// token), a line that does not have the exact form stops the run, and the text that reaches the new issue is cleaned
// (no mentions, no HTML comments, one line, bounded). The new issue starts held, so a person reads its plan before any
// code is written, and the plan of the origin was approved by the person who ran this.
//
// Each step checks first whether it was done, so a run that stopped half way is finished by the next one: a work item
// that was already created is found by the comment on the origin or, failing that, by the marker in its body.
//
// Reads use the workflow token (public repositories only). The new issue is created with CROSS_REPO_TOKEN, which the
// updater generates from related-repos.md into the workflow (`# concierge:cross-repo-env`); the comment on the origin
// is written with the workflow token and `dependency-required` with SIGNAL_TOKEN, so that the label event starts the
// dependency watcher.
//
// Install: copy workflows/spawn-work-items.yml to .github/workflows/spawn-work-items.yml and scripts/spawn-work-items.mjs
// to .github/scripts/spawn-work-items.mjs. It imports related-repo-closer.mjs (which imports dependency-watch.mjs,
// opt-out.mjs, reporter-notify.mjs and resolution.mjs), so install them too. An issue that carries `no-auto-processing`
// is left alone.
import { execFileSync } from 'node:child_process';
import { isOptedOut, labelNames, optedOutReason } from './opt-out.mjs';
import { ghApi } from './reporter-notify.mjs';
import { readComments } from './related-repo-closer.mjs';

export const LABEL_HOLD = 'plan-approval-required';
export const LABEL_DEPENDENCY = 'dependency-required';
export const LABEL_RELATED = 'related-repo';
export const MARKER = '<!-- spawn:';
const BOT = 'github-actions[bot]';
const MAX_TEXT = 200;
const lower = (s) => String(s || '').toLowerCase();
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * Text from a plan that is about to be written into another issue: one line, no HTML comment (a marker must come from
 * this script only), no mention (it would notify a stranger), bounded.
 */
export function clean(text) {
  const one = String(text || '')
    .replace(/<!--|-->/g, ' ')
    .replace(/@(?=[\w-])/g, '@\u200b')
    .replace(/\s+/g, ' ')
    .trim();
  return one.length > MAX_TEXT ? `${one.slice(0, MAX_TEXT - 1).trimEnd()}…` : one;
}

const ITEM = /^\s*(?:[-*]\s+)?Work item:\s*([\w.-]+\/[\w.-]+)\s*\|\s*(.+?)\s*\|\s*where:\s*(.+?)\s*\|\s*order:\s*(first|independent|this)\s*$/i;
const ITEM_START = /^\s*(?:[-*]\s+)?Work item:/i;

/** The `Work item:` lines of a plan: { items: [{ repo, scope, where, order }], problems: [line] }. */
export function parseWorkItems(text) {
  const items = [];
  const problems = [];
  for (const line of String(text || '').split('\n')) {
    if (!ITEM_START.test(line)) continue;
    const m = line.match(ITEM);
    if (!m) {
      problems.push(clean(line));
      continue;
    }
    items.push({ repo: m[1], scope: clean(m[2]), where: clean(m[3]), order: lower(m[4]) });
  }
  return { items, problems };
}

/** The latest plan the plan worker of this repository wrote on the issue, or undefined. */
export function latestPlan(comments, thisRepo) {
  const plan = new RegExp(`gh-aw-workflow-call-id:\\s*${esc(thisRepo)}/plan-worker`, 'i');
  return [...(comments || [])].reverse().find((cm) => cm.user && cm.user.login === BOT && plan.test(cm.body || ''));
}

/** The work items this script already created for the origin, from its own comments: Map(repo -> `owner/repo#n`). */
export function spawnedChildren(comments) {
  const found = new Map();
  for (const cm of comments || []) {
    for (const m of String(cm.body || '').matchAll(/<!-- spawn:child ([\w.-]+\/[\w.-]+)#(\d+) -->/g)) found.set(lower(m[1]), `${m[1]}#${m[2]}`);
  }
  return found;
}

/** The new issue: what changes, where, and that it belongs to the origin. The marker is how a second run finds it. */
export function childBody(item, originRef, planUrl) {
  const wait = item.order === 'first' ? `The change in ${originRef.split('#')[0]} needs this one first.` : `The two changes do not wait for each other.`;
  return (
    `${item.scope}\n\nWhere: ${item.where}\n\nPart of ${originRef}. ${planUrl ? `The plan that names this work item: ${planUrl}\n\n` : ''}${wait}` +
    `\n\n${MARKER}part-of ${originRef} -->`
  );
}

export function childTitle(item, originRef) {
  const scope = item.scope.length > 100 ? `${item.scope.slice(0, 99).trimEnd()}…` : item.scope;
  return `${scope} (for ${originRef})`;
}

/** The comment on the origin. A `Depends on:` line is what the dependency watcher reads; it is there only for `first`. */
export function statusComment(item, childRef) {
  const lead = `The plan needs work in another repository, tracked in ${childRef}: ${item.scope}`;
  const body = item.order === 'first' ? `${lead} This issue waits for it.\n\nDepends on: ${childRef}` : `${lead} The two changes do not wait for each other.`;
  return `${body}\n\n${MARKER}child ${childRef} -->`;
}

/**
 * Decide what to do about an origin issue. `ctx.thisRepo` is `owner/repo`, `ctx.relatedRepo` the related repository the
 * updater generated (or empty), `ctx.api(path)` a read-only GET returning { status, data } and never throwing. Returns
 *   { action: 'skip', reason }                          nothing to do, and nothing wrong
 *   { action: 'spawn', items, planUrl, spawned }        the work items to create (`spawned` is what exists already)
 */
export function decide(issue, ctx) {
  const skip = (reason) => ({ action: 'skip', reason });
  if (issue.pull_request) return skip('a pull request');
  if (issue.state !== 'open') return skip('the issue is not open');
  if (issue.user && issue.user.type === 'Bot') return skip('opened by a bot');
  if (isOptedOut(issue)) return skip(optedOutReason('issue'));
  if (labelNames(issue).includes(LABEL_RELATED)) return skip('an original whose work is tracked in another repository: its plan is on the linked issue');
  if (/^\s*Part of [\w.-]+\/[\w.-]+#\d+/m.test(String(issue.body || ''))) return skip('a work item is not split again: the plan of the issue it belongs to did that');
  if (!ctx.relatedRepo) return skip('no related repository with a secret is configured here');

  const comments = readComments(ctx.api, `repos/${ctx.thisRepo}/issues/${issue.number}`);
  if (!comments) return skip('the comments of the issue could not be read: nothing changed');
  const plan = latestPlan(comments, ctx.thisRepo);
  if (!plan) return skip('the issue has no plan from the plan worker of this repository');

  const { items, problems } = parseWorkItems(plan.body);
  if (problems.length > 0) return skip(`a "Work item:" line of the plan does not have the exact form: ${problems.join(' / ')}`);
  const children = [];
  const seen = new Set();
  for (const item of items) {
    const key = lower(item.repo);
    if (seen.has(key)) return skip(`the plan has two work items for ${item.repo}`);
    seen.add(key);
    if (key === lower(ctx.thisRepo)) continue; // this repository's own part is the origin itself
    if (key !== lower(ctx.relatedRepo)) return skip(`the plan names ${item.repo}, which is not the related repository configured here (${ctx.relatedRepo}): nothing was created`);
    if (item.order === 'this') return skip(`the work item for ${item.repo} says "order: this", which is the line for ${ctx.thisRepo}`);
    children.push(item);
  }
  if (children.length === 0) return skip(`the plan names no work in ${ctx.relatedRepo}`);
  return { action: 'spawn', items: children, planUrl: plan.html_url || '', spawned: spawnedChildren(comments), comments };
}

/**
 * Do what `decide` found, through the injected functions: ctx.findChild(repo, originRef), ctx.createIssue(repo, title,
 * body, labels) returning `owner/repo#n`, ctx.comment(n, body) and ctx.addLabel(n, label). Each step checks first.
 * Returns a summary.
 */
export function apply(verdict, issue, ctx) {
  const originRef = `${ctx.thisRepo}#${issue.number}`;
  const did = [];
  const have = new Set(labelNames(issue));
  const write = (what, fn) => {
    if (!ctx.dryRun) fn();
    did.push(what);
  };
  for (const item of verdict.items) {
    let childRef = verdict.spawned.get(lower(item.repo)) || (ctx.findChild && ctx.findChild(item.repo, originRef));
    if (!childRef) {
      if (ctx.dryRun) childRef = `${item.repo}#?`;
      write(`created a work item in ${item.repo}`, () => {
        childRef = ctx.createIssue(item.repo, childTitle(item, originRef), childBody(item, originRef, verdict.planUrl), [LABEL_HOLD]);
      });
    }
    if (!verdict.spawned.has(lower(item.repo))) write(`commented on ${originRef} about ${childRef}`, () => ctx.comment(issue.number, statusComment(item, childRef)));
    if (item.order === 'first' && !have.has(LABEL_DEPENDENCY)) write(`labelled ${originRef} ${LABEL_DEPENDENCY}`, () => ctx.addLabel(issue.number, LABEL_DEPENDENCY));
  }
  return did;
}

/** Write through the gh CLI. Throws on an HTTP error, with its text. */
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
  const signalToken = env.SIGNAL_TOKEN || readToken;
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
    dryRun,
    // The search index lags a minute or so: this only catches a work item whose comment on the origin was never written.
    findChild: (repo, originRef) => {
      const q = encodeURIComponent(`repo:${repo} is:issue in:body "spawn:part-of ${originRef}"`);
      const r = api(`search/issues?q=${q}&per_page=5`);
      const hit = r.status === 200 && r.data && (r.data.items || []).find((i) => String(i.body || '').includes(`${MARKER}part-of ${originRef} -->`));
      return hit ? `${repo}#${hit.number}` : '';
    },
    createIssue: (repo, title, body, labels) => {
      const out = ghWrite([`repos/${repo}/issues`, '--method', 'POST', '-f', `title=${title}`, '-f', `body=${body}`, ...labels.flatMap((l) => ['-f', `labels[]=${l}`])], writeToken);
      return `${repo}#${JSON.parse(out).number}`;
    },
    comment: (n, body) => ghWrite([`repos/${thisRepo}/issues/${n}/comments`, '--method', 'POST', '-f', `body=${body}`], readToken),
    addLabel: (n, label) => ghWrite([`repos/${thisRepo}/issues/${n}/labels`, '--method', 'POST', '-f', `labels[]=${label}`], signalToken),
  };
  if (!dryRun && ctx.relatedRepo && !writeToken) {
    console.log(`::error::${ctx.relatedRepo} is configured but its token (CROSS_REPO_TOKEN) is empty: is the secret set? Nothing changed.`);
    return 1;
  }

  const verdict = decide(issue.data, ctx);
  if (verdict.action === 'skip') {
    console.log(`#${number}: nothing done (${verdict.reason})`);
    return 0;
  }
  try {
    const did = apply(verdict, issue.data, ctx);
    console.log(`#${number}: ${dryRun ? 'dry run, nothing written: ' : ''}${did.join(', ') || 'already done'}`);
    return 0;
  } catch (e) {
    console.log(`::error::#${number}: ${String(e.stderr || e.message || e).trim().split('\n')[0]}. Run it again to finish.`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
