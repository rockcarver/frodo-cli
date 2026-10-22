// Plan approval resume for Repo Concierge.
//
// Deterministic: no LLM. When a maintainer removes `plan-approval-required`
// from a high-complexity issue, this hands the issue to the PR gate by
// applying `plan-triage-handoff`. Rules: docs/multi-phase-design.md.
import { execFileSync } from 'node:child_process';

export const MARKER = '<!-- plan-approval-resume -->';
export const LABEL_APPROVAL = 'plan-approval-required';
export const LABEL_HANDOFF = 'plan-triage-handoff';
export const LABEL_HIGH = 'complexity/high';
export const LABEL_DEPENDENCY = 'dependency-required';

/**
 * Decide whether to hand the issue off.
 * `removedLabel` is the label whose removal fired the event; leave it out for
 * a manual run (then the approval label must simply be absent).
 */
export function decide(issue, removedLabel) {
  const labels = new Set((issue.labels || []).map((l) => l.name || l));
  if (issue.pull_request) return { handoff: false, reason: 'pull request' };
  if (issue.state !== 'open') return { handoff: false, reason: 'issue is closed' };
  if (removedLabel !== undefined && removedLabel !== LABEL_APPROVAL) {
    return { handoff: false, reason: `unrelated label ${removedLabel}` };
  }
  if (labels.has(LABEL_APPROVAL)) return { handoff: false, reason: 'approval is still required' };
  if (!labels.has(LABEL_HIGH)) return { handoff: false, reason: 'no high-complexity plan to approve' };
  if (labels.has(LABEL_DEPENDENCY)) return { handoff: false, reason: 'waiting on a dependency' };
  if (labels.has(LABEL_HANDOFF)) return { handoff: false, reason: 'already handed off' };
  return { handoff: true, reason: 'approval removed' };
}

/** Hand off through the injected label and comment functions. */
export function resume(issue, ctx) {
  const verdict = decide(issue, ctx.removedLabel);
  if (!verdict.handoff) return verdict;
  if (!ctx.dryRun) {
    // Applied with the signal token so the PR gate starts.
    ctx.addLabel(LABEL_HANDOFF);
    ctx.comment(
      `${MARKER}\nPlan approved${ctx.actor ? ` by @${ctx.actor}` : ''}. Handing the issue to implementation.`
    );
  }
  return verdict;
}

function ghJson(path, token, { method = 'GET', body } = {}) {
  const args = ['api', path, '--method', method];
  if (body) for (const [k, v] of Object.entries(body)) args.push('-f', `${k}=${v}`);
  const out = execFileSync('gh', args, {
    env: { ...process.env, GH_TOKEN: token },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return out ? JSON.parse(out) : null;
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const repo = env.GITHUB_REPOSITORY;
  const number = Number(env.ISSUE_NUMBER);
  if (!repo || !Number.isInteger(number) || number <= 0) {
    console.error('GITHUB_REPOSITORY and ISSUE_NUMBER are required');
    process.exit(1);
  }
  const readToken = env.GH_TOKEN;
  const signalToken = env.SIGNAL_TOKEN || readToken;
  const issue = ghJson(`repos/${repo}/issues/${number}`, readToken);
  const verdict = resume(issue, {
    removedLabel: env.REMOVED_LABEL || undefined,
    actor: env.ACTOR || undefined,
    dryRun: argv.includes('--dry-run'),
    addLabel: (l) =>
      ghJson(`repos/${repo}/issues/${number}/labels`, signalToken, { method: 'POST', body: { 'labels[]': l } }),
    comment: (body) => ghJson(`repos/${repo}/issues/${number}/comments`, readToken, { method: 'POST', body: { body } }),
  });
  console.log(`#${number}: ${verdict.handoff ? 'handed off' : 'skipped'} (${verdict.reason})`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
