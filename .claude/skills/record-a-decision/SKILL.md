---
name: record-a-decision
description: Use when a change settles something that will outlive it (a rule contributors must follow, a behaviour users rely on, a design principle), when a pull request changes a behaviour an accepted decision record covers, or when you need to supersede or deprecate a record. Covers when a record is warranted, numbering, front matter, the fixed sections, the index in docs/decisions/README.md, the sensitivity screen and the validator test.
---

# Record a decision

A decision record says **what we chose and why**, as a rule a reviewer can check. A skill like this one says **how to do a task**. The records are binding, the skills point at them. The authoritative text is [docs/decisions/README.md](../../../docs/decisions/README.md); this is the order to do it in.

## 1. Decide whether you need one

Write a record for a decision that outlives the change that prompted it: a rule contributors must follow, a behaviour users rely on, a design principle, a policy. Do not write one for an implementation note, a refactor or a bug fix. When in doubt, ask in the issue.

- **An accepted record is binding.** Read the index first (`docs/decisions/README.md`, "Index"; the `applies-to` column says which paths each one covers).
- **If your task conflicts with an accepted record, stop and say so** in the issue or pull request. Do not override it and do not work around it.
- **A pull request that changes a decided behaviour adds a new record or supersedes the old one**, in the same pull request.
- **A decision that binds more than this repository** (frodo-lib, the Homebrew tap, the Repo Concierge) is recorded once in the public umbrella repository [rockcarver/frodo](https://github.com/rockcarver/frodo), in its `docs/decisions/`, and linked from the section "Decisions that span repositories" of this repository's README. Do not copy it here.

## 2. Write it

```console
ls docs/decisions                                   # the highest number is the last record
cp docs/decisions/template.md docs/decisions/NNNN-short-title.md
```

- **File name:** `NNNN-short-title.md`, four digits, the next number (counted up from `0001`, never reused, no gaps), lowercase words joined by hyphens.
- **Front matter:** `status` (`proposed`, `accepted`, `rejected`, `deprecated` or `superseded by NNNN`), `date` (the day the status last changed, `YYYY-MM-DD`), `decision-makers` (roles such as `maintainers`, never private data), `applies-to` (a list of path globs the decision binds; leave it out for a repository-wide decision), and optionally `issues` (`owner/repo#number`). No other keys.
- **Body:** a title and the sections `Context and problem statement`, `Decision`, `Consequences`, and optionally `Alternatives considered`, in that order and no others.
- **Decision as rules**, in plain language: what is allowed, what is not, and the one or two exceptions. A reviewer must be able to check it.
- **Keep it short:** at most 60 lines. Say what must be kept in sync (tests, lint rules, docs) under `Consequences`.
- **Status:** `accepted` is for a decision the maintainers have made (the issue or the review says so). If nobody with that authority has decided it yet, write the record as `proposed` and say so in the pull request. `deprecated` marks a known deviation that is not extended and is to be rectified (see cli records 0023, 0024, 0025 and 0026 for how that reads).

## 3. Add it to the index

Add a row to the table under "Index" in `docs/decisions/README.md`: the number linked to the file, the title exactly as in the record, the status exactly as in the record, and every `applies-to` glob in backticks (`repository-wide` when there are none).

## 4. Screen it for sensitive content

The repository is public, and so is everything in a record, its history and its pull request.

- No secrets, keys, tokens, passwords, customer or tenant names, private URLs, e-mail addresses, or names of people. Roles instead.
- No details of a security weakness, an incident or an unfixed bug. Say "a secret could be exposed" in general terms at most, or leave it out and ask a maintainer how to record it.
- Name no tool or vendor: the validator rejects it.

Write the pull request description the same way, and check it before you publish it: an edit history keeps earlier revisions of a description.

## 5. Supersede or deprecate

- Accepted records are not edited, except for a typo.
- To change a decision, write a new record that says which one it replaces, and set the old record's status to `superseded by NNNN` (its only other edit). Update both index rows.
- A superseded or deprecated record may keep `applies-to` paths that no longer exist; an accepted one may not.

## 6. Run the validator

```console
npm run test:only -- test/unit/DecisionRecords.test.js
```

It checks the file names and numbering, the front matter keys and statuses, the section order, the 60-line limit, that no tool name or e-mail address appears, that `applies-to` paths exist for accepted records, that every record has an index row that matches it, and that `AGENTS.md` and `CLAUDE.md` still lead to the records. It cannot judge what a decision says: that is for the reviewer.

If you rename or renumber a file, fix the index and every link to it (`grep -rn "decisions/00" .`), including the skills in `.claude/skills/`.

## Stop and ask when

- your task conflicts with an accepted record;
- you are not sure the decision is the maintainers' to make;
- the record would need private or sensitive detail to make sense.
