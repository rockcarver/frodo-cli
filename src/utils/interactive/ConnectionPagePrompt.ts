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
import { armEscapeGrace, EXIT_ALL } from './ExitAll';
import {
  navigationMenuItems,
  renderFramedBox,
  renderNavigationMenu,
  stripAnsi,
} from './NavigationMenu';
import { notePromptRendered } from './PromptGateState';
import { useTerminalWidth } from './TerminalWidth';

/** The masked rendering of a password row's stored value. */
const PASSWORD_MASK = '••••••••';

export type ConnectionPageRow = {
  /** Stable identifier the caller maps values back from. */
  key: 'host' | 'username' | 'password';
  label: string;
  /**
   * Current value as resolved by the caller so far (profile, env, CLI).
   * Password rows render masked regardless.
   */
  value?: string;
  /** Where the value came from, e.g. "from profile prod". */
  note?: string;
};

export type ConnectionPageConfig = {
  message: string;
  rows: ConnectionPageRow[];
  /**
   * Command preview: the command being authored, rendered as a footer
   * line (by CommandPreview.ts). A function is called on every render with
   * the page's current rows, so the footer follows what the user has
   * committed so far (value and color) instead of what was known when the
   * page opened.
   */
  preview?: string | ((rows: ConnectionPageRow[]) => string | undefined);
  /**
   * Called when the user commits an edit to the host row -- the
   * credential rows' profile context keys on the host, so the caller
   * re-resolves their annotations. Receives the new host, returns the
   * updated rows (same keys; values/notes refreshed).
   */
  onHostChange?: (host: string) => Promise<ConnectionPageRow[]>;
};

/**
 * The connection page (docs/INTERACTIVE-COMMANDS.md): a
 * single-page form for host + username + password showing RESOLVED
 * current values with their provenance, replacing the sequential
 * prompts when connection input is missing and reachable via → when
 * everything is already resolved.
 *
 * Key language (docs/INTERACTIVE-COMMANDS.md): ↑↓ between rows, `<enter>` on a row opens its
 * inline editor (typing edits; `<enter>` commits, `<esc>` cancels the
 * edit), `<enter>` on the Done row concludes the page, `<esc>` on the
 * page cancels the command (exit-all: the page is the top level of the
 * connection step, and no other prompt takes over). The page opens on the
 * first row without a value. The password row masks its
 * value and draft both when stored and while typing; an empty commit on
 * a password row KEEPS the stored value (a masked row you didn't mean
 * to change must not become blank).
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
) => Promise<
  { host?: string; username?: string; password?: string } | typeof EXIT_ALL
>;

/**
 * The row the page opens on: the first one without a value (the user has
 * to fill it in), the first row when every row has one.
 */
function firstEmptyRow(rows: ConnectionPageRow[]): number {
  const index = rows.findIndex(
    (row) => row.value === undefined || row.value === ''
  );
  return index === -1 ? 0 : index;
}

const connectionPageImpl = createPrompt(
  (config: ConnectionPageConfig, done: (value: unknown) => void) => {
    const [rows, setRows] = useState<ConnectionPageRow[]>(config.rows);
    // The Done row sits after the field rows.
    const doneIndex = config.rows.length;
    const [active, setActive] = useState(() => firstEmptyRow(config.rows));
    const [status, setStatus] = useState<'idle' | 'done' | 'escaped'>('idle');
    const [editing, setEditing] = useState<null | ConnectionPageRow['key']>(
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

    // Grace teardown on unmount.
    useEffect(() => () => escapeGraceRef.current?.dispose(), []);

    useEffect(() => {
      draftRef.current = draft;
    }, [draft]);

    const commitRow = async (key: ConnectionPageRow['key'], value: string) => {
      setEditing(null);
      setDraft('');
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
      const result: Record<string, string | undefined> = {};
      for (const row of rows) result[row.key] = row.value;
      done(result);
    };

    useKeypress((key, rl) => {
      if (resolvingRef.current) return; // host re-resolution in flight
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
          } else {
            void commitRow(editing, line);
          }
        } else if (key.name === 'escape') {
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
          return;
        } else {
          escapeGraceRef.current?.otherKey();
          escapeGraceRef.current = undefined;
          setDraft(rl.line);
        }
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
        if (active === doneIndex) {
          conclude();
        } else {
          const row = rows[active];
          setEditing(row.key);
          setDraft('');
          rl.clearLine(0);
        }
      } else if (isUpKey(key) || isDownKey(key)) {
        escapeGraceRef.current?.otherKey();
        escapeGraceRef.current = undefined;
        const offset = isUpKey(key) ? -1 : 1;
        setActive(
          active + offset < 0 ? doneIndex : (active + offset) % (doneIndex + 1)
        );
      }
      // Other keys on the page (not editing a row) are ignored -- a form
      // has no type-to-filter.
    });

    const renderValue = (row: ConnectionPageRow, isEditing: boolean) => {
      if (isEditing) {
        return row.key === 'password' ? '•'.repeat(draft.length) : draft;
      }
      if (row.value === undefined || row.value === '') {
        return c.muted('(not set)');
      }
      return row.key === 'password' ? c.muted(PASSWORD_MASK) : row.value;
    };

    if (status === 'escaped') {
      return `${prefix} ${config.message} ${c.muted('(cancelled)')}`;
    }
    if (status === 'done') {
      return `${prefix} ${config.message} ${c.positive('saved for this invocation')}`;
    }

    const resolvingNote = resolving
      ? c.muted(' (re-resolving credentials...)')
      : '';
    // The navigation menu (see NavigationMenu.ts): framed box at the
    // TOP; the page's enter has two roles (edit a row / conclude on
    // Done), so the item names both. The rows + Done form the page's
    // framed panel (panel per surface -- see EscapableSelectPrompt).
    const menu = renderNavigationMenu(
      navigationMenuItems({
        enter: 'edit / done',
        escape: 'cancel',
      }),
      width
    );
    const rowLines = [
      ...rows.map((row, index) => {
        const isEditing = editing === row.key;
        const cursor = isEditing ? '›' : index === active ? '›' : ' ';
        const note = !isEditing && row.note ? c.muted(` (${row.note})`) : '';
        const line = `${cursor} ${row.label}: ${renderValue(row, isEditing)}${note}`;
        return {
          text: index === active || isEditing ? c.command(line) : line,
          plain: `${cursor} ${row.label}: ${stripAnsi(renderValue(row, isEditing))}${row.note && !isEditing ? ` (${row.note})` : ''}`,
        };
      }),
      (() => {
        const cursor = active === doneIndex ? '›' : ' ';
        const line = `${cursor} Done — run with these values`;
        return {
          text: c.command(line),
          plain: line,
        };
      })(),
    ];
    if (escapeGraceOpen) {
      rowLines.push({
        text: c.muted('esc again to exit all -- or wait to close the editor'),
        plain: 'esc again to exit all -- or wait to close the editor',
      });
    }
    const panel = renderFramedBox({
      title: {
        text: `${prefix} ${config.message}${resolvingNote}`,
        plain: `? ${config.message}${resolvingNote}`,
      },
      lines: rowLines,
      width,
    });
    const preview =
      typeof config.preview === 'function'
        ? config.preview(rows)
        : config.preview;
    const lines = [menu, panel, preview];
    return lines.filter(Boolean).join('\n');
  }
);

export const connectionPage = ((config) => {
  notePromptRendered();
  // Erase-on-conclude: see EscapableSelectPrompt's wrapper comment.
  return connectionPageImpl(config, { clearPromptOnDone: true });
}) as unknown as ConnectionPageFn;
