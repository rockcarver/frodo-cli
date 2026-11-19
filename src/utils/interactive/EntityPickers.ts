/**
 * Entity pickers (docs/INTERACTIVE-COMMANDS.md, "Pickers that need a login").
 *
 * A command whose target-entity option (`-i/--secret-id`, `-i/--tree-id`
 * etc.) was left unspecified can offer a dropdown populated from the live
 * system -- a PingAM server, a PingIDM instance, or an Identity Cloud
 * tenant, whichever the command targets -- instead of failing or forcing
 * `-a`. The data source is per command family: the spec's `load` is whatever
 * read function the family's library module provides (`frodo.authn.journey
 * .readJourneys` for PingAM, `frodo.cloud.secret.readSecrets` for cloud, and
 * so on), so each picker is deployment-type-correct by construction; nothing
 * here assumes a particular deployment type.
 *
 * A family of commands registers its picks once (decision record 0038,
 * EntityPickRegistry.ts, the entries in EntityPickFamilies.ts): every command
 * of the family that has the option inherits the pick, so a command file
 * declares nothing and calls nothing.
 *
 * The flow spans two stages:
 *
 * 1. SETUP: the resolver (ResolveInteractiveInputs) reads the picks a command
 *    inherits to learn which options are entity-pickable, and when such an
 *    option is the missing half of a mandatory/one-of rule, it SKIPS the
 *    free-text value step for it (asking the user to type an id by hand would
 *    defeat the picker's purpose) and leaves the option unset.
 *
 * 2. THE PASS: once the mandatory options and the one-of groups are resolved
 *    (and again after the invocation editor), the pass runs
 *    `resolvePassEntityPicks(command)`, which runs the dropdown for every
 *    still-unspecified pickable option. The loaders need tokens, so the pass
 *    logs in first when one of the picks that will open needs them (record
 *    0044); the Ready step follows. A pick the pass has run is not run
 *    again: the `getTokens` wrapper skips it (`resolveFamilyEntityPicks`, for
 *    a command whose pass made no login). A prompt only
 *    happens when the gate allows prompting (canPrompt()), the option is
 *    still unspecified, and the loader returned at least one entity. Every
 *    other path is a no-op, so non-interactive behavior stays
 *    byte-identical: no TTY, `--no-prompt`, FRODO_NO_PROMPT, FRODO_TEST,
 *    or an empty system all leave `options.<name>` untouched and the
 *    action proceeds exactly as before (usually to its existing "required"
 *    error).
 *
 * A pick is not offered when the command line answers it already: when an
 * option that conflicts with its own is set (whoever set it: typed, chosen in
 * the one-of picker, a saved default, or an earlier pick of the run, so an id
 * and a name are asked for once), or when another member of its one-of group
 * is given or was chosen in the resolution pass (record 0047).
 *
 * Escape backs out of a picker without setting anything -- that DECLINES the
 * pick, and a declined pick never runs the command (record 0017 and 0038): the
 * pass ends the command with exit code 1, and the `getTokens` wrapper returns
 * false, the same signal as a failed login. That includes a failing loader,
 * which must never read as "picks satisfied" (the delete commands branch on
 * the options after `getTokens`, and a pick that did not happen must not fall
 * through to delete-all on a transient read error).
 */

import { Command } from 'commander';
import { printError, verboseMessage } from '../Console';
import { editableOptionsHint } from './EditableOptions';
import { familyEntityPicks, requestablePicks } from './EntityPickRegistry';
import { escapableSelect, ESCAPE, RIGHT } from './EscapableSelectPrompt';
import { EXIT_ALL, EXIT_ALL_SIGNAL } from './ExitAll';
import {
  activeConflicts,
  commitOption,
  failWithConflict,
} from './OptionConflicts';
import { deferredChoicesOf, oneOfMemberAnswering } from './OptionRequirements';
import {
  notePassEntityPickAttempted,
  passEntityPickAttempted,
} from './PassLogin';
import { promptInput } from './PromptGate';
import { canPrompt } from './PromptGateState';
import { NEXT_LABEL } from './ReadyStep';

/**
 * Loads the candidate entities for a picker. Returns the raw skeletons;
 * `label`/`description` turn an entity into the picker row. A failing load
 * (host unreachable, permission denied) DECLINES the pick: the pick returns
 * false so the command stops instead of falling through to its destructive
 * --all branch.
 */
export type EntityPickLoader<T> = () => Promise<T[]>;

/**
 * Loads the candidate entities for one command: the same as an
 * `EntityPickLoader`, for a loader that reads other options of the command
 * (a family loader is shared by all the commands of the family and has no
 * command of its own to close over).
 */
export type CommandEntityPickLoader<T> = (command: Command) => Promise<T[]>;

/**
 * The registry-facing shape of an entity pick spec: the entity type is
 * erased (functions accept `any`) so heterogenous spec lists type-check.
 * `entityPick<T>` keeps the typed surface for call sites; the erasure only
 * widens what the registry stores.
 */
export type EntityPickSpec<T = any> = {
  /**
   * Attribute name of the option being filled (e.g. `secretId`). The value
   * written back is the entity's rendered label unless the spec has a
   * `value` -- for most command families the option wants the entity
   * id/name, so the label IS the value (loaders are expected to feed the
   * label with the id).
   */
  name: string;
  /** Loads the candidates from the live system. */
  load: EntityPickLoader<T>;
  /**
   * Loads the candidates for the command that runs the pick, instead of
   * `load`, which is then only the list without a command. Use it when the
   * list is narrowed by other options of the command (`-c` and `-t` of
   * `mapping delete`): the loader reads them from the command it is given.
   * `load` is never given the command, because a library read function
   * passed as `load` would take it for its own first argument.
   */
  loadFor?: CommandEntityPickLoader<T>;
  /** Renders an entity as the picker row label (and the option value, see `value`). */
  label: (entity: T) => string;
  /**
   * The option value for an entity, when it is not the row label (a user
   * row shows the name and the id; the option wants the id). The live
   * command preview and the committed value both use it.
   */
  value?: (entity: T) => string;
  /**
   * Type-to-search predicate over the entity. Omitted, typing filters the
   * row labels by case-insensitive substring; give one when the match must
   * span more than the label (a user by username, name, email or id).
   */
  search?: (entity: T, query: string) => boolean;
  /**
   * For lists too long to show whole: when `when()` says so, the picker asks
   * for a search text first and offers only what `load(text)` returns. A
   * string returned by `load` is shown as a message and the text is asked
   * for again (for example "1200 users match 'a': type more"). Esc or an
   * empty text declines the pick. `when` and `load` read the system; they do
   * not prompt. Both are given the command that runs the pick, for a family
   * whose list depends on another option of it (as `loadFor` is).
   */
  searchFirst?: {
    when: (command: Command) => Promise<boolean>;
    message?: string;
    /** Shown in the prompt under the question: what to type. */
    hint?: string;
    load: (text: string, command: Command) => Promise<T[] | string>;
  };
  /** Optional second line shown as the row's dimmed description. */
  description?: (entity: T) => string | undefined;
  /** Prompt message; defaults to "Select <entity kind>:". */
  message?: string;
  /** Noun for the default message, e.g. "secret". */
  kind: string;
  /**
   * Attribute names of options the loader reads to narrow the list (`-c`
   * narrows the mappings that are offered). They conflict with the picked
   * option on the command line, so the pick replaces them: once it is made
   * they are dropped from the command, and the command that runs (and its
   * preview) is the one you could type again.
   */
  scopedBy?: string[];
  /**
   * Whether the loader needs a login. Default: true. A loader that reads
   * only what is on this machine (the saved connection profiles) says false,
   * and the resolution pass then opens the pick without logging in for it.
   */
  needsLogin?: boolean;
};

/**
 * The entity pickers a command inherits from the registry of its command
 * family (EntityPickRegistry, record 0038), plus the ones the user asked for on
 * the options page ("choose after connecting") for the options whose pick is
 * available on request only. Read by ResolveInteractiveInputs to know which
 * options it should NOT free-text prompt for -- those belong to the entity
 * picker of the pass.
 */
export function getEntityPicks(command: Command): EntityPickSpec<unknown>[] {
  const inherited = familyEntityPicks(command);
  const asked = requestablePicks(command).filter(
    (pick) =>
      deferredChoicesOf(command).has(pick.name) &&
      !inherited.some((familyPick) => familyPick.name === pick.name)
  );
  return [...inherited, ...asked];
}

/**
 * Whether the user can ask for the pick of this option on the options page,
 * to be made after login: the command has a pick for it, or its family offers
 * one on request. Picks that open by themselves need no asking, but asking is
 * harmless.
 */
export function canChooseAfterConnecting(
  command: Command,
  name: string
): boolean {
  return (
    hasEntityPick(command, name) ||
    requestablePicks(command).some((pick) => pick.name === name)
  );
}

/**
 * Whether the named option has an entity picker registered on this
 * command. Convenience for the resolver's value steps.
 */
export function hasEntityPick(command: Command, name: string): boolean {
  return getEntityPicks(command).some((pick) => pick.name === name);
}

/**
 * Defines an entity picker for one option. The returned spec is listed in the
 * entry of its command family (EntityPickFamilies.ts).
 */
export function entityPick<T>(spec: EntityPickSpec<T>): EntityPickSpec<T> {
  return spec;
}

/**
 * Runs the picks of a command whose option is still unspecified (record 0038).
 * The framework calls it after login, from `getTokens`, for a command whose
 * pass made no login; a command file calls no resolver of its own. False means
 * the user declined or a load failed, and the command must not run its body.
 * @param command the command that runs
 * @returns false when the command must not run
 */
export async function resolveFamilyEntityPicks(
  command: Command
): Promise<boolean> {
  return runEntityPicks(command, getEntityPicks(command));
}

/**
 * Why a pick is not offered now, or undefined when it is. An empty reason means
 * the option is set already, which needs no word. A pick is not offered when
 * its option has a value, when an option that conflicts with it is set (whoever
 * set it: the user, the choice made in the resolution pass, a saved default or
 * an earlier pick of the run; the id of a node and its name conflict, and one
 * answer is enough; only the options that narrow the list are not in the way,
 * the pick replaces them), or when a member of its one-of group answers the
 * group already (`-g` of `agent export`, or a member chosen in the pass whose
 * own pick comes later: the command line is complete, record 0047).
 */
function whyNotOffered(
  command: Command,
  pick: EntityPickSpec<unknown>
): string | undefined {
  // Commands branch on the RAW option value (options.secretId); writing
  // through setOptionValueWithSource keeps both that object and the
  // resolver's own getOptionValue reads consistent.
  if (command.getOptionValue(pick.name)) return '';
  const [blocker] = activeConflicts(command, pick.name).filter(
    (option) => !pick.scopedBy?.includes(option.attributeName())
  );
  if (blocker) {
    return `Not offering a ${pick.kind} to pick: it cannot be used with ${blocker.flags}.`;
  }
  const answering = oneOfMemberAnswering(command, pick.name);
  if (answering) {
    const flags =
      command.options.find((option) => option.attributeName() === answering)
        ?.flags ?? answering;
    return `Not offering a ${pick.kind} to pick: ${flags} is given already.`;
  }
  return undefined;
}

/**
 * The entity picks that will open in the resolution pass: the picks of the
 * command (its own, those of its family, and the ones the user asked for on
 * the options page) that are offered now and that the pass has not run yet.
 * The pass reads it to decide whether it must log in (record 0044).
 * @param command the command that is being resolved
 * @returns the picks that will open
 */
export function pendingPassPicks(command: Command): EntityPickSpec<unknown>[] {
  return getEntityPicks(command).filter(
    (pick) =>
      !passEntityPickAttempted(pick.name) &&
      whyNotOffered(command, pick) === undefined
  );
}

/**
 * Whether a pick needs a login for its loader (default: it does).
 * @param pick the pick
 * @returns true when the loader needs tokens
 */
export function pickNeedsLogin(pick: EntityPickSpec<unknown>): boolean {
  return pick.needsLogin !== false;
}

/**
 * Runs the picks of the command for the resolution pass (record 0044). Same
 * contract as `resolveFamilyEntityPicks`: false means the user declined or a
 * load failed, and the command must not run. A pick that was run is
 * remembered, so the `getTokens` wrapper does not run it again.
 * @param command the command that is being resolved
 * @returns false when the command must not run
 */
export async function resolvePassEntityPicks(
  command: Command
): Promise<boolean> {
  return runEntityPicks(command, getEntityPicks(command), { inPass: true });
}

async function runEntityPicks(
  command: Command,
  picks: EntityPickSpec<unknown>[],
  options: { inPass?: boolean } = {}
): Promise<boolean> {
  if (!canPrompt()) return true;
  for (const pick of picks) {
    // The pass ran it already: asked once, whatever the answer was.
    if (passEntityPickAttempted(pick.name)) continue;
    const why = whyNotOffered(command, pick);
    if (why !== undefined) {
      if (why) verboseMessage(why);
      continue;
    }
    if (options.inPass) notePassEntityPickAttempted(pick.name);
    let entities: unknown[];
    try {
      const searched = pick.searchFirst
        ? await searchFirst(command, pick, pick.searchFirst)
        : undefined;
      if (searched === ESCAPE) {
        const { revokeAuthoringPrint } = await import('./AuthoringPrintState');
        revokeAuthoringPrint();
        return false;
      }
      entities =
        searched ??
        (await (pick.loadFor ? pick.loadFor(command) : pick.load()));
    } catch (error) {
      // Loader failure is a DECLINED pick, not a satisfied one: returning
      // true here would let a delete command fall through to its destructive
      // --all branch (real incident 2026-10-14: a transient 400 on the
      // secrets-list read made `esv secret delete` run delete-all on a live
      // tenant). False = "stop without running the action body", same
      // contract as escape.
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
        // in the pass the Ready step follows; outside it nothing can be promised
        ...(options.inPass ? { enterLabel: NEXT_LABEL } : {}),
        // LIVE footer: the highlighted entity's label (the exact value
        // the real apply writes) shadows the target option per render,
        // so the footer shows the command gaining that pick BEFORE
        // <enter> commits. `pick.label` maps entity -> option value --
        // the same mapping the committed apply uses. An empty filtered
        // list highlights nothing: the callback then renders the
        // committed state (undefined -> undefined) instead of crashing
        // on the spec's `entity._id`-style label.
        preview: liveOptionPreviewFor(command, pick.name, (entity) =>
          entity === undefined ? undefined : valueOf(pick, entity)
        ),
        ...(pick.search
          ? {
              search: ({ value }: { value: unknown }, query: string) =>
                pick.search!(value, query),
            }
          : {}),
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
  // The deferred authoring print: this function is the flush site for a
  // command whose entity picks are the last command-mutating interactive step
  // and run after the login (the pass made none for them). Flushing HERE puts
  // the eventual command directly above the action's results. Gated on auth
  // already having succeeded: a flow whose auth then fails must not print (the
  // command never ran). When auth has NOT succeeded yet, the getTokens wrapper
  // flushes instead (no picks pending -> it doesn't skip). Non-interactive
  // sessions (canPrompt false, early return) never reach this. The pass prints
  // nothing: the print is armed when the pass ends, and the wrapper flushes it
  // above the results.
  if (!options.inPass) {
    const { authSucceededForFlush, flushAuthoringPrint } =
      await import('./AuthoringPrintState');
    if (authSucceededForFlush()) {
      flushAuthoringPrint();
    }
  }
  return true;
}

/** The option value for an entity: its `value`, else its row label. */
function valueOf(pick: EntityPickSpec<unknown>, entity: unknown): string {
  return (pick.value ?? pick.label)(entity);
}

/**
 * The search-first step of a long list: asks for a text and loads the
 * matches until there are some. Returns the matches to show, `undefined`
 * when the list is short enough to load whole, or ESCAPE when the user
 * declined.
 */
async function searchFirst(
  command: Command,
  pick: EntityPickSpec<unknown>,
  spec: NonNullable<EntityPickSpec<unknown>['searchFirst']>
): Promise<unknown[] | undefined | typeof ESCAPE> {
  if (!(await spec.when(command))) return undefined;
  const { commandPreviewFor } =
    await import('../../cli/ResolveInteractiveInputs');
  // what the prompt says under the question: the hint, then why the last text was not enough
  let note = spec.hint;
  for (;;) {
    const text = await promptInput({
      message: spec.message ?? `Search ${pick.kind}s:`,
      hint: note,
      // the search text is not the option's value: the footer is the command as it stands
      preview: () => commandPreviewFor(command) ?? '',
    });
    // '' is Esc, Ctrl-C or an empty line: all of them decline
    if (!text) return ESCAPE;
    const found = await spec.load(text.trim(), command);
    if (typeof found !== 'string') {
      if (found.length > 0) return found;
      note = `No ${pick.kind} matches '${text.trim()}'.`;
      continue;
    }
    note = found;
  }
}

function apply(
  command: Command,
  pick: EntityPickSpec<unknown>,
  entity: unknown
): void {
  const result = commitOption(command, pick.name, valueOf(pick, entity), {
    consume: pick.scopedBy,
  });
  if (result.status === 'blocked') {
    const option = command.options.find(
      (candidate) => candidate.attributeName() === pick.name
    );
    if (option) failWithConflict(command, option, result.blockedBy);
    return;
  }
  for (const dropped of result.cleared) {
    verboseMessage(
      `Dropped ${dropped.flags}: it cannot be used with the ${pick.kind} that was picked.`
    );
  }
}
