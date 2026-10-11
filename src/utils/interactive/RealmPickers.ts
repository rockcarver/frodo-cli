/**
 * Realm picker (interactive commands plan, Phase 3).
 *
 * After authentication succeeds, a command whose realm argument was left
 * at its default can offer a dropdown of the target system's realms --
 * but ONLY when the system actually has more than one (a single-realm
 * tenant has no choice to offer; the default is already correct). The
 * pick fires from the getTokens wrapper (AuthenticateOps) immediately
 * after auth succeeds, so every command gets it without per-command
 * wiring; a prompt only happens when
 *
 * - the gate allows prompting (canPrompt()),
 * - the command declares a realm positional argument,
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
 * The loader failing (permission denied on realm listing, older servers,
 * classic deployments where the endpoint differs) is swallowed and the
 * default kept: the command is about to run against the default realm
 * exactly as it did before Phase 3.
 */

import { state } from '@rockcarver/frodo-lib';
import { Command } from 'commander';
import { verboseMessage } from '../Console';
import { escapableSelect, ESCAPE } from './EscapableSelectPrompt';
import { canPrompt } from './PromptGateState';

/** frodo-lib's sentinel default for "no realm chosen yet". */
const DEFAULT_REALM_KEY = '__default__realm__';

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

/**
 * Records whether this invocation's realm came from the user (positional
 * argument value or FRODO_REALM) as opposed to the sentinel default.
 * Called by the resolution pass BEFORE auth -- see the `realmUserSpecified`
 * doc for why the timing matters.
 */
export function noteRealmProvenance(): void {
  const realm = state.getRealm();
  realmUserSpecified = !!realm && realm !== DEFAULT_REALM_KEY;
}

/** Test hygiene: clears the per-invocation provenance + realm cache. */
export function resetRealmPickerStateForTests(): void {
  realmUserSpecified = false;
  cachedRealms = undefined;
}

/**
 * Offers the realm dropdown for `command`'s realm argument when the
 * conditions in the module doc hold. Called by the getTokens wrapper
 * after a successful login. Never throws; on any problem it simply keeps
 * the default.
 */
export async function resolveRealmPick(command: Command): Promise<void> {
  if (!canPrompt()) return;
  if (!command.registeredArguments.some((a) => a.name() === 'realm')) return;
  if (realmUserSpecified) return;

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
  const choice = await escapableSelect<string>({
    message: `Choose a realm (default: ${current}):`,
    choices: realms.map((realm) => ({
      value: realm.name,
      name: realm.name,
      description: realm.active ? undefined : 'inactive',
    })),
  });
  if (choice === ESCAPE || !choice || choice === current) return;
  state.setRealm(choice);
  verboseMessage(`Using realm ${choice}.`);
}
