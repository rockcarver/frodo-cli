---
status: proposed
date: 2026-10-24
decision-makers: maintainers
applies-to:
  - src/utils/Config.ts
  - src/ops/ConfigOps.ts
  - src/ops/IdmOps.ts
---

# Directory layouts and the where-used search live in CLI utilities (proposed)

## Context and problem statement

Several commands read or write a directory of configuration files and one searches a configuration export for where an id is used. The logic sits in `src/utils/Config.ts` and a few ops modules, and the library has no counterpart. Whether this is a deviation is a judgement call that the maintainers have not made: files are the CLI's business (umbrella 0001 lets the CLI own files), but the layouts and the search are knowledge about configuration that a script or the MCP server would also need. This record states the facts so that the call can be made. Measured on `main` (75c58f4c, 2026-10-24); status proposed because it rests on that judgement.

## Decision

Proposed, not accepted. If accepted: the where-used search moves to the library, and the directory layouts are designed once, together with the config-manager file sets (record 0024), because they have the same shape (entity data to a set of files and back).

### Evidence

| What | Where | Size | Library counterpart |
| - | - | - | - |
| rebuild a full export from a directory | `utils/Config.ts` `getFullExportConfigFromDirectory`, `getConfig` | 475 lines in the file; `getConfig` is 184 lines with 39 logic indicators, the highest of any function outside promote | none (the library exports and imports data objects) |
| write a full export as a directory | `ops/ConfigOps.ts` `exportItem` | 199 lines | none |
| IDM configuration directory | `ops/IdmOps.ts` `getIdmImportDataFromIdmDirectory`, `ops/MappingOps.ts` legacy mapping readers | about 100 lines | none |
| where-used search | `utils/Config.ts` `getIdLocations`; used by `script list`, `script describe`, `esv variable list` and `describe`, `esv secret list` and `describe` | 25 lines | none |

- `utils/Config.ts` imports eight ops modules (`ScriptOps`, `NodeOps`, `ThemeOps`, `MappingOps`, `IdmOps`, `classic/ServerOps`, `IgaWorkflowOps`, `ops/utils/OpsUtils`) while those modules use `Config.ts`: a utility importing the layer above it, and an eight-file runtime import cycle (record 0007, measured).

## Consequences

- Six commands (the where-used ones) cannot be offered to other consumers; `config import` and `config export` are tied to the CLI's directory layout.
- The import cycle makes `Config.ts` hard to test on its own.

### Remediation

Direction only; not scheduled. (1) Move `getIdLocations` into the library: size S. (2) Break the cycle by moving the ops-specific readers out of `Config.ts` into their ops modules: size S. (3) Decide, with record 0024, whether the layout readers and writers become library file-set functions: size M.
