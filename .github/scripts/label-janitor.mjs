// Label janitor for Repo Concierge.
//
// Deterministic: no LLM. Keeps an issue or pull request showing where it is, not
// where it has been. A gate label is a signal: once the next signal exists, the
// earlier one goes. When an issue closes, the labels that describe open work go
// too. Classification and outcome labels (complexity, risk, duplicate, released,
// and so on) are never touched. Rules: docs/multi-phase-design.md, "Label lifecycle".
import { execFileSync } from 'node:child_process';

/** Gate labels in the order a work item passes through them, per object type. */
export const GATE = {
  issue: ['issue-worker-ready', 'issue-triage-handoff', 'plan-worker-ready', 'plan-triage-handoff'],
  pr: ['pr-worker-ready', 'pr-triage-handoff'],
};

/** What issue triage can apply when it has finished with an issue. Any of them consumes issue-worker-ready. */
export const TRIAGE_OUTCOMES = [
  'issue-triage-handoff',
  'backlog',
  'needs-info',
  'dependency-required',
  'scope-review',
  'out-of-scope',
  'duplicate',
  'invalid',
  'already-fixed',
  'spam',
];

/** Labels that only mean something while work is open; removed when the issue closes. */
export const OPEN_WORK_STATE = [
  'dependency-required',
  'dependency-satisfied',
  'needs-info',
  'backlog',
  'scope-review',
  'plan-approval-required',
];

/** Label events that can change the answer; the workflow starts only for these (plus assigned and closed). */
export const TRIGGER_LABELS = [
  ...new Set([...GATE.issue, ...GATE.pr, ...TRIAGE_OUTCOMES, 'plan-approval-required']),
];

const CODING_AGENT = /^copilot(-swe-agent)?(\[bot\])?$/i;

/** True for the account the PR worker assigns (the Copilot coding agent). */
export function isCodingAgent(login) {
  return CODING_AGENT.test(String(login || ''));
}

/**
 * The labels to remove from one issue or pull request.
 *
 * `labels`: names currently on it. `state`: 'open' or 'closed' (a merged pull
 * request counts as closed). `assignees`: logins. A label is removed only when the
 * evidence that replaces it is already there, so an item never loses its position.
 */
export function staleLabels({ labels, state = 'open', isPullRequest = false, assignees = [] }) {
  const have = new Set(labels);
  const has = (l) => have.has(l);
  const any = (...ls) => ls.some(has);
  const stale = [];
  const drop = (label, when) => {
    if (has(label) && when) stale.push(label);
  };
  const closed = state !== 'open';

  if (isPullRequest) {
    drop('pr-worker-ready', closed || has('pr-triage-handoff'));
    drop('pr-triage-handoff', closed);
    return stale;
  }

  if (closed) {
    for (const label of [...GATE.issue, ...OPEN_WORK_STATE]) drop(label, true);
    return [...new Set(stale)];
  }

  const agent = assignees.some(isCodingAgent);
  const planned = [...have].some((l) => l.startsWith('complexity/') || l.startsWith('risk/'));
  const planDecided = any('plan-triage-handoff', 'plan-approval-required');
  drop('issue-worker-ready', TRIAGE_OUTCOMES.some(has) || any('plan-worker-ready') || planDecided || planned || agent);
  drop('issue-triage-handoff', any('plan-worker-ready') || planDecided || planned || agent);
  drop('plan-worker-ready', planDecided || agent);
  drop('plan-triage-handoff', agent);
  return stale;
}

// ------------------------------------------------------------------ one run

/**
 * ctx: { get(number) -> issue|null, list(label, state) -> issues[], remove(number, label),
 *        log(line) }. Returns [{ number, kind, removed }] for every item that changed.
 * opts: { number, includeClosed, dryRun }. With a number it cleans that one item;
 * without one it sweeps every open item that carries a gate label (and, with
 * includeClosed, closed items that carry any label this janitor removes).
 */
export async function run(opts, ctx) {
  const items = new Map();
  if (opts.number) {
    const item = await ctx.get(opts.number);
    if (item) items.set(item.number, item);
  } else {
    const gate = [...GATE.issue, ...GATE.pr];
    const states = opts.includeClosed ? ['open', 'closed'] : ['open'];
    for (const state of states) {
      const labels = state === 'closed' ? [...new Set([...gate, ...OPEN_WORK_STATE])] : gate;
      for (const label of labels) {
        for (const item of await ctx.list(label, state)) items.set(item.number, item);
      }
    }
  }

  const changed = [];
  const failures = [];
  for (const item of [...items.values()].sort((a, b) => a.number - b.number)) {
    const kind = item.pull_request ? 'pull request' : 'issue';
    const stale = staleLabels({
      labels: (item.labels || []).map((l) => l.name || l),
      state: item.state,
      isPullRequest: Boolean(item.pull_request),
      assignees: (item.assignees || []).map((a) => a.login || a),
    });
    if (stale.length === 0) continue;
    for (const label of stale) {
      if (opts.dryRun) continue;
      try {
        await ctx.remove(item.number, label);
      } catch (e) {
        failures.push(`#${item.number} ${label}: ${e.message}`);
      }
    }
    changed.push({ number: item.number, kind, removed: stale });
    ctx.log(`#${item.number} (${kind}, ${item.state}): ${opts.dryRun ? 'would remove' : 'removed'} ${stale.join(', ')}`);
  }
  if (changed.length === 0) ctx.log('Nothing to clean up.');
  if (failures.length) throw new Error(`could not remove: ${failures.join('; ')}`);
  return changed;
}

// --------------------------------------------------------------------- main

function gh(args, token) {
  try {
    return execFileSync('gh', args, {
      env: { ...process.env, GH_TOKEN: token },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (e) {
    const err = new Error(String(e.stderr || e.message).trim());
    err.notFound = /HTTP 404|HTTP 410/.test(err.message);
    throw err;
  }
}

export function realContext(repo, token) {
  return {
    get: async (number) => {
      try {
        return JSON.parse(gh(['api', `repos/${repo}/issues/${number}`], token));
      } catch (e) {
        if (e.notFound) return null;
        throw e;
      }
    },
    list: async (label, state) => {
      const out = gh(
        ['api', '--paginate', `repos/${repo}/issues?state=${state}&labels=${encodeURIComponent(label)}&per_page=100`, '--jq', '.[] | tojson'],
        token
      );
      return out.split('\n').filter(Boolean).map((line) => JSON.parse(line));
    },
    remove: async (number, label) => {
      try {
        gh(['api', '--method', 'DELETE', `repos/${repo}/issues/${number}/labels/${encodeURIComponent(label)}`], token);
      } catch (e) {
        if (!e.notFound) throw e; // already gone: that is the goal
      }
    },
    log: (line) => console.log(line),
  };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const repo = env.GITHUB_REPOSITORY;
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (!repo || !token) {
    console.error('GITHUB_REPOSITORY and GH_TOKEN are required');
    process.exit(1);
  }
  const number = Number(env.ITEM_NUMBER) || 0;
  await run(
    {
      number,
      includeClosed: String(env.INCLUDE_CLOSED) === 'true',
      dryRun: argv.includes('--dry-run') || String(env.DRY_RUN) === 'true',
    },
    realContext(repo, token)
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`::error::${e.message}`);
    process.exit(1);
  });
}
