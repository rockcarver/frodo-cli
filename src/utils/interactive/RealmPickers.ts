/**
 * Realm picker (docs/INTERACTIVE-COMMANDS.md, "Pickers that need a login").
 *
 * Once a login exists, a command whose realm argument was left
 * at its default can offer a dropdown of the target system's realms --
 * but ONLY when the system actually has more than one (a single-realm
 * tenant has no choice to offer; the default is already correct). The
 * pick fires in the resolution pass, right after the login the pass makes
 * for it (record 0044), so every command gets it without per-command
 * wiring; the getTokens wrapper (AuthenticateOps) offers it only to a
 * command whose pass made no login, and never a second time. A prompt only
 * happens when
 *
 * - the gate allows prompting (canPrompt()),
 * - the command declares a realm positional argument,
 * - a required connection input or option prompted the user to complete the
 *   command,
 * - the user did not name a realm explicitly (argument value or
 *   FRODO_REALM -- recorded by `noteRealmProvenance` during the
 *   resolution pass, BEFORE frodo-lib maps the sentinel default to the
 *   deployment type's realm during auth), and
 * - the target system reports more than one realm.
 *
 * Every other path is a no-op. Escape declines the offer and keeps the
 * deployment-type default -- unlike the entity pickers there is no
 * "wrong" continuation to protect here (the default is a valid choice),
 * so backing out just means "keep the default".
 *
 * A `config-manager` command is different (see RealmUse): one that uses its
 * realm positional reads "no realm" as every realm, so its picker has an
 * `All realms` row first and makes it the default, and a realm that is picked
 * really narrows the run (the command reads it after login with
 * `realmOfRun`); one that ignores its realm gets no picker at all.
 *
 * A command whose realm matters only when an option is set (`frodo config
 * export`, `-r`) declares it with `realmPickerOnlyWith` (see RealmUse): its
 * picker is the ordinary one and opens under the same conditions as above, and
 * only when that option is set.
 *
 * The loader failing (permission denied on realm listing, older servers,
 * classic deployments where the endpoint differs) is swallowed and the
 * default kept: the command is about to run against the default realm
 * exactly as it did before the interactive layer existed.
 */

import { state } from '@rockcarver/frodo-lib';
import { Command } from 'commander';
import { verboseMessage } from '../Console';
import { editableOptionsHint } from './EditableOptions';
import { escapableSelect, ESCAPE, RIGHT } from './EscapableSelectPrompt';
import { EXIT_ALL, EXIT_ALL_SIGNAL } from './ExitAll';
import { positionalValue } from './PositionalArgs';
import { canPrompt } from './PromptGateState';
import { NEXT_LABEL } from './ReadyStep';
import { ignoresRealm, realmPickerWanted, realmUseOf } from './RealmUse';

/** frodo-lib's sentinel default for "no realm chosen yet". */
const DEFAULT_REALM_KEY = '__default__realm__';

/**
 * The value of the `All realms` row of a command that uses its realm (see
 * RealmUse). It is never written anywhere: choosing it leaves the realm
 * positional at the sentinel, which those commands read as every realm.
 */
const ALL_REALMS = '__all_realms__';

/** Cache of the realms read during this invocation (one fetch per run). */
let cachedRealms: { name: string; active: boolean }[] | undefined;

/**
 * Whether the current invocation's realm was user-specified. Captured by
 * `noteRealmProvenance` during the resolution pass -- it CANNOT be
 * re-derived after auth, because frodo-lib's determineDefaultRealm
 * replaces the sentinel default with the deployment type's realm (alpha
 * or /) during _getTokens, making a user choice and a mapped default
 * indistinguishable afterwards.
 */
let realmUserSpecified = false;
let requiredInputPrompted = false;

/** Records whether required input prompted during resolution. */
export function noteRequiredInputPrompted(prompted: boolean): void {
  requiredInputPrompted = prompted;
}

/** Whether required connection input prompted in the current invocation. */
export function requiredInputPromptedForTests(): boolean {
  return requiredInputPrompted;
}

/**
 * Records whether this invocation's realm came from the user (positional
 * argument value or FRODO_REALM) as opposed to the sentinel default.
 * Called by the resolution pass BEFORE auth -- see the `realmUserSpecified`
 * doc for why the timing matters.
 *
 * The realm positional is read from the command's processed arguments: it
 * only reaches frodo-lib's state later, when the action body runs
 * `handleDefaultArgsAndOpts`, so `state.getRealm()` alone cannot see a realm
 * the user typed (the picker then opened for `frodo journey list <host>
 * /alpha`). FRODO_REALM is the positional's default, so it counts through the
 * same read.
 *
 * @param command the command being run; omit it to judge by the state alone
 */
export function noteRealmProvenance(command?: Command): void {
  const realm =
    (command ? positionalValue(command, 'realm') : undefined) ??
    state.getRealm();
  realmUserSpecified = !!realm && realm !== DEFAULT_REALM_KEY;
}

/** What `noteRealmProvenance` last recorded (for tests: the flag is module-private). */
export function realmUserSpecifiedForTests(): boolean {
  return realmUserSpecified;
}

/** Test hygiene: clears the per-invocation provenance + realm cache. */
export function resetRealmPickerStateForTests(): void {
  realmUserSpecified = false;
  requiredInputPrompted = false;
  cachedRealms = undefined;
}

/**
 * Whether the realm picker can open for this command: every condition of
 * record 0001 that is known before the login. Only the last one, that the
 * system has more than one realm, needs the login to be known. The resolution
 * pass asks it to decide whether it must log in for the picker.
 * @param command the command that is being resolved
 * @returns true when the picker may open once a login exists
 */
export function realmPickerApplies(command: Command): boolean {
  if (!canPrompt()) return false;
  if (!command.registeredArguments.some((a) => a.name() === 'realm')) {
    return false;
  }
  // A config-manager command that ignores its realm: the choice would change
  // nothing, so do not ask (see RealmUse).
  if (ignoresRealm(command)) return false;
  // A command whose realm matters only with an option (`config export -r`):
  // without it the realm changes nothing, so do not ask (see RealmUse).
  if (!realmPickerWanted(command)) return false;
  if (realmUserSpecified) return false;
  return requiredInputPrompted;
}

/**
 * Offers the realm dropdown for `command`'s realm argument when the
 * conditions in the module doc hold. Called by the resolution pass right
 * after the login it makes for the picker, and by the getTokens wrapper for a
 * command whose pass made no login. Never throws; on any problem it simply
 * keeps the default.
 * @param command the command that is being resolved
 * @param options.inPass the picker runs in the resolution pass, which the Ready step follows: Enter says `next`
 */
export async function resolveRealmPick(
  command: Command,
  options: { inPass?: boolean } = {}
): Promise<void> {
  if (!realmPickerApplies(command)) return;

  let realms: { name: string; active: boolean }[];
  try {
    if (!cachedRealms) {
      // Via the memoized ops helper: shares one fetch with commands that
      // read realms themselves (frodo realm list), keeping Polly's
      // order-matched replay intact (recordings have one entry for the
      // endpoint) and halving the latency when both run.
      const { readRealmsCached } = await import('../../ops/RealmOps');
      const skeletons = await readRealmsCached();
      cachedRealms = skeletons.map((realm) => ({
        name: realm.name ?? realm._id ?? '',
        active: realm.active ?? true,
      }));
    }
    realms = cachedRealms;
  } catch {
    return; // can't list realms: keep the default
  }
  if (realms.length <= 1) return;

  const current = state.getRealm();
  // A command that uses its realm reads "no realm" as every realm, so the
  // first and default row is `All realms` and leaving the realm out is a
  // choice that is shown as one. The deployment's default realm is just one
  // of the rows there.
  const realmUse = realmUseOf(command);
  // The picker runs POST-AUTH, so `current` is already frodo-lib's mapped
  // deployment default (alpha on cloud, / on classic/forgeops) -- passing
  // it as the select's default pre-highlights the TRUE default instead of
  // the first row, so a bare <enter> means "keep the deployment default".
  // The default may legitimately be absent from the list (the realms
  // endpoint never returns the root realm, so on classic/forgeops "/" has
  // no row): escapableSelect falls back to the first row in that case.
  // → (armed by the hint) opens the invocation editor, then
  // re-prompts this picker; ESCAPE keeps the default as before; EXIT_ALL
  // THROWS the unwind signal (the session ends even though auth already
  // succeeded -- the gesture means "leave everything", from any depth,
  // per docs/INTERACTIVE-COMMANDS.md).
  // The loop's exit type is string | typeof ESCAPE (the RIGHT case loops;
  // EXIT_ALL never resolves out of the loop -- it throws).
  let choice: string | typeof ESCAPE;
  for (;;) {
    const { livePositionalPreviewFor, runInvocationEditorForCommand } =
      await import('../../cli/ResolveInteractiveInputs');
    const livePreview = livePositionalPreviewFor(command, 'realm');
    const realmChoices = realms.map((realm) => ({
      value: realm.name,
      name: realm.name,
      description: realm.active ? undefined : 'inactive',
    }));
    const answer = await escapableSelect<string>({
      message: realmUse
        ? realmUse.tenantWide
          ? 'Choose a realm (realm-specific config only; tenant-wide config is always included):'
          : 'Choose a realm (All realms is the default):'
        : `Choose a realm (default: ${current}):`,
      default: realmUse ? ALL_REALMS : current,
      hint: editableOptionsHint(command),
      // in the pass the Ready step follows; outside it nothing can be promised
      ...(options.inPass ? { enterLabel: NEXT_LABEL } : {}),
      // LIVE footer: the highlighted realm shadows the realm positional
      // per render, so the footer's realm token moves with the cursor
      // BEFORE <enter> commits (live preview). The `All realms` row shadows
      // the sentinel, which the preview prints as no realm token.
      preview: livePreview
        ? (highlighted: unknown) =>
            livePreview(
              highlighted === ALL_REALMS ? DEFAULT_REALM_KEY : highlighted
            )
        : undefined,
      choices: realmUse
        ? [
            {
              value: ALL_REALMS,
              name: 'All realms',
              description: 'every realm',
            },
            ...realmChoices,
          ]
        : realmChoices,
    });
    if (answer === EXIT_ALL) throw EXIT_ALL_SIGNAL;
    if (answer === RIGHT) {
      // The hint advertised the editor, so → must open it (this branch
      // used to just re-prompt, making the key look dead). The editor
      // throws EXIT_ALL_SIGNAL on a double-ESC; a plain return loops
      // back here and the user can still ESC the picker.
      await runInvocationEditorForCommand(command);
      continue;
    }
    choice = answer;
    break;
  }
  if (choice === ESCAPE) {
    // Backed out: keep the deployment default (the pre-interactive
    // behavior), AND say so -- a silent return after the frame erased
    // left the terminal idle with no explanation (user report
    // 2026-10-13: "the picker wasn't active" -- the prompt had actually
    // concluded; nothing showed why nothing then happened).
    verboseMessage(
      realmUse ? 'Using all realms.' : `Keeping the default realm ${current}.`
    );
    return;
  }
  if (realmUse && choice === ALL_REALMS) {
    // The default row of a command that uses its realm: nothing is written,
    // the realm positional stays at the sentinel, which means every realm.
    verboseMessage('Using all realms.');
    return;
  }
  // For a command that uses its realm the deployment's default realm is a
  // realm like any other, so choosing it narrows the run to that realm.
  if (!choice || (!realmUse && choice === current)) {
    // <enter> on the already-highlighted default: an explicit "keep
    // it". The pick is DONE -- do NOT loop back into another picker
    // instance (the old silent re-prompt read as a dead screen: the
    // prompt concluded and nothing re-appeared).
    verboseMessage(`Keeping the default realm ${current}.`);
    return;
  }
  state.setRealm(choice);
  // Write the picked realm back into the command's realm positional so the
  // deferred authoring print (flushed at the action's postAction hook, see
  // FrodoCommand/AuthoringPrintState) shows the command EXACTLY as it ran
  // -- the printed realm token matches state.getRealm() token for token.
  // Without this, a non-default pick would print the (sentinel-translated)
  // positional while the action actually runs in `choice`. The CLI
  // positional convention is the plain name (no leading slash) -- the
  // exact value the user would type -- and handleDefaultArgsAndOpts
  // re-feeds it into state.setRealm inside the action body, so the value
  // must be positional-shaped, not state-shaped.
  {
    const { setPositionalValueForCommand } =
      await import('../../cli/ResolveInteractiveInputs');
    setPositionalValueForCommand(command, 'realm', choice.replace(/^\//, ''));
  }
  verboseMessage(`Using realm ${choice}.`);
}
