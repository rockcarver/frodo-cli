/**
 * The "zero-touch" resolution pass: fills missing command input
 * interactively before the action body runs (see
 * docs/INTERACTIVE-COMMANDS.md). Wired from FrodoCommand's preAction
 * hook; never modifies frodo-lib.
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
 *    would answer anyway would be pure friction. Explicit credential
 *    sources (service account, Amster key, browser/device auth) likewise
 *    suppress username/password prompts, but not the host prompt.
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
import { printMessage, successMessage, verboseMessage } from '../utils/Console';
import {
  armAuthoringPrint,
  setAuthoringPrintFlush,
} from '../utils/interactive/AuthoringPrintState';
import {
  liveMultiOptionPreview,
  liveOptionPreview,
  livePositionalPreview,
  renderCommandPreview,
  setDeploymentTypeForPreview,
  type CommandReadiness,
} from '../utils/interactive/CommandPreview';
import {
  forcesUserLogin,
  hasExplicitCredentialSource,
  savedConnectionIsComplete,
} from '../utils/interactive/ConnectionCredentials';
import {
  connectionPage,
  type ConnectionPageRow,
} from '../utils/interactive/ConnectionPagePrompt';
import {
  applicableCommandDefaults,
  optionMissingUserValue,
} from '../utils/interactive/DefaultsStore';
import {
  editableOptionalOptions,
  editableOptionGroupOf,
  editableOptionGroups,
  editableOptionsHiddenByConflicts,
  editableOptionsHint,
  sortEditableOptions,
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
import { EXIT_ALL, EXIT_ALL_SIGNAL } from '../utils/interactive/ExitAll';
import {
  assertNoConflicts,
  commitOption,
  failWithConflict,
  hiddenNote,
  selectableMembers,
} from '../utils/interactive/OptionConflicts';
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
import {
  noteRealmProvenance,
  noteRequiredInputPrompted,
} from '../utils/interactive/RealmPickers';
import {
  assertNoPendingSecrets,
  collectSecretsByPrompt,
  collectSecretsFromStdin,
  failFirstPendingSecret,
} from '../utils/interactive/SecretCollector';
import { isSecretOption } from '../utils/interactive/SecretOptions';
import { guidedModeEnabled } from '../utils/SettingsStore';
import { readStdinToEndSync } from '../utils/StdinSync';

const { getConnectionProfilesPath, getConnectionProfileByHost } = frodo.conn;
const { probeDeploymentType, hasCachedBrowserSession } = frodo.login;
const { isValidUrl } = frodo.utils;

// The active-action-command registry lives in its own zero-import module
// (ActiveActionCommandState) so ops-layer importers (AuthenticateOps's
// post-auth realm/entity pickers) don't drag this file's frodo-lib-importing
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

const connectionPromptsSkippedWhen = new WeakMap<
  Command,
  (command: Command) => boolean
>();

/**
 * Registers a predicate that says, for one invocation, that the command
 * needs no connection at all, so the resolution pass opens neither the
 * profile picker nor the Connection page. Called from
 * FrodoCommand.skipConnectionPromptsWhen. The predicate runs in the
 * resolution pass, after persisted defaults are applied, so it sees the
 * same options the action will.
 */
export function deferSkipConnectionPrompts(
  command: Command,
  predicate: (command: Command) => boolean
): void {
  connectionPromptsSkippedWhen.set(command, predicate);
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
    // The last required input: a secret used without a value comes from
    // stdin when input is piped, and ends the command otherwise.
    collectSecretsFromStdin(command, {
      isTTY: !!process.stdin.isTTY,
      read: readStdinToEndSync,
    });
    return;
  }

  // Interactive: connection args first (they give the mandatory-option
  // prompts their tenant context), then mandatory options, then one-of
  // groups (which may prompt for a member option; after that step the
  // action's getTokens may still fail on auth, exactly as before).
  // Either step bailing out falls back to the pre-Phase-1 error
  // semantics.
  // Persisted per-command defaults fill in BEFORE any prompt or
  // resolution -- a saved value reads as authored input (source 'cli')
  // for everything downstream (the editor's (current: x) display, the
  // preview footer, the serializer's copy-paste tokens), while an
  // explicit flag or env var on THIS invocation keeps precedence (the
  // gate skips options that already carry a non-default source).
  applyPersistedDefaults(command);
  // Realm provenance MUST be captured before any prompt: frodo-lib maps
  // the sentinel default to the deployment's realm during auth, so a
  // user choice and a mapped default are indistinguishable afterwards.
  noteRealmProvenance(command);
  noteRequiredInputPrompted(false);
  // The realm picker is only an optional extension of a connection prompt.
  // Track only resolveConnectionArgs below: missing mandatory command options
  // are not connection gaps and must not trigger the realm picker.
  // Keep the deployment default when realm is the sole omitted value.
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
  // The connection is UNRESOLVED while its own prompts are open (the
  // profile picker, the credentials page): record that BEFORE they run so
  // their footers render red. Recording only the outcome left every
  // connection-stage gap green -- an unset flag reads as "ready", and
  // nothing else is mandatory for most commands, so the footer was never
  // red there. When nothing needs prompting the flag flips to its real
  // value immediately, with no frame in between.
  connectionReadiness.set(command, false);
  const promptCountBeforeConnection = promptsRendered();
  const connectionResolved =
    (connectionPromptsSkippedWhen.get(command)?.(command) ?? false) ||
    (await resolveConnectionArgs(command));
  connectionReadiness.set(command, connectionResolved);
  noteRequiredInputPrompted(promptsRendered() > promptCountBeforeConnection);
  const mandatoryResolved = connectionResolved
    ? await resolveMandatoryOptions(command)
    : false;
  if (!connectionResolved || !mandatoryResolved) {
    if (violations.length > 0) {
      throwMissingMandatory(command, violations[0]);
    }
    // Never let a secret's marker run on as a value.
    assertNoPendingSecrets(command);
    return;
  }
  const oneOfResolved = await resolveOneOfGroups(command);
  if (!oneOfResolved) {
    const unsatisfied = findUnsatisfiedOneOfGroups(command);
    if (unsatisfied.length > 0) {
      throwOneOfUnsatisfied(command, unsatisfied[0]);
    }
  }
  // Secrets come last of the required inputs: every other prompt has
  // succeeded by now, so a declined earlier prompt never makes anyone type a
  // secret for nothing. Asked for in declaration order, input hidden.
  if (
    !(await collectSecretsByPrompt(command, violations, (message) =>
      promptPassword({
        message,
        preview: () => commandPreviewFor(command) ?? '',
      })
    ))
  ) {
    failFirstPendingSecret(command, violations, (flags) =>
      throwMissingMandatory(command, flags)
    );
  }
  // The invocation editor runs LAST: by now gap-filled
  // mandatory/one-of values are visible, so the editor only offers what is
  // still unspecified. Backing out keeps every value resolved above.
  // Trigger: an explicit --prompt (commander source
  // 'cli' -- the default true doesn't count) or the persisted guided-mode
  // settings toggle (frodo settings guided) -- both are opt-in; default
  // runs keep today's behavior. (--edit retired: commander rejects it as
  // an unknown option.)
  if (explicitlyInteractive) {
    await runInvocationEditor(command);
  }

  // Safety net: every option above went through commitOption, so this only
  // fires for a path that bypassed it. The command about to run (and the
  // preview of it) must be one the command line itself would accept.
  assertNoConflicts(command);
  assertNoPendingSecrets(command);

  // The authoring-tool moment, DEFERRED to just before the command's
  // own output: after an interactive-assisted resolution, the command as
  // it will run prints exactly once, directly ABOVE the action's results
  // (user: the print is a header for the results, not a footer after
  // them). Flush sites, chosen so every flow's print lands at its last
  // command-mutating moment:
  //
  // - getTokens wrapper (AuthenticateOps): after the post-auth realm pick
  //   concludes -- every auth command's action output starts after its
  //   getTokens returns, so the print sits directly above the results.
  //   SKIPPED when the command has entity picks pending (the picks may
  //   still change the command; resolveEntityPicks flushes instead).
  // - resolveEntityPicks (EntityPickers): after the last entity pick
  //   concludes -- the pick-after-auth commands (esv variable set, secret
  //   store mapping delete) print here, with the picked values in.
  // - postAction hook (FrodoCommand): the fallback for commands whose
  //   interactive flow ends elsewhere (settings/conn/stub commands -- no
  //   auth, no picks); a no-op for anything the first two sites already
  //   flushed.
  //
  // Flows that never reach a flush site (cancelled pickers, unsatisfied
  // one-of groups, failed auth) print nothing -- an abandoned session
  // leaves nothing behind.
  //
  // Armed UNCONDITIONALLY (registration is free); the PRINT GATE lives in
  // the flush closure, evaluated at flush time -- NOT here. It must be
  // evaluated late: post-auth realm/entity pickers render AFTER this pass
  // ends, so a gate evaluated now would miss a session whose only prompt
  // was a picker. The gate itself
  // is unchanged: at least one prompt rendered this process, or the user
  // explicitly requested the flow (--prompt / guided mode). Fully
  // specified non-TTY runs (e2e snapshots) render no prompts and never
  // pass the gate, so output is byte-identical.
  armAuthoringPrint();
  setAuthoringPrintFlush(() => {
    if (promptsRendered() === 0 && !explicitlyInteractive) return;
    // Green (theme `positive`): the print sits directly above the
    // action's results and must be distinguishable from them at a
    // glance (user decision 2026-10-12, reversing #793's plain-color
    // experiment -- plain text read as more output). Ready-state green
    // is semantically right too: the flushed command is by definition
    // validated and about to run.
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
 * The `→` routing for pickers inside the resolution pass: runs
 * `escapableSelect` with the command's discoverability hint attached,
 * and when the user presses → (resolve `RIGHT`), opens the invocation
 * editor, then re-prompts -- so a user who landed in a mandatory/one-of/
 * profile picker can discover and edit everything else from there (the
 * segment navigation described in docs/INTERACTIVE-COMMANDS.md). Without
 * a hint (nothing to configure) this is exactly `escapableSelect`: the
 * → key stays readline's business and the loop never engages.
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
  // Preview discipline: callers pass their own (a LIVE callback when the
  // pick maps onto a command token); the default is a static-committed-
  // state render wrapped as a callback, re-rendered on EVERY redraw --
  // so values filled since the last prompt (including by the editor's
  // return loop above) show immediately instead of one picker-open late.
  const preview = config.preview ?? (() => commandPreviewFor(command) ?? '');
  for (;;) {
    const choice = await escapableSelect<Value>({
      ...config,
      hint,
      preview,
    });
    // EXIT_ALL resolves INSIDE the prompt (the grace window holds both
    // presses in one instance) and THROWS straight out of this loop --
    // it never reaches the caller (the resolver's callers branch on
    // ESCAPE only).
    if (choice === EXIT_ALL) throw EXIT_ALL_SIGNAL;
    if (choice === ESCAPE) return ESCAPE;
    if (choice !== RIGHT) return choice;
    // The editor THROWS EXIT_ALL_SIGNAL on a double-ESC inside it (the
    // signal propagates through this loop untouched); its plain return
    // (values committed or the value step declined) just loops back into
    // this picker -- the user can still ESC it to leave the segment.
    await runInvocationEditor(command);
  }
}

/**
 * The command preview footer for `command`'s prompts: the
 * command-so-far, red + cursive while mandatory input is missing, green/
 * white when validated and ready. Readiness derives from this module's
 * registries (deferred mandatory violations, one-of groups, connection
 * resolution); undefined when prompting is disallowed (the preview is an
 * interactive affordance only).
 */
export function commandPreviewFor(command: Command): string | undefined {
  if (!canPrompt()) return undefined;
  const readiness = commandReadinessFor(command);
  return readiness ? renderCommandPreview(command, readiness) : undefined;
}

/**
 * The Connection page's LIVE footer: the command with the page's rows
 * shadowed into its positionals (the serializer masks the password), green
 * once every row the command declares holds a value. The page is the
 * connection step's own prompt, so the connection counts as resolved when
 * its rows are filled, not when the step ends (connectionReadiness stays
 * false until then, which is why a one-shot footer never turned green).
 * Like livePositionalPreview, the real positionals are only borrowed for
 * this render. Undefined when prompting is disallowed.
 */
function connectionPagePreview(
  command: Command,
  rows: ConnectionPageRow[]
): string | undefined {
  const readiness = commandReadinessFor(command);
  if (!readiness) return undefined;
  const args = command.processedArgs;
  const committed = new Map<number, unknown>();
  for (const row of rows) {
    const index = positionalIndex(command, row.key);
    if (args && index !== -1 && row.value) {
      committed.set(index, args[index]);
      args[index] = row.value;
    }
  }
  try {
    return renderCommandPreview(command, {
      ...readiness,
      connectionResolved: rows
        .filter((row) => positionalIndex(command, row.key) !== -1)
        .every((row) => row.value),
    });
  } finally {
    for (const [index, value] of committed) args[index] = value;
  }
}

/**
 * The resolver's current readiness input for `command` (the data behind
 * commandPreviewFor's render), for callers building LIVE preview
 * callbacks (livePositionalPreview/liveOptionPreview need the readiness
 * at every re-render, not a one-shot string). Undefined when prompting
 * is disallowed -- same gate as commandPreviewFor.
 */
export function commandReadinessFor(
  command: Command
): CommandReadiness | undefined {
  if (!canPrompt()) return undefined;
  // Freshness: the deferred-mandatory registry records what parser time
  // found -- a value filled SINCE (by this pass's own prompts or the
  // invocation editor) must not keep the footer red. Recompute per call:
  // an option is "still missing" only when its label is registered AND
  // the option still holds no value.
  const registered = pendingMandatoryViolations.get(command) ?? [];
  const missingMandatoryOptionLabels = registered.filter((label) => {
    const option = command.options.find(
      (candidate) => candidate.flags === label
    );
    if (!option) return true;
    const value = command.getOptionValue(option.attributeName());
    return value === undefined || value === false || value === '';
  });
  const oneOfUnsatisfied = findUnsatisfiedOneOfGroups(command).length > 0;
  // Before the resolution pass has reached the connection step there is
  // no connection truth yet (the map is empty) -- leave it unset:
  // readiness then hinges on the mandatory/one-of state alone. From the
  // step onward the map holds false while the connection's own prompts
  // are open, then the outcome.
  const connectionResolved = connectionReadiness.get(command);
  return {
    missingMandatoryOptionLabels,
    oneOfUnsatisfied,
    ...(connectionResolved !== undefined ? { connectionResolved } : {}),
  };
}

/**
 * LIVE preview callbacks for `command`'s pickers (the footer shows what
 * the user is INFLUENCING -- arrowing through a list re-renders the
 * command with the highlighted value shadowed in). Built fresh per
 * picker open; the readiness THUNK re-derives per render (footer color
 * answers "valid as shown right now" -- user decision 2026-10-14: a
 * highlighted value that completes the command reads green before any
 * commit), so the callbacks stay valid across the picker's renders even
 * as mandatory/one-of state moves. Undefined when prompting is
 * disallowed -- same gate as commandPreviewFor.
 */
export function livePositionalPreviewFor(
  command: Command,
  positionalName: string
): ((highlighted: unknown) => string) | undefined {
  if (!commandReadinessFor(command)) return undefined;
  return livePositionalPreview(command, positionalName, () =>
    commandReadinessFor(command)
  );
}

export function liveOptionPreviewFor(
  command: Command,
  optionName: string,
  toValue?: (highlighted: unknown) => string | undefined
): ((highlighted: unknown) => string) | undefined {
  if (!commandReadinessFor(command)) return undefined;
  return liveOptionPreview(
    command,
    optionName,
    () => commandReadinessFor(command),
    toValue
  );
}

/**
 * The footer of a text prompt that collects the value of an option: the
 * command with the text typed so far shadowed in, as the pickers do with the
 * highlighted value (record 0019). Every prompt that asks for a value passes
 * one, so a typed value is framed like a picked one.
 */
function typedOptionPreviewFor(
  command: Command,
  optionName: string
): ((typed: string) => string) | undefined {
  const live = liveOptionPreviewFor(command, optionName);
  return live ? (typed) => live(typed.trim()) : undefined;
}

/** The footer of a text prompt that collects a positional argument; see typedOptionPreviewFor. */
function typedPositionalPreviewFor(
  command: Command,
  positionalName: string
): ((typed: string) => string) | undefined {
  const live = livePositionalPreviewFor(command, positionalName);
  return live ? (typed) => live(typed.trim()) : undefined;
}

/**
 * Prompts for a value from a closed choice set. A ONE-item set auto-commits
 * (a single choice is no choice; commander would accept only that value
 * anyway -- the plan's single-option refinement); otherwise a searchable
 * dropdown. Returns ESCAPE only from the interactive picker, so a
 * single-choice set can never decline. With `optionName`, the picker's
 * footer is LIVE: arrowing through the values re-renders the command with
 * the highlighted value shadowed into that option.
 */
async function selectFromChoices(
  command: Command,
  message: string,
  choices: string[],
  optionName?: string
): Promise<string | typeof ESCAPE> {
  if (choices.length === 1) {
    verboseMessage(`Only one value available: ${choices[0]}`);
    return choices[0];
  }
  return selectWithEditorRouting(command, {
    message,
    ...(optionName
      ? { preview: liveOptionPreviewFor(command, optionName) }
      : {}),
    choices: choices.map((choiceValue) => ({
      name: choiceValue,
      value: choiceValue,
    })),
  });
}

/**
 * Sets an option through the conflict check (issue #967). A conflict with
 * something the user gave ends the command with commander's own error, as
 * if it had been typed that way; a conflicting value the resolver set
 * earlier (a saved default, an earlier pick) is replaced, and says so in
 * verbose output.
 */
function commitOrFail(command: Command, option: Option, value: unknown): void {
  const result = commitOption(command, option.attributeName(), value);
  if (result.status === 'blocked') {
    failWithConflict(command, option, result.blockedBy);
  }
  for (const replaced of result.cleared) {
    verboseMessage(
      `Replaced ${replaced.flags}, which cannot be used with ${option.flags}.`
    );
  }
}

/**
 * The editor's variant of commitOrFail: a conflict is not fatal there. It
 * says which option stands in the way and leaves the option unset, so the
 * user can pick something else. Returns whether the value was set.
 */
function commitInEditor(
  command: Command,
  option: Option,
  value: unknown
): boolean {
  const result = commitOption(command, option.attributeName(), value);
  if (result.status === 'blocked') {
    printMessage(
      `${option.flags} was not set: it cannot be used with ${result.blockedBy.flags}.`,
      'info'
    );
    return false;
  }
  for (const replaced of result.cleared) {
    verboseMessage(
      `Replaced ${replaced.flags}, which cannot be used with ${option.flags}.`
    );
  }
  return true;
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

    // A secret is collected last, hidden, by the secrets step: typing it
    // here would echo it.
    if (isSecretOption(option)) continue;

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
        option.argChoices,
        option.attributeName()
      );
      if (choice === ESCAPE) return false;
      value = choice;
    } else {
      const answer = await promptInput({
        message: `Enter a value for ${option.flags}:`,
        preview: typedOptionPreviewFor(command, option.attributeName()),
      });
      if (!answer) return false;
      value = answer;
    }
    commitOrFail(command, option, value);
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

    // A member that cannot be combined with an option the user already gave
    // is not offered (the command line would be rejected); if that leaves
    // nothing to pick, fail like commander does for the typed combination.
    const { selectable, hidden } = selectableMembers(
      command,
      memberOptions.map((member) => member.name)
    );
    if (hidden.length > 0) printMessage(hiddenNote(hidden), 'info');
    if (selectable.length === 0) {
      failWithConflict(command, hidden[0].option, hidden[0].blockedBy);
    }
    const offered = memberOptions.filter((member) =>
      selectable.includes(member.name)
    );

    const subject = group.purpose ?? 'what to act on';
    // LIVE footer: each row IS an option of the group, so the shadow
    // dispatches per highlight -- the highlighted member's own option
    // gains a placeholder showing the flag as present. The pick itself
    // is a boolean-resolution (selecting the member satisfies the group);
    // the value step below fills it for valued members. `true` shadowed
    // with source 'cli' serializes the flag alone -- exactly the token
    // the committed pick produces for boolean members. Readiness re-
    // derives per render: with a boolean member highlighted the group
    // reads SATISFIED in the same frame (green before any commit).
    const picked = await selectWithEditorRouting(command, {
      message: `Choose ${subject}:`,
      ...(commandReadinessFor(command)
        ? {
            preview: (highlighted: unknown) => {
              const member = offered.find(
                (candidate) => candidate.name === highlighted
              );
              // The gate above ran commandReadinessFor once; it can only
              // have become truthier since (values fill, none clear), so
              // the render-time re-derive is always defined here.
              const readiness = commandReadinessFor(command);
              if (!member || !readiness)
                return readiness
                  ? renderCommandPreview(command, readiness)
                  : '';
              // Boolean members shadow `true` (the flag alone serializes
              // -- the exact committed token); valued members shadow
              // nothing (their flag needs a value the NEXT step collects
              // -- a fake value would lie in the footer).
              const isBoolean = !/<[^>]+>|\[[^\]]+\]/.test(member.option.flags);
              return liveOptionPreview(
                command,
                member.name,
                () => commandReadinessFor(command),
                isBoolean ? () => true : () => undefined
              )(highlighted);
            },
          }
        : {}),
      choices: offered.map((member): EscapableSelectChoice<string> => ({
        value: member.name,
        name: `${member.option.flags}${member.option.description ? ` -- ${member.option.description}` : ''}`,
      })),
    });
    if (picked === ESCAPE) return false;

    const chosen = offered.find((member) => member.name === picked)!;

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
        chosen.option.argChoices,
        chosen.name
      );
      if (value === ESCAPE) return false;
      commitOrFail(command, chosen.option, value);
    } else if (!/<[^>]+>|\[[^\]]+\]/.test(chosen.option.flags)) {
      // Boolean flag: the flags carry no value placeholder (<value> /
      // [value]), so the pick itself is the value -- no second prompt.
      commitOrFail(command, chosen.option, true);
    } else {
      const answer = await promptInput({
        message: `Enter a value for ${chosen.option.flags}:`,
        preview: typedOptionPreviewFor(command, chosen.name),
      });
      if (!answer) return false;
      commitOrFail(command, chosen.option, answer);
    }
    verboseMessage(`Using ${chosen.option.flags}.`);
  }
  return true;
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
 * state's own env fallback), or an explicit credential source makes the
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
      // LIVE footer: the highlighted profile's host shadows the host
      // positional -- the footer shows the command's host token (and the
      // connection page's later prompts) moving with the cursor. The
      // "enter manually" sentinel maps to undefined (committed state).
      // Readiness stays SNAPSHOT here on purpose: the connection flag is
      // false while this picker is open (nothing is resolved yet), and
      // no highlight can change that -- the footer reads red until a
      // host commits, which is exactly the incomplete state it is.
      const readiness = commandReadinessFor(command);
      const choice = await selectWithEditorRouting<
        string | typeof ENTER_MANUALLY
      >(command, {
        message: 'Choose a connection profile:',
        ...(readiness
          ? { preview: livePositionalPreview(command, 'host', readiness) }
          : {}),
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
          preview: typedPositionalPreviewFor(command, 'host'),
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
        preview: typedPositionalPreviewFor(command, 'host'),
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
  // too late for the preview). No profile: probe the host ANONYMOUSLY
  // (frodo.login.probeDeploymentType -- two unauthenticated POSTs to
  // /oauth2/authorize, ~200ms) so new-host flows (frodo login <host>,
  // frodo conn save <host>, env-var connections) get the type BEFORE any
  // login: the realm sentinel translates in the preview/footer, realm
  // pickers pre-highlight the right default, cloud-only gating reads
  // correctly. The probed type is written into state (not just the
  // preview) because pre-auth prompt machinery reads
  // state.getDeploymentType(); it MUST match what auth later determines,
  // and the probe's evidence (built-in admin client existence) is the
  // same signal determineDeploymentType uses post-auth, so they agree by
  // construction. Probe failure (unreachable host, non-AM endpoint)
  // keeps the current behavior: preview keeps the untranslated sentinel,
  // and the run proceeds exactly as before the probe existed.
  {
    const host = positionalValue(command, 'host') ?? state.getHost();
    if (!state.getDeploymentType() && host) {
      try {
        const profile = await getConnectionProfileByHost(host);
        setDeploymentTypeForPreview(profile.deploymentType);
      } catch {
        // No profile for this host: the anonymous probe is the only
        // remaining signal. Only probe under the prompting gate (non-
        // interactive runs must stay byte-identical AND latency-free).
        if (canPrompt() && isValidUrl(host)) {
          try {
            const probe = await probeDeploymentType(host);
            // An unreachable or non-AM host is not classic: the probe
            // answers 'classic' for it too, so only a conclusive answer
            // counts. Otherwise as if the probe didn't exist --
            // untranslated sentinel, pre-existing semantics.
            if (probe.conclusive) {
              state.setDeploymentType(probe.deploymentType);
              setDeploymentTypeForPreview(probe.deploymentType);
            }
          } catch {
            // The probe itself failed: same as inconclusive.
          }
        }
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
    !hasExplicitCredentialSource(command);
  const passwordNeeded =
    positionalIndex(command, 'password') !== -1 &&
    !positionalValue(command, 'password') &&
    !state.getPassword() && // env fallback (FRODO_PASSWORD)
    !hasExplicitCredentialSource(command);

  if (!usernameNeeded && !passwordNeeded) return true;

  const host = positionalValue(command, 'host') ?? state.getHost();
  if (!host) return true; // host unresolved; the action fails on it as before

  let savedUsername: string | undefined;
  let profileNote: string | undefined;
  try {
    const profile = await getConnectionProfileByHost(host);
    // frodo-lib will authenticate from the profile alone when it carries
    // any usable credential (user/svcacct/amster), names one as its saved
    // default (browser, svcacct, amster), or a fresh browser session is
    // cached for the host (record 0031); a bare profile entry (host saved
    // without credentials -- possible via earlier frodo versions and manual
    // edits) answers nothing, so the prompts still run for it. A
    // username-only entry prefills the username prompt.
    if (
      savedConnectionIsComplete(
        profile,
        hasCachedBrowserSession(profile.tenant ?? host),
        forcesUserLogin(command)
      )
    ) {
      return true;
    }
    savedUsername = profile.username ?? undefined;
    profileNote = profile.alias
      ? `from profile ${profile.alias}`
      : 'from profile';
  } catch {
    // No profile for this host (or unreadable): a fresh browser session
    // cached for it still completes the connection (record 0031); otherwise
    // fall through to prompts.
    if (!forcesUserLogin(command) && hasCachedBrowserSession(host)) return true;
  }

  // The connection PAGE is the only prompt for username and password.
  // Rows carry the resolved current values + provenance (a username-only
  // profile prefills the username row; env fallbacks show as "(from
  // FRODO_USERNAME)" etc.); an empty commit on the masked password row
  // keeps the stored value. The page opens on the first row without a
  // value, its footer follows the rows, and Escape cancels the command:
  // there is no second, unframed prompt behind it.
  const result = await connectionPage({
    message: 'Connection:',
    preview: (rows) => connectionPagePreview(command, rows),
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
        // state.getUsername() is '' (not undefined) when nothing set it, so
        // `||` is what falls through to the saved profile's username.
        value:
          positionalValue(command, 'username') ??
          (state.getUsername() || savedUsername),
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
  if (result === EXIT_ALL) {
    // Exit-all unwinds the whole interactive resolution -- no fallback
    // prompts, the command does not run. THROW: the session ends (the
    // signal travels through the resolver, the preAction hook chain and
    // the action body to app.ts's top-level catch).
    throw EXIT_ALL_SIGNAL;
  }
  if (result.username) setPositionalValue(command, 'username', result.username);
  if (result.password) setPositionalValue(command, 'password', result.password);
  return true;
}

/**
 * The invocation editor: lists the command's optional
 * options that are NOT already specified on this invocation (gap-filled
 * mandatory/one-of values from the earlier steps don't re-appear), with
 * their help descriptions. Space toggles, enter commits; each selected
 * option then gets a value step matched to its type (dropdown for
 * commander choices(), free text otherwise -- booleans commit on toggle).
 * Unselected options keep their built-in defaults; committed values apply
 * to THIS invocation only (plain option values, no persistence -- that is
 * Defaults.json -- see DefaultsStore).
 *
 * Escape backs out of the value step without committing that option; the
 * multiselect's Escape (or ←) backs out of the editor entirely (committed
 * nothing beyond what the earlier steps resolved). No editor on a
 * non-interactive session: --edit is meaningless there and the command
 * must behave exactly as without it (FRODO_TEST e2e determinism).
 */

// The editor's candidate list + the discoverability hint live in a zero-import
// module (EditableOptions) so picker modules in utils/interactive/ can
// attach the same hint without importing this file's graph (see the
// ActiveActionCommandState split for the layering rationale). Re-exported
// for the editor's own use.
export {
  editableOptionGroupOf,
  editableOptionGroups,
  editableOptionalOptions,
  editableOptionsHint,
} from '../utils/interactive/EditableOptions';

// The positional read/write helpers live in a zero-import module
// (PositionalArgs); re-exported here under the historical name for any
// other consumers.
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

/**
 * Applies the command's persisted defaults (~/.frodo/
 * Defaults.json) to every option the user did NOT provide this
 * invocation (flag or env -- the precedence gate is
 * optionMissingUserValue: source undefined or 'default'). Values land
 * with source 'cli': persisted defaults are user-authored
 * configuration, and everything downstream (editor display, preview
 * footer, the eventual-command serializer) must treat them as real
 * input. Interactive only -- non-interactive runs keep byte-identical
 * behavior (built-in defaults).
 */
function applyPersistedDefaults(command: Command): void {
  if (!canPrompt()) return;
  const persisted = applicableCommandDefaults(command);
  for (const option of command.options) {
    const value = persisted[option.attributeName()];
    if (value === undefined) continue;
    if (!optionMissingUserValue(command, option)) continue;
    // A secret is never saved, so a stray saved one is never applied.
    if (isSecretOption(option)) continue;
    // Type guard: a persisted value must fit the option's collector
    // shape -- arrays only for repeat-collecting options (ListOption
    // family), everything else scalar. A mismatched entry (the option's
    // definition changed since the save) is skipped, not applied.
    const collectsArrays =
      Array.isArray(command.getOptionValue(option.attributeName())) ||
      Array.isArray(option.defaultValue);
    if (Array.isArray(value) !== collectsArrays) continue;
    // A saved default fills a gap; it never overrides anything and never
    // joins an option that cannot be combined with one already set.
    const result = commitOption(command, option.attributeName(), value, {
      replace: false,
    });
    if (result.status === 'blocked') {
      verboseMessage(
        `Skipping saved default ${option.flags}: it cannot be used with ${result.blockedBy.flags}.`
      );
      continue;
    }
    verboseMessage(
      `Using saved default ${option.flags} ${String(value)} (frodo settings defaults to change).`
    );
  }
}

async function runInvocationEditor(command: Command): Promise<void> {
  // THROWS EXIT_ALL_SIGNAL on a double-ESC inside the editor (either the
  // multiselect's list escape or a value step's) -- the signal propagates
  // through every caller to app.ts's top-level handler.
  const hiddenByConflicts = editableOptionsHiddenByConflicts(command);
  if (hiddenByConflicts.length > 0) {
    printMessage(hiddenNote(hiddenByConflicts), 'info');
  }
  const candidates = editableOptionalOptions(command);
  if (candidates.length === 0) {
    verboseMessage('No optional options left to edit.');
    return;
  }

  // Pre-select every option that already holds a user-authored value
  // (CLI/env/persisted-default source 'cli', or a previous commit in
  // this same editor loop): re-opening the editor via → must show the
  // selections that are already in the command, not an empty slate --
  // the user's markers ARE the command state. Commander defaults stay
  // unmarked (they are not the user's input).
  const preselected = candidates
    .filter(
      (option) => command.getOptionValueSource(option.attributeName()) === 'cli'
    )
    .map((option) => option.attributeName());

  // The per-option value step, shared by both paths that can collect a
  // value: the <space> side step (below) and the post-commit loop.
  // Returns undefined when the user declines (escape / empty enter) --
  // the caller leaves the option untouched. `committed` records every
  // value actually written, for the --save-defaults partial save.
  const runValueStep = async (
    attributeName: string
  ): Promise<string | true | typeof EXIT_ALL | undefined> => {
    const option = command.options.find(
      (candidate) => candidate.attributeName() === attributeName
    );
    if (!option) return undefined;
    // Re-editing a valued option pre-fills the value step with
    // the current value (Escape keeps it) -- "just wanted to peek" costs
    // one Esc, not a retyping session.
    const current = command.getOptionValue(attributeName);
    const currentText =
      current === undefined || current === false ? undefined : String(current);
    if (option.argChoices && option.argChoices.length > 0) {
      const value = await escapableSelect<string>({
        message: `Choose a value for ${option.flags}:`,
        preview: liveOptionPreviewFor(command, attributeName),
        choices: option.argChoices.map(
          (choiceValue): EscapableSelectChoice<string> => ({
            name: choiceValue,
            value: choiceValue,
          })
        ),
        default: currentText,
      });
      if (value === EXIT_ALL) return EXIT_ALL;
      if (value === ESCAPE || value === RIGHT) return undefined;
      if (!commitInEditor(command, option, value)) return undefined;
      return value;
    }
    if (!/<[^>]+>|\[[^\]]+\]/.test(option.flags)) {
      // Boolean flag: selected = true, no value step.
      if (!commitInEditor(command, option, true)) return undefined;
      return true;
    }
    const answer = await promptInput({
      message: `Enter a value for ${option.flags}:`,
      default: currentText,
      preview: typedOptionPreviewFor(command, attributeName),
    });
    if (!answer) return undefined;
    if (!commitInEditor(command, option, answer)) return undefined;
    return answer;
  };

  const committed: Record<string, unknown> = {};

  const picked = await escapableMultiSelect<string>({
    message: `Optional options for '${command.name()}' (space to select):`,
    defaultValues: preselected,
    // LIVE footer over the SELECTION (not the cursor): every space-
    // toggled option renders as its flag -- booleans as the flag alone,
    // valued options as flag + value placeholder while being valued.
    // The committed state shows when nothing is selected. Readiness
    // re-derives per render: a boolean toggle that satisfies the last
    // mandatory/one-of gap flips the footer green in the same frame.
    preview: (() => {
      if (!commandReadinessFor(command)) return undefined;
      return liveMultiOptionPreview(command, () =>
        commandReadinessFor(command)
      );
    })(),
    // Space on a VALUED option opens the prompt's INLINE value editor
    // (user feedback 2026-10-12: marking --retry showed a <placeholder>
    // and required a second enter to reach the value menu -- and the
    // first nested-prompt design froze the frame: two readlines over
    // stdin). The option is marked only once a real value is committed;
    // esc rejects the mark. Booleans have no value step and toggle
    // directly.
    needsValue: (attributeName) => {
      const option = command.options.find(
        (candidate) => candidate.attributeName() === attributeName
      );
      // A secret is asked for with its input hidden after the choice (see
      // the loop below), never typed into the inline editor.
      return (
        !!option &&
        !isSecretOption(option) &&
        /<[^>]+>|\[[^\]]+\]/.test(option.flags)
      );
    },
    // Enum options (commander `.choices()`, e.g. --retry <strategy>)
    // get an in-frame PICKER instead of free text (user feedback
    // 2026-10-12: free-typing an enum value is both wrong-shaped and
    // invisible).
    choicesFor: (attributeName) => {
      const option = command.options.find(
        (candidate) => candidate.attributeName() === attributeName
      );
      return option?.argChoices && option.argChoices.length > 0
        ? option.argChoices.map(String)
        : undefined;
    },
    // The value editor starts at the option's current value (a picker
    // cursor lands on it; the text draft pre-fills) -- same
    // "pre-fill the value step" contract runValueStep's re-edit
    // already honors.
    currentValueFor: (attributeName) => {
      const option = command.options.find(
        (candidate) => candidate.attributeName() === attributeName
      );
      if (!option) return undefined;
      const current = command.getOptionValue(attributeName);
      // Array collectors have no single current text to start from --
      // a repeated mark APPENDS (mirroring repeated flags), so the
      // editor starts empty every time.
      if (current === undefined || current === false || Array.isArray(current))
        return undefined;
      return String(current);
    },
    onValue: (attributeName, value) => {
      const option = command.options.find(
        (candidate) => candidate.attributeName() === attributeName
      );
      if (!option) return;
      // Array-collecting options (ListOption family) accumulate:
      // a repeated mark appends, mirroring repeated CLI flags.
      const collectsArrays = Array.isArray(option.defaultValue);
      const existing = command.getOptionValue(attributeName);
      const next = collectsArrays
        ? [...(Array.isArray(existing) ? existing : []), value]
        : value;
      // A conflict leaves the option unset (the message says why); the
      // loop after the prompt then tries it once more and says it again.
      if (!commitInEditor(command, option, next)) return;
      committed[attributeName] = command.getOptionValue(attributeName);
      verboseMessage(`Using ${option.flags} ${value}.`);
    },
    // The GROUPED editor (user decision 2026-10-13): the command's own
    // options flat on top, every shared help group a collapsible
    // section (the -hh order). A group holding an option the user
    // already set (defaultValues below, source 'cli') starts expanded,
    // so authored state never hides behind a collapsed header.
    groups: editableOptionGroups(candidates),
    choices: sortEditableOptions(candidates).map((option) => {
      // Already-valued options are editable too --
      // shown with their current value so the user can tell them apart.
      // Distinguish a commander default (never user-typed) from a value
      // that came from this invocation's CLI/env.
      const current = command.getOptionValue(option.attributeName());
      const sourced =
        current === undefined || current === false
          ? undefined
          : isSecretOption(option)
            ? ' (set)'
            : command.getOptionValueSource(option.attributeName()) === 'default'
              ? ` (default: ${current})`
              : ` (current: ${current})`;
      return {
        value: option.attributeName(),
        name: option.flags,
        group: editableOptionGroupOf(option),
        description: option.description
          ? `${option.description}${sourced ?? ''}`
          : sourced?.trim(),
      };
    }),
  });
  if (picked === EXIT_ALL) {
    // Exit-all unwinds the whole interactive resolution (see the
    // runInvocationEditor contract below). THROW the signal -- the
    // editor can be opened from inside any routing loop or the action
    // body, so only a throw reaches the top-level handler.
    throw EXIT_ALL_SIGNAL;
  }
  if (picked === MULTISEL_ESCAPE) {
    verboseMessage('Invocation editor dismissed; values unchanged.');
    return;
  }
  // With --save-defaults, every value committed in THIS editor
  // session (set/changed below) persists as the command's defaults. Only
  // options actually committed are saved -- a dismissed editor or an
  // untouched option changes nothing on disk.
  const savingDefaults =
    command.getOptionValue('saveDefaults') === true &&
    command.getOptionValueSource('saveDefaults') === 'cli';

  for (const attributeName of picked) {
    const pickedOption = command.options.find(
      (candidate) => candidate.attributeName() === attributeName
    );
    if (pickedOption && isSecretOption(pickedOption)) {
      // A secret is asked for here, input hidden, and never saved as a
      // default. One that already has a value is kept as it is.
      const alreadySet =
        command.getOptionValueSource(attributeName) === 'cli' &&
        command.getOptionValue(attributeName) !== undefined;
      if (!alreadySet) {
        const answer = await promptPassword({
          message: `Enter a value for ${pickedOption.flags} (input is hidden):`,
          preview: () => commandPreviewFor(command) ?? '',
        });
        if (answer && commitInEditor(command, pickedOption, answer)) {
          verboseMessage(`Using ${pickedOption.flags}.`);
        }
      }
      continue;
    }
    // Options valued INLINE (the multiselect's onValue committed the
    // value AND marked the option, source 'cli') are done -- running
    // the value step again would ask twice for the same value. A
    // boolean flag also sets source 'cli' at toggle time, so the
    // source check covers both; the value step is only for options
    // still without a user value.
    const alreadyValued =
      command.getOptionValueSource(attributeName) === 'cli' &&
      command.getOptionValue(attributeName) !== undefined;
    if (alreadyValued) {
      const option = command.options.find(
        (candidate) => candidate.attributeName() === attributeName
      )!;
      verboseMessage(`Using ${option.flags}.`);
      continue;
    }
    const value = await runValueStep(attributeName);
    if (value === EXIT_ALL) throw EXIT_ALL_SIGNAL; // exit-all unwinds to the shell
    if (value === undefined) continue;
    committed[attributeName] = value;
    const option = command.options.find(
      (candidate) => candidate.attributeName() === attributeName
    )!;
    verboseMessage(`Using ${option.flags}.`);
  }

  // The editor can open from INSIDE getTokens (a picker's [⏵] key),
  // which is after the action body's handleDefaultArgsAndOpts copy ran
  // -- so options committed here (--curlirize/--debug/--verbose...)
  // reached the command object but never frodo-lib's state (user report
  // 2026-10-13: --curlirize selected in the editor produced no curl
  // output). Replay the state handlers for everything the editor left
  // authored. Host/realm/user/password are skipped (the resolver owns
  // connection state; re-feeding it would clobber a resolved
  // connection).
  if (picked.length > 0) {
    const { replayEditorOptionStates } = await import('./FrodoCommand');
    replayEditorOptionStates(command);
  }

  // Persist what this session committed (partial save -- only
  // the editor's own commits; gap-filled mandatory values and
  // connection args are per-invocation, not preferences).
  if (savingDefaults && Object.keys(committed).length > 0) {
    const { saveCommandDefaults } =
      await import('../utils/interactive/DefaultsStore');
    saveCommandDefaults(command, committed);
    successMessage(
      `Saved ${Object.keys(committed).length} option${
        Object.keys(committed).length === 1 ? '' : 's'
      } as defaults for '${commandStorePath(command)}'.`
    );
  }
}

/** The `frodo x y z` path -- the store's key (DefaultsStore's own helper,
 * re-imported lazily beside its save call). */
function commandStorePath(command: Command): string {
  const names: string[] = [];
  for (
    let cursor: Command | undefined = command;
    cursor;
    cursor = cursor.parent
  ) {
    names.unshift(cursor.name());
  }
  return names.join(' ');
}
