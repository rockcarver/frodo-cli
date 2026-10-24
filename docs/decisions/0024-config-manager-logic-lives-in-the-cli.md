---
status: deprecated
date: 2026-10-24
decision-makers: maintainers
applies-to:
  - src/configManagerOps/**
  - src/cli/config-manager/**
  - src/utils/FrConfig.ts
  - src/utils/Config.ts
---

# The config-manager logic lives in the CLI instead of the library (deprecated)

## Context and problem statement

Umbrella record 0001: the library is the brain and the CLI is a thin wrapper; business logic and configuration management belong in frodo-lib behind the facade, the CLI adds terminal concerns only. The config-manager commands pull a tenant's configuration into the fr-config-manager directory layout and push it back. That layout, the splitting of an entity into files, the placeholders and the realm iteration are knowledge about the configuration, not about a terminal, and nothing in them is specific to an interface. They are implemented in the CLI, with next to no counterpart in the library (only `RawConfigOps.ts`, the raw import and export options). Other consumers (a script, the MCP server, another tool) cannot use them. Measured on `main` (75c58f4c, 2026-10-24).

## Decision

Deprecated and not extended:

- No new config-manager entity support is written in the CLI. A new entity is built library first (a library function behind the facade) and wrapped (records 0007, 0023).
- Meanwhile the CLI does not copy layout or placeholder helpers (`utils/FrConfig.ts`) into other commands, does not add file-system layout logic to command files, and does not add facade-less API calls.

### Evidence

| What | Result |
| - | - |
| operations | 42 modules, 5,198 lines; 115 facade calls against 376 file-system calls (3.3 file operations per library call) |
| commands | 87 files, 4,626 lines, no direct library call (they only call the ops modules) |
| helpers | `utils/FrConfig.ts` (119 lines: `safeFileName`, `escapePlaceholders`, `esvToEnv`, `replaceAllInJson`, `clearOperationalAttributes`, `fileFilter`) and the full-export readers in `utils/Config.ts` (record 0027) |
| library counterpart | `RawConfigOps.ts` only |
| share of the CLI | 83 of 339 commands (24.5%); 8,324 of 66,177 source lines (12.6%) |
| tests | 87 e2e files, 92 `-h` snapshots, 3 unit tests |
| per function | 79% of the 119 functions are small (at most 3 logic indicators); the weight is in layout and file handling, not in complexity |

Clusters, with the work to move each into the library (size S, M or L):

| Cluster | Modules and lines | Library work | Size |
| - | - | - | - |
| foundations: all, raw, metadata, entity, direct-control, restart | 6, 545 | the file-set abstraction (relative path to content), realm iteration, placeholder rules; align with `RawConfigOps` | M |
| simple entities: access config, audit, cookie domains, CORS, CSP, email provider and templates, endpoints, KBA, locales, password policy, remote servers, schedules, terms and conditions, UI config, internal roles, connector definitions and mappings, managed and service objects, organisation privileges, secret mappings, telemetry, authentication | 25, 2,350 | one generic export and import over `frodo.idm.config` and the AM settings APIs, with per-entity layout rules | M together (S each) |
| transform-heavy: journeys 407, SAML 279, secrets 260, scripts 218, variables 215, authorization policies 206, services 191, IGA workflows 168, OAuth2 agents 132, themes 130, custom nodes 97 | 11, 2,303 | per-entity extraction of scripts, HTML and JSON into side files and the inverse; journeys L, SAML, secrets, variables, scripts, policies, services and IGA M, the others S | L |
| command files | 87, 4,626 | rewire to the new facade calls; they keep options, progress and file reading and writing | S |

Overall size: L.

## Consequences

- Library users and the MCP server cannot export or import configuration in this layout.
- Library and CLI release in lockstep for any change to the layout.

### Remediation

Direction only; not scheduled. The logic moves into frodo-lib behind the facade, returning and accepting a set of files (path and content) so that the library does no terminal work; the CLI keeps what is terminal: arguments, progress, writing and reading the files, standard input, exit codes. `src/configManagerOps/` folds into `src/ops/` (record 0023).

- Order: library module first, library release, pin bump, then the CLI rewrite per cluster (record 0012). Foundations first, then the simple entities, then the transform-heavy ones.
- Implications: the library gains a new facade surface (additive, not breaking); the CLI's behaviour must stay byte-identical, with the 87 e2e recordings and 92 snapshots as the safety net; no CLI release is breaking.
- Independent of the command renames in record 0022.
