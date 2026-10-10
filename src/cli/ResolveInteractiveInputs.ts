/**
 * The Phase 1 "zero-touch" resolution pass: fills missing command input
 * interactively before the action body runs (INTERACTIVE-COMMANDS-PLAN.md,
 * Phase 1). Wired from FrodoCommand's preAction hook; never modifies
 * frodo-lib.
 *
 * Two resolver kinds run here, connection arguments first (the host gives
 * the later prompts their context), then deferred mandatory options:
 *
 * 1. Connection arguments. Missing `host` (dropdown of saved connection
 *    profiles, single profile silently assumed, free-text entry when none
 *    exist -- see runInteractivePreferredCredentialPicker for the
 *    precedent), missing `username`/`password` -- but ONLY when no saved
 *    profile can supply credentials for the resolved host, since frodo-lib
 *    already falls back to profile-stored credentials on its own
 *    (AuthenticateOps loadConnectionProfile); prompting when a profile
 *    would answer anyway would be pure friction. `--browser`/`--device`
 *    likewise suppress the username/password prompts (their flow is the
 *    interactive part) but not the host prompt, which those flows still
 *    need.
 *
 * 2. Deferred mandatory options. Commander's
 *    `missingMandatoryOptionValue()` normally throws during parsing --
 *    BEFORE the preAction hook chain runs. FrodoCommand overrides it to
 *    record the violation instead, which makes all 57 existing
 *    `makeOptionMandatory()` call sites prompt-capable with zero syntax
 *    change. Options carrying commander `choices()` are offered as a
 *    dropdown instead of free typing.
 *
 * Everything here is gap-filling, and every gap-fill writes into the
 * command's own `processedArgs`/option values -- NOT into frodo-lib state
 * -- because `handleDefaultArgsAndOpts` (which copies positional args into
 * state) runs INSIDE the action body, after this pass; writing state here
 * would be overwritten by `undefined` a moment later. A fully-specified
 * invocation reaches the action untouched, and outside the prompt gate
 * (see PromptGate) the pass degrades to exactly the old error behavior.
 */

import fs from 'fs';
import { frodo, state } from '@rockcarver/frodo-lib';
import type { Command, Option } from 'commander';
import { verboseMessage } from '../utils/Console';
import {
  escapableSelect,
  ESCAPE,
  type EscapableSelectChoice,
} from '../utils/interactive/EscapableSelectPrompt';
import {
  canPrompt,
  promptInput,
  promptPassword,
} from '../utils/interactive/PromptGate';

const { getConnectionProfilesPath, getConnectionProfileByHost } = frodo.conn;

/**
 * A mandatory-option violation that commander's parse recorded instead of
 * throwing on. Lives here rather than on the command instance so the
 * deferred state survives the parse->hook handoff regardless of how
 * commander clones or nests commands.
 */
const pendingMandatoryViolations = new WeakMap<Command, string[]>();

/**
 * One-of rule registered on a command via `requireOneOf` (see
 * FrodoCommand). Weaker than `makeOptionMandatory`: instead of "this one
 * option must always be present", it says "one (or all, with mode 'all')
 * of these options must be present" -- the shape of the
 * `Unrecognized combination of options or no options...` dead-ends that
 * 113 command action bodies enforce only AFTER authenticating. Evaluated
 * in the resolution pass (below), where a violation becomes an
 * interactive prompt on a prompt-capable session and commander's own
 * error otherwise.
 */
export type OneOfGroupSpec = {
  /** Long names (no dashes) of the group's member options. */
  options: string[];
  /**
   * 'one' (default): at least one member must be present. 'all': every
   * member must be present (pairwise-required members, e.g. esv secret
   * version activate's `-i` + `-v`).
   */
  mode?: 'one' | 'all';
  /**
   * Human-readable purpose shown in prompts/errors, e.g. "what to
   * delete". Derived from the command description when omitted.
   */
  purpose?: string;
};

const pendingOneOfGroups = new WeakMap<Command, OneOfGroupSpec[]>();

/**
 * Registers one-of groups on a command for resolution-pass evaluation.
 * Called from FrodoCommand.requireOneOf.
 */
export function deferOneOfGroups(
  command: Command,
  groups: OneOfGroupSpec[]
): void {
  pendingOneOfGroups.set(command, [
    ...(pendingOneOfGroups.get(command) ?? []),
    ...groups,
  ]);
}

/**
 * Records a mandatory option that was missing at parse time, instead of
 * throwing. Called from FrodoCommand's `missingMandatoryOptionValue`
 * override. `optionLabel` is the option's full flags string (e.g.
 * `-s, --schema <schema>`), matching what commander's own error message
 * embeds.
 */
export function deferMissingMandatoryOption(
  command: Command,
  optionLabel: string
): void {
  const pending = pendingMandatoryViolations.get(command) ?? [];
  pending.push(optionLabel);
  pendingMandatoryViolations.set(command, pending);
}

/**
 * The CommanderError code commander itself uses for this failure; the
 * re-throw preserves it so scripts can match on it.
 */
export const MISSING_MANDATORY_OPTION_CODE =
  'commander.missingMandatoryOptionValue';

/**
 * Rebuilds commander's exact error message for a deferred violation (see
 * missingMandatoryOptionValue in commander's lib/command.js).
 */
function missingMandatoryOptionMessage(optionLabel: string): string {
  return `error: required option '${optionLabel}' not specified`;
}

/**
 * Runs the interactive resolution pass for `command` (the leaf command
 * about to execute).
 *
 * When prompting is disallowed, any deferred mandatory violation is
 * re-thrown with commander's own message/code (identical to pre-Phase-1
 * behavior -- commander would have thrown during parsing) and everything
 * else is a no-op. When the user backs out of a prompt (Escape/empty
 * Enter), any deferred violations are re-thrown the same way (matching
 * the old parse order, where the mandatory check ran first) and missing
 * connection args are left for the action's getTokens() to fail on
 * exactly as before.
 */
export async function resolveInteractiveInputs(
  command: Command
): Promise<void> {
  const violations = pendingMandatoryViolations.get(command) ?? [];

  if (!canPrompt()) {
    if (violations.length > 0) {
      throwMissingMandatory(command, violations[0]);
    }
    const unsatisfiedGroups = findUnsatisfiedOneOfGroups(command);
    if (unsatisfiedGroups.length > 0) {
      throwOneOfUnsatisfied(command, unsatisfiedGroups[0]);
    }
    return;
  }

  // Interactive: connection args first (they give the mandatory-option
  // prompts their tenant context), then mandatory options, then one-of
  // groups (which may prompt for a member option; after that step the
  // action's getTokens may still fail on auth, exactly as before).
  // Either step bailing out falls back to the pre-Phase-1 error
  // semantics.
  const connectionResolved = await resolveConnectionArgs(command);
  const mandatoryResolved = connectionResolved
    ? await resolveMandatoryOptions(command)
    : false;
  if (!connectionResolved || !mandatoryResolved) {
    if (violations.length > 0) {
      throwMissingMandatory(command, violations[0]);
    }
    return;
  }
  const oneOfResolved = await resolveOneOfGroups(command);
  if (!oneOfResolved) {
    const unsatisfied = findUnsatisfiedOneOfGroups(command);
    if (unsatisfied.length > 0) {
      throwOneOfUnsatisfied(command, unsatisfied[0]);
    }
  }
}

/**
 * Emits commander's exact mandatory-option failure: same message, same
 * CommanderError code, same stderr output and exit path as pre-Phase-1.
 */
function throwMissingMandatory(command: Command, optionLabel: string): never {
  command.error(missingMandatoryOptionMessage(optionLabel), {
    code: MISSING_MANDATORY_OPTION_CODE,
  });
}

/**
 * Commander-style failure for an unsatisfied one-of group. The message
 * mirrors commander's own error shape (message + help + exit 1), which is
 * also the UX the replaced `Unrecognized combination` else-branches had
 * (they printed, showed help, and exited 1).
 */
function throwOneOfUnsatisfied(command: Command, group: OneOfGroupSpec): never {
  const members = group.options
    .map((name) => {
      const option = command.options.find(
        (candidate) => candidate.attributeName() === name
      );
      return option ? option.flags : `--${name}`;
    })
    .join(' | ');
  command.error(
    `error: one of '${members}' is required${
      group.purpose ? ` to choose ${group.purpose}` : ''
    }`,
    { code: ONE_OF_UNSATISFIED_CODE }
  );
}

/**
 * The CommanderError code for an unsatisfied one-of group. Namespaced like
 * commander's own codes (`commander.missingArgument`,
 * `commander.missingMandatoryOptionValue`) so scripts can match on it, but
 * distinct from any commander code since this rule is frodo-specific.
 */
export const ONE_OF_UNSATISFIED_CODE = 'frodo.oneOfUnsatisfied';

/**
 * Prompts for each deferred mandatory option violation. Options with a
 * closed value set (commander `choices()`) get a dropdown; everything
 * else free text. Returns false as soon as the user declines one (Escape
 * or empty Enter) -- the caller then restores the old error semantics.
 */
async function resolveMandatoryOptions(command: Command): Promise<boolean> {
  const violations = pendingMandatoryViolations.get(command) ?? [];
  for (const violation of violations) {
    const option = command.options.find((candidate) => {
      return candidate.flags === violation;
    });
    if (!option) {
      // Should not happen (the label came from the option itself), but
      // degrade to the old error rather than guessing.
      throwMissingMandatory(command, violation);
    }
    const attributeName = option.attributeName();

    let value: string | undefined;
    if (option.argChoices && option.argChoices.length > 0) {
      const choice = await escapableSelect<string>({
        message: `Choose a value for ${option.flags}:`,
        choices: option.argChoices.map(
          (choiceValue): EscapableSelectChoice<string> => ({
            name: choiceValue,
            value: choiceValue,
          })
        ),
      });
      if (choice === ESCAPE) return false;
      value = choice;
    } else {
      const answer = await promptInput({
        message: `Enter a value for ${option.flags}:`,
      });
      if (!answer) return false;
      value = answer;
    }
    command.setOptionValueWithSource(attributeName, value, 'cli');
    verboseMessage(`Using ${value} for ${option.flags}.`);
  }
  return true;
}

/**
 * Whether a one-of group is satisfied by the current option values. 'one'
 * mode needs at least one member present; 'all' mode every member. Values
 * are read via getOptionValue so injected gap-fills count.
 */
function groupSatisfied(command: Command, group: OneOfGroupSpec): boolean {
  const defined = (name: string): boolean => {
    const value = command.getOptionValue(name);
    return value !== undefined && value !== false && value !== '';
  };
  return group.mode === 'all'
    ? group.options.every(defined)
    : group.options.some(defined);
}

/**
 * All registered one-of groups the current invocation does not satisfy.
 */
function findUnsatisfiedOneOfGroups(command: Command): OneOfGroupSpec[] {
  const groups = pendingOneOfGroups.get(command) ?? [];
  return groups.filter((group) => !groupSatisfied(command, group));
}

/**
 * Interactive resolution of unsatisfied one-of groups: the user picks WHICH
 * member to supply (dropdown over the group's members, defaulting to the
 * first), then a value step matched to the member's type -- dropdown for
 * commander `choices()`, free text otherwise (booleans resolve by the pick
 * itself). Mirrors resolveMandatoryOptions' decline semantics: Escape or
 * empty Enter returns false and the caller restores the error.
 */
async function resolveOneOfGroups(command: Command): Promise<boolean> {
  const unsatisfied = findUnsatisfiedOneOfGroups(command);
  for (const group of unsatisfied) {
    const memberOptions = group.options
      .map((name) => {
        const option = command.options.find(
          (candidate) => candidate.attributeName() === name
        );
        return option ? { name, option } : undefined;
      })
      .filter(
        (member): member is { name: string; option: Option } =>
          member !== undefined
      );
    if (memberOptions.length === 0) continue;

    const subject = group.purpose ?? 'what to act on';
    const picked = await escapableSelect<string>({
      message: `Choose ${subject}:`,
      choices: memberOptions.map((member): EscapableSelectChoice<string> => ({
        value: member.name,
        name: `${member.option.flags}${member.option.description ? ` -- ${member.option.description}` : ''}`,
      })),
    });
    if (picked === ESCAPE) return false;

    const chosen = memberOptions.find((member) => member.name === picked)!;
    if (chosen.option.argChoices && chosen.option.argChoices.length > 0) {
      const value = await escapableSelect<string>({
        message: `Choose a value for ${chosen.option.flags}:`,
        choices: chosen.option.argChoices.map(
          (choiceValue): EscapableSelectChoice<string> => ({
            name: choiceValue,
            value: choiceValue,
          })
        ),
      });
      if (value === ESCAPE) return false;
      command.setOptionValueWithSource(chosen.name, value, 'cli');
    } else if (!/<[^>]+>|\[[^\]]+\]/.test(chosen.option.flags)) {
      // Boolean flag: the flags carry no value placeholder (<value> /
      // [value]), so the pick itself is the value -- no second prompt.
      command.setOptionValueWithSource(chosen.name, true, 'cli');
    } else {
      const answer = await promptInput({
        message: `Enter a value for ${chosen.option.flags}:`,
      });
      if (!answer) return false;
      command.setOptionValueWithSource(chosen.name, answer, 'cli');
    }
    verboseMessage(`Using ${chosen.option.flags}.`);
  }
  return true;
}

/**
 * Index of the default positional argument of that name on this command
 * (commands omit default args via the FrodoCommand omits list, so the
 * index differs per command), or -1 when the command doesn't declare it.
 */
function positionalIndex(command: Command, name: string): number {
  return command.registeredArguments.findIndex(
    (argument) => argument.name() === name
  );
}

function positionalValue(command: Command, name: string): string | undefined {
  const index = positionalIndex(command, name);
  if (index === -1) return undefined;
  const value = command.processedArgs?.[index];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function setPositionalValue(
  command: Command,
  name: string,
  value: string
): void {
  const index = positionalIndex(command, name);
  if (index === -1) return;
  // Two surfaces must see the injected value:
  //
  // - `processedArgs` is what the action handler's positional parameters
  //   are sliced from (commander's action() wrapper slices
  //   this.processedArgs).
  // - `args` (raw, options-removed user args) is what
  //   handleDefaultArgsAndOpts iterates to copy default arguments into
  //   frodo-lib state INSIDE the action body -- it does NOT read
  //   processedArgs, so a processedArgs-only injection would be
  //   overwritten with `undefined` the moment the action starts.
  // Verified against commander's _processArguments (fills processedArgs
  // from args, never writes back) and this repo's
  // handleDefaultArgsAndOpts (iterates command.args).
  if (command.processedArgs) {
    command.processedArgs[index] = value;
  }
  // `args` holds only user-supplied positional values; a gap-fill by
  // definition fills a position the user left empty, so extending/padding
  // with the injected value is safe. Pad with nulls for any inner
  // positions the user skipped (rare: inner default args are optional),
  // since args is positional.
  if (Array.isArray(command.args)) {
    while (command.args.length < index) {
      command.args.push(null);
    }
    if (index === command.args.length) {
      command.args.push(value);
    } else if (command.args[index] == null) {
      command.args[index] = value;
    }
  }
}

/**
 * Whether the invocation carries an explicit interactive-auth mode
 * (--browser/--device). Read from the parsed option values, NOT from
 * frodo-lib state: `handleDefaultArgsAndOpts` sets authMode from these
 * same options inside the action body, i.e. after this pass runs.
 */
function isInteractiveAuthMode(command: Command): boolean {
  return (
    !!command.getOptionValue('browser') || !!command.getOptionValue('device')
  );
}

/**
 * Reads the saved connection profiles file directly (no auth, no network)
 * to enumerate candidates for the host dropdown. Returns a sorted list;
 * empty when the file is missing or unreadable.
 */
function listSavedProfiles(): { host: string; alias?: string }[] {
  const filename = getConnectionProfilesPath();
  let connectionsData: Record<string, { alias?: string }>;
  try {
    connectionsData = JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch {
    return [];
  }
  return Object.keys(connectionsData)
    .sort()
    .map((host) => ({ host, alias: connectionsData[host].alias }));
}

// Distinct from any real host string so it can't collide with one.
const ENTER_MANUALLY = Symbol('resolveConnectionArgs:enterManually');

/**
 * Prompts for the missing connection-level positional arguments: host,
 * then username/password -- the latter only when no saved profile can
 * supply credentials for the resolved host. Returns false when the user
 * declines a prompt (Escape or empty Enter); the caller then restores the
 * pre-Phase-1 error semantics.
 *
 * Skipped per-argument when: the command doesn't declare the argument,
 * the value is already present (positional arg, or env var via frodo-lib
 * state's own env fallback), or --browser/--device makes the
 * username/password prompts redundant.
 */
async function resolveConnectionArgs(command: Command): Promise<boolean> {
  // -- host -------------------------------------------------------------
  if (
    positionalIndex(command, 'host') !== -1 &&
    !positionalValue(command, 'host') &&
    !state.getHost() // env fallback (FRODO_HOST)
  ) {
    const profiles = listSavedProfiles();
    let picked: string | undefined;

    if (profiles.length === 1) {
      // Single profile: no menu -- mirror the established convention
      // (runInteractivePreferredCredentialPicker). Announced only under
      // --verbose, since this runs inside an otherwise-quiet command.
      picked = profiles[0].host;
      verboseMessage(
        `No host given; using the only saved connection profile: ${picked}`
      );
    } else if (profiles.length > 1) {
      const choice = await escapableSelect<string | typeof ENTER_MANUALLY>({
        message: 'Choose a connection profile:',
        // Filter matches host AND alias (case-insensitive) -- typing part
        // of a hostname or the alias both find the profile.
        search: ({ value, name }, query) => {
          const needle = query.toLowerCase();
          if (value === ENTER_MANUALLY) return name.length === 0;
          return (
            value.toLowerCase().includes(needle) ||
            (profiles.find((p) => p.host === value)?.alias ?? '')
              .toLowerCase()
              .includes(needle)
          );
        },
        choices: [
          {
            value: ENTER_MANUALLY,
            name: 'Enter a host manually...',
            description: 'Type an AM base URL (or a profile substring).',
          },
          ...profiles.map(
            (
              profile
            ): EscapableSelectChoice<string | typeof ENTER_MANUALLY> => ({
              value: profile.host,
              name: profile.alias
                ? `${profile.host} (${profile.alias})`
                : profile.host,
            })
          ),
        ],
      });
      if (choice === ESCAPE) return false;
      if (choice === ENTER_MANUALLY) {
        const answer = await promptInput({
          message: 'AM base URL (or profile alias/substring):',
        });
        if (!answer) return false;
        picked = answer;
      } else {
        picked = choice;
      }
    } else {
      // No saved profiles at all: free-text entry, same as the "enter
      // manually" path above.
      const answer = await promptInput({
        message: 'AM base URL:',
      });
      if (!answer) return false;
      picked = answer;
    }
    setPositionalValue(command, 'host', picked);
  }

  // -- username / password ----------------------------------------------
  // Prompted ONLY when frodo-lib's own resolution can't answer: a saved
  // profile for the (now-resolved) host supplies stored credentials on
  // its own (AuthenticateOps loadConnectionProfile), so prompting would
  // be pure friction. No profile (new host, or host given as a URL with
  // nothing saved): prompt bare, so e.g. `frodo login <new-host>` and
  // `frodo conn save <new-host>` become fully interactive.
  const usernameNeeded =
    positionalIndex(command, 'username') !== -1 &&
    !positionalValue(command, 'username') &&
    !state.getUsername() && // env fallback (FRODO_USERNAME)
    !isInteractiveAuthMode(command);
  const passwordNeeded =
    positionalIndex(command, 'password') !== -1 &&
    !positionalValue(command, 'password') &&
    !state.getPassword() && // env fallback (FRODO_PASSWORD)
    !isInteractiveAuthMode(command);

  if (!usernameNeeded && !passwordNeeded) return true;

  const host = positionalValue(command, 'host') ?? state.getHost();
  if (!host) return true; // host unresolved; the action fails on it as before

  let savedUsername: string | undefined;
  try {
    const profile = await getConnectionProfileByHost(host);
    // frodo-lib will authenticate from the profile alone when it carries
    // any usable credential (user/svcacct/amster); a bare profile entry
    // (host saved without credentials -- possible via earlier frodo
    // versions and manual edits) answers nothing, so the prompts still
    // run for it. A username-only entry prefills the username prompt.
    if (
      (profile.username && profile.password) ||
      profile.svcacctId ||
      profile.amsterPrivateKey
    ) {
      return true;
    }
    savedUsername = profile.username ?? undefined;
  } catch {
    // No profile for this host (or unreadable): fall through to prompts.
  }

  if (usernameNeeded) {
    const answer = await promptInput({
      message: 'Username:',
      default: savedUsername,
    });
    if (!answer) return false;
    setPositionalValue(command, 'username', answer);
  }

  if (passwordNeeded) {
    const answer = await promptPassword({ message: 'Password:' });
    if (!answer) return false;
    setPositionalValue(command, 'password', answer);
  }

  return true;
}
