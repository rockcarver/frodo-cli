---
status: accepted
date: 2026-10-24
decision-makers:
  - maintainers
applies-to:
  - docs/decisions/core/**
  - decisions/core/**
repos:
  - rockcarver/frodo-cli
  - rockcarver/frodo-lib
---

# Core decision records are kept in each repository

## Context and problem statement

Sixteen of the first seventeen cross-repository records bind both frodo-cli and frodo-lib. They lived in the umbrella repository rockcarver/frodo, which holds no code, is rarely opened and has no required checks. The Repo Concierge's gates read only the repository they run in, so each repository also restated every record in one sentence, and one cross-repository decision took three pull requests.

## Decision

- A decision that binds more than one repository is a core record: one file in the `core/` folder of every repository it binds (`docs/decisions/core/` in frodo-cli, `decisions/core/` in frodo-lib; the Homebrew tap holds the ones that bind it), with the same name and the same text in each.
- Cite a core record as "core NNNN", never as "NNNN" alone: each repository's own records have their own numbers. The index of each repository lists the core records with their `applies-to`.
- Numbers inside `core/` count up from 0001, are never reused and have no gaps. A new core record takes the next free number in every repository, in one pull request per repository.
- Accepted core records are not edited. A new core record supersedes an old one; the old one's status line is the only change, and it is made in every repository. The one exception is a Known deviations section (next bullet).
- A "Known deviations" section says where the code or the repository does not yet follow the record. It is a status note, not part of the decision: it names the tracking issue and the commit it was written against, and it may be added, edited or removed, without a new record, in the pull request that fixes the deviation or opens its tracking issue. That pull request says so in its description, and a maintainer reviews the change like any change to a record. Nothing else in an accepted record changes.
- A weekly check compares each repository's `core/` with its sibling's and fails the run on a missing file or a difference. It opens no issues.
- The umbrella repository rockcarver/frodo is archived. Its records stay readable there as history and are not updated.
- This record supersedes one sentence of core 0003, the one that says decisions spanning repositories live in the umbrella repository. The rest of core 0003 stays in force, and so does its status.

## Consequences

- A cross-repository decision costs one pull request in each repository instead of three, and the gates, the validators and the skills read the full record next to the code.
- The two repositories can differ between the merge of one pull request and the merge of its pair. The weekly check finds a pair that stays apart, so merge the two pull requests together.
- Records that cite "umbrella NNNN" keep working through the archived repository. New text says "core NNNN" and links the local file.
- A repository that starts using core records copies the whole `core/` folder and adds the index.
- A pull request that fixes a recorded deviation edits the Known deviations section of that record in the same pull request, in every repository that holds it, so a record never claims that a fixed defect is still open.

## Alternatives considered

Keep the umbrella repository as the single home: no copies, but a dormant repository without required checks would hold the strongest rules, and the gates cannot read it. Mirror the umbrella into each repository automatically: the full text everywhere, but a sync workflow to build and a dormant repository to keep.

Supersede a record every time one of its deviations is fixed: the rule stays literal, but each fix restates a whole record to retire one status note.
