/**
 * Usage examples that break a rule of UsageExampleOperands.test.js and have
 * not been fixed yet. Used only by that test. It is empty now: every example
 * of every command passes.
 *
 * This list only ever shrinks:
 * - NEVER add an example here. Fix the example: it must run as written and
 *   must not open an interactive mode (see
 *   .github/instructions/cli-commands.instructions.md).
 * - When you fix an example listed here, delete its entry. The test fails
 *   until you do, so the list cannot go stale.
 *
 * An entry is `{ example, rule, reason }`: `example` is the command line
 * exactly as `-hhh` prints it, `rule` the rule it breaks (the test says what
 * each rule means) and `reason` why it is still here.
 */
export const LEGACY_EXAMPLE_VIOLATIONS = [];
