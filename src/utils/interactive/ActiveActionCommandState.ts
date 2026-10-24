/**
 * The active action command's registry, split from
 * `ResolveInteractiveInputs.ts` the same way PromptGateState is split from
 * PromptGate: a zero-import state module that heavier layers (ops/ --
 * specifically AuthenticateOps's post-auth realm picker) can import
 * without dragging the resolution pass's graph along.
 *
 * That matters for tests that mock `@rockcarver/frodo-lib` wholesale
 * (test/unit/mcp-server-ops.test.js): the mock's namespace only carries
 * what its graph actually loads, so any ops->cli edge pulling in the
 * frodo-lib-importing interactive prompts (ColorTheme's `theme` import)
 * fails the graph walk with "does not provide an export named 'theme'".
 * Importing this leaf module instead keeps that edge dependency-free.
 */

import type { Command } from 'commander';

/**
 * The leaf command whose action is about to run, recorded by the
 * resolution pass. Post-auth hooks that have no command reference of
 * their own (the getTokens wrapper consults the realm picker, which
 * needs the command to check for a realm argument) read this instead of
 * threading the command through every call site.
 */
let activeActionCommand: Command | undefined;

/**
 * Records the leaf command about to execute (and clears it, for test
 * hygiene between invocations).
 */
export function setActiveActionCommand(command: Command | undefined): void {
  activeActionCommand = command;
}

/**
 * The leaf command recorded by the resolution pass, if any.
 */
export function getActiveActionCommand(): Command | undefined {
  return activeActionCommand;
}
