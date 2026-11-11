import {
  createPrompt,
  isDownKey,
  isEnterKey,
  isUpKey,
  useEffect,
  useKeypress,
  usePrefix,
  useRef,
  useState,
} from '@inquirer/core';
import c from '../ColorTheme';
import {
  connectionSnapshot,
  doneLabel,
  filterRealmChoices,
  pageComplete,
  realmAfterChoice,
  type ConnectionFieldKey,
  type ConnectionPageRow,
  type PageConnection,
  type RealmRow,
} from './ConnectionPageState';
import { armEscapeGrace, EXIT_ALL } from './ExitAll';
import {
  navigationMenuItems,
  renderFramedBox,
  renderNavigationMenu,
  stripAnsi,
} from './NavigationMenu';
import { notePromptRendered } from './PromptGateState';
import { useTerminalWidth } from './TerminalWidth';

export type {
  ConnectionFieldKey,
  ConnectionPageRow,
  PageConnection,
  RealmRow,
} from './ConnectionPageState';

/** The masked rendering of a password row's stored value. */
const PASSWORD_MASK = '••••••••';

/** How many realms the choice box shows at once. */
const REALM_PAGE_SIZE = 7;

/** What the footer needs to know besides the rows: the realm chosen, and the realm highlighted in the choice box. */
export type ConnectionPagePreviewExtra = {
  realm?: string;
  highlightedRealm?: string;
};

export type ConnectionPageConfig = {
  message: string;
  rows: ConnectionPageRow[];
  /**
   * Command preview: the command being authored, rendered as a footer
   * line (by CommandPreview.ts). A function is called on every render with
   * the page's current rows, so the footer follows what the user has
   * committed so far (value and color) instead of what was known when the
   * page opened. The second argument carries the realm chosen on the page and
   * the one highlighted in its choice box.
   */
  preview?:
    | string
    | ((
        rows: ConnectionPageRow[],
        extra: ConnectionPagePreviewExtra
      ) => string | undefined);
  /**
   * Called when the user commits an edit to the host row -- the
   * credential rows' profile context keys on the host, so the caller
   * re-resolves their annotations. Receives the new host, returns the
   * updated rows (same keys; values/notes refreshed).
   */
  onHostChange?: (host: string) => Promise<ConnectionPageRow[]>;
  /**
   * Done logs in when the page is complete (a realm picker may follow, record
   * 0046): the pass does it, the page only says so on the Done row (`connect`).
   */
  logsIn?: boolean;
  /**
   * A login was made with the rows the page opened with: it says who is logged
   * in, and shows the Realm row (`realm`) while the rows still match. Editing the
   * host or a credential drops both, and Done logs in again.
   */
  connected?: PageConnection;
  /** The Realm row, shown while the page is connected. */
  realm?: RealmRow;
  /** The realm chosen when the page was left for the invocation editor, so it opens again with it. */
  realmChoice?: string;
  /**
   * Discoverability hint, as the pickers have it ("→ 26 options"): shown, and
   * the → key armed, while the Realm row is part of the page. The page resolves
   * with `openEditor` and the pass opens the invocation editor, then the page
   * again; this is the key the realm picker had before the realm moved here.
   */
  hint?: string;
  /**
   * The login failed: the page shows the failure in its frame and any of Enter
   * and Escape closes it. The page is not left for an edit; the command ends
   * (no retry loop, record 0046).
   */
  failure?: string;
};

/** What the page resolves with when Done (or, after a failure, Enter) is pressed. */
export type ConnectionPageResult = {
  host?: string;
  username?: string;
  password?: string;
  /** The realm chosen on the page, undefined when the default is kept or no Realm row was shown. */
  realm?: string;
  /** The rows as they stand, notes included, so the page can open again with them. */
  rows: ConnectionPageRow[];
  /** → was pressed (see `hint`): the pass opens the invocation editor, then the page again. */
  openEditor?: boolean;
};

/**
 * The connection page (docs/INTERACTIVE-COMMANDS.md): a
 * single-page form for host + username + password showing RESOLVED
 * current values with their provenance, replacing the sequential
 * prompts when connection input is missing and reachable via → when
 * everything is already resolved. Once a login has shown that the system has
 * several realms it also carries the Realm row (record 0046).
 *
 * Key language (docs/INTERACTIVE-COMMANDS.md): ↑↓ between rows, `<enter>` on a row opens its
 * inline editor (typing edits; `<enter>` commits, `<esc>` cancels the
 * edit), `<enter>` on the Done row concludes the page (and, when the page
 * logs in, starts the login: the pass runs it and opens the page again with the
 * outcome), `<esc>` on the page cancels the command (exit-all: the page is the
 * top level of the connection step, and no other prompt takes over). The page
 * opens on the first row without a value. The password row masks its
 * value and draft both when stored and while typing; an empty commit on
 * a password row KEEPS the stored value (a masked row you didn't mean
 * to change must not become blank). `<enter>` on the Realm row opens the
 * realms of the system in a box under the page; `<esc>` there keeps what the
 * row had.
 *
 * Host edits re-resolve the credential rows via `onHostChange` (the
 * profile lookup keys on the host); the page shows a resolving state
 * and ignores keys until it completes.
 *
 * Hand-built on @inquirer/core for the same reasons as the other prompts
 * in this directory: the packaged prompts can't express Escape-as-
 * sentinel, and a form is exactly the kind of interaction the packaged
 * set has no answer for.
 */
type ConnectionPageFn = (
  config: ConnectionPageConfig
) => Promise<ConnectionPageResult | typeof EXIT_ALL>;

/**
 * The row the page opens on: the first one without a value (the user has
 * to fill it in), the first row when every row has one. A page that is logged
 * in and carries the Realm row opens on Done: the user can choose a realm
 * (↑), or press Enter to keep the default.
 */
function firstEmptyRow(rows: ConnectionPageRow[]): number {
  const index = rows.findIndex(
    (row) => row.value === undefined || row.value === ''
  );
  return index === -1 ? 0 : index;
}

/** Everything a frame of the page is drawn from. */
type PageView = {
  config: ConnectionPageConfig;
  rows: ConnectionPageRow[];
  /** Index of the highlighted row; the Done row is last. */
  active: number;
  editing: null | ConnectionFieldKey | 'realm';
  draft: string;
  resolving: boolean;
  escapeGraceOpen: boolean;
  width: number;
  prefix: string;
  /** The realm chosen on the page, undefined for the default. */
  realm: string | undefined;
  realmCursor: number;
  /** The login is running: the frame is the static one of the pass, no key works. */
  busy: boolean;
};

/** Whether the Realm row is part of the page: a login was made for the rows it shows now. */
function realmRowOf(
  config: ConnectionPageConfig,
  rows: ConnectionPageRow[]
): RealmRow | undefined {
  return config.connected !== undefined &&
    config.connected.snapshot === connectionSnapshot(rows)
    ? config.realm
    : undefined;
}

/** The choices of the realm box that match the filter. */
function realmChoicesShown(view: PageView) {
  const realm = realmRowOf(view.config, view.rows);
  return realm ? filterRealmChoices(realm.choices, view.draft) : [];
}

/**
 * One frame of the page: the Navigate menu, the panel with the rows, the Done
 * row and the status line, the box of the realm choices when it is open, and
 * the command preview. Pure, so the pass draws the same frame while it logs in.
 */
function renderPage(view: PageView): string {
  const { config, rows, width } = view;
  const connectedNow =
    config.connected !== undefined &&
    config.connected.snapshot === connectionSnapshot(rows);
  const realmRow = realmRowOf(config, rows);
  const doneIndex = rows.length + (realmRow ? 1 : 0);
  // no row is highlighted while the failure is shown; Done is while the login runs
  const active = view.busy
    ? doneIndex
    : config.failure !== undefined
      ? -1
      : Math.min(view.active, doneIndex);
  const label = doneLabel({
    logsIn: config.logsIn === true,
    complete: pageComplete(rows),
    connected: connectedNow,
  });

  // The navigation menu (see NavigationMenu.ts): framed box at the TOP, and
  // the keys it lists are the ones that work for what is highlighted.
  let items;
  if (view.busy) {
    items = [
      { keys: 'wait', action: 'for the login', intent: 'muted' as const },
    ];
  } else if (config.failure !== undefined) {
    items = [{ keys: '[ENTER]', action: 'close', intent: 'positive' as const }];
  } else if (view.editing === 'realm') {
    items = navigationMenuItems({
      filter: true,
      enter: 'pick',
      escape: 'keep current',
    });
  } else if (view.editing !== null) {
    items = navigationMenuItems({
      move: false,
      type: 'a value',
      enter: 'commit',
    });
  } else {
    items = navigationMenuItems({
      enter: active === doneIndex ? label : 'edit',
      right:
        realmRow && config.hint ? config.hint.replace(/^→\s*/, '') : undefined,
      escape: 'cancel',
    });
  }
  const menu = renderNavigationMenu(items, width);

  const resolvingNote = view.resolving
    ? c.muted(' (re-resolving credentials...)')
    : '';
  const rowLines = rows.map((row, index) => {
    const isEditing = view.editing === row.key;
    const cursor = isEditing || index === active ? '›' : ' ';
    const shown = isEditing
      ? row.key === 'password'
        ? '•'.repeat(view.draft.length)
        : view.draft
      : row.value === undefined || row.value === ''
        ? c.muted('(not set)')
        : row.key === 'password'
          ? c.muted(PASSWORD_MASK)
          : row.value;
    const note = !isEditing && row.note ? c.muted(` (${row.note})`) : '';
    const line = `${cursor} ${row.label}: ${shown}${note}`;
    return {
      text: index === active || isEditing ? c.command(line) : line,
      plain: `${cursor} ${row.label}: ${stripAnsi(shown)}${row.note && !isEditing ? ` (${row.note})` : ''}`,
    };
  });
  if (realmRow) {
    const index = rows.length;
    const isEditing = view.editing === 'realm';
    const cursor = isEditing || index === active ? '›' : ' ';
    const chosen = view.realm
      ? (realmRow.choices.find((choice) => choice.value === view.realm)?.name ??
        view.realm)
      : realmRow.defaultText;
    const note = view.realm ? '' : ' (default)';
    const line = `${cursor} ${realmRow.label}: ${chosen}${isEditing ? '' : note}`;
    rowLines.push({
      text: index === active || isEditing ? c.command(line) : line,
      plain: line,
    });
  }
  if (config.failure === undefined) {
    const doneText = `${active === doneIndex ? '›' : ' '} Done — ${label === 'connect' ? 'log in with these values' : 'continue with these values'}`;
    rowLines.push({ text: c.command(doneText), plain: doneText });
  }
  if (view.busy) {
    rowLines.push({ text: '', plain: '' });
    rowLines.push({ text: c.muted('Logging in...'), plain: 'Logging in...' });
  } else if (config.failure !== undefined) {
    const failed = `Login failed: ${config.failure}`;
    rowLines.push({ text: '', plain: '' });
    rowLines.push({ text: c.negative(failed), plain: failed });
  } else if (connectedNow) {
    const connected = config.connected?.who
      ? `Connected as ${config.connected.who}`
      : 'Connected';
    rowLines.push({ text: '', plain: '' });
    rowLines.push({ text: c.positive(connected), plain: connected });
  }
  if (view.escapeGraceOpen) {
    rowLines.push({
      text: c.muted('esc again to exit all -- or wait to close the editor'),
      plain: 'esc again to exit all -- or wait to close the editor',
    });
  }
  const panel = renderFramedBox({
    title: {
      text: `${view.prefix} ${config.message}${resolvingNote}`,
      plain: `? ${config.message}${resolvingNote}`,
    },
    lines: rowLines,
    width,
  });

  // The choice box of the Realm row: its own framed box directly under the panel
  // it edits, like the value box of the invocation editor.
  let realmBox = '';
  let highlightedRealm: string | undefined;
  if (view.editing === 'realm' && realmRow) {
    const shown = realmChoicesShown(view);
    const cursor = Math.min(view.realmCursor, Math.max(0, shown.length - 1));
    highlightedRealm = shown[cursor]?.value;
    const start = Math.max(
      0,
      Math.min(
        cursor - Math.floor(REALM_PAGE_SIZE / 2),
        shown.length - REALM_PAGE_SIZE
      )
    );
    const choiceLines =
      shown.length === 0
        ? [{ text: c.muted('(no realm matches)'), plain: '(no realm matches)' }]
        : shown.slice(start, start + REALM_PAGE_SIZE).map((choice, offset) => {
            const isCursor = start + offset === cursor;
            const suffix = [
              choice.value === realmRow.defaultValue ? 'default' : '',
              choice.description ?? '',
            ]
              .filter(Boolean)
              .join(', ');
            const line = `${isCursor ? '›' : ' '} ${choice.name}${suffix ? ` (${suffix})` : ''}`;
            return {
              text: isCursor ? c.command(line) : line,
              plain: line,
            };
          });
    const query = view.draft ? ` ${view.draft}` : '';
    realmBox = renderFramedBox({
      title: {
        text: `${view.prefix} ${realmRow.message}${query}`,
        plain: `? ${realmRow.message}${query}`,
      },
      lines: choiceLines,
      width,
    });
  }

  const preview =
    typeof config.preview === 'function'
      ? config.preview(rows, {
          ...(view.realm !== undefined ? { realm: view.realm } : {}),
          ...(highlightedRealm !== undefined ? { highlightedRealm } : {}),
        })
      : config.preview;
  return [menu, panel, realmBox, preview].filter(Boolean).join('\n');
}

const connectionPageImpl = createPrompt(
  (config: ConnectionPageConfig, done: (value: unknown) => void) => {
    const [rows, setRows] = useState<ConnectionPageRow[]>(config.rows);
    const [active, setActive] = useState(() => {
      const realmRow = realmRowOf(config, config.rows);
      return realmRow ? config.rows.length + 1 : firstEmptyRow(config.rows);
    });
    const [status, setStatus] = useState<'idle' | 'done' | 'escaped'>('idle');
    const [editing, setEditing] = useState<null | ConnectionFieldKey | 'realm'>(
      null
    );
    const [draft, setDraft] = useState('');
    const [resolving, setResolving] = useState(false);
    const prefix = usePrefix({
      status: status === 'escaped' ? 'done' : status,
    });
    // readline consumes its buffer when Enter fires (verified pattern in
    // textPrompt); the draft mirror is the source of truth for commits.
    const draftRef = useRef('');
    // The double-ESC grace (see ExitAll.ts): the first ESC opens a short
    // window instead of acting; a second ESC inside it exits all, an
    // expired window (or any other key) performs the single-ESC action.
    const escapeGraceRef = useRef<
      ReturnType<typeof armEscapeGrace> | undefined
    >(undefined);
    const [escapeGraceOpen, setEscapeGraceOpen] = useState(false);
    // The frame follows the terminal (re-drawn on resize). Declared after
    // every other useState so their hook order is unchanged.
    const width = useTerminalWidth();
    const resolvingRef = useRef(false);
    // The Realm row (declared after the width, so the hook order of the rest is unchanged).
    const [realm, setRealm] = useState<string | undefined>(config.realmChoice);
    const [realmCursor, setRealmCursor] = useState(0);

    // Grace teardown on unmount.
    useEffect(() => () => escapeGraceRef.current?.dispose(), []);

    useEffect(() => {
      draftRef.current = draft;
    }, [draft]);

    const result = (): ConnectionPageResult => {
      const out: ConnectionPageResult = { rows };
      for (const row of rows) out[row.key] = row.value;
      const realmRow = realmRowOf(config, rows);
      out.realm = realmRow ? realm : undefined;
      return out;
    };

    const commitRow = async (key: ConnectionFieldKey, value: string) => {
      setEditing(null);
      setDraft('');
      // an edit to the connection drops the realm chosen for the old one
      setRealm(undefined);
      if (key === 'host' && config.onHostChange) {
        // The credential rows' provenance keys on the host: re-resolve
        // before accepting more input.
        setResolving(true);
        resolvingRef.current = true;
        try {
          const updated = await config.onHostChange(value);
          setRows(updated);
        } catch {
          // Re-resolution is best-effort; keep the current rows.
        }
        setResolving(false);
        resolvingRef.current = false;
      } else {
        setRows((previous) =>
          previous.map((row) => (row.key === key ? { ...row, value } : row))
        );
      }
    };

    const conclude = () => {
      setStatus('done');
      done(result());
    };

    /** The first ESC in an editor opens the grace window; the second exits all, the expiry closes the editor. */
    const escapeEditor = (rl: { clearLine: (dir: 0) => void }) => {
      // Double-ESC inside the row editor: exit all (see ExitAll.ts
      // grace); a single press closes the editor ("back one level").
      if (escapeGraceRef.current) {
        const grace = escapeGraceRef.current;
        escapeGraceRef.current = undefined;
        grace.secondEscape();
        return;
      }
      setEscapeGraceOpen(true);
      escapeGraceRef.current = armEscapeGrace({
        onSecondEscape: () => {
          setEditing(null);
          setDraft('');
          setStatus('escaped');
          done(EXIT_ALL);
        },
        onGraceExpire: () => {
          setEscapeGraceOpen(false);
          setEditing(null);
          setDraft('');
          rl.clearLine(0);
        },
      });
    };

    useKeypress((key, rl) => {
      if (resolvingRef.current) return; // host re-resolution in flight
      if (config.failure !== undefined) {
        // The failure is shown; the command ends when it is closed.
        if (isEnterKey(key) || key.name === 'escape') {
          setStatus('done');
          done(result());
        }
        return;
      }
      const realmRow = realmRowOf(config, rows);
      const doneIndex = rows.length + (realmRow ? 1 : 0);
      if (editing === 'realm' && realmRow) {
        const shown = filterRealmChoices(realmRow.choices, draft);
        if (isEnterKey(key)) {
          escapeGraceRef.current?.otherKey();
          escapeGraceRef.current = undefined;
          const picked = shown[Math.min(realmCursor, shown.length - 1)];
          // Enter with nothing matching keeps what the row had
          if (picked) setRealm(realmAfterChoice(realmRow, picked.value));
          setEscapeGraceOpen(false);
          setEditing(null);
          setDraft('');
          rl.clearLine(0);
        } else if (key.name === 'escape') {
          escapeEditor(rl);
        } else if (isUpKey(key) || isDownKey(key)) {
          escapeGraceRef.current?.otherKey();
          escapeGraceRef.current = undefined;
          setRealmCursor(
            Math.max(
              0,
              Math.min(shown.length - 1, realmCursor + (isUpKey(key) ? -1 : 1))
            )
          );
        } else {
          escapeGraceRef.current?.otherKey();
          escapeGraceRef.current = undefined;
          setDraft(rl.line);
          setRealmCursor(0);
        }
        return;
      }
      if (editing !== null) {
        if (isEnterKey(key)) {
          escapeGraceRef.current?.otherKey();
          escapeGraceRef.current = undefined;
          // readline already consumed its buffer (textPrompt pattern);
          // read the mirror.
          const line = draft || rl.line || '';
          if (editing === 'password' && line.length === 0) {
            // Empty commit on the masked row = keep the stored value.
            void commitRow(
              editing,
              rows.find((r) => r.key === 'password')?.value ?? ''
            );
          } else if (editing !== 'realm') {
            void commitRow(editing, line);
          }
        } else if (key.name === 'escape') {
          escapeEditor(rl);
          return;
        } else {
          escapeGraceRef.current?.otherKey();
          escapeGraceRef.current = undefined;
          setDraft(rl.line);
        }
        return;
      }
      if (key.name === 'right' && realmRow && config.hint) {
        // the key the realm picker had: the invocation editor, then back here
        escapeGraceRef.current?.otherKey();
        escapeGraceRef.current = undefined;
        done({ ...result(), openEditor: true });
        return;
      }
      if (key.name === 'escape') {
        // The top level of the connection step: ESC cancels the command.
        // There is no grace window and no fallback prompt -- nothing is
        // asked a second time.
        setStatus('escaped');
        done(EXIT_ALL);
        return;
      } else if (isEnterKey(key)) {
        escapeGraceRef.current?.otherKey();
        escapeGraceRef.current = undefined;
        const at = Math.min(active, doneIndex);
        if (at === doneIndex) {
          conclude();
        } else if (realmRow && at === rows.length) {
          // the cursor starts on the row that is in effect
          const index = realmRow.choices.findIndex(
            (choice) => choice.value === (realm ?? realmRow.defaultValue)
          );
          setRealmCursor(Math.max(0, index));
          setEditing('realm');
          setDraft('');
          rl.clearLine(0);
        } else {
          const row = rows[at];
          setEditing(row.key);
          setDraft('');
          rl.clearLine(0);
        }
      } else if (isUpKey(key) || isDownKey(key)) {
        escapeGraceRef.current?.otherKey();
        escapeGraceRef.current = undefined;
        const offset = isUpKey(key) ? -1 : 1;
        const at = Math.min(active, doneIndex);
        setActive(
          at + offset < 0 ? doneIndex : (at + offset) % (doneIndex + 1)
        );
      }
      // Other keys on the page (not editing a row) are ignored -- a form
      // has no type-to-filter.
    });

    if (status === 'escaped') {
      return `${prefix} ${config.message} ${c.muted('(cancelled)')}`;
    }
    if (status === 'done') {
      return `${prefix} ${config.message} ${c.positive('saved for this invocation')}`;
    }

    return renderPage({
      config,
      rows,
      active,
      editing,
      draft,
      resolving,
      escapeGraceOpen,
      width,
      prefix,
      realm,
      realmCursor,
      busy: false,
    });
  }
);

export const connectionPage = ((config) => {
  notePromptRendered();
  // Erase-on-conclude: see EscapableSelectPrompt's wrapper comment.
  return connectionPageImpl(config, { clearPromptOnDone: true });
}) as unknown as ConnectionPageFn;

/**
 * The frame the pass leaves on the screen while the login runs: the page as the
 * user pressed Done on it, with "Logging in..." under the Done row and no key
 * working. It is drawn by `showTransientFrame` (no prompt is open: the login may
 * ask for a second factor, which reads the terminal itself) and taken away by
 * whatever writes next. See TransientFrame.ts.
 * @param config the config the page was opened with
 * @param rows the rows as the user left them
 * @param width the frame width
 * @returns the frame
 */
export function renderConnectionBusyFrame(
  config: ConnectionPageConfig,
  rows: ConnectionPageRow[],
  width: number
): string {
  return renderPage({
    config: { ...config, connected: undefined, realm: undefined },
    rows,
    active: rows.length,
    editing: null,
    draft: '',
    resolving: false,
    escapeGraceOpen: false,
    width,
    prefix: '?',
    realm: undefined,
    realmCursor: 0,
    busy: true,
  });
}
