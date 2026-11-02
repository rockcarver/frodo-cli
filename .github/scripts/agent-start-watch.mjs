// Agent start watch for Issue Concierge.
//
// Deterministic: no LLM. The PR worker hands an issue to the coding agent by assigning it, and GitHub accepts the assignment
// before the agent has started anything. The agent's own session can still fail to start, and when it does it says so once,
// in a comment on the issue ("The agent encountered an error and was unable to start working on this issue"), after it has
// opened an empty draft pull request. Nothing else shows it: the assignment succeeded, the gate's run is green, a session
// that never started creates no workflow run, and the janitor has already taken the hand-off label away because an agent is
// assigned (frodo-lib#783 on 2026-11-02 and frodo-lib#754 on 2026-10-23: the issue sat with an assignee and no work).
//
// This reads that comment and gives the issue `agent-start-failed`, with the signal token so that the status issue and the
// options comment start. It does nothing else: the maintainer decides, and `/retry` (scripts/commands.mjs) takes the empty
// start back and hands the issue on again. It never starts the agent again by itself. Rules and reasons:
// docs/multi-phase-design.md, "When the coding agent does not start", and the decision record 0041.
//
// Install: copy to .github/scripts/agent-start-watch.mjs (it imports janitor.mjs, opt-out.mjs and plan-approval-resume.mjs, so
// install those too).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { LABEL_AGENT_FAILED, isCodingAgent } from './janitor.mjs';
import { isOptedOut, labelNames, optedOutReason } from './opt-out.mjs';
import { isClassified } from './plan-approval-resume.mjs';

/**
 * What the coding agent writes when its session cannot start. The wording is GitHub's: workflows/agent-start-watch.yml reads the
 * same words in its `if:`, a test keeps the two equal, and a change in the wording shows as an issue the page lists as "with the
 * coding agent" with no pull request (the status issue) instead of as a held one.
 */
export const START_FAILURE = /\bunable to start working on this issue\b/i;

/**
 * Whether the comment is the agent's report that it could not start on this issue, and the issue is one the Concierge handed on.
 * issue: as the REST API gives it. comment: { user: { login, type }, body }.
 * Returns { label: boolean, reason }.
 */
export function decide(issue, comment) {
  if (issue.pull_request) return { label: false, reason: 'pull request' };
  if (issue.state !== 'open') return { label: false, reason: 'issue is closed' };
  if (isOptedOut(issue)) return { label: false, reason: optedOutReason('issue') };
  if (issue.user && issue.user.type === 'Bot') return { label: false, reason: 'issue opened by a bot' };
  const user = comment && comment.user;
  if (!user || user.type !== 'Bot' || !isCodingAgent(user.login)) return { label: false, reason: 'comment is not the coding agent\'s' };
  if (!START_FAILURE.test(String(comment.body || ''))) return { label: false, reason: 'comment is not a report that the agent could not start' };
  const assignees = (issue.assignees || []).map((a) => a.login || a);
  if (!assignees.some(isCodingAgent)) return { label: false, reason: 'the coding agent is no longer assigned' };
  const labels = new Set(labelNames(issue));
  if (labels.has(LABEL_AGENT_FAILED)) return { label: false, reason: 'already labelled' };
  // The Concierge hands an issue to the agent after plan triage has classified the plan. An issue that somebody assigned to
  // the agent by hand is theirs: starting it again is not for the Concierge to offer.
  if (!isClassified(labels)) return { label: false, reason: 'plan triage has not classified the issue, so the Concierge did not hand it to the agent' };
  return { label: true, reason: 'the coding agent reported that it could not start' };
}

/** The latest comment of the coding agent, for a run started by hand. */
export function latestAgentComment(comments) {
  const own = comments.filter((c) => c.user && c.user.type === 'Bot' && isCodingAgent(c.user.login));
  return own.length ? own.reduce((a, b) => (Date.parse(b.created_at) >= Date.parse(a.created_at) ? b : a)) : null;
}

function realApi(env, repo) {
  const call = (args, token) => execFileSync('gh', args, { env: { ...process.env, GH_TOKEN: token }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  const get = (path) => JSON.parse(call(['api', path], env.GH_TOKEN));
  const signal = env.SIGNAL_TOKEN || env.GH_TOKEN;
  return {
    getIssue: (n) => get(`repos/${repo}/issues/${n}`),
    listComments(n) {
      const all = [];
      for (let page = 1; page <= 10; page += 1) {
        const chunk = get(`repos/${repo}/issues/${n}/comments?per_page=100&page=${page}`);
        all.push(...chunk);
        if (chunk.length < 100) break;
      }
      return all;
    },
    // The signal token, because a label added with the workflow token starts no workflow.
    addLabel: (n, label) => call(['api', `repos/${repo}/issues/${n}/labels`, '--method', 'POST', '-f', `labels[]=${label}`], signal),
  };
}

export function main(argv = process.argv.slice(2), env = process.env, api = realApi(env, env.GITHUB_REPOSITORY), log = (m) => console.log(m)) {
  const repo = env.GITHUB_REPOSITORY;
  if (!repo) {
    log('::error::GITHUB_REPOSITORY is required');
    return 1;
  }
  const payload = env.GITHUB_EVENT_PATH && fs.existsSync(env.GITHUB_EVENT_PATH) ? JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8')) : {};
  const fromEvent = env.GITHUB_EVENT_NAME === 'issue_comment' && payload.issue && payload.comment;
  const number = fromEvent ? payload.issue.number : Number(env.ISSUE_NUMBER);
  if (!Number.isInteger(number) || number <= 0) {
    log('::error::an issue comment event or ISSUE_NUMBER is required');
    return 1;
  }
  const issue = api.getIssue(number);
  const comment = fromEvent ? payload.comment : latestAgentComment(api.listComments(number));
  if (!issue || !comment) {
    log(`#${number}: skipped (${issue ? 'the coding agent has not commented' : 'the issue could not be read'})`);
    return 0;
  }
  const verdict = decide(issue, comment);
  log(`#${number}: ${verdict.label ? 'labelled' : 'skipped'} (${verdict.reason})`);
  if (verdict.label && !argv.includes('--dry-run')) api.addLabel(number, LABEL_AGENT_FAILED);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
