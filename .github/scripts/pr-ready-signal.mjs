// PR ready signal for Repo Concierge.
//
// Deterministic: no LLM. The PR gate starts when a pull request carries
// `pr-worker-ready`, and the coding agent was told to add it but cannot: its GitHub
// tools do not write labels. This applies the label for it, with the signal token so
// the label event starts PR triage. Rules: docs/multi-phase-design.md, "PR gate".
//
// The source of truth for "the agent has finished" is the pull request's timeline:
// the agent's sessions are recorded as `copilot_work_started` and `copilot_work_finished`.
// A sweep reads them, so it needs no event from the agent (an event it causes waits for
// a maintainer's approval) and it repeats after every feedback round.
import { execFileSync } from 'node:child_process';
import { isCodingAgent } from './label-janitor.mjs';

export const LABEL = 'pr-worker-ready';

const pickLatest = (events, test) =>
  events
    .filter(test)
    .map((e) => e.at)
    .sort()
    .pop() || null;

/**
 * The sweep rule for one pull request. `events` are timeline entries as
 * `{ event, label?, at }` (ISO timestamps compare as strings).
 *
 * Signal when the agent's latest session has finished (the newest `copilot_work_finished`
 * is later than the newest `copilot_work_started`) and no `pr-worker-ready` label has been
 * applied since that finish. So one finish is signalled once, a feedback round that
 * finishes again is signalled again, and a label the janitor removed is not re-added for a
 * finish that was already handled.
 */
export function decideSweep({ pr, events }) {
  if (!pr) return { add: false, reason: 'no pull request found' };
  if (pr.state !== 'open' || pr.merged) return { add: false, reason: 'pull request is not open' };
  if (!isCodingAgent(pr.user?.login)) return { add: false, reason: 'not a coding agent pull request' };
  const labels = new Set((pr.labels || []).map((l) => l.name || l));
  if (labels.has(LABEL)) return { add: false, reason: 'already signalled' };
  const started = pickLatest(events, (e) => e.event === 'copilot_work_started');
  const finished = pickLatest(events, (e) => e.event === 'copilot_work_finished');
  if (!finished) return { add: false, reason: 'the agent has not finished a session yet' };
  if (started && started > finished) return { add: false, reason: 'the agent is working again' };
  const signalled = pickLatest(events, (e) => e.event === 'labeled' && e.label === LABEL);
  if (signalled && signalled > finished) return { add: false, reason: 'this finish was already signalled' };
  return { add: true, reason: `the agent finished at ${finished}` };
}

/**
 * Decide for one pull request on a direct trigger.
 *   ready_for_review  a maintainer took the draft out of draft
 *   manual            a person ran the workflow for this pull request
 */
export function decide({ pr, trigger }) {
  if (!pr) return { add: false, reason: 'no pull request found' };
  if (pr.state !== 'open' || pr.merged) return { add: false, reason: 'pull request is not open' };
  if (!isCodingAgent(pr.user?.login)) return { add: false, reason: 'not a coding agent pull request' };
  const labels = new Set((pr.labels || []).map((l) => l.name || l));
  if (labels.has(LABEL)) return { add: false, reason: 'already signalled' };
  return { add: true, reason: trigger };
}

// ------------------------------------------------------------------ main

function gh(args, token) {
  try {
    return execFileSync('gh', args, {
      env: { ...process.env, GH_TOKEN: token },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    throw new Error(String(e.stderr || e.message).trim());
  }
}

/**
 * opts: { number, trigger, dryRun }. With a number: that pull request, on a direct
 * trigger. Without one (trigger `sweep`): every open pull request the coding agent
 * opened, by the timeline rule.
 */
export async function run(opts, ctx) {
  const results = [];
  const report = (pr, verdict) => {
    ctx.log(`#${pr ? pr.number : '(none)'}: ${verdict.add ? (opts.dryRun ? 'would add' : 'added') : 'skipped'} ${LABEL} (${verdict.reason}; trigger ${opts.trigger})`);
    results.push({ number: pr?.number, ...verdict });
  };
  const apply = async (pr, verdict) => {
    if (verdict.add && !opts.dryRun) await ctx.addLabel(pr.number);
    report(pr, verdict);
  };

  if (opts.number) {
    const pr = await ctx.getPull(opts.number);
    await apply(pr, decide({ pr, trigger: opts.trigger }));
    return results;
  }

  const open = (await ctx.listOpenPulls()).filter((p) => isCodingAgent(p.user?.login));
  if (open.length === 0) ctx.log('No open coding agent pull requests.');
  for (const pr of open) {
    const labels = new Set((pr.labels || []).map((l) => l.name || l));
    if (labels.has(LABEL)) {
      report(pr, { add: false, reason: 'already signalled' });
      continue;
    }
    await apply(pr, decideSweep({ pr, events: await ctx.timeline(pr.number) }));
  }
  return results;
}

export function realContext(repo, readToken, signalToken) {
  return {
    getPull: async (number) => JSON.parse(gh(['api', `repos/${repo}/pulls/${number}`], readToken)),
    listOpenPulls: async () =>
      gh(['api', '--paginate', `repos/${repo}/pulls?state=open&per_page=100`, '--jq', '.[] | tojson'], readToken)
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l)),
    timeline: async (number) =>
      gh(
        [
          'api',
          '--paginate',
          `repos/${repo}/issues/${number}/timeline?per_page=100`,
          '--jq',
          '.[] | select(.event=="copilot_work_started" or .event=="copilot_work_finished" or (.event=="labeled" and .label.name=="' +
            LABEL +
            '")) | {event, label: (.label.name // null), at: .created_at} | tojson',
        ],
        readToken
      )
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l)),
    addLabel: async (number) => gh(['api', '--method', 'POST', `repos/${repo}/issues/${number}/labels`, '-f', `labels[]=${LABEL}`], signalToken),
    log: (line) => console.log(line),
  };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const repo = env.GITHUB_REPOSITORY;
  const readToken = env.GH_TOKEN;
  if (!repo || !readToken) {
    console.error('GITHUB_REPOSITORY and GH_TOKEN are required');
    process.exit(1);
  }
  // The signal token makes the label event start PR triage; without it fall back to the
  // read token, which still labels but starts nothing (the run says so).
  const signalToken = env.SIGNAL_TOKEN || readToken;
  if (!env.SIGNAL_TOKEN) console.log('::warning::SIGNAL_TOKEN is not set; the label will not start PR triage.');
  const number = Number(env.PR_NUMBER) || 0;
  await run(
    {
      number,
      trigger: number ? env.TRIGGER || 'manual' : 'sweep',
      dryRun: argv.includes('--dry-run') || String(env.DRY_RUN) === 'true',
    },
    realContext(repo, readToken, signalToken)
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`::error::${e.message}`);
    process.exit(1);
  });
}
