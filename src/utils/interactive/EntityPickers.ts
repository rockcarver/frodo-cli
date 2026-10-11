/**
 * Entity pickers (interactive commands plan, Phase 3).
 *
 * A command whose target-entity option (`-i/--secret-id`, `-i/--tree-id`
 * etc.) was left unspecified can offer a dropdown populated from the live
 * system -- a PingAM server, a PingIDM instance, or an Identity Cloud
 * tenant, whichever the command targets -- instead of failing or forcing
 * `-a`. The data source is per-command: the spec's `load` is whatever read
 * function the command family's ops layer provides (`frodo.authn.journey
 * .readJourneys` for PingAM, `frodo.cloud.secret.readSecrets` for cloud,
 * and so on), so each picker is deployment-type-correct by construction;
 * nothing here assumes a particular deployment type. The pick fires AFTER
 * authentication succeeds (the loaders need tokens) and before the action
 * body uses the option -- the command calls `resolveEntityPicks(command,
 * picks)` in its authenticated branch. A prompt only happens when
 *
 * - the gate allows prompting (canPrompt()),
 * - the option is still unspecified, and
 * - the loader returns at least one entity.
 *
 * Every other path is a no-op, so non-interactive behavior stays
 * byte-identical: no TTY, `--no-prompt`, FRODO_NO_PROMPT, FRODO_TEST, or an
 * empty system all leave `options.<name>` untouched and the action proceeds
 * exactly as before (usually to its existing "required" error).
 *
 * Escape backs out of a picker without setting anything -- callers treat
 * that as "declined to run" and return (same shape as a failed
 * getTokens()). A returned `false` from `resolveEntityPicks` is the
 * caller's signal to stop.
 */

import { Command } from 'commander';
import { escapableSelect, ESCAPE } from './EscapableSelectPrompt';
import { canPrompt } from './PromptGateState';

/**
 * Loads the candidate entities for a picker. Returns the raw skeletons;
 * `label`/`description` turn an entity into the picker row. Errors
 * (host unreachable, permission denied) resolve to an empty list rather
 * than throwing -- the action's own error path handles a failing
 * connection better than a picker-side stack trace.
 */
export type EntityPickLoader<T> = () => Promise<T[]>;

export type EntityPickSpec<T> = {
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

/**
 * Defines an entity picker for one option. The returned spec is passed to
 * `resolveEntityPicks` by the command's action body.
 */
export function entityPick<T>(spec: EntityPickSpec<T>): EntityPickSpec<T> {
  return spec;
}

/**
 * Runs every entity pick declared for this command whose option is still
 * unspecified. No-op when prompting is disallowed. Returns false when the
 * user escaped the picker -- the caller should return without running the
 * action's body (same shape as a failed getTokens()).
 */
export async function resolveEntityPicks<T>(
  command: Command,
  picks: EntityPickSpec<T>[]
): Promise<boolean> {
  if (!canPrompt() || picks.length === 0) return true;
  for (const pick of picks) {
    // Commands branch on the RAW option value (options.secretId); writing
    // through setOptionValueWithSource keeps both that object and the
    // resolver's own getOptionValue reads consistent.
    if (command.getOptionValue(pick.name)) continue;
    let entities: T[];
    try {
      entities = await pick.load();
    } catch {
      return true; // loader failure: leave the action's own error path
    }
    if (entities.length === 0) return true;
    if (entities.length === 1) {
      // Single-option paradigm (gap-fill prompts): one candidate is no
      // choice -- auto-select it, mirroring the single-profile host
      // picker and the single-child stub auto-descend.
      apply(command, pick, entities[0]);
      continue;
    }
    const chosen = await escapableSelect<T>({
      message: pick.message ?? `Select ${pick.kind} to act on:`,
      choices: entities.map((entity) => {
        const description = pick.description?.(entity);
        return {
          value: entity,
          name: pick.label(entity),
          ...(description !== undefined ? { description } : {}),
        };
      }),
    });
    if (chosen === ESCAPE) return false;
    apply(command, pick, chosen);
  }
  return true;
}

function apply<T>(command: Command, pick: EntityPickSpec<T>, entity: T): void {
  command.setOptionValueWithSource(pick.name, pick.label(entity), 'cli');
}
