import {
  frodo,
  state,
  type BrowserLoginOptions,
  type BrowserLoginPrompt,
  type BrowserLoginPromptHandler,
  type Callback,
  type CallbackHandler,
  type Tokens,
} from '@rockcarver/frodo-lib';
import open from 'open';
import { printError, printMessage, verboseMessage } from '../utils/Console';
import { printErrorHint } from '../utils/ErrorCodeHints';
// The active-command registry, not ResolveInteractiveInputs itself: that
// file's graph reaches the frodo-lib-importing interactive prompts, which
// breaks tests that mock frodo-lib wholesale (see ActiveActionCommandState).
import { getActiveActionCommand } from '../utils/interactive/ActiveActionCommandState';
// The credential vocabulary lives in the interactive layer
// (ConnectionProfilePickers -- both the profile preference picker and
// this per-invocation override speak the same words); imported for use
// below AND re-exported so ops/ and cli/ consumers keep their
// established import path.
import type { CredentialOverrideType } from '../utils/interactive/ConnectionProfilePickers';
import { EXIT_ALL_SIGNAL } from '../utils/interactive/ExitAll';
// The login the resolution pass made for its pickers (record 0044): zero-import
// state, so this module stays loadable where frodo-lib is mocked.
import {
  passEntityPickAttempted,
  passRealmPickDone,
  takePassLogin,
  unsupportedDeploymentTypeMessage,
} from '../utils/interactive/PassLogin';
import { canPrompt } from '../utils/interactive/PromptGateState';
import { question } from '../utils/Prompt';

export type { CredentialOverrideType };

const { getTokens: _getTokens, getTokensInteractive: _getTokensInteractive } =
  frodo.login;
const { DEPLOYMENT_TYPES } = frodo.utils.constants;

const otpCallbackHandler: CallbackHandler = (callback: Callback) => {
  if (callback.type != 'NameCallback')
    throw new Error(`Unsupported callback: ${callback.type}`);
  printMessage(
    `Multi-factor authentication is enabled and required for this user.`
  );
  callback.input[0].value = question(`${callback.output[0].value}: `);
  return callback;
};

/**
 * Whether an interactive browser login started via this CLI process should
 * use the OAuth2 Device Authorization Grant instead of the default
 * loopback-redirect flow. Set by `--device`/`FRODO_LOGIN_DEVICE_FLOW` (see
 * `FrodoCommand.ts`) or by `frodo login --device`. Kept as module-scoped
 * state rather than on frodo-lib's `state`, since it's a one-shot,
 * per-invocation UX choice, not session identity.
 */
let useDeviceFlowOverride: boolean | undefined;

export function setUseDeviceFlow(value: boolean): void {
  useDeviceFlowOverride = value;
}

export function getUseDeviceFlow(): boolean {
  return (
    useDeviceFlowOverride ?? process.env.FRODO_LOGIN_DEVICE_FLOW === 'true'
  );
}

/**
 * Whether an implicit (non-interactive) command's own `getTokens()` call
 * should force a plain username/password login even when the resolved
 * connection profile also has a service account (or Amster) credential
 * configured — set by `--force-login-as-user`/`FRODO_FORCE_LOGIN_AS_USER`
 * (see `FrodoCommand.ts`). Same reasoning as `useDeviceFlowOverride` above:
 * a one-shot, per-invocation choice, not session identity, so it lives here
 * rather than on frodo-lib's `state`. Threads straight through to
 * frodo-lib's own `getTokens({forceLoginAsUser})` parameter — this is not a
 * new mechanism, just the first way to reach it from an arbitrary command
 * instead of only the one hardcoded internal call site (`conn-save.ts`).
 */
let forceLoginAsUserOverride: boolean | undefined;

export function setForceLoginAsUser(value: boolean): void {
  forceLoginAsUserOverride = value;
}

export function getForceLoginAsUserOverride(): boolean {
  // Truthy-string check (not a strict === 'true'), matching frodo-lib's own
  // reading of this exact same env var name in AuthenticateOps.ts's
  // getTokens() default parameter — frodo-cli's wrapper always passes an
  // explicit boolean through, so that default never actually applies once
  // routed through here, but the same env var name should mean the same
  // thing regardless of which layer happens to read it.
  return forceLoginAsUserOverride ?? !!process.env.FRODO_FORCE_LOGIN_AS_USER;
}

/**
 * Which configured credential type this one invocation should use,
 * overriding ambient browser-session cache reuse and any saved
 * defaultCredential/forceLoginAsUser preference — set by
 * `--credential`/`FRODO_CREDENTIAL` (see `FrodoCommand.ts`). The union
 * itself lives in the interactive layer (ConnectionProfilePickers --
 * both the profile preference picker and this per-invocation override
 * speak the same credential vocabulary), re-exported here so ops/ and
 * cli/ consumers keep their established import path.
 */
let credentialOverride: CredentialOverrideType | undefined;

export function setCredentialOverride(value: CredentialOverrideType): void {
  credentialOverride = value;
}

export function getCredentialOverride(): CredentialOverrideType | undefined {
  const envValue = process.env.FRODO_CREDENTIAL;
  return (
    credentialOverride ??
    (envValue === 'user' ||
    envValue === 'svcacct' ||
    envValue === 'amster' ||
    envValue === 'browser'
      ? envValue
      : undefined)
  );
}

/**
 * Whether `cliBrowserLoginPromptHandler` should try to launch a local
 * browser for the loopback-redirect flow, as opposed to only ever printing
 * the URL (for remote/SSH sessions with no usable local browser). Defaults
 * to true; set to false via `frodo login --no-open`.
 */
let openBrowser = true;

export function setOpenBrowser(value: boolean): void {
  openBrowser = value;
}

/**
 * Whether this process showed a browser-login step: told apart from a
 * session reused from the cache when the command names who it runs as.
 */
let browserLoginPrompted = false;

/**
 * Presents an interactive browser-login step on the CLI: launches the
 * system browser for the loopback-redirect flow, or prints the user code
 * and verification URL for the device-authorization flow.
 *
 * @remarks
 * The authorize URL itself is always printed too, even when the system
 * browser opens successfully — not just as a fallback for when launching
 * one fails or was disabled via `setOpenBrowser(false)`. The auto-opened
 * browser is whatever the OS considers the default, which isn't
 * necessarily the one the login should actually happen in (e.g. a profile
 * with the right admin session, or a clean one with no extensions that
 * might interfere with the loopback redirect) — printing the URL
 * unconditionally lets the user open it in a different browser themselves
 * without having to first watch the automatic launch fail.
 */
export const cliBrowserLoginPromptHandler: BrowserLoginPromptHandler = async (
  prompt: BrowserLoginPrompt
) => {
  browserLoginPrompted = true;
  if (prompt.userCode && prompt.verificationUri) {
    printMessage(`To complete login, open this URL in any browser:`);
    printMessage(`  ${prompt.verificationUri}`);
    printMessage(`and enter this code when prompted:`);
    printMessage(`  ${prompt.userCode}`);
    return;
  }
  if (prompt.authorizeUrl) {
    if (openBrowser) {
      printMessage(`Opening browser to complete login...`);
      try {
        await open(prompt.authorizeUrl);
        printMessage(
          `If you'd rather use a different browser, open this URL manually:`
        );
      } catch {
        printMessage(
          `Could not open a browser automatically. Open this URL manually to complete login:`,
          'warn'
        );
      }
    } else {
      printMessage(`Open this URL in any browser to complete login:`);
    }
    printMessage(`  ${prompt.authorizeUrl}`);
  }
};

/**
 * Logs in with the library, as every command does, and says who is logged in.
 * Throws what the library throws; the callers report it.
 * @param forceLoginAsUser the caller's own request to log in as a user (the global override is added here)
 * @param autoRefresh true to automatically refresh tokens before they expire
 * @param types supported deployment types
 * @returns who is logged in (the subject of the tokens)
 */
async function login(
  forceLoginAsUser: boolean,
  autoRefresh: boolean,
  types: string[]
): Promise<string> {
  const tokens = await _getTokens(
    // The caller's own explicit request always wins; otherwise fall back
    // to the global --force-login-as-user/FRODO_FORCE_LOGIN_AS_USER
    // override, so any implicit command (not just conn-save.ts's own
    // hardcoded call) can force a plain username/password login over a
    // profile's configured service account/Amster credential. Ignored by
    // frodo-lib whenever credentialOverride below is also set.
    forceLoginAsUser || getForceLoginAsUserOverride(),
    autoRefresh,
    types,
    otpCallbackHandler,
    getUseDeviceFlow(),
    cliBrowserLoginPromptHandler,
    getCredentialOverride()
  );
  verboseMessage(
    `Connected to ${state.getHost()} [${
      state.getRealm() ? state.getRealm() : 'root'
    }] as ${tokens.subject}`
  );
  // A browser or device login runs as whoever is signed in to the browser,
  // which the command line does not say, so always name the account.
  // Other logins keep the verbose line above: their account is the one
  // that was passed in or saved.
  if (state.getActiveCredentialSource() === 'browser') {
    printMessage(
      browserLoginPrompted
        ? `Logged in as ${tokens.subject}`
        : `Using the saved browser login of ${tokens.subject}`,
      'info'
    );
  }
  return tokens.subject;
}

/**
 * The login the resolution pass makes for a picker that needs one (decision
 * records 0044 and 0046): the same machinery as `getTokens` below (the callback
 * for a second factor, the browser and device prompts, service account, saved
 * credentials, `--credential`, the global force-login-as-user override) with
 * the default arguments. The pass remembers what it used, so the command's own
 * `getTokens()` does not log in a second time. A failure is returned, not
 * reported: the connection page shows it in its frame and reports it when it is
 * closed (`reportLoginFailure`).
 * @returns what the login used and who is logged in, or the error the login failed with
 */
export async function tryLoginInPass(): Promise<
  | {
      session: {
        forceLoginAsUser: boolean;
        autoRefresh: boolean;
        subject: string;
      };
    }
  | { error: unknown }
> {
  const forceLoginAsUser = getForceLoginAsUserOverride();
  const autoRefresh = true;
  try {
    const subject = await login(
      forceLoginAsUser,
      autoRefresh,
      DEPLOYMENT_TYPES
    );
    return { session: { forceLoginAsUser, autoRefresh, subject } };
  } catch (error) {
    if (error === EXIT_ALL_SIGNAL) throw error;
    return { error };
  }
}

/**
 * Reports a failed login the way `getTokens` does: the error, and the hint for
 * it (the library states what is wrong; the advice is ours, ErrorCodeHints).
 * @param error what the login failed with
 */
export function reportLoginFailure(error: unknown): void {
  printError(error as Error);
  printErrorHint(error as Error);
}

/**
 * The login of the pass, reported where it fails: see `tryLoginInPass`.
 * @returns what the login used, or undefined when it failed (the failure is reported)
 */
export async function loginInPass(): Promise<
  { forceLoginAsUser: boolean; autoRefresh: boolean } | undefined
> {
  const attempt = await tryLoginInPass();
  if ('error' in attempt) {
    reportLoginFailure(attempt.error);
    return undefined;
  }
  return {
    forceLoginAsUser: attempt.session.forceLoginAsUser,
    autoRefresh: attempt.session.autoRefresh,
  };
}

/**
 * Get tokens and store them in State
 *
 * A command whose resolution pass logged in for a picker (record 0044) uses
 * that login when this is its first call and it asks for the same
 * `forceLoginAsUser` and `autoRefresh`: no second round trip. The command's own
 * list of deployment types is still enforced, with the library's error. With
 * other arguments, or on a later call, it logs in as usual.
 * @param {boolean} forceLoginAsUser true to force login as user even if a service account is available (default: false). Also forced by the global --force-login-as-user option/FRODO_FORCE_LOGIN_AS_USER env var (see getForceLoginAsUserOverride()) regardless of this parameter. Deprecated — use --credential user (getCredentialOverride()) instead; kept for backward compatibility and overridden by it when both are set.
 * @param {boolean} autoRefresh true to automatically refresh tokens before they expire (default: true)
 * @param {string[]} types Array of supported deployment types. The function will throw an error if an unsupported type is detected (default: ['classic', 'cloud', 'forgeops'])
 * @returns {Promise<boolean>} true when logged in and the pickers that follow the login were satisfied
 */
export async function getTokens(
  forceLoginAsUser: boolean = false,
  autoRefresh: boolean = true,
  types: string[] = DEPLOYMENT_TYPES
): Promise<boolean> {
  try {
    if (
      takePassLogin(
        forceLoginAsUser || getForceLoginAsUserOverride(),
        autoRefresh
      )
    ) {
      // The pass logged in with these arguments. Only this command's own list of
      // deployment types is left to check, and the library's refusal is the
      // error that says so (what a login made here would have raised).
      const refusal = unsupportedDeploymentTypeMessage(
        types,
        state.getDeploymentType()
      );
      if (refusal) {
        const { unsupportedDeploymentTypeError } =
          await import('./UnsupportedDeploymentTypeError');
        throw unsupportedDeploymentTypeError(refusal);
      }
      verboseMessage('Using the login made while the command was completed.');
    } else {
      await login(forceLoginAsUser, autoRefresh, types);
    }
    // Post-auth realm picker: offers the target system's realms when the
    // command has a realm argument, the user left it at its default, the
    // resolution pass prompted for required connection input, and the system
    // has multiple realms. The active command is recorded by the resolution
    // pass (preAction), so commands that bypass it naturally skip the picker.
    // The pass offers it itself when it logs in for it (record 0044); it is
    // never offered a second time here.
    //
    // Gated on canPrompt() and lazy-imported: this module must stay loadable
    // in tests that mock frodo-lib wholesale (the picker's graph reaches
    // ColorTheme's `theme` import), and a non-interactive session doesn't
    // need the picker's machinery.
    if (canPrompt() && !passRealmPickDone()) {
      const { resolveRealmPick } =
        await import('../utils/interactive/RealmPickers');
      await resolveRealmPick(getActiveActionCommand());
    }
    // The deferred authoring print: flushed
    // HERE so the eventual command lands directly above the action's
    // results (the print is a header for the output, not a footer after
    // it) -- every auth command's action prints its results only after
    // getTokens returns true, and the realm pick (which can still change
    // the command) has concluded by now. SKIPPED when the command has entity
    // picks still PENDING (registered and their option unset, and the pass has
    // not run them -- they run later in the action body and may still change
    // the command): resolveEntityPicks flushes after its picks conclude
    // instead. Picks already applied before auth (the pick-first pattern) do
    // NOT block this flush -- their option is set, nothing pending.
    // Arming-only sessions (no prompts, not explicitly interactive) flush
    // as a no-op via the closure's gate.
    {
      const { noteAuthSucceeded, flushAuthoringPrint } =
        await import('../utils/interactive/AuthoringPrintState');
      noteAuthSucceeded();
      const activeCommand = getActiveActionCommand();
      // The entity pickers the command inherits from its command family
      // (decision record 0038) run here, once the loaders have a login, so
      // a command in such a family calls no resolver of its own. A declined
      // pick or a failed load stops the command like a failed login does.
      // The picks the pass ran are skipped (record 0044).
      if (activeCommand) {
        const { resolveFamilyEntityPicks } =
          await import('../utils/interactive/EntityPickers');
        if (!(await resolveFamilyEntityPicks(activeCommand))) {
          return false;
        }
      }
      const hasPendingPicks = await (async () => {
        if (!activeCommand) return false;
        const { getEntityPicks } =
          await import('../utils/interactive/EntityPickers');
        return getEntityPicks(activeCommand).some(
          (pick) =>
            !activeCommand.getOptionValue(pick.name) &&
            !passEntityPickAttempted(pick.name)
        );
      })();
      if (!hasPendingPicks) {
        flushAuthoringPrint();
      }
    }
    return true;
  } catch (error) {
    // The exit-all unwind is not an auth failure -- rethrow it so it
    // reaches app.ts's top-level handler (realm/entity pickers throw the
    // signal from inside this try).
    if (error === EXIT_ALL_SIGNAL) throw error;
    printError(error);
    // the library states what is wrong; the advice is ours (ErrorCodeHints)
    printErrorHint(error);
    // Auth failed: the command never ran -- revoke the deferred print so
    // the postAction fallback (whose only remaining purpose is non-auth
    // commands) leaves nothing behind for a failed auth attempt.
    {
      const { revokeAuthoringPrint } =
        await import('../utils/interactive/AuthoringPrintState');
      revokeAuthoringPrint();
    }
  }
  return false;
}

/**
 * For a command that tries a list of option combinations, each with `&& (await getTokens())`, and reports
 * "unrecognized combination of options" when none ran: a login that failed has said why already, so the command
 * must not blame its options. `login` is `getTokens` that remembers that it failed and does not try again after that.
 * @returns {{ login: Function, loginFailed: Function }} `login` to use in place of `getTokens`, and `loginFailed()` to ask whether it failed
 */
export function trackLogin(): {
  login: (...args: Parameters<typeof getTokens>) => Promise<boolean>;
  loginFailed: () => boolean;
} {
  let failed = false;
  return {
    login: async (...args) => {
      // one failed login ends the attempts of this invocation
      if (failed) return false;
      const loggedIn = await getTokens(...args);
      if (!loggedIn) failed = true;
      return loggedIn;
    },
    loginFailed: () => failed,
  };
}

/**
 * Get tokens via a real interactive browser login (loopback-redirect or
 * device-authorization grant), bypassing `getTokens()`'s password/service-
 * account/Amster fallback chain entirely. Used by `frodo login --browser`.
 * @param {Omit<BrowserLoginOptions, 'promptHandler'>} options browser-login options; the CLI always supplies its own promptHandler
 * @returns {Promise<Tokens>} object containing the tokens, or null on failure
 */
export async function getTokensInteractive(
  options: Omit<BrowserLoginOptions, 'promptHandler'>
): Promise<Tokens> {
  try {
    const tokens = await _getTokensInteractive({
      ...options,
      useDeviceFlow: options.useDeviceFlow ?? getUseDeviceFlow(),
      promptHandler: cliBrowserLoginPromptHandler,
    });
    verboseMessage(
      `Connected to ${state.getHost()} [${
        state.getRealm() ? state.getRealm() : 'root'
      }] as ${tokens.subject}`
    );
    return tokens;
  } catch (error) {
    printError(error);
    printErrorHint(error);
  }
  return null;
}
