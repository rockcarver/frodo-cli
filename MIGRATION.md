# Frodo CLI Migration Guide

This page summarizes the breaking changes between major versions of
`@rockcarver/frodo-cli` — everything you need to migrate scripts and
automation from one major version to the next without deciphering the full
[changelog](CHANGELOG.md).

---

## Upgrading to 5.x

### From 4.x

**Removed command aliases** (backwards-compatibility spellings of the
canonical commands; use the canonical name):

| Removed alias                  | Canonical command      |
| ------------------------------ | ---------------------- |
| `direct-configuration-control` | `frodo dcc`            |
| `logs`                         | `frodo log`            |
| `connection`, `connections`    | `frodo conn`           |
| `policyset`                    | `frodo authz set`      |
| `details`                      | `frodo realm describe` |
| `ig`                           | `frodo agent gateway`  |

**Kept**: `frodo conn save` retains its `add` alias.

**Journey import validation**: journey imports, full configuration imports,
config-manager journey pushes, and `frodo promote` now validate journey
references by default. Pass `--no-validate` to restore the previous behavior.

### Node.js version matrix changes in 5.x

- 5.x is tested on Node.js 26 only, and building frodo from source (the npm
  package) requires Node.js 26 (`engines.node >= 26`). The release binaries
  embed the Node.js 26 runtime and have no Node.js requirement at all.

---

## Upgrading to 4.x

### From 3.x

- Dropped support for Node.js 18 and 20; Node.js 22, 24, and 26 are tested.

**Export extraction is the default, and `-x` now means the opposite.** In 3.x
the export commands extracted scripts and server properties into separate
files only when asked (`-x, --extract`). In 4.x they extract by default, and
`-x, --no-extract` turns extraction off. A 3.x command line that passes `-x`
still runs, but it now keeps that content inline. The long form `--extract`
no longer exists and is rejected. This affects `config export`,
`script export` and `server export`.

| 3.x command line                | Same result in 4.x and later    |
| ------------------------------- | ------------------------------- |
| `frodo config export -A -x ...` | `frodo config export -A ...`    |
| `frodo config export -A ...`    | `frodo config export -A -x ...` |

**Removed option**:

| Removed option                                            | Replacement                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| `-s, --separate-mappings` (`config export`, `idm export`) | None needed: sync mappings are always written to separate files. |

---

## Maintaining This Guide

When a release removes or deprecates a command, alias, or option:

1. Add the removal to the **target major's** section (e.g. "Upgrading to
   5.x / From 4.x") as a table row: removed spelling, canonical replacement.
2. Keep the README's breaking-changes summary in
   [.github/README.md](.github/README.md) as a short list that links here
   for the full detail.
3. Verify against the built binary before publishing: every listed alias
   should actually be rejected (`frodo <alias> -h` falls through to root
   help).
