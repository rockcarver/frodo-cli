/**
 * Connection-profile pickers (docs/INTERACTIVE-COMMANDS.md).
 *
 * The interactive picker behind bare `frodo conn [host]` -- lets the user
 * view and set one profile's preferred credential. v1 scope only:
 * viewing/setting the preferred credential for one already-existing
 * profile -- no profile creation, deletion, or alias management here.
 *
 * Lives in the interactive layer (not ops) by design: the interactive
 * framework is ambient, so a regular command file picks interactivity up
 * automatically and neither ops modules nor command files carry prompting
 * code of their own (docs/INTERACTIVE-COMMANDS.md, layering). Like
 * RealmPickers/EntityPickers, this module imports frodo-lib directly and
 * never imports from ops/ -- the command layer calls INTO it, not the
 * other way around.
 */

import fs from 'fs';
import { frodo, state } from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../Console';
import {
  escapableSelect,
  ESCAPE,
  RIGHT,
  type EscapableSelectChoice,
} from './EscapableSelectPrompt';
import { EXIT_ALL } from './ExitAll';
import { canPrompt } from './PromptGateState';

const {
  getConnectionProfilesPath,
  getConnectionProfileByHost,
  saveConnectionProfile,
} = frodo.conn;

/**
 * Which configured credential type a connection profile (or one
 * invocation, via `--credential`/FRODO_CREDENTIAL) can prefer. Re-homed
 * here from AuthenticateOps so the interactive layer has no import edge
 * back into ops/, even type-only ones; ops/ re-exports the union for its
 * own consumers.
 */
export type CredentialOverrideType = 'user' | 'svcacct' | 'amster' | 'browser';

/**
 * The picker behind bare `frodo conn [host]`: pick a profile (skipped
 * when `host` resolves or only one profile is saved), then pick that
 * profile's preferred credential from what's actually configured on it.
 * Mirrors `frodo settings`'s bare-invocation pattern (see
 * `runInteractiveThemePicker` in `settings-theme.ts`, the template for
 * fully-interactive command types). ESCAPE and RIGHT both decline
 * without saving (RIGHT: no editor hint here), and the double-ESC
 * EXIT_ALL gesture lands in the same "declined" branch -- this picker
 * is its own top level, so there is nothing to unwind past.
 * @param {string} host Optional host URL, unique substring, or alias. When
 * omitted, offers a picker across every saved profile (skipping straight to
 * it if there's only one), the same way `settings.ts` skips its own
 * category picker when there's only one category.
 * @returns {Promise<boolean>} true if a preference was actually set and
 * saved; false if the user escaped without choosing, or no profile could be
 * resolved.
 */
export async function runInteractivePreferredCredentialPicker(
  host?: string
): Promise<boolean> {
  // Gate-respecting (docs/INTERACTIVE-COMMANDS.md): --no-prompt,
  // FRODO_NO_PROMPT, FRODO_TEST, and non-TTY sessions decline the picker
  // exactly as an ESC would -- the bare action must not prompt when
  // prompting is disallowed, or --no-prompt on this stub would be a
  // dead flag.
  if (!canPrompt()) return false;
  let resolvedHost: string;
  if (host) {
    resolvedHost = host;
  } else {
    const filename = getConnectionProfilesPath();
    let connectionsData: Record<string, { alias?: string }>;
    try {
      connectionsData = JSON.parse(fs.readFileSync(filename, 'utf8'));
    } catch {
      connectionsData = {};
    }
    const hosts = Object.keys(connectionsData);
    if (hosts.length === 0) {
      printMessage(
        `No connection profiles found in ${filename}. Create one first with 'frodo conn save' or 'frodo login --save'.`,
        'info'
      );
      return false;
    }
    if (hosts.length === 1) {
      resolvedHost = hosts[0];
    } else {
      const choice = await escapableSelect<string>({
        message: 'Choose a connection profile:',
        // Filter matches host AND alias (case-insensitive).
        search: ({ value }, query) =>
          value.toLowerCase().includes(query.toLowerCase()) ||
          (connectionsData[value].alias ?? '')
            .toLowerCase()
            .includes(query.toLowerCase()),
        choices: hosts.map((h) => ({
          value: h,
          name: connectionsData[h].alias
            ? `${h} (${connectionsData[h].alias})`
            : h,
        })),
      });
      if (
        choice === EXIT_ALL ||
        choice === ESCAPE ||
        choice === RIGHT // RIGHT: no hint here
      ) {
        // Double-ESC or ESC: the profile picker is its own top level.
        return false;
      }
      resolvedHost = choice;
    }
  }

  let profile;
  try {
    profile = await getConnectionProfileByHost(resolvedHost);
  } catch (error) {
    printError(error);
    return false;
  }

  // Only offer what's actually configured on this profile -- 'browser' is
  // always offerable, since any profile can do a fresh interactive login
  // regardless of what else is configured.
  const credentialChoices: EscapableSelectChoice<CredentialOverrideType>[] = [];
  if (profile.username && profile.password) {
    credentialChoices.push({
      value: 'user',
      name: 'user (plain username/password)',
    });
  }
  if (profile.svcacctId) {
    credentialChoices.push({
      value: 'svcacct',
      name: 'svcacct (service account)',
    });
  }
  if (profile.amsterPrivateKey) {
    credentialChoices.push({
      value: 'amster',
      name: 'amster (Amster private key)',
    });
  }
  credentialChoices.push({
    value: 'browser',
    name: 'browser (interactive login)',
  });

  // Default the cursor to whatever's already in effect -- the explicit
  // preferredCredential if this profile has one, else (for a profile that
  // predates that field) whatever its legacy authMode implies, else no
  // default at all.
  const currentPreference: CredentialOverrideType | undefined =
    profile.defaultCredential ??
    (profile.authMode === 'interactive' ? 'browser' : undefined);

  const selected = await escapableSelect<CredentialOverrideType>({
    message: `Preferred credential for ${profile.tenant}:`,
    choices: credentialChoices,
    default: currentPreference,
  });
  if (
    selected === EXIT_ALL ||
    selected === ESCAPE ||
    selected === RIGHT // RIGHT: no hint here
  ) {
    // Double-ESC or ESC: this picker is its own top level.
    return false;
  }

  state.setHost(profile.tenant);
  state.setPreferredCredential(selected);
  try {
    await saveConnectionProfile(profile.tenant);
  } catch (error) {
    printError(error);
    return false;
  }
  printMessage(`Saved connection profile ${state.getHost()}`);
  return true;
}
