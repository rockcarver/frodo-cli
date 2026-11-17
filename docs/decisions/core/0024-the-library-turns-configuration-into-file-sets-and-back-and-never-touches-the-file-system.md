---
status: proposed
date: 2026-11-16
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
---

# The library turns configuration into file sets and back, and never touches the file system

## Context and problem statement

[Core 0001](0001-library-is-the-brain-cli-is-a-thin-wrapper.md) makes the library the brain. The config-manager commands write a tenant's configuration as a folder of small files and read it back, one file per object, so that a version control diff shows what changed. The knowledge in that is about the configuration, not about a terminal: how an object is split into files, the shape rules, the placeholders, the overrides, the realm iteration. When this was decided, on 2026-11-16, all of it lived in the CLI, mixed with file reads and writes and terminal output, so library users and other consumers could not use the format and the pure parts could be tested only with a file system and a recorded tenant. CLI records 0023 and 0024 mark this as a deviation to be rectified, without a contract or a schedule.

## Decision

Terms: a **file set** is a list of files, each with a path and content, as data only: it is never the file system itself (the type is called `VirtualFileSet` in code). A **configuration type** is one type of object that config-manager manages and that has one owner (core 0022): a journey, a script, a trusted JWT issuer. Agent is a supertype and each agent type is a subtype of it: a subtype that has an owner of its own is skipped by the supertype, which owns the agent types that have none. A **file set reader** is what a push asks for files.

- **Pure split and merge, pull and push.** For each configuration type the library has one pure split (objects to a file set) and one pure merge (a file set to what the platform needs), in the module that owns the type. The module's tenant-facing functions use them: a **pull** reads the type from the tenant and returns a file set, a **push** takes a file set from a reader and writes it to the tenant. They are exposed on the `frodo` facade ([core 0007](0007-public-api-only-through-the-frodo-facade.md)); the split and merge are exported from the module only. `export` and `import` keep meaning the JSON export of the library.
- **One tenant path.** A pull is a split of the type's export and a push is a merge followed by its import: a type is read from the tenant in one place and written in one place. What a pull or push needs is added to the options of export and import, so the heritage commands get it too, and a test per type checks that a pull makes the requests of the export it wraps.
- **No file system.** A pull returns a file set; it does not write files. A push takes a `FileSetReader` (it lists a directory and reads a file) that the consumer supplies. The library imports no file system module for this and reads no file on its own.
- **One definition per type.** The path rules, the shape rules, the placeholders and overrides, the realm iteration and the per-object results (through callbacks, as for the other imports) are written once, in the library, and a type has one owner ([core 0022](0022-a-configuration-type-has-one-owner-in-every-layer.md)). Secrets are never in a file set in the clear ([core 0013](0013-secrets-are-never-exported-in-the-clear.md)).
- **The consumer keeps the interface.** The CLI keeps options, prompts, guards, progress, exit codes and the adapters that write a file set to the file system and read it back. The library never prints for it.
- **The files do not change.** A move changes no byte of what a pull writes or a push reads. Each type has a test in the library that pins its file set before the CLI uses it, and the CLI's recordings and snapshots stay as the safety net.
- **Order.** The library function first, a library release, the pin, then the CLI rewrite; the CLI removes its own copy in the pull request that uses the library's. A type that is not moved yet is not extended in the CLI except as a pure split and merge kept apart from file reads and writes.

## Consequences

- Library users, the MCP server and the CLI share one implementation of the format; the CLI's config-manager layer shrinks to commands and adapters.
- The library's facade grows (additive). Users of the CLI see no change, so no `MIGRATION.md` item is needed for a move.
- CLI records 0023 and 0024 stay `deprecated` until the layer is gone; they describe the deviation this record rectifies.
- Kept in sync: the golden file set test of each type, the core copy in both repositories, and the glossary in the tracking issues.
- Not covered: the order and schedule of the types (the tracking issues), and any command or option name.
