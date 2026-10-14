/**
 * Entity pickers (docs/INTERACTIVE-COMMANDS.md, post-auth pickers).
 *
 * A command whose target-entity option (`-i/--secret-id`, `-i/--tree-id`
 * etc.) was left unspecified can offer a dropdown populated from the live
 * system -- a PingAM server, a PingIDM instance, or an Identity Cloud
 * tenant, whichever the command targets -- instead of failing or forcing
 * `-a`. The data source is per-command: the spec's `load` is whatever read
 * function the command family's ops layer provides (`frodo.authn.journey
 * .readJourneys` for PingAM, `frodo.cloud.secret.readSecrets` for cloud,
 * and so on), so each picker is deployment-type-correct by construction;
 * nothing here assumes a particular deployment type.
 *
 * The flow spans two stages:
 *
 * 1. SETUP: the command declares its specs with `deferEntityPicks(command,
 *    [...])`. The resolver (ResolveInteractiveInputs) reads the registry to
 *    learn which options are entity-pickable, and when such an option is
 *    the missing half of a mandatory/one-of rule, it SKIPS the free-text
 *    value step for it (asking the user to type an id by hand would defeat
 *    the picker's purpose) and leaves the option unset.
 *
 * 2. ACTION BODY: after `getTokens()` succeeds (the loaders need tokens),
 *    the command calls `resolveEntityPicks(command)`, which runs the
 *    dropdown for every still-unspecified pickable option. A prompt only
 *    happens when the gate allows prompting (canPrompt()), the option is
 *    still unspecified, and the loader returned at least one entity. Every
 *    other path is a no-op, so non-interactive behavior stays
 *    byte-identical: no TTY, `--no-prompt`, FRODO_NO_PROMPT, FRODO_TEST,
 *    or an empty system all leave `options.<name>` untouched and the
 *    action proceeds exactly as before (usually to its existing "required"
 *    error).
 *
 * Escape backs out of a picker without setting anything -- callers treat
 * that as "declined to run" and return (same shape as a failed
 * getTokens()). A returned `false` from `resolveEntityPicks` is the
 * caller's signal to stop -- that includes a failing loader, which must
 * never read as "picks satisfied" (the delete-family actions'
 * `(options.all || (await resolveEntityPicks(command)))` would otherwise
 * fall through to delete-all on a transient read error).
 */

import { Command } from 'commander';
import { printError } from '../Console';
import { editableOptionsHint } from './EditableOptions';
import { escapableSelect, ESCAPE, RIGHT } from './EscapableSelectPrompt';
import { EXIT_ALL, EXIT_ALL_SIGNAL } from './ExitAll';
import { canPrompt } from './PromptGateState';

/**
 * Loads the candidate entities for a picker. Returns the raw skeletons;
 * `label`/`description` turn an entity into the picker row. A failing load
 * (host unreachable, permission denied) DECLINES the pick: resolveEntityPicks
 * returns false so the command stops instead of falling through to its
 * destructive --all branch.
 */
export type EntityPickLoader<T> = () => Promise<T[]>;

/**
 * The registry-facing shape of an entity pick spec: the entity type is
 * erased (functions accept `any`) so heterogenous spec lists type-check.
 * `entityPick<T>` keeps the typed surface for call sites; the erasure only
 * widens what the registry stores.
 */
export type EntityPickSpec<T = any> = {
  /**
   * Attribute name of the option being filled (e.g. `secretId`). The value
   * written back is the entity's rendered label -- for every current
   * command family, the option wants the entity id/name, so the label IS
   * the value (loaders are expected to feed the label with the id).
   */
  name: string;
  /** Loads the candidates from the live system. */
  load: EntityPickLoader<T>;
  /** Renders an entity as both the picker row label and the option value. */
  label: (entity: T) => string;
  /** Optional second line shown as the row's dimmed description. */
  description?: (entity: T) => string | undefined;
  /** Prompt message; defaults to "Select <entity kind>:". */
  message?: string;
  /** Noun for the default message, e.g. "secret". */
  kind: string;
};

const pendingEntityPicks = new WeakMap<Command, EntityPickSpec<unknown>[]>();

/**
 * Registers entity pickers on a command. Called from the command's setup
 * (module scope of the command file) so the resolver can consult the
 * registry and the action body can run the picks with one bare call.
 * `T` defaults to unknown, so heterogenous spec lists type-check.
 */
export function deferEntityPicks(
  command: Command,
  picks: EntityPickSpec[]
): void {
  pendingEntityPicks.set(command, [
    ...(pendingEntityPicks.get(command) ?? []),
    ...picks,
  ]);
}

/**
 * The entity pickers registered on a command (empty when none). Read by
 * ResolveInteractiveInputs to know which options it should NOT free-text
 * prompt for -- those belong to the post-auth dropdown.
 */
export function getEntityPicks(command: Command): EntityPickSpec<unknown>[] {
  return pendingEntityPicks.get(command) ?? [];
}

/**
 * Whether the named option has an entity picker registered on this
 * command. Convenience for the resolver's value steps.
 */
export function hasEntityPick(command: Command, name: string): boolean {
  return getEntityPicks(command).some((pick) => pick.name === name);
}

/**
 * Defines an entity picker for one option. The returned spec is registered
 * via `deferEntityPicks`.
 */
export function entityPick<T>(spec: EntityPickSpec<T>): EntityPickSpec<T> {
  return spec;
}

/**
 * Runs every entity pick registered for this command whose option is still
 * unspecified. No-op when prompting is disallowed. Returns false when the
 * user escaped the picker -- the caller should return without running the
 * action's body (same shape as a failed getTokens()).
 */
export async function resolveEntityPicks(command: Command): Promise<boolean> {
  if (!canPrompt()) return true;
  for (const pick of getEntityPicks(command)) {
    // Commands branch on the RAW option value (options.secretId); writing
    // through setOptionValueWithSource keeps both that object and the
    // resolver's own getOptionValue reads consistent.
    if (command.getOptionValue(pick.name)) continue;
    let entities: unknown[];
    try {
      entities = await pick.load();
    } catch (error) {
      // Loader failure is a DECLINED pick, not a satisfied one: returning
      // true here lets `(options.all || (await resolveEntityPicks(...)))`
      // fall through to the destructive --all branch (real incident
      // 2026-10-14: a transient 400 on the secrets-list read made
      // `esv secret delete` run delete-all on a live tenant). False =
      // "stop without running the action body", same contract as escape.
      printError(error as Error, `Error reading ${pick.kind}s`);
      return false;
    }
    if (entities.length === 0) return true;
    if (entities.length === 1) {
      // Single-option paradigm (gap-fill prompts): one candidate is no
      // choice -- auto-select it, mirroring the single-profile host
      // picker and the single-child stub auto-descend.
      apply(command, pick, entities[0]);
      continue;
    }
    // The → key (armed by the hint) opens the invocation
    // editor, then re-prompts this picker -- discover-and-edit without
    // leaving the flow. Editorial loop, ESCAPE still declines the pick.
    let chosen: unknown | typeof ESCAPE | typeof RIGHT;
    for (;;) {
      const { liveOptionPreviewFor } =
        await import('../../cli/ResolveInteractiveInputs');
      chosen = await escapableSelect<unknown>({
        message: pick.message ?? `Select ${pick.kind} to act on:`,
        hint: editableOptionsHint(command),
        // LIVE footer: the highlighted entity's label (the exact value
        // the real apply writes) shadows the target option per render,
        // so the footer shows the command gaining that pick BEFORE
        // <enter> commits. `pick.label` maps entity -> option value --
        // the same mapping the committed apply uses.
        preview: liveOptionPreviewFor(command, pick.name, (entity) =>
          pick.label(entity)
        ),
        choices: entities.map((entity) => {
          const description = pick.description?.(entity);
          return {
            value: entity,
            name: pick.label(entity),
            ...(description !== undefined ? { description } : {}),
          };
        }),
      });
      if (chosen !== RIGHT) break;
      const { runInvocationEditorForCommand } =
        await import('../../cli/ResolveInteractiveInputs');
      await runInvocationEditorForCommand(command);
    }
    if (chosen === EXIT_ALL) {
      // Exit-all: revoke the deferred authoring print (nothing may be
      // left behind for an abandoned flow) and THROW the unwind signal
      // -- it propagates through the action body to app.ts's top-level
      // handler, ending the session from any nesting depth.
      const { revokeAuthoringPrint } = await import('./AuthoringPrintState');
      revokeAuthoringPrint();
      throw EXIT_ALL_SIGNAL;
    }
    if (chosen === ESCAPE) {
      // User declined to run (single ESC): revoke the deferred authoring
      // print so the postAction fallback (non-auth commands' flush site)
      // leaves nothing behind for an abandoned flow -- same contract as
      // the one-of error path skipping postAction entirely.
      const { revokeAuthoringPrint } = await import('./AuthoringPrintState');
      revokeAuthoringPrint();
      return false;
    }
    apply(command, pick, chosen);
  }
  // The deferred authoring print: this
  // function is the flush site for commands whose entity picks are the
  // last command-mutating interactive step. Two shapes exist: pick-first
  // (`(pick) && (await getTokens())` -- picks run BEFORE auth) and
  // pick-after-auth (esv variable set, secret store mapping delete --
  // picks run AFTER auth). In both, flushing HERE puts the eventual
  // command directly above the action's results. Gated on auth already
  // having succeeded: a pick-first flow whose auth then fails must not
  // print (the command never ran). When auth has NOT succeeded yet, the
  // getTokens wrapper flushes instead (no picks pending -> it doesn't
  // skip). Non-interactive sessions (canPrompt false, early return)
  // never reach this.
  {
    const { authSucceededForFlush, flushAuthoringPrint } =
      await import('./AuthoringPrintState');
    if (authSucceededForFlush()) {
      flushAuthoringPrint();
    }
  }
  return true;
}

function apply(
  command: Command,
  pick: EntityPickSpec<unknown>,
  entity: unknown
): void {
  command.setOptionValueWithSource(pick.name, pick.label(entity), 'cli');
}
