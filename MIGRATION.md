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

### Node.js version matrix changes in 5.x

- 5.x is tested on Node.js 26 only, and building frodo from source (the npm
  package) requires Node.js 26 (`engines.node >= 26`). The release binaries
  embed the Node.js 26 runtime and have no Node.js requirement at all.

---

## Upgrading to 4.x

### From 3.x

- Dropped support for Node.js 18 and 20; Node.js 22, 24, and 26 are tested.

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
