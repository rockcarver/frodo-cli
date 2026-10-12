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
import { printMessage, verboseMessage } from '../utils/Console';
import {
  armAuthoringPrint,
  setAuthoringPrintFlush,
} from '../utils/interactive/AuthoringPrintState';
import {
  renderCommandPreview,
  setDeploymentTypeForPreview,
} from '../utils/interactive/CommandPreview';
import {
  connectionPage,
  PAGE_ESCAPE,
} from '../utils/interactive/ConnectionPagePrompt';
import {
  editableOptionalOptions,
  editableOptionsHint,
} from '../utils/interactive/EditableOptions';
import { hasEntityPick } from '../utils/interactive/EntityPickers';
import {
  escapableMultiSelect,
  MULTISEL_ESCAPE,
} from '../utils/interactive/EscapableMultiSelectPrompt';
import {
  escapableSelect,
  ESCAPE,
  RIGHT,
  type EscapableSelectChoice,
  type EscapableSelectConfig,
} from '../utils/interactive/EscapableSelectPrompt';
import {
  positionalIndex,
  positionalValue,
  setPositionalValue,
} from '../utils/interactive/PositionalArgs';
import {
  canPrompt,
  promptInput,
  promptPassword,
  promptsRendered,
} from '../utils/interactive/PromptGate';
import { noteRealmProvenance } from '../utils/interactive/RealmPickers';
import { guidedModeEnabled } from '../utils/SettingsStore';

const { getConnectionProfilesPath, getConnectionProfileByHost } = frodo.conn;

// The active-action-command registry lives in its own zero-import module
// (ActiveActionCommandState) so ops-layer importers (AuthenticateOps's
// post-auth realm picker) don't drag this file's frodo-lib-importing
// graph into tests that mock frodo-lib wholesale. Re-exported here for
// the resolution pass's own use.
export {
  setActiveActionCommand,
  getActiveActionCommand,
} from '../utils/interactive/ActiveActionCommandState';

/**
 * A mandatory-option violation that commander's parse recorded instead of
 * throwing on. Lives here rather than on the command instance so the
 * deferred state survives the parse->hook handoff regardless of how
 * commander clones or nests commands.
 */
const pendingMandatoryViolations = new WeakMap<Command, string[]>();

/**
 * Whether the connection level (host/username/password) resolved for this
 * command this session -- set by resolveConnectionArgs, whether the values
 * came from argv, env fallbacks, saved profiles, or the prompts. The
 * preview's readiness keys on THIS, not on the positionals: env/profile
 * resolution leaves the command object's positionals empty while the
 * connection is fully resolved. Lives beside pendingMandatoryViolations
 * for the same parse->hook handoff reasons.
 */
const connectionReadiness = new WeakMap<Command, boolean>();

/**
 * Option-requiredness rule registered on a command via `requireOneOf`
 * (at least one member present) or `requireAllOf` (every member present --
 * pairwise-required members, e.g. esv secret version activate's `-i` +
 * `-v`). Weaker than `makeOptionMandatory`: instead of "this one option
 * must always be present", it says "one of / all of these options must be
 * present" -- the shape of the `Unrecognized combination of options or no
 * options...` dead-ends that 113 command action bodies enforce only AFTER
 * authenticating. Evaluated in the resolution pass (below), where a
 * violation becomes an interactive prompt on a prompt-capable session and
 * commander's own error otherwise.
 */
export type OptionRequirementSpec = {
  /** Long names (no dashes) of the group's member options. */
  options: string[];
  /**
   * Whether every member (true) or at least one member (false) must be
   * present. OPTIONAL -- set by the requireOneOf/requireAllOf wrappers
   * (requireOneOf defaults it to false, requireAllOf to true); callers
   * never pass it.
   */
  all?: boolean;
  /**
   * Human-readable purpose shown in prompts/errors, e.g. "what to
   * delete". Derived from the command description when omitted.
   */
  purpose?: string;
};

/**
 * Pre-requireAllOf spelling kept as an alias so the part-1/part-2 call
 * sites keep compiling while they migrate to the split methods.
 */
export type OneOfGroupSpec = OptionRequirementSpec;

const pendingOneOfGroups = new WeakMap<
  Command,
  (OptionRequirementSpec & { all: boolean })[]
>();

/**
 * Registers option-requiredness groups on a command for resolution-pass
 * evaluation. Called from FrodoCommand.requireOneOf/requireAllOf.
 */
export function deferOneOfGroups(
  command: Command,
  groups: (OptionRequirementSpec & { all: boolean })[]
): void {
  pendingOneOfGroups.set(command, [
    ...(pendingOneOfGroups.get(command) ?? []),
    ...groups,
  ]);
}

/**
 * The option-requiredness groups registered on a command (empty when
 * none). Read by FrodoStubHelp to render the rule in help output -- the
 * help annotation and the resolver consume the same metadata.
 */
export function getOneOfGroups(
  command: Command
): (OptionRequirementSpec & { all: boolean })[] {
  return pendingOneOfGroups.get(command) ?? [];
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
  // The realm provenance MUST be noted before any prompt: frodo-lib maps
  // the sentinel default to the deployment type's realm during auth, so
  // "user chose" is only distinguishable from "mapped default" here.
  noteRealmProvenance();
  // Sentinel translation for the command preview: the realm positional's
  // sentinel default must print as the deployment type's default realm
  // (alpha on cloud, / otherwise -- the same mapping frodo-lib applies at
  // auth). Known eagerly from -m/--type / FRODO_DEPLOYMENT (state) and
  // re-set after profile resolution (the profile may carry the type).
  setDeploymentTypeForPreview(state.getDeploymentType());
  // The editor trigger (explicit --prompt or guided mode) also flags the
  // session as explicitly interactive for the print gate below: the user
  // ASKED for the flow even when nothing was pending. Value must be
  // true, not merely source 'cli' -- --no-prompt also carries source
  // 'cli' (and is already filtered out by the !canPrompt() early return,
  // but the value check keeps this independent of that ordering).
  const explicitlyInteractive =
    (command.getOptionValue('prompt') === true &&
      command.getOptionValueSource('prompt') === 'cli') ||
    guidedModeEnabled();
  const connectionResolved = await resolveConnectionArgs(command);
  connectionReadiness.set(command, connectionResolved);
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
  // The invocation editor (Phase 2/5) runs LAST: by now gap-filled
  // mandatory/one-of values are visible, so the editor only offers what is
  // still unspecified. Backing out keeps every value resolved above.
  // Trigger (Phase 5 slice 5): an explicit --prompt (commander source
  // 'cli' -- the default true doesn't count) or the persisted guided-mode
  // settings toggle (frodo settings guided) -- both are opt-in; default
  // runs keep today's behavior. (--edit retired: commander rejects it as
  // an unknown option.)
  if (explicitlyInteractive) {
    await runInvocationEditor(command);
  }

  // Phase 5 authoring-tool moment, DEFERRED to the action's completion:
  // after an interactive-assisted resolution, the command as it ran prints
  // exactly once -- at the postAction hook (FrodoCommand), the only point
  // where NOTHING can change the command anymore: the resolution pass,
  // the post-auth realm pick (inside getTokens), the action body's entity
  // picks, and the action's own output have all concluded. Printing there
  // makes the print the LAST line of the run -- adjacent to the next shell
  // prompt, maximally copyable, and never stale (a realm pick or editor
  // change between here and the action is reflected: the closure re-reads
  // the command object at flush time). Flows that never reach the action
  // (cancelled pickers, unsatisfied one-of groups, failed auth errors that
  // throw) skip postAction entirely -- an abandoned authoring session
  // leaves nothing behind.
  //
  // Armed UNCONDITIONALLY (registration is free); the PRINT GATE lives in
  // the flush closure, evaluated at flush time -- NOT here. It must be
  // evaluated late: the post-auth realm picker renders AFTER this pass
  // ends, so a gate evaluated now would miss a session whose only prompt
  // was that picker (env-resolved connection + realm pick -- the exact
  // frodo journey list flow that motivated the deferral). The gate itself
  // is unchanged: at least one prompt rendered this process, or the user
  // explicitly requested the flow (--prompt / guided mode). Fully
  // specified non-TTY runs (e2e snapshots) render no prompts and never
  // pass the gate, so output is byte-identical.
  armAuthoringPrint();
  setAuthoringPrintFlush(() => {
    if (promptsRendered() === 0 && !explicitlyInteractive) return;
    printMessage(
      renderCommandPreview(command, {
        missingMandatoryOptionLabels: [],
        oneOfUnsatisfied: false,
      }),
      'text'
    );
  });
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
function throwOneOfUnsatisfied(
  command: Command,
  group: OptionRequirementSpec
): never {
  const members = group.options
    .map((name) => {
      const option = command.options.find(
        (candidate) => candidate.attributeName() === name
      );
      return option ? option.flags : `--${name}`;
    })
    .join(group.all ? ' + ' : ' | ');
  command.error(
    `error: ${
      group.all
        ? `all of '${members}' are required`
        : `one of '${members}' is required`
    }${group.purpose ? ` to choose ${group.purpose}` : ''}`,
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
 * The Phase 5 `→` routing for pickers inside the resolution pass: runs
 * `escapableSelect` with the command's discoverability hint attached,
 * and when the user presses → (resolve `RIGHT`), opens the invocation
 * editor, then re-prompts -- so a user who landed in a mandatory/one-of/
 * profile picker can discover and edit everything else from there
 * (INTERACTIVE-COMMANDS-PLAN.md, Phase 5). Without a hint (nothing to
 * configure) this is exactly `escapableSelect`: the → key stays
 * readline's business and the loop never engages.
 *
 * Re-prompting after the editor keeps the picker's own contract intact
 * (the caller sees a plain value or ESCAPE); the editor's ←/Esc re-enter
 * this loop, where the user can still decline with Escape.
 */
async function selectWithEditorRouting<Value>(
  command: Command,
  config: EscapableSelectConfig<Value>
): Promise<Value | typeof ESCAPE> {
  const hint = editableOptionsHint(command);
  for (;;) {
    const choice = await escapableSelect<Value>({
      ...config,
      hint,
      preview: commandPreviewFor(command),
    });
    if (choice !== RIGHT) return choice;
    await runInvocationEditor(command);
  }
}

/**
 * The Phase 5 command preview footer for `command`'s prompts: the
 * command-so-far, red + cursive while mandatory input is missing, green/
 * white when validated and ready. Readiness derives from this module's
 * registries (deferred mandatory violations, one-of groups, connection
 * resolution); undefined when prompting is disallowed (the preview is an
 * interactive affordance only).
 */
export function commandPreviewFor(command: Command): string | undefined {
  if (!canPrompt()) return undefined;
  const missingMandatoryOptionLabels =
    pendingMandatoryViolations.get(command) ?? [];
  const oneOfUnsatisfied = findUnsatisfiedOneOfGroups(command).length > 0;
  // Before resolveConnectionArgs has run there is no connection truth yet
  // (the map is empty) -- leave it unset: readiness then hinges on the
  // mandatory/one-of state alone, which is exactly what's knowable then.
  const connectionResolved = connectionReadiness.get(command);
  return renderCommandPreview(command, {
    missingMandatoryOptionLabels: [...missingMandatoryOptionLabels],
    oneOfUnsatisfied,
    ...(connectionResolved !== undefined ? { connectionResolved } : {}),
  });
}

/**
 * Prompts for a value from a closed choice set. A ONE-item set auto-commits
 * (a single choice is no choice; commander would accept only that value
 * anyway -- the plan's single-option refinement); otherwise a searchable
 * dropdown. Returns ESCAPE only from the interactive picker, so a
 * single-choice set can never decline.
 */
async function selectFromChoices(
  command: Command,
  message: string,
  choices: string[]
): Promise<string | typeof ESCAPE> {
  if (choices.length === 1) {
    verboseMessage(`Only one value available: ${choices[0]}`);
    return choices[0];
  }
  return selectWithEditorRouting(command, {
    message,
    choices: choices.map((choiceValue) => ({
      name: choiceValue,
      value: choiceValue,
    })),
  });
}

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

    // Entity-pickable options are deferred to the action body's post-auth
    // dropdown (resolveEntityPicks) -- free-texting an id here would defeat
    // the picker's purpose. Leave the violation unresolved; the action
    // resolves it after getTokens (or errors non-interactively).
    if (hasEntityPick(command, attributeName)) {
      verboseMessage(
        `${option.flags} will be offered from the target system after login.`
      );
      continue;
    }

    let value: string | undefined;
    if (option.argChoices && option.argChoices.length > 0) {
      const choice = await selectFromChoices(
        command,
        `Choose a value for ${option.flags}:`,
        option.argChoices
      );
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
 * Whether an option-requiredness group is satisfied by the current option
 * values: every member for requireAllOf groups, at least one for
 * requireOneOf groups. Values are read via getOptionValue so injected
 * gap-fills count.
 */
function groupSatisfied(
  command: Command,
  group: OptionRequirementSpec
): boolean {
  const defined = (name: string): boolean => {
    const value = command.getOptionValue(name);
    return value !== undefined && value !== false && value !== '';
  };
  return group.all ? group.options.every(defined) : group.options.some(defined);
}

/**
 * All registered option-requiredness groups the current invocation does
 * not satisfy.
 */
function findUnsatisfiedOneOfGroups(command: Command): OptionRequirementSpec[] {
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
    const picked = await selectWithEditorRouting(command, {
      message: `Choose ${subject}:`,
      choices: memberOptions.map((member): EscapableSelectChoice<string> => ({
        value: member.name,
        name: `${member.option.flags}${member.option.description ? ` -- ${member.option.description}` : ''}`,
      })),
    });
    if (picked === ESCAPE) return false;

    const chosen = memberOptions.find((member) => member.name === picked)!;

    // Entity-pickable members are deferred to the action body's post-auth
    // dropdown (resolveEntityPicks) -- see resolveMandatoryOptions.
    if (hasEntityPick(command, chosen.name)) {
      verboseMessage(
        `${chosen.option.flags} will be offered from the target system after login.`
      );
      continue;
    }

    if (chosen.option.argChoices && chosen.option.argChoices.length > 0) {
      const value = await selectFromChoices(
        command,
        `Choose a value for ${chosen.option.flags}:`,
        chosen.option.argChoices
      );
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
      const choice = await selectWithEditorRouting<
        string | typeof ENTER_MANUALLY
      >(command, {
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
    // The picked profile's deployment type feeds the preview's sentinel
    // translation (frodo-lib itself only loads the profile into state
    // later, during auth). The lookup below covers all host origins.
  }
  // Refresh the preview's deployment type when the host is known but the
  // type isn't yet: the saved profile may carry it (the user didn't pass
  // -m/--type, and lib loads the profile into state only during auth --
  // too late for the preview).
  {
    const host = positionalValue(command, 'host') ?? state.getHost();
    if (!state.getDeploymentType() && host) {
      try {
        const profile = await getConnectionProfileByHost(host);
        setDeploymentTypeForPreview(profile.deploymentType);
      } catch {
        // No profile for this host: preview keeps the untranslated
        // sentinel (still a valid re-runnable token).
      }
    }
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
  let profileNote: string | undefined;
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
    profileNote = profile.alias
      ? `from profile ${profile.alias}`
      : 'from profile';
  } catch {
    // No profile for this host (or unreadable): fall through to prompts.
  }

  // Phase 5: the connection PAGE replaces the sequential username-then-
  // password prompts. Rows carry the resolved current values + provenance
  // (a username-only profile prefills the username row as before; env
  // fallbacks show as "(from FRODO_USERNAME)" etc.); an empty commit on
  // the masked password row keeps the stored value. Escape on the page
  // falls back to today's sequential prompts (unchanged behavior).
  const result = await connectionPage({
    message: 'Connection:',
    preview: commandPreviewFor(command),
    rows: [
      {
        key: 'host',
        label: 'host',
        value: host,
        note: profileNote ?? undefined,
      },
      {
        key: 'username',
        label: 'username',
        value: positionalValue(command, 'username') ?? state.getUsername(),
        note: state.getUsername()
          ? 'from FRODO_USERNAME'
          : (profileNote ?? undefined),
      },
      {
        key: 'password',
        label: 'password',
        value: positionalValue(command, 'password') ?? state.getPassword(),
        note: state.getPassword()
          ? 'from FRODO_PASSWORD'
          : (profileNote ?? undefined),
      },
    ],
    onHostChange: async (newHost) => {
      setPositionalValue(command, 'host', newHost);
      // Re-resolve the credential rows' profile context for the new host
      // (the lookup keys on the host).
      let note: string | undefined;
      let savedUser: string | undefined;
      try {
        const profile = await getConnectionProfileByHost(newHost);
        note = profile.alias ? `from profile ${profile.alias}` : 'from profile';
        savedUser = profile.username ?? undefined;
      } catch {
        note = undefined;
      }
      return [
        { key: 'host', label: 'host', value: newHost, note },
        {
          key: 'username',
          label: 'username',
          value: positionalValue(command, 'username') ?? savedUser,
          note,
        },
        {
          key: 'password',
          label: 'password',
          value: undefined,
          note,
        },
      ];
    },
  });
  if (result === PAGE_ESCAPE) {
    // Page declined: fall back to the pre-page sequential prompts.
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
  if (result.username) setPositionalValue(command, 'username', result.username);
  if (result.password) setPositionalValue(command, 'password', result.password);
  return true;
}

/**
 * The --edit invocation editor (Phase 2): lists the command's optional
 * options that are NOT already specified on this invocation (gap-filled
 * mandatory/one-of values from the earlier steps don't re-appear), with
 * their help descriptions. Space toggles, enter commits; each selected
 * option then gets a value step matched to its type (dropdown for
 * commander choices(), free text otherwise -- booleans commit on toggle).
 * Unselected options keep their built-in defaults; committed values apply
 * to THIS invocation only (plain option values, no persistence -- that is
 * Phase 4's Defaults.json).
 *
 * Escape backs out of the value step without committing that option; the
 * multiselect's Escape (or ←) backs out of the editor entirely (committed
 * nothing beyond what the earlier steps resolved). No editor on a
 * non-interactive session: --edit is meaningless there and the command
 * must behave exactly as without it (FRODO_TEST e2e determinism).
 */

// The editor's candidate list + the Phase 5 hint live in a zero-import
// module (EditableOptions) so picker modules in utils/interactive/ can
// attach the same hint without importing this file's graph (see the
// ActiveActionCommandState split for the layering rationale). Re-exported
// for the editor's own use.
export {
  editableOptionalOptions,
  editableOptionsHint,
} from '../utils/interactive/EditableOptions';

// The positional read/write helpers live in a zero-import module
// (PositionalArgs) shared with the post-auth realm picker's write-back;
// re-exported here under the historical name for any other consumers.
export { setPositionalValue as setPositionalValueForCommand } from '../utils/interactive/PositionalArgs';

/**
 * Public entry for utils/interactive picker modules (EntityPickers,
 * RealmPickers): their `→` key opens this editor, then re-prompts. Kept
 * as a named export because those modules import this file lazily (the
 * cycle is otherwise static: this file imports their registries).
 */
export async function runInvocationEditorForCommand(
  command: Command
): Promise<void> {
  await runInvocationEditor(command);
}

async function runInvocationEditor(command: Command): Promise<void> {
  const candidates = editableOptionalOptions(command);
  if (candidates.length === 0) {
    verboseMessage('No optional options left to edit.');
    return;
  }

  const picked = await escapableMultiSelect<string>({
    message: `Optional options for '${command.name()}' (space to select):`,
    preview: commandPreviewFor(command),
    choices: candidates.map((option) => {
      // Phase 5 widening: already-valued options are editable too --
      // shown with their current value so the user can tell them apart.
      // Distinguish a commander default (never user-typed) from a value
      // that came from this invocation's CLI/env.
      const current = command.getOptionValue(option.attributeName());
      const sourced =
        current === undefined || current === false
          ? undefined
          : command.getOptionValueSource(option.attributeName()) === 'default'
            ? ` (default: ${current})`
            : ` (current: ${current})`;
      return {
        value: option.attributeName(),
        name: option.flags,
        description: option.description
          ? `${option.description}${sourced ?? ''}`
          : sourced?.trim(),
      };
    }),
  });
  if (picked === MULTISEL_ESCAPE) {
    verboseMessage('Invocation editor dismissed; values unchanged.');
    return;
  }

  for (const attributeName of picked) {
    const option = command.options.find(
      (candidate) => candidate.attributeName() === attributeName
    )!;
    // Phase 5: re-editing a valued option pre-fills the value step with
    // the current value (Escape keeps it) -- "just wanted to peek" costs
    // one Esc, not a retyping session.
    const current = command.getOptionValue(attributeName);
    const currentText =
      current === undefined || current === false ? undefined : String(current);
    if (option.argChoices && option.argChoices.length > 0) {
      const value = await escapableSelect<string>({
        message: `Choose a value for ${option.flags}:`,
        preview: commandPreviewFor(command),
        choices: option.argChoices.map(
          (choiceValue): EscapableSelectChoice<string> => ({
            name: choiceValue,
            value: choiceValue,
          })
        ),
        default: currentText,
      });
      if (value === ESCAPE || value === RIGHT) continue;
      command.setOptionValueWithSource(attributeName, value, 'cli');
    } else if (!/<[^>]+>|\[[^\]]+\]/.test(option.flags)) {
      // Boolean flag: selected = true, no value step.
      command.setOptionValueWithSource(attributeName, true, 'cli');
    } else {
      const answer = await promptInput({
        message: `Enter a value for ${option.flags}:`,
        default: currentText,
      });
      if (!answer) continue;
      command.setOptionValueWithSource(attributeName, answer, 'cli');
    }
    verboseMessage(`Using ${option.flags}.`);
  }
}
