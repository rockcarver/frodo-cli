// Janitor for Repo Concierge.
//
// Deterministic: no LLM. Keeps an issue or pull request showing where it is, not
// where it has been. A gate label is a signal: once the next signal exists, the
// earlier one goes. When an issue closes, the labels that describe open work go
// too. Classification and outcome labels (complexity, risk, duplicate, released,
// and so on) are never touched, and neither is any item that carries `no-auto-processing`.
// Rules: docs/multi-phase-design.md, "Label lifecycle" and "Opting an item out".
//
// A second task, `--held-runs`, deletes the runs GitHub holds for approval that approving
// could only turn into a skipped run or into CI for a commit that is no longer the head (see
// DISPOSABLE_HELD_RUNS and disposableReason). Rules: docs/multi-phase-design.md, "Held runs".
import { execFileSync } from 'node:child_process';
import { isOptedOut, optedOutReason } from './opt-out.mjs';

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
 * Runs GitHub holds at `action_required` until a maintainer approves them, that approving can only turn
 * into a skipped run. GitHub holds every run the coding agent causes before it evaluates any job
 * condition, so a comment by the agent on its own pull request leaves a held `Issue Worker` run behind
 * that `if:` would skip (a test pins the guard in workflows/issue-worker.md), and every push leaves a held
 * `Dependabot Auto-Merge` run behind whose only job runs for Dependabot. An entry with a `guard` is
 * deleted only while the default branch's copy of that workflow still has the guard (see
 * `everyJobGuardedByDependabot`): the file belongs to the repository, not to this harness. Never add a
 * workflow here that does real work: a held CI run is the approval that matters.
 */
export const DISPOSABLE_HELD_RUNS = [
  {
    path: '.github/workflows/issue-worker.lock.yml',
    event: 'issue_comment',
    reason: 'the Issue Worker skips comments by bots on pull requests',
  },
  {
    path: '.github/workflows/dependabot-auto-merge.yml',
    event: 'pull_request',
    guard: 'dependabot-actor',
    reason: 'its job runs only for Dependabot',
  },
];

/** True for a run held for approval and caused by the coding agent: the only runs the sweep ever looks at. */
export function isHeldByAgent(run) {
  return run.status === 'completed' && run.conclusion === 'action_required' && isCodingAgent(run.actor?.login);
}

/** The table entry for a run, by workflow file and event, or undefined. The entry's guard is not checked here. */
export function disposableEntry(run) {
  return DISPOSABLE_HELD_RUNS.find((d) => d.path === run.path && d.event === run.event);
}

/** True for a held run the table lists: held for the coding agent, and a listed workflow on a listed event. */
export function isDisposableHeldRun(run) {
  return isHeldByAgent(run) && disposableEntry(run) !== undefined;
}

/**
 * True when every job of a workflow file is conditioned on the Dependabot actor, so a run caused by anyone
 * else can only be skipped: each job key (two spaces of indent under `jobs:`) has a job-level `if:` whose
 * whole condition is `github.actor == 'dependabot[bot]'` (optionally wrapped in `${{ }}`).
 */
export function everyJobGuardedByDependabot(text) {
  const lines = String(text || '').split(/\r?\n/);
  const start = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (start < 0) return false;
  const jobs = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break; // the next top-level key ends the jobs block
    if (/^ {2}[\w-]+:\s*$/.test(line)) jobs.push({ name: line.trim(), guarded: false });
    else if (jobs.length && /^ {4}if:\s*(\$\{\{\s*)?github\.actor == 'dependabot\[bot\]'(\s*\}\})?\s*(#.*)?$/.test(line)) {
      jobs[jobs.length - 1].guarded = true;
    }
  }
  return jobs.length > 0 && jobs.every((j) => j.guarded);
}

/**
 * Why a held `pull_request` run is stale, or null when it is not: its pull request is closed (merged
 * included), or the run is for a commit that is no longer the head of the pull request. `pr` is
 * { state, headSha } as read just now. The run for the CURRENT head is never stale, whatever the
 * workflow: it is the only CI for the agent's code and the human gate for branch-controlled workflow files.
 */
export function staleRunReason(run, pr) {
  const number = run.pull_requests?.[0]?.number;
  if (run.event !== 'pull_request' || !number || !pr) return null;
  if (pr.state !== 'open') return `pull request #${number} is closed`;
  if (pr.headSha && run.head_sha && pr.headSha !== run.head_sha) {
    return `pull request #${number} moved on to ${String(pr.headSha).slice(0, 7)}`;
  }
  return null;
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
    // An opted-out item keeps its labels exactly as a person left them, even a stale gate label.
    if (isOptedOut(item)) {
      ctx.log(`#${item.number} (${kind}, ${item.state}): skipped, ${optedOutReason(kind)}`);
      continue;
    }
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

// ------------------------------------------------------------- held runs

/**
 * Decides one held run. Returns the reason to delete it, or null to keep it. Doubt always keeps the run:
 * a pull request that cannot be read, or a workflow whose guard cannot be confirmed, is logged and left.
 * `cache`: { prs: Map, guards: Map } so a sweep reads each pull request and workflow file once.
 */
async function disposableReason(run, ctx, cache) {
  const entry = disposableEntry(run);
  if (entry) {
    if (!entry.guard) return entry.reason;
    if (!cache.guards.has(entry.path)) {
      try {
        cache.guards.set(entry.path, everyJobGuardedByDependabot(await ctx.readWorkflow(entry.path)));
      } catch (e) {
        cache.guards.set(entry.path, false);
        ctx.log(`::warning::${entry.path} could not be read, so its held runs are kept: ${e.message}`);
      }
    }
    if (cache.guards.get(entry.path)) return entry.reason;
    ctx.log(`run ${run.id} (${run.name}): kept, ${entry.path} no longer has a Dependabot-actor guard on every job`);
  }
  const number = run.pull_requests?.[0]?.number;
  if (run.event === 'pull_request' && number) {
    if (!cache.prs.has(number)) {
      try {
        cache.prs.set(number, await ctx.getPullRequest(number));
      } catch (e) {
        cache.prs.set(number, { error: e.message });
      }
    }
    const pr = cache.prs.get(number);
    if (pr?.error) {
      ctx.log(`::warning::run ${run.id} (${run.name}): kept, pull request #${number} could not be read: ${pr.error}`);
      return null;
    }
    return staleRunReason(run, pr);
  }
  return null;
}

/**
 * ctx: { listHeldRuns() -> runs[], deleteRun(id), getPullRequest(number) -> { state, headSha },
 *        readWorkflow(path) -> text, log(line) }. opts: { dryRun }.
 * Deletes the held runs of the coding agent that `disposableReason` accepts and nothing else: the table's
 * workflows (Issue Worker comments, Dependabot Auto-Merge) and pull request runs that are stale. The held
 * run for a pull request's current head (the approval that matters) and a contributor's run are never
 * touched. Returns the deleted ids.
 */
export async function sweepHeldRuns(opts, ctx) {
  const deleted = [];
  const failures = [];
  const cache = { prs: new Map(), guards: new Map() };
  for (const run of (await ctx.listHeldRuns()).filter(isHeldByAgent)) {
    const reason = await disposableReason(run, ctx, cache);
    if (!reason) continue;
    if (!opts.dryRun) {
      try {
        await ctx.deleteRun(run.id);
      } catch (e) {
        failures.push(`run ${run.id}: ${e.message}`);
        continue;
      }
    }
    deleted.push(run.id);
    ctx.log(`run ${run.id} (${run.name}, ${run.event} by ${run.actor.login}, "${run.display_title}"): ${opts.dryRun ? 'would delete' : 'deleted'} (${reason})`);
  }
  if (deleted.length === 0 && failures.length === 0) ctx.log('No held runs to delete.');
  if (failures.length) throw new Error(`could not delete: ${failures.join('; ')}`);
  return deleted;
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
    listHeldRuns: async () => {
      const out = gh(
        ['api', '--paginate', `repos/${repo}/actions/runs?status=action_required&per_page=100`, '--jq', '.workflow_runs[] | tojson'],
        token
      );
      return out.split('\n').filter(Boolean).map((line) => JSON.parse(line));
    },
    getPullRequest: async (number) => {
      const pr = JSON.parse(gh(['api', `repos/${repo}/pulls/${number}`], token));
      return { state: pr.state, headSha: pr.head?.sha };
    },
    readWorkflow: async (path) =>
      Buffer.from(gh(['api', `repos/${repo}/contents/${path}`, '--jq', '.content'], token).trim(), 'base64').toString('utf8'),
    deleteRun: async (id) => {
      try {
        gh(['api', '--method', 'DELETE', `repos/${repo}/actions/runs/${id}`], token);
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
  const dryRun = argv.includes('--dry-run') || String(env.DRY_RUN) === 'true';
  if (argv.includes('--held-runs')) {
    await sweepHeldRuns({ dryRun }, realContext(repo, token));
    return;
  }
  const number = Number(env.ITEM_NUMBER) || 0;
  await run({ number, includeClosed: String(env.INCLUDE_CLOSED) === 'true', dryRun }, realContext(repo, token));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`::error::${e.message}`);
    process.exit(1);
  });
}
