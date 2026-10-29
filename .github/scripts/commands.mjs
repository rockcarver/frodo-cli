// Comment commands and the options comment of Repo Concierge.
//
// Deterministic: no LLM. A maintainer decides what becomes of an issue that waits for them by commenting a command
// (`/accept`, `/decline`, `/approve`, `/replan`, `/retry`), and the Concierge keeps one comment on such an issue, the
// options comment, that says what is needed and which command does what. The options comment is derived from the
// issue's labels alone (scripts/concierge-state.mjs shows the same state on the status issue), it exists only while a
// maintainer has to act, it is always the last comment, and it is deleted when nothing waits any more.
//
// A command does what a person with the role can already do by hand with the labels, no more. The commenter's role is
// read from GitHub, never from the comment; the issue acted on is the issue of the event, never a number in the text;
// and the text of a comment is data: it is not passed to a shell or to a model, and a reason is echoed with its
// mentions neutralised. The Concierge still never lifts a hold on its own: a person gives the command, and the
// approval names that person. Rules and reasons: docs/multi-phase-design.md, "The maintainer's view".
//
// Install: copy to .github/scripts/commands.mjs (it imports concierge-settings.mjs, concierge-state.mjs,
// plan-approval-resume.mjs, janitor.mjs and opt-out.mjs, so install those too).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { SETTINGS_PATH, parseSettings } from './concierge-settings.mjs';
import { BOT, GATE_LABELS, OPTIONS_MARKER, STUCK_AFTER_MINUTES, isOptionsComment, labelledAt, MAINTAINER_ASSOCIATIONS } from './concierge-state.mjs';
import { LABEL_OPT_OUT, isOptedOut, labelNames } from './opt-out.mjs';
import { MARKER as APPROVAL_MARKER, decide as decideApproval } from './plan-approval-resume.mjs';

export const ROLES = ['read', 'triage', 'write', 'maintain', 'admin'];
export const LABEL_DECLINED = 'declined';
export const LABEL_HANDOFF = 'issue-triage-handoff';
export const LABEL_APPROVAL = 'plan-approval-required';
export const LABEL_PLAN_HANDOFF = 'plan-triage-handoff';
/**
 * The record of `/accept`, a comment of the bot. The labels that show the decision are removed as the issue moves on, and
 * the author association of the maintainer's own comment is not a record: GitHub shows a member with private membership
 * as a CONTRIBUTOR to the workflow token. workflows/issue-triage.md reads this string in its pre-activation step and in its
 * prompt; a test keeps the three equal.
 */
export const ACCEPT_MARKER = '<!-- concierge:accepted -->';

/** The labels that stop an issue at the first gate; a maintainer accepts it by removing them. */
export const STOP_LABELS = ['needs-decision', 'scope-review', 'backlog', 'out-of-scope', LABEL_DECLINED, 'needs-info'];
/** An issue that shows any of these has been handed on: a maintainer or an earlier run decided to plan it. */
const PROGRESS_LABELS = [LABEL_HANDOFF, 'plan-worker-ready', LABEL_PLAN_HANDOFF];

// ------------------------------------------------------------------ the roles

/** The lowest role that may use commands: in a personal repository there is no triage role, so write is the floor. */
export const effectiveNeed = (need, organisation) => (organisation || ROLES.indexOf(need) >= ROLES.indexOf('write') ? need : 'write');

/** True when a person with `role` may use commands under the setting `need`. */
export function mayUse(role, need, { organisation = true } = {}) {
  const rank = ROLES.indexOf(String(role || '').toLowerCase());
  return rank >= 0 && rank >= ROLES.indexOf(effectiveNeed(need, organisation));
}

// ------------------------------------------------------------------ reading a command

/** The commands. workflows/issue-worker.md skips a comment that starts with one of them; a test keeps the two lists equal. */
export const COMMAND_NAMES = ['accept', 'decline', 'approve', 'replan', 'retry', 'help'];
const COMMAND = new RegExp(`^/(${COMMAND_NAMES.join('|')})(?:[ \\t]+(.*))?$`, 'i');

/**
 * The command a comment gives, or null. Only the first line counts, so a command in a quote, a code block or the middle
 * of a sentence does nothing. The rest of the line is the argument (a reason), at most 300 characters.
 */
export function parseCommand(body) {
  const first = String(body || '').replace(/\r/g, '').split('\n').find((l) => l.trim() !== '');
  const m = first ? COMMAND.exec(first.trim()) : null;
  return m ? { name: m[1].toLowerCase(), argument: (m[2] || '').trim().slice(0, 300) } : null;
}

/** A maintainer's words in a comment the bot writes: a mention becomes code, so that the bot's comment notifies nobody. */
export const neutralizeMentions = (text) => String(text || '').replace(/@([A-Za-z0-9][A-Za-z0-9_-]*)/g, '`@$1`');

// ------------------------------------------------------------------ when a maintainer has to act

const classified = (labels) => [...labels].some((l) => l.startsWith('complexity/')) && [...labels].some((l) => l.startsWith('risk/'));

/**
 * What the issue waits for, or null when it waits for no maintainer:
 * decision (held because it changes what exists), scope (held for the scope), plan (a classified plan waits for
 * approval), stalled (a gate label has not moved for an hour). A request kept out of the Concierge, a bot's issue, a
 * pull request and a closed issue wait for nobody.
 */
export function situationOf(issue, { events = [], now = Date.now() } = {}) {
  if (issue.pull_request || issue.state !== 'open') return null;
  if (isOptedOut(issue) || (issue.user && issue.user.type === 'Bot')) return null;
  const labels = new Set(labelNames(issue));
  if (labels.has('needs-decision')) return 'decision';
  if (labels.has('scope-review')) return 'scope';
  if (labels.has(LABEL_APPROVAL) && classified(labels)) return 'plan';
  const gate = GATE_LABELS.find((l) => labels.has(l));
  if (gate) {
    const since = labelledAt(events, gate);
    if (since !== null && now - since > STUCK_AFTER_MINUTES * 60000) return 'stalled';
  }
  return null;
}

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * Why a plan is held, from the lines the plan worker writes for plan triage: a conflict with a decision record, the
 * wrong layer, work in another repository, a breaking change, or none of these.
 */
export function planReason(comments, repo) {
  const marker = new RegExp(`gh-aw-workflow-call-id:\\s*${esc(repo)}/plan-worker(?![\\w-])`, 'i');
  const plans = comments.filter((c) => c.user && c.user.login === BOT && marker.test(c.body || ''));
  const body = plans.length ? plans[plans.length - 1].body : '';
  if (/^\s*[-*]?\s*Conflicts with /m.test(body)) return 'conflict';
  if (/^\s*(?:\*\*)?Wrong layer:/m.test(body)) return 'wrong-layer';
  if (/^\s*Work item:/m.test(body)) return 'work-item';
  if (/^\s*[-*]?\s*(?:\*\*)?Breaking change:/m.test(body)) return 'breaking';
  return 'plain';
}

// ------------------------------------------------------------------ the options comment

const SENTENCE = {
  decision: 'This request changes something that already exists, so a maintainer needs to decide on it before anything is planned.',
  scope: 'A maintainer needs to decide whether this fits the project.',
  stalled: 'This issue has not moved for a while. A maintainer can start it again.',
  'plan.plain': 'A maintainer needs to approve the plan before anything is built.',
  'plan.conflict': 'This request conflicts with a decision the project has taken. A maintainer needs to decide.',
  'plan.wrong-layer': 'The plan found that the fix belongs in another repository. A maintainer needs to decide what happens next.',
  'plan.work-item': 'The plan needs work in two repositories. A maintainer needs to decide how to split it.',
  'plan.breaking': 'The plan found a change to something that already exists. A maintainer needs to decide whether it goes ahead.',
};

const ACCEPT = (label) => ['/accept', `Plan it: removes \`${label}\` and hands the issue to the plan worker.`];
const DECLINE = ['/decline [reason]', 'Close it as not planned: adds `declined` and tells the reporter, with your reason.'];
const ROWS = {
  decision: [ACCEPT('needs-decision'), DECLINE],
  scope: [ACCEPT('scope-review'), DECLINE],
  plan: [
    ['/approve', 'Let the coding agent start: removes `plan-approval-required` and hands the issue to implementation.'],
    ['/replan [what to change]', 'Ask for a new plan: your comment tells the plan worker what to change.'],
    DECLINE,
  ],
  stalled: [['/retry', 'Give the gate label again, so that the gate runs once more.']],
};
const EXTRA = {
  'plan.work-item': 'To split the work, run **Spawn Work Items** from the Actions tab. `/approve` lets this repository\'s part go on alone.',
  'plan.wrong-layer': 'The plan names the repository where the fix belongs; move or re-route the issue there, or `/decline` it here.',
  'plan.conflict': 'The plan names the decision record. Change the request, or supersede the record, before you approve.',
};

/**
 * The options comment this issue should have, or null. kind is what the issue waits for (and why, for a plan): when it
 * changes, the comment is posted again instead of edited, so that people who follow the issue are told.
 */
export function optionsFor(issue, { comments = [], events = [], now = Date.now(), settings, repo, organisation = true }) {
  const situation = situationOf(issue, { events, now });
  if (!situation) return null;
  const kind = situation === 'plan' ? `plan.${planReason(comments, repo)}` : situation;
  const need = effectiveNeed(settings.commands.need, organisation);
  const rows = ROWS[situation].map(([command, what]) => `| \`${command}\` | ${what} |`).join('\n');
  const body = [
    `${OPTIONS_MARKER} kind=${kind} -->`,
    SENTENCE[kind],
    '',
    '<details><summary>Maintainer options</summary>',
    '',
    '| Comment | What it does |',
    '| --- | --- |',
    rows,
    '',
    ...(EXTRA[kind] ? [EXTRA[kind], ''] : []),
    `Start a comment with the command; the rest of that line is your reason. It needs the **${need}** role or higher${need === 'write' && settings.commands.need !== 'write' ? ' (this is a personal repository)' : ''}. The same can be done by hand with the labels.`,
    '',
    '</details>',
  ].join('\n');
  return { kind, body };
}

export const menuKind = (comment) => /concierge:options kind=(\S+)/.exec(comment.body || '')?.[1] ?? null;

const stamp = (c) => `${c.created_at ?? ''}#${String(c.id ?? 0).padStart(20, '0')}`;

/**
 * What to do to the issue's comments so that the options comment is what it should be: the operations, in order.
 * It stays where it is only when it is the last comment of the issue and of the same kind; the same kind with other
 * words is edited in place; anything else is deleted and posted again, at the end. Duplicates are deleted.
 */
export function planMenu({ desired, comments }) {
  const menus = comments.filter(isOptionsComment);
  const ops = [];
  if (!desired) return menus.map((m) => ({ op: 'delete', id: m.id }));
  const last = [...comments].sort((a, b) => stamp(a).localeCompare(stamp(b))).pop();
  const keep = last && isOptionsComment(last) ? last : null;
  for (const m of menus) if (m !== keep) ops.push({ op: 'delete', id: m.id });
  if (keep && menuKind(keep) === desired.kind) {
    if (keep.body.trim() !== desired.body.trim()) ops.push({ op: 'edit', id: keep.id, body: desired.body });
  } else {
    if (keep) ops.push({ op: 'delete', id: keep.id });
    ops.push({ op: 'post', body: desired.body });
  }
  return ops;
}

// ------------------------------------------------------------------ what a command does

const refuse = (reason) => ({ ok: false, reason });
const done = (note) => ({ ok: true, note });

/**
 * Do what the command says to the issue, through api. Returns { ok, reason } for a refusal (a reply says why) or
 * { ok: true }. The caller has checked the role. Labels that only stop the issue are removed with the workflow token (a
 * removal starts nothing); the label that hands the issue on, and a close, are made with the signal token, because
 * those are what start the next gate.
 */
export function runCommand(cmd, { issue, actor, api, paused = false }) {
  const n = issue.number;
  const labels = new Set(labelNames(issue));
  if (isOptedOut(issue)) return refuse(`This issue carries \`${LABEL_OPT_OUT}\`, so the Concierge does not touch it. Remove the label to hand it over.`);

  // While the Concierge is paused no gate starts, so a command that hands an issue on would leave it behind a gate that
  // never runs. Declining and listing the commands start nothing.
  if (paused && ['accept', 'approve', 'replan', 'retry'].includes(cmd.name)) {
    return refuse('The Concierge is paused (the repository variable `CONCIERGE_PAUSED` is `true`), so nothing would start. Resume it first, then give the command again.');
  }

  switch (cmd.name) {
    case 'accept': {
      const stops = STOP_LABELS.filter((l) => labels.has(l));
      if (stops.length === 0) {
        if (issue.state !== 'open') return refuse('This issue is closed and nothing marks it as declined or held, so there is nothing to accept.');
        if (labels.has(LABEL_APPROVAL)) return refuse('Nothing stops this issue at the first gate; its plan waits for approval, which is `/approve`.');
        return refuse('Nothing stops this issue: it has already been handed on.');
      }
      for (const l of stops) api.removeLabel(n, l);
      if (issue.state !== 'open') api.reopen(n);
      // The record comes before the label that hands the issue on, so that nothing the hand-over starts can miss it.
      api.reply(n, `${ACCEPT_MARKER}\nAccepted by @${actor} with /accept. The request goes to planning now.`);
      api.addLabelSignal(n, LABEL_HANDOFF);
      return done(`removed ${stops.join(', ')} and handed the issue to the plan worker`);
    }
    case 'decline': {
      if (issue.state !== 'open' && labels.has(LABEL_DECLINED)) return refuse('This issue is already declined.');
      api.addLabel(n, LABEL_DECLINED);
      api.reply(n, `Thanks for the report. A maintainer has decided not to take this on.${cmd.argument ? `\n\n${neutralizeMentions(cmd.argument)}` : ''}`);
      if (issue.state === 'open') api.closeSignal(n);
      return done('declined and closed as not planned');
    }
    case 'approve': {
      if (!labels.has(LABEL_APPROVAL)) return refuse('There is no plan waiting for approval: the issue does not carry `plan-approval-required`.');
      const without = { ...issue, labels: [...labels].filter((l) => l !== LABEL_APPROVAL) };
      const verdict = decideApproval(without, undefined, actor);
      if (!verdict.handoff) return refuse(`The plan cannot be approved yet: ${verdict.reason}.`);
      api.removeLabel(n, LABEL_APPROVAL);
      api.addLabelSignal(n, LABEL_PLAN_HANDOFF);
      api.reply(n, `${APPROVAL_MARKER}\nPlan approved by @${actor} with /approve. Handing the issue to implementation.`);
      return done('approved and handed to implementation');
    }
    case 'replan': {
      if (issue.state !== 'open' || !labels.has(LABEL_APPROVAL)) return refuse('`/replan` asks for a new plan for a plan that waits for approval; this issue has none.');
      if (labels.has(LABEL_HANDOFF)) api.removeLabel(n, LABEL_HANDOFF);
      api.addLabelSignal(n, LABEL_HANDOFF);
      return done('asked the plan worker for a new plan');
    }
    case 'retry': {
      const gate = GATE_LABELS.find((l) => labels.has(l));
      if (issue.state !== 'open' || !gate) return refuse('Nothing is in a gate on this issue, so there is nothing to start again.');
      api.removeLabel(n, gate);
      api.addLabelSignal(n, gate);
      return done(`gave \`${gate}\` again`);
    }
    case 'help':
      api.reply(
        n,
        [
          'Commands for maintainers. Start a comment with one; the rest of that line is your reason.',
          '',
          '| Comment | What it does |',
          '| --- | --- |',
          ...['/accept', '/decline [reason]', '/approve', '/replan [what to change]', '/retry'].map((c) => `| \`${c}\` | ${ROWS_ALL[c]} |`),
        ].join('\n')
      );
      return done('listed the commands');
    default:
      return refuse('Unknown command.');
  }
}

const ROWS_ALL = {
  '/accept': 'Plan an issue that is held (`needs-decision`, `scope-review`, `backlog`, `needs-info`) or declined.',
  '/decline [reason]': 'Close an issue as not planned, add `declined`, and tell the reporter.',
  '/approve': 'Approve a plan that waits for approval; the coding agent starts.',
  '/replan [what to change]': 'Ask for a new plan for a plan that waits for approval.',
  '/retry': 'Give the gate label of an issue again, so that its gate runs once more.',
};

// ------------------------------------------------------------------ GitHub

/** The real api: the gh CLI, with the workflow token for what should start nothing and the signal token for what should. */
export function realApi(env, repo) {
  const call = (args, token, input) =>
    execFileSync('gh', args, { env: { ...process.env, GH_TOKEN: token }, encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  const json = (method, path, body, token = env.GH_TOKEN) => {
    const out = call(['api', path, '--method', method, ...(body ? ['--input', '-'] : [])], token, body ? JSON.stringify(body) : undefined);
    return out ? JSON.parse(out) : null;
  };
  const signal = env.SIGNAL_TOKEN || env.GH_TOKEN;
  const get = (path, token = env.GH_TOKEN) => {
    try {
      return { status: 200, data: json('GET', path, undefined, token) };
    } catch (e) {
      const m = /HTTP (\d{3})/.exec(String(e.stderr || e.message || ''));
      return { status: m ? Number(m[1]) : 0, data: null };
    }
  };
  const list = (path, maxPages = 10) => {
    const all = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const res = get(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      if (res.status !== 200 || !Array.isArray(res.data)) return null;
      all.push(...res.data);
      if (res.data.length < 100) break;
    }
    return all;
  };
  const ignore404 = (fn) => {
    try {
      fn();
    } catch (e) {
      if (!/HTTP 404/.test(String(e.stderr || e.message))) throw e;
    }
  };
  return {
    getIssue: (n) => get(`repos/${repo}/issues/${n}`).data,
    listComments: (n) => list(`repos/${repo}/issues/${n}/comments`),
    listEvents: (n) => list(`repos/${repo}/issues/${n}/events`, 3) ?? [],
    listOpenIssues: () => list(`repos/${repo}/issues?state=open`),
    listRecentComments: (since) => list(`repos/${repo}/issues/comments?since=${encodeURIComponent(since)}`, 10) ?? [],
    role(login) {
      for (const token of [env.GH_TOKEN, signal]) {
        const res = get(`repos/${repo}/collaborators/${encodeURIComponent(login)}/permission`, token);
        if (res.status === 200 && res.data) return String(res.data.role_name || res.data.permission || '').toLowerCase();
        if (res.status === 404) return 'none';
      }
      return null;
    },
    removeLabel: (n, label) => ignore404(() => json('DELETE', `repos/${repo}/issues/${n}/labels/${encodeURIComponent(label)}`)),
    addLabel: (n, label) => json('POST', `repos/${repo}/issues/${n}/labels`, { labels: [label] }),
    addLabelSignal: (n, label) => json('POST', `repos/${repo}/issues/${n}/labels`, { labels: [label] }, signal),
    closeSignal: (n) => json('PATCH', `repos/${repo}/issues/${n}`, { state: 'closed', state_reason: 'not_planned' }, signal),
    reopen: (n) => json('PATCH', `repos/${repo}/issues/${n}`, { state: 'open' }),
    reply: (n, body) => json('POST', `repos/${repo}/issues/${n}/comments`, { body }),
    react: (commentId, content) => json('POST', `repos/${repo}/issues/comments/${commentId}/reactions`, { content }),
    postComment: (n, body) => json('POST', `repos/${repo}/issues/${n}/comments`, { body }),
    editComment: (id, body) => json('PATCH', `repos/${repo}/issues/comments/${id}`, { body }),
    deleteComment: (id) => ignore404(() => json('DELETE', `repos/${repo}/issues/comments/${id}`)),
    read: (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null),
  };
}

// ------------------------------------------------------------------ the options comment of one issue

/** Bring one issue's options comment to what it should be. Returns the operations made. */
export function syncOptions(api, issue, { repo, settings, organisation, now }) {
  const comments = api.listComments(issue.number);
  if (!comments) return [];
  const labels = new Set(labelNames(issue));
  const events = GATE_LABELS.some((l) => labels.has(l)) ? api.listEvents(issue.number) : [];
  const desired = settings.commands.on ? optionsFor(issue, { comments, events, now, settings, repo, organisation }) : null;
  const ops = planMenu({ desired, comments });
  for (const o of ops) {
    if (o.op === 'delete') api.deleteComment(o.id);
    else if (o.op === 'edit') api.editComment(o.id, o.body);
    else api.postComment(issue.number, o.body);
  }
  return ops;
}

/** The labels that make an issue wait for a maintainer or move through a gate: an issue with none of them has no options comment to keep. */
const WAITING_LABELS = new Set(['needs-decision', 'scope-review', LABEL_APPROVAL, ...GATE_LABELS]);

/** The issues that may have an options comment, or have one: those that carry a label that waits for a maintainer, and those that hold a recent menu. */
export function menuCandidates(api, now) {
  const open = api.listOpenIssues();
  if (!open) return null;
  const numbers = new Set(open.filter((i) => !i.pull_request && labelNames(i).some((l) => WAITING_LABELS.has(l))).map((i) => i.number));
  const since = new Date(now - 30 * 86400000).toISOString();
  for (const c of api.listRecentComments(since)) {
    if (isOptionsComment(c) && /\/issues\/(\d+)$/.test(c.issue_url || '')) numbers.add(Number(c.issue_url.split('/').pop()));
  }
  return { open, numbers: [...numbers].sort((a, b) => a - b) };
}

// ------------------------------------------------------------------ the entry point

function settingsFrom(api, log) {
  const { settings, problems } = parseSettings(api.read(SETTINGS_PATH));
  for (const p of problems) log(`::warning::${p}`);
  return { on: settings.commands, need: settings['commands-need'] };
}

const isCollaborator = (association) => MAINTAINER_ASSOCIATIONS.has(association);

export function main(env = process.env, api = realApi(env, env.GITHUB_REPOSITORY), log = (m) => console.log(m)) {
  const repo = env.GITHUB_REPOSITORY;
  if (!repo) {
    log('::error::GITHUB_REPOSITORY is required');
    return 1;
  }
  const event = env.GITHUB_EVENT_NAME;
  const payload = env.GITHUB_EVENT_PATH && fs.existsSync(env.GITHUB_EVENT_PATH) ? JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8')) : {};
  const now = Date.now();
  const cfg = settingsFrom(api, log);
  const settings = { commands: cfg };
  if (!cfg.on) {
    log('commands is false: no command is read and no options comment is kept');
    return 0;
  }
  const organisation = (payload.repository && payload.repository.owner && payload.repository.owner.type) !== 'User';
  const ctx = { repo, settings, organisation, now };

  const syncOne = (number) => {
    const issue = api.getIssue(number);
    if (!issue || issue.pull_request) return;
    const ops = syncOptions(api, issue, ctx);
    if (ops.length) log(`#${number}: options comment ${ops.map((o) => o.op).join(', ')}`);
  };

  if (event === 'issue_comment' && payload.issue) {
    if (payload.issue.pull_request) return 0;
    const number = payload.issue.number;
    const commenter = payload.comment && payload.comment.user;
    const cmd = commenter && commenter.type !== 'Bot' ? parseCommand(payload.comment.body) : null;
    if (cmd) {
      const role = api.role(commenter.login);
      const allowed = role !== null && mayUse(role, cfg.need, { organisation });
      if (allowed) {
        const result = runCommand(cmd, { issue: api.getIssue(number), actor: commenter.login, api, paused: env.CONCIERGE_PAUSED === 'true' });
        api.react(payload.comment.id, result.ok ? 'rocket' : 'confused');
        if (!result.ok) api.reply(number, `Could not run \`/${cmd.name}\`: ${result.reason}`);
        log(`#${number}: /${cmd.name} by ${commenter.login}: ${result.ok ? result.note : result.reason}`);
      } else if (isCollaborator(payload.comment.author_association)) {
        api.react(payload.comment.id, 'confused');
        api.reply(number, role === null
          ? `Could not run \`/${cmd.name}\`: GitHub did not tell the Concierge your role in this repository.`
          : `Could not run \`/${cmd.name}\`: commands need the **${effectiveNeed(cfg.need, organisation)}** role or higher, and yours is ${role}.`);
        log(`#${number}: /${cmd.name} by ${commenter.login} refused (role ${role})`);
      } else {
        log(`#${number}: /${cmd.name} by ${commenter.login} ignored (not a collaborator)`);
      }
    }
    // A comment on an issue that waits for nobody costs nothing more; a menu that is left over is removed by the hourly run.
    if (cmd || labelNames(payload.issue).some((l) => WAITING_LABELS.has(l))) syncOne(number);
    return 0;
  }
  if (event === 'issues' && payload.issue) {
    syncOne(payload.issue.number);
    return 0;
  }
  if (event === 'workflow_dispatch' && env.ISSUE_NUMBER) {
    syncOne(Number(env.ISSUE_NUMBER));
    return 0;
  }
  const found = menuCandidates(api, now);
  if (!found) {
    log('::error::the open issues could not be listed; the options comments are left as they are');
    return 1;
  }
  for (const number of found.numbers.slice(0, 60)) syncOne(number);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
