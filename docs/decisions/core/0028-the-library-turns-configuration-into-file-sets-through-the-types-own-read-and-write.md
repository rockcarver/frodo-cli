---
status: accepted
date: 2026-11-27
decision-makers:
  - maintainers
applies-to:
  - src/ops/**
  - src/cli/config-manager/**
  - src/configManagerOps/**
repos:
  - rockcarver/frodo-cli
  - rockcarver/frodo-lib
issues:
  - rockcarver/frodo-cli#1365
  - rockcarver/frodo-lib#1114
  - rockcarver/frodo-lib#1162
---

# The library turns configuration into file sets and back through the type's own read and write, and never touches the file system

## Context and problem statement

This record replaces [core 0024](0024-the-library-turns-configuration-into-file-sets-and-back-and-never-touches-the-file-system.md) and keeps what it decided except three rules: that a pull is a split of the type's export, that what a pull needs is added to the options of export and import, and that a move changes no byte. When the first type moved, on 2026-11-27 (rockcarver/frodo-lib#1162), the code did none of them: a pull reads the entity with the read of its owner, because an export puts a placeholder back for a value that the state holds; what it needs went into a shared engine; and three differences from the old files are on purpose (below). The rules are restated as they hold.

## Decision

Terms as in the record this replaces: a **file set** is a list of files, each with a path and content, as data only (`VirtualFileSet` in code); a **configuration type** has one owner ([core 0022](0022-a-configuration-type-has-one-owner-in-every-layer.md)); a **file set reader** is what a push asks for files.

- **Pure split and merge, pull and push.** Each type has one pure split (objects to a file set) and one pure merge (a file set to what the platform needs), in the module that owns it. Its tenant-facing functions use them: a **pull** reads the type from the tenant and returns a file set, a **push** takes a file set from a reader and writes it to the tenant. They are on the `frodo` facade ([core 0007](0007-public-api-only-through-the-frodo-facade.md)); split and merge are exported from the module only. `export` and `import` keep meaning the JSON export of the library.
- **One tenant path.** A pull reads the type with the one function of its owner that the command line's pull called before the move, and splits the answer; where that is the plain read, the pull does not go through the export, which puts a placeholder back for a value that the state holds. A push merges the files and writes with the one function that the old push called: an import, or an update where the type has no import. The TSDoc of each names the function, and a test per type checks that the requests of the pull and the push are those of that function.
- **Needs go into the engine.** What a pull or push needs beyond that function is an option of the shared engine of the library, with a default that leaves every type that already uses it unchanged.
- **The files keep their bytes, except in three cases.** A move keeps what a pull writes and the requests a push sends, as the command line made them, except: a pull writes every `${` of a value escaped, so that a push reads it as text; a push refuses, and sends nothing for, a file whose id is not the id of the type or that holds none, so that a file set, which comes from a reader the library does not control, cannot point a push at another object; a file that holds an escaped `${` is read as text also when no complete placeholder is in it, so that it reads the same whether or not another line holds one.
- **No file system.** A pull returns a file set; a push asks a `FileSetReader` that the consumer supplies. The library imports no file system module for this and reads no file on its own.
- **One definition per type.** The path rules, shape rules, placeholders and overrides, realm iteration and the per-object results (the outcomes a push returns, and the result callback as for the other imports) are written once, in the library. Secrets are never in a file set in the clear ([core 0013](0013-secrets-are-never-exported-in-the-clear.md)).
- **The consumer keeps the interface.** The command line keeps options, prompts, guards, progress, exit codes and the adapters between a file set and the file system. The library never prints for it.
- **Order.** The library function first, a library release, the pin, then the command line; it removes its own copy in the pull request that uses the library's.

## Consequences

- The library, the MCP server and the command line share one implementation of the format.
- The pull request that moves a command names which of the three differences its files meet, and `MIGRATION.md` gets an item when a user can see one. The old rule, that a move needs none, is withdrawn.
- A command that says it is experimental is not bound to the old bytes ([core 0019](0019-experimental-features-are-not-bound-by-compatibility-records.md)); a difference outside the three still needs a record.
- Kept in sync: the golden file set test of each type, the core copy in both repositories, and the glossary in the tracking issues.
- Not covered: the order of the types, any command or option name, and what a pull returns beside the file set for a type with a list of objects (names that clash, ids that cannot be a file name), which the first such type decides.

## Known deviations

When this section was written, on 2026-11-27, against frodo-cli commit ebfbf06f7 and frodo-lib commit cb729a239, the library still held the file helpers that core 0024 lists (`saveToFile`, `saveJsonToFile`, `saveTextToFile`, `readJsonFile`, `readFiles`, `getFilePath`, `getWorkingDirectory` on `frodo.utils`, and the journey tree resolvers that read files). They deviate from "No file system" and are tracked in rockcarver/frodo-lib#1114. The pull request that removes the last of them removes this section from both repositories.
