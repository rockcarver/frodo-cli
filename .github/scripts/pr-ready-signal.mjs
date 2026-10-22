// PR ready signal for Repo Concierge.
//
// Deterministic: no LLM. The PR gate starts when a pull request carries
// `pr-worker-ready`, and the coding agent was told to add it but cannot: its GitHub
// tools do not write labels. This applies the label for it, with the signal token so
// the label event starts PR triage. Rules: docs/multi-phase-design.md, "PR gate".
import { execFileSync } from 'node:child_process';
import { isCodingAgent } from './label-janitor.mjs';

export const LABEL = 'pr-worker-ready';

/**
 * Decide whether to apply the label.
 *
 * `trigger` is what fired the workflow (logged, and part of the decision):
 *   review_requested  the coding agent asks for review when it finishes
 *   agent_run         the coding agent's own run completed (`conclusion`)
 *   ready_for_review  a maintainer took the draft out of draft
 *   manual            a person ran the workflow for this pull request
 * `sender` is who caused the event (login), `conclusion` the finished run's result.
 */
export function decide({ pr, trigger, sender, conclusion }) {
  if (!pr) return { add: false, reason: 'no pull request found' };
  if (pr.state !== 'open' || pr.merged) return { add: false, reason: 'pull request is not open' };
  if (!isCodingAgent(pr.user?.login)) return { add: false, reason: 'not a coding agent pull request' };
  const labels = new Set((pr.labels || []).map((l) => l.name || l));
  if (labels.has(LABEL)) return { add: false, reason: 'already signalled' };
  if (trigger === 'review_requested' && !isCodingAgent(sender)) {
    return { add: false, reason: 'review was requested by someone other than the coding agent' };
  }
  if (trigger === 'agent_run' && conclusion !== 'success') {
    return { add: false, reason: `the agent run ended with ${conclusion || 'no result'}` };
  }
  return { add: true, reason: trigger };
}

// ------------------------------------------------------------------ main

function gh(args, token) {
  try {
    return execFileSync('gh', args, {
      env: { ...process.env, GH_TOKEN: token },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    throw new Error(String(e.stderr || e.message).trim());
  }
}

/** Resolve the pull request: by number, or from the branch a finished run belongs to. */
export function findPullRequest({ number, branch }, ctx) {
  if (number) return ctx.getPull(number);
  if (branch) return ctx.pullForBranch(branch);
  return null;
}

export async function run(opts, ctx) {
  const pr = await findPullRequest(opts, ctx);
  const verdict = decide({ pr, trigger: opts.trigger, sender: opts.sender, conclusion: opts.conclusion });
  const where = pr ? `#${pr.number}` : '(none)';
  if (verdict.add && !opts.dryRun) await ctx.addLabel(pr.number);
  ctx.log(`${where}: ${verdict.add ? (opts.dryRun ? 'would add' : 'added') : 'skipped'} ${LABEL} (${verdict.reason}; trigger ${opts.trigger})`);
  return { ...verdict, number: pr?.number };
}

export function realContext(repo, readToken, signalToken) {
  return {
    getPull: async (number) => JSON.parse(gh(['api', `repos/${repo}/pulls/${number}`], readToken)),
    pullForBranch: async (branch) => {
      const owner = repo.split('/')[0];
      const list = JSON.parse(gh(['api', `repos/${repo}/pulls?state=open&head=${owner}:${encodeURIComponent(branch)}`], readToken));
      return list[0] || null;
    },
    addLabel: async (number) =>
      gh(['api', '--method', 'POST', `repos/${repo}/issues/${number}/labels`, '-f', `labels[]=${LABEL}`], signalToken),
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
  const dryRun = argv.includes('--dry-run') || String(env.DRY_RUN) === 'true';
  await run(
    {
      number: Number(env.PR_NUMBER) || 0,
      branch: env.HEAD_BRANCH || '',
      trigger: env.TRIGGER || 'manual',
      sender: env.SENDER || '',
      conclusion: env.CONCLUSION || '',
      dryRun,
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
