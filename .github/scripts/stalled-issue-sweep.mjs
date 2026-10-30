// Stalled issue sweep for Issue Concierge.
//
// Deterministic: no LLM. An issue the issue worker analysed but that never reached issue triage gets the gate
// label again, so triage runs on the analysis that is already there. A model run can end before it signals
// (the turn limit, an engine error), and a label below confidence HIGH is held back as a suggestion that starts
// nothing; either way the issue sits outside the pipeline and nothing says so (frodo-lib#803). The sweep does
// what a maintainer did by hand: it removes the gate label if it is still there and adds it again with the
// signal token, which is what starts issue triage. It never lifts a hold, never posts a comment and never starts
// the issue worker, so it cannot write a second analysis. Rules: docs/multi-phase-design.md, "Stalled issues".
//
// Install: copy to .github/scripts/stalled-issue-sweep.mjs (it imports janitor.mjs and opt-out.mjs, so
// install those too).
import { execFileSync } from 'node:child_process';
import { isCodingAgent, TRIAGE_OUTCOMES } from './janitor.mjs';
import { isOptedOut, labelNames, optedOutReason } from './opt-out.mjs';

export const LABEL_GATE = 'issue-worker-ready';
export const LABEL_RELATED = 'related-repo';
/** The account the issue worker's comments are posted by. */
export const BOT = 'github-actions[bot]';
/** How long after the last sign of life (the analysis, or the gate label) a run of issue triage can still be on its way. */
export const MIN_AGE_MINUTES = 30;
/** Gate label events since the last analysis, the worker's own one included. At the limit the sweep leaves it to a person. */
export const MAX_GATE_LABEL_EVENTS = 3;
/** The worker adds its label a moment after it posts, and the clocks of two API calls differ. */
const SETTLE_MS = 2 * 60 * 1000;

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const skip = (reason) => ({ reenter: false, reason });

/**
 * The evidence that an issue is past issue triage: an outcome of triage, a later gate label, a classification
 * or the coding agent. The hold `plan-approval-required` is not evidence: a routed issue starts held, before
 * any gate has run on it. Returns what was found, or null.
 */
export function progressEvidence(labels, assignees = []) {
  const have = labels instanceof Set ? labels : new Set(labels);
  const outcome = TRIAGE_OUTCOMES.find((l) => have.has(l));
  if (outcome) return `\`${outcome}\``;
  const later = ['plan-worker-ready', 'plan-triage-handoff'].find((l) => have.has(l));
  if (later) return `\`${later}\``;
  const classified = [...have].find((l) => l.startsWith('complexity/') || l.startsWith('risk/'));
  if (classified) return `\`${classified}\``;
  if (assignees.some((a) => isCodingAgent(a.login || a))) return 'the coding agent is assigned';
  return null;
}

/** True for a comment the issue worker of this repository posted (gh-aw appends its marker to every one). */
export function isWorkerAnalysis(comment, thisRepo) {
  const worker = new RegExp(`gh-aw-workflow-call-id:\\s*${esc(thisRepo)}/issue-worker`, 'i');
  return Boolean(comment.user && comment.user.login === BOT && worker.test(comment.body || ''));
}

/** The gates after the issue worker: a comment of one of them means the issue has been through issue triage. */
const LATER_GATES = ['issue-triage', 'plan-worker', 'plan-triage', 'pr-worker', 'pr-triage'];

/**
 * True for a comment a later gate of this repository posted. The labels cannot tell: on an issue that carries
 * the hold the janitor takes `issue-triage-handoff` and `plan-worker-ready` away within seconds, and plan
 * triage's classification only comes after the plan, so for a while a plan comment is the only trace.
 */
export function isLaterGateComment(comment, thisRepo) {
  const later = new RegExp(`gh-aw-workflow-call-id:\\s*${esc(thisRepo)}/(?:${LATER_GATES.join('|')})\\b`, 'i');
  return Boolean(comment.user && comment.user.login === BOT && later.test(comment.body || ''));
}

/**
 * What can be told from the issue alone, without a call: an item the sweep never looks at. Returns a skip
 * verdict, or null when the issue is a candidate.
 */
export function prefilter(issue) {
  if (issue.pull_request) return skip('pull request');
  if (issue.state !== 'open') return skip('issue is closed');
  if (isOptedOut(issue)) return skip(optedOutReason('issue'));
  if (issue.user && issue.user.type === 'Bot') return skip('opened by a bot: no gate starts for it');
  const labels = new Set(labelNames(issue));
  if (labels.has(LABEL_RELATED)) return skip('an original whose work is tracked in another repository: planning happens on the linked issue');
  const evidence = progressEvidence(labels, issue.assignees || []);
  if (evidence) return skip(`already past issue triage (${evidence})`);
  return null;
}

/**
 * Decide whether to give the issue its gate label again.
 * facts: { comments, events, openPulls } as the API gave them (events: the issue events, labeled ones matter).
 * opts: { thisRepo, now, minAgeMinutes }.
 */
export function decide(issue, facts, opts) {
  const early = prefilter(issue);
  if (early) return early;
  const now = opts.now ?? Date.now();
  const minAge = (opts.minAgeMinutes ?? MIN_AGE_MINUTES) * 60 * 1000;

  const laterGate = (facts.comments || []).find((c) => isLaterGateComment(c, opts.thisRepo));
  if (laterGate) return skip('already past issue triage (a later gate has commented on it)');
  const analyses = (facts.comments || []).filter((c) => isWorkerAnalysis(c, opts.thisRepo));
  if (analyses.length === 0) return skip('the issue worker has not posted an analysis: nothing for issue triage to read');
  if ((facts.openPulls || []).length > 0) return skip('an open pull request closes it: nothing should be planned');

  const lastAnalysis = Math.max(...analyses.map((c) => Date.parse(c.created_at)));
  const gateEvents = (facts.events || [])
    .filter((e) => e.event === 'labeled' && e.label && e.label.name === LABEL_GATE)
    .map((e) => Date.parse(e.created_at));
  const lastSign = Math.max(lastAnalysis, ...gateEvents);
  if (now - lastSign < minAge) {
    return skip(`the last sign of life is under ${Math.round(minAge / 60000)} minutes old: a run of issue triage can still be on its way`);
  }
  const entries = gateEvents.filter((t) => t >= lastAnalysis - SETTLE_MS).length;
  if (entries >= MAX_GATE_LABEL_EVENTS) {
    return skip(`the gate label was applied ${entries} times since the last analysis and nothing followed: a person must look`);
  }
  const hadLabel = labelNames(issue).includes(LABEL_GATE);
  return {
    reenter: true,
    reason: hadLabel ? 'the gate label is there but issue triage never concluded' : 'the analysis is posted but the gate label never took effect',
    hadLabel,
  };
}

/** Decide, and give the label again through the injected functions. Never comments, never touches another label. */
export function resume(issue, facts, ctx) {
  const verdict = decide(issue, facts, ctx);
  if (!verdict.reenter || ctx.dryRun) return verdict;
  // Remove, then add: re-adding a label that is there fires nothing.
  if (verdict.hadLabel) ctx.removeLabel(LABEL_GATE);
  ctx.addLabel(LABEL_GATE);
  return verdict;
}

// ------------------------------------------------------------------ the API

/** One page of a GET through the gh CLI. Never throws: { status, data } with status 0 for a transport error. */
export function ghGet(path, token) {
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

/** Every page of a list endpoint, or null when a page could not be read. */
export function ghList(path, token, { get = ghGet, perPage = 100, maxPages = 20 } = {}) {
  const all = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const res = get(`${path}${path.includes('?') ? '&' : '?'}per_page=${perPage}&page=${page}`, token);
    if (res.status !== 200 || !Array.isArray(res.data)) return null;
    all.push(...res.data);
    if (res.data.length < perPage) return all;
  }
  return all;
}

/** The open pull requests that close the issue, by GitHub's own link, as the PR worker reads them. */
function openClosingPulls(repo, number, token) {
  const [owner, name] = repo.split('/');
  try {
    const out = execFileSync(
      'gh',
      [
        'api', 'graphql',
        '-f', 'query=query($owner: String!, $repo: String!, $number: Int!) { repository(owner: $owner, name: $repo) { issue(number: $number) { closedByPullRequestsReferences(first: 5, includeClosedPrs: false) { nodes { number state } } } } }',
        '-F', `owner=${owner}`, '-F', `repo=${name}`, '-F', `number=${number}`,
      ],
      { env: { ...process.env, GH_TOKEN: token }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const nodes = JSON.parse(out).data.repository.issue.closedByPullRequestsReferences.nodes || [];
    return nodes.filter((pr) => pr.state === 'OPEN');
  } catch {
    return null;
  }
}

function ghWrite(path, token, { method, label } = {}) {
  const args = ['api', path, '--method', method];
  if (label) args.push('-f', `labels[]=${label}`);
  execFileSync('gh', args, { env: { ...process.env, GH_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'] });
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const repo = env.GITHUB_REPOSITORY;
  if (!repo) {
    console.error('GITHUB_REPOSITORY is required');
    process.exit(1);
  }
  const readToken = env.GH_TOKEN;
  const signalToken = env.SIGNAL_TOKEN || readToken;
  const dryRun = argv.includes('--dry-run') || env.DRY_RUN === 'true';
  const only = Number(argv.includes('--issue') ? argv[argv.indexOf('--issue') + 1] : env.ISSUE_NUMBER) || null;

  let issues;
  if (only) {
    const res = ghGet(`repos/${repo}/issues/${only}`, readToken);
    issues = res.status === 200 && res.data ? [res.data] : null;
  } else {
    issues = ghList(`repos/${repo}/issues?state=open`, readToken);
  }
  if (!issues) {
    console.error('::error::the issues could not be listed');
    process.exit(1);
  }

  let reentered = 0;
  let failed = 0;
  for (const issue of issues.sort((a, b) => a.number - b.number)) {
    const n = issue.number;
    const early = prefilter(issue);
    if (early) {
      // A sweep of every issue stays quiet about the many it never looks at; a named issue gets its answer.
      if (only) console.log(`#${n}: left alone (${early.reason})`);
      continue;
    }
    const comments = ghList(`repos/${repo}/issues/${n}/comments`, readToken);
    const events = ghList(`repos/${repo}/issues/${n}/events`, readToken);
    const openPulls = openClosingPulls(repo, n, readToken);
    if (!comments || !events || !openPulls) {
      console.log(`::warning::#${n}: could not read the comments, the events or the linked pull requests; left alone`);
      failed += 1;
      continue;
    }
    try {
      const verdict = resume(issue, { comments, events, openPulls }, {
        thisRepo: repo,
        // One issue named by hand: the person asking has seen it, so how recent its last sign of life is does not matter.
        minAgeMinutes: only ? 0 : MIN_AGE_MINUTES,
        dryRun,
        removeLabel: (label) => {
          try {
            ghWrite(`repos/${repo}/issues/${n}/labels/${encodeURIComponent(label)}`, signalToken, { method: 'DELETE' });
          } catch (e) {
            if (!/HTTP 404/.test(String(e.stderr || e.message))) throw e;
          }
        },
        addLabel: (label) => ghWrite(`repos/${repo}/issues/${n}/labels`, signalToken, { method: 'POST', label }),
      });
      console.log(`#${n}: ${verdict.reenter ? (dryRun ? 'would give the gate label again' : 'gave the gate label again') : 'left alone'} (${verdict.reason})`);
      if (verdict.reenter) reentered += 1;
    } catch (e) {
      console.log(`::error::#${n}: could not change the labels: ${String(e.stderr || e.message).trim()}`);
      failed += 1;
    }
  }
  console.log(`${reentered} issue${reentered === 1 ? '' : 's'} ${dryRun ? 'would be' : 'were'} given the gate label again`);
  if (failed > 0) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
