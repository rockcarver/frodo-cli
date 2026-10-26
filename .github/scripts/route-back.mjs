// Route back for Repo Concierge.
//
// Deterministic: no LLM. A split-repo link has two issues: the ORIGINAL, which the reporter filed, and the CANONICAL
// issue in the repository that holds the work (record 0019). When a maintainer decides that the fix belongs in the
// repository of the original after all (the plan said "Wrong layer", or a person read the code), this moves the work
// back in one explicit act, run by hand for the canonical issue:
//   - the original gets a plain-language comment and loses `related-repo`: it is the working issue again;
//   - it is held (`plan-approval-required`) and handed to the plan gate (`issue-triage-handoff`), so a plan is written
//     against the right repository's code and a maintainer approves it before any code is written;
//   - the canonical issue gets a comment that names the original and is closed as not planned, which the related-repo
//     closer leaves alone ("the original is left to a maintainer").
// Rules and the reasons for them: docs/multi-phase-design.md, "Routing back"; record 0031.
// Before this existed there was no way back: plan triage told a maintainer to "move or re-route" an issue and nothing
// did it, and removing `related-repo` from the original starts nothing (frodo-lib#803, 2026-10-26).
//
// Trust: the same as the closer's. The `Reported from` line only names a candidate, which must be in this repository's
// related repository, carry `related-repo`, not be opted out and have a comment from the harness that names this issue
// (`verifyOriginal`, shared with the closer). An original that carries `no-auto-processing` is refused: removing that
// label hands the issue to the issue worker, and that is a maintainer's act, not this script's.
//
// Each step checks first whether it was done already, so a run that stopped half way is finished by the next one.
// The proof of the link ends when `related-repo` is removed, so the comments name each other: a run that finds the
// original without the label but with this script's comment, and the canonical issue's comment that names the
// original, finishes the rest.
//
// Reads use the workflow token (public repositories only). Writes to the original use CROSS_REPO_TOKEN, which the
// updater generates from related-repos.md into the workflow (`# concierge:cross-repo-env`); writes to the canonical
// issue use the workflow token.
//
// Install: copy workflows/route-back.yml to .github/workflows/route-back.yml and scripts/route-back.mjs to
// .github/scripts/route-back.mjs. It imports related-repo-closer.mjs (which imports dependency-watch.mjs, opt-out.mjs,
// reporter-notify.mjs and resolution.mjs), so install them too. An issue that carries `no-auto-processing` is left alone.
import { execFileSync } from 'node:child_process';
import { isOptedOut, labelNames, optedOutReason } from './opt-out.mjs';
import { ghApi } from './reporter-notify.mjs';
import { LABEL_CANONICAL, LABEL_ORIGINAL, readComments, verifyOriginal } from './related-repo-closer.mjs';

export const LABEL_HOLD = 'plan-approval-required';
export const LABEL_HANDOFF = 'issue-triage-handoff';
export const MARKER = '<!-- route-back:';
const lower = (s) => String(s || '').toLowerCase();

/**
 * The plan the plan worker of this repository wrote on the canonical issue: the link to its latest comment, or ''.
 * It goes into the comment on the original, because the plan worker there starts from that issue alone and what the
 * plan found (where the code is, what it read) is the lead it needs.
 */
export function planCommentUrl(comments, thisRepo) {
  const plan = new RegExp(`gh-aw-workflow-call-id:\\s*${thisRepo.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/plan-worker`, 'i');
  const found = [...(comments || [])].reverse().find((cm) => cm.user && cm.user.login === 'github-actions[bot]' && plan.test(cm.body || ''));
  return found && found.html_url ? found.html_url : '';
}

/** The comment on the original: plain language, no label or gate named. */
export function originalComment(thisRef, planUrl = '') {
  return (
    `This issue is where the work will be done after all. It was passed to ${thisRef}, but a closer look showed that the fix belongs in this repository, ` +
    `so that issue is closed and its notes stay there for reference.${planUrl ? ` The plan written there, with what it found in the code, is at ${planUrl}.` : ''} ` +
    `A plan for this repository comes next, and a maintainer reviews it before any code is written.` +
    `\n\n${MARKER}original ${thisRef} -->`
  );
}

/** The comment on the canonical issue. It names the original, which is what lets a second run finish this one. */
export function canonicalComment(originalRef) {
  return (
    `The fix belongs in ${originalRef} after all, so the work continues there and this issue is closed as not planned. ` +
    `The plan above stays for reference.\n\n${MARKER}canonical ${originalRef} -->`
  );
}

/** The original this script was already routing back, named by its own comment on the canonical issue, or null. */
export function markedOriginal(comments) {
  for (const cm of comments || []) {
    const m = String(cm.body || '').match(/<!-- route-back:canonical ([\w.-]+\/[\w.-]+#\d+) -->/);
    if (m) return m[1];
  }
  return null;
}

/**
 * Decide what to do about a canonical issue. `issue` is the canonical issue (this repository), `ctx.thisRepo` is
 * `owner/repo`, `ctx.relatedRepo` the related repository the updater generated, `ctx.api(path)` a read-only GET
 * returning { status, data } and never throwing. Returns one of
 *   { action: 'skip', reason }                nothing to do, and nothing wrong
 *   { action: 'route', original, comments, resumed } what to do; `comments` are the canonical issue's, `resumed` is true
 *                                              when an earlier run already removed the link label
 */
export function decide(issue, ctx) {
  const skip = (reason) => ({ action: 'skip', reason });
  const thisRef = `${ctx.thisRepo}#${issue.number}`;

  if (issue.pull_request) return skip('a pull request');
  if (issue.user && issue.user.type === 'Bot') return skip('opened by a bot');
  if (isOptedOut(issue)) return skip(optedOutReason('issue'));
  if (!labelNames(issue).includes(LABEL_CANONICAL)) return skip(`the issue does not carry ${LABEL_CANONICAL}: it is not the canonical issue of a link`);

  const comments = readComments(ctx.api, `repos/${ctx.thisRepo}/issues/${issue.number}`);
  if (!comments) return skip('the comments of the issue could not be read: nothing changed');
  const named = markedOriginal(comments);

  if (issue.state !== 'open') {
    return skip(named ? `already routed back to ${named}` : 'the issue is closed: only an open canonical issue is routed back');
  }

  const found = verifyOriginal(issue, ctx);
  if (found.original) {
    if (found.original.data.state !== 'open') return skip(`${found.original.ref} is closed: there is nothing to route back to`);
    return { action: 'route', original: found.original, comments, planUrl: planCommentUrl(comments, ctx.thisRepo), resumed: false };
  }

  // An earlier run may have removed the link label and stopped. Its own comments are the proof then: the one on this
  // issue names the original, and the one on the original names this issue.
  if (named && lower(named.split('#')[0]) === lower(ctx.relatedRepo)) {
    const [repo, number] = named.split('#');
    const base = `repos/${repo}/issues/${number}`;
    const r = ctx.api(base);
    const oComments = r && r.status === 200 && r.data ? readComments(ctx.api, base) : null;
    if (oComments && !r.data.pull_request && !isOptedOut(r.data) && r.data.state === 'open' && oComments.some((cm) => (cm.body || '').includes(`${MARKER}original ${thisRef} -->`))) {
      const original = { repo, number: Number(number), ref: named, labels: new Set(labelNames(r.data)), data: r.data, comments: oComments };
      return { action: 'route', original, comments, planUrl: planCommentUrl(comments, ctx.thisRepo), resumed: true };
    }
  }
  return skip(found.skip);
}

/**
 * Do what `decide` found, through the injected write functions. The order keeps the proof of the link alive as long as
 * possible: the hold and the two comments first, the link label next, the hand-off last, and the canonical issue is
 * closed only when everything else is done, so an open canonical issue always means unfinished work. Returns a summary.
 */
export function apply(verdict, issue, ctx) {
  const { original, comments } = verdict;
  const thisRef = `${ctx.thisRepo}#${issue.number}`;
  const did = [];
  const o = ctx.original;
  const c = ctx.canonical;
  const write = (what, fn) => {
    if (!ctx.dryRun) fn();
    did.push(what);
  };

  if (!original.labels.has(LABEL_HOLD)) write(`held ${original.ref}`, () => o.addLabel(original.repo, original.number, LABEL_HOLD));
  if (!original.comments.some((cm) => (cm.body || '').includes(`${MARKER}original ${thisRef} -->`))) {
    write(`commented on ${original.ref}`, () => o.comment(original.repo, original.number, originalComment(thisRef, verdict.planUrl)));
  }
  if (!comments.some((cm) => (cm.body || '').includes(`${MARKER}canonical ${original.ref} -->`))) {
    write(`commented on ${thisRef}`, () => c.comment(issue.number, canonicalComment(original.ref)));
  }
  if (original.labels.has(LABEL_ORIGINAL)) write(`removed ${LABEL_ORIGINAL} from ${original.ref}`, () => o.removeLabel(original.repo, original.number, LABEL_ORIGINAL));
  if (!original.labels.has(LABEL_HANDOFF)) write(`handed ${original.ref} to the plan gate`, () => o.addLabel(original.repo, original.number, LABEL_HANDOFF));
  write(`closed ${thisRef} as not planned`, () => c.close(issue.number));
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
    original: {
      addLabel: (repo, n, label) => ghWrite([`repos/${repo}/issues/${n}/labels`, '--method', 'POST', '-f', `labels[]=${label}`], writeToken),
      removeLabel: (repo, n, label) => {
        try {
          ghWrite([`repos/${repo}/issues/${n}/labels/${encodeURIComponent(label)}`, '--method', 'DELETE'], writeToken);
        } catch (e) {
          if (!/HTTP 404/.test(String(e.stderr || e.message))) throw e;
        }
      },
      comment: (repo, n, body) => ghWrite([`repos/${repo}/issues/${n}/comments`, '--method', 'POST', '-f', `body=${body}`], writeToken),
    },
    canonical: {
      comment: (n, body) => ghWrite([`repos/${thisRepo}/issues/${n}/comments`, '--method', 'POST', '-f', `body=${body}`], readToken),
      close: (n) => ghWrite([`repos/${thisRepo}/issues/${n}`, '--method', 'PATCH', '-f', 'state=closed', '-f', 'state_reason=not_planned'], readToken),
    },
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
    console.log(`#${number}: routed back to ${verdict.original.ref}${verdict.resumed ? ' (finishing an earlier run)' : ''}${dryRun ? ' (dry run, nothing written)' : ''}: ${did.join(', ')}`);
    return 0;
  } catch (e) {
    console.log(`::error::#${number}: ${String(e.stderr || e.message || e).trim().split('\n')[0]}. Run it again to finish.`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
