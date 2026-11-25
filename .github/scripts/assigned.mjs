// An issue assigned to a person, for Issue Concierge.
//
// Deterministic: no LLM. A maintainer who assigns an open issue to a person (an account of type User) has said that
// person handles it, and the Concierge keeps out of it: this gives the issue `no-auto-processing`, the opt-out label, with
// the workflow token, so that no event follows. The label is sticky: unassigning does nothing, and handing the issue
// back is removing the label (which starts the issue worker once). Rules and reasons: docs/multi-phase-design.md, "Opting
// an item out", and the decision record
// https://github.com/gearsnlevers/issue-concierge/blob/main/docs/decisions/0043-an-item-a-person-handles-is-never-touched-by-the-concierge.md
//
// An assignee alone is not that statement. When the PR worker assigns the coding agent with a personal token, GitHub
// assigns the owner of the token too, in the same second, and `/retry` unassigns only the agent. So the issue is
// "handled by a person" only when a person is assigned, NO bot is (the coding agent is a bot), and plan triage has not
// handed the issue on or classified it (the hand-off and the classification are on the issue when the Concierge assigns the
// agent). All of it is read from the issue as it is now, not from the event that started the run, so the two events of one
// hand-off give the same answer in either order. It never applies to a pull request, never writes for a bot, never writes
// a comment, and never removes anything.
//
// Install: copy to .github/scripts/assigned.mjs (it imports janitor.mjs and opt-out.mjs, so install those too).
import { execFileSync } from 'node:child_process';
import { isCodingAgent, planGateOutcome } from './janitor.mjs';
import { LABEL_OPT_OUT, isOptedOut, labelNames } from './opt-out.mjs';

/** True for an account of type User: the only kind of assignee that is a person. */
export const isPerson = (assignee) => assignee?.type === 'User';

/** True for a bot, the coding agent included. The agent is also known by its login, for an assignee read without its type. */
export const isBotAssignee = (assignee) => assignee?.type === 'Bot' || isCodingAgent(assignee?.login);

/** True when a person is among the assignees and no bot is: the issue is in a person's hands. `assignees`: as the API gives them. */
export function handledByPerson(assignees) {
  const list = assignees || [];
  return list.some(isPerson) && !list.some(isBotAssignee);
}

const skip = (reason) => ({ label: false, reason });

/**
 * Whether to give the issue the opt-out label. `issue`: as the REST API gives it, read now; null for one that cannot be found.
 * Returns { label: boolean, reason }.
 */
export function decide(issue) {
  if (!issue) return skip('the issue could not be found');
  if (issue.pull_request) return skip('a pull request is its own item: the rule never applies to one');
  if (issue.state !== 'open') return skip('the issue is closed');
  if (isOptedOut(issue)) return skip(`the issue carries ${LABEL_OPT_OUT} already`);
  const assignees = issue.assignees || [];
  if (assignees.some(isBotAssignee)) return skip('a bot is assigned (the coding agent, or the person GitHub adds with it, is not a claim)');
  if (!assignees.some(isPerson)) return skip('no person is assigned');
  const outcome = planGateOutcome(labelNames(issue));
  if (outcome) return skip(`the plan gate has an outcome (${outcome}): the issue is the Concierge's, and the existing hold applies`);
  return { label: true, reason: 'a person is assigned, no bot is, and the plan gate has no outcome' };
}

/**
 * ctx: { get(number) -> issue|null, addLabel(number, label), log(line) }. opts: { number, dryRun }.
 * Reads the issue now, decides, and writes the label once. A read or a write that fails throws, and nothing is written on a guess.
 * Returns the verdict.
 */
export async function run(opts, ctx) {
  const { number } = opts;
  let issue;
  try {
    issue = await ctx.get(number);
  } catch (e) {
    throw new Error(`#${number}: could not read the issue: ${e.message}; nothing was written`);
  }
  const verdict = decide(issue);
  if (!verdict.label) {
    ctx.log(`#${number}: skipped (${verdict.reason})`);
    return verdict;
  }
  if (opts.dryRun) {
    ctx.log(`#${number}: would label ${LABEL_OPT_OUT} (${verdict.reason})`);
    return verdict;
  }
  try {
    await ctx.addLabel(number, LABEL_OPT_OUT);
  } catch (e) {
    throw new Error(`#${number}: could not add ${LABEL_OPT_OUT}: ${e.message}`);
  }
  ctx.log(`#${number}: labelled ${LABEL_OPT_OUT} (${verdict.reason})`);
  return verdict;
}

// --------------------------------------------------------------------- main

function gh(args, token) {
  try {
    return execFileSync('gh', args, {
      env: { ...process.env, GH_TOKEN: token },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    const err = new Error(String(e.stderr || e.message).trim());
    err.notFound = /HTTP 404|HTTP 410/.test(err.message);
    throw err;
  }
}

/** The two calls against GitHub, with the token the workflow gives: the workflow token, never the signal token. */
export function realApi(repo, token) {
  return {
    get: async (number) => {
      try {
        return JSON.parse(gh(['api', `repos/${repo}/issues/${number}`], token));
      } catch (e) {
        if (e.notFound) return null;
        throw e;
      }
    },
    addLabel: async (number, label) => {
      gh(['api', `repos/${repo}/issues/${number}/labels`, '--method', 'POST', '-f', `labels[]=${label}`], token);
    },
  };
}

/** Returns the exit code: 0 after a write or a skip, 1 for a failure (a red run is how a maintainer finds out that nothing was written). */
export async function main(argv = process.argv.slice(2), env = process.env, api, log = (line) => console.log(line)) {
  const repo = env.GITHUB_REPOSITORY;
  const number = Number(env.ISSUE_NUMBER);
  if (!repo || !Number.isInteger(number) || number <= 0) {
    log('::error::GITHUB_REPOSITORY and ISSUE_NUMBER are required');
    return 1;
  }
  const dryRun = argv.includes('--dry-run') || String(env.DRY_RUN) === 'true';
  try {
    await run({ number, dryRun }, { ...(api ?? realApi(repo, env.GH_TOKEN || env.GITHUB_TOKEN)), log });
  } catch (e) {
    log(`::error::${e.message}`);
    return 1;
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
