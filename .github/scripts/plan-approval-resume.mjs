// Plan approval resume for Repo Concierge.
//
// Deterministic: no LLM. When a maintainer removes `plan-approval-required`
// from an issue plan triage has classified (high complexity or high risk, which plan triage holds
// itself, or any classification when a maintainer put the hold on by hand), this hands the issue
// to the PR gate by applying `plan-triage-handoff`. Rules: docs/multi-phase-design.md.
import { execFileSync } from 'node:child_process';
import { isCodingAgent } from './janitor.mjs';

export const MARKER = '<!-- plan-approval-resume -->';
export const LABEL_APPROVAL = 'plan-approval-required';
export const LABEL_HANDOFF = 'plan-triage-handoff';
export const LABEL_HIGH = 'complexity/high';
export const LABEL_RISK_HIGH = 'risk/high';
export const LABEL_DEPENDENCY = 'dependency-required';

/**
 * Plan triage has classified the plan: it applies one complexity label and one risk label, whatever
 * their values. An issue that has only one of them, or neither, has not been through plan triage.
 */
export function isClassified(labels) {
  const names = [...labels];
  return names.some((n) => n.startsWith('complexity/')) && names.some((n) => n.startsWith('risk/'));
}

/** True for a bot account: approval is a human decision, so a bot removing the label never counts. */
export function isBot(login) {
  return /\[bot\]$/i.test(String(login || '')) || isCodingAgent(login);
}

/**
 * Decide whether to hand the issue off.
 * `removedLabel` is the label whose removal fired the event; leave it out for
 * a manual run (then the approval label must simply be absent). `actor` is who
 * removed it (or started the manual run); leave it out when unknown.
 */
export function decide(issue, removedLabel, actor) {
  const labels = new Set((issue.labels || []).map((l) => l.name || l));
  if (issue.pull_request) return { handoff: false, reason: 'pull request' };
  if (issue.state !== 'open') return { handoff: false, reason: 'issue is closed' };
  if (removedLabel !== undefined && removedLabel !== LABEL_APPROVAL) {
    return { handoff: false, reason: `unrelated label ${removedLabel}` };
  }
  if (isBot(actor)) return { handoff: false, reason: `approval removed by a bot (${actor})` };
  if (labels.has(LABEL_APPROVAL)) return { handoff: false, reason: 'approval is still required' };
  // A high label alone counts (plan triage held the issue itself, and the older flow applied only the
  // complexity label). Any other plan needs both labels: a hold put on by hand before plan triage ran
  // leaves nothing to approve yet, and that is plan triage's to do (re-add `plan-worker-ready`).
  if (!labels.has(LABEL_HIGH) && !labels.has(LABEL_RISK_HIGH) && !isClassified(labels)) {
    return { handoff: false, reason: 'plan triage has not classified the issue yet: nothing to approve' };
  }
  if (labels.has(LABEL_DEPENDENCY)) return { handoff: false, reason: 'waiting on a dependency' };
  // The janitor removes `plan-triage-handoff` once the coding agent is assigned, so
  // an assignee counts as handed off too.
  const assignees = (issue.assignees || []).map((a) => a.login || a);
  if (labels.has(LABEL_HANDOFF) || assignees.some(isCodingAgent)) return { handoff: false, reason: 'already handed off' };
  return { handoff: true, reason: 'approval removed' };
}

/** Hand off through the injected label and comment functions. */
export function resume(issue, ctx) {
  const verdict = decide(issue, ctx.removedLabel, ctx.actor);
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
