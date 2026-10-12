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
import { navigationMenuItems, renderNavigationMenu } from './NavigationMenu';
import { notePromptRendered } from './PromptGateState';

/**
 * Resolved by `connectionPage` when the user presses Escape on the page
 * (not inside a row editor): "don't touch connection args". The caller
 * falls back to its pre-existing behavior (today: the sequential
 * prompts; for an already-resolved visit, just conclude).
 */
export const PAGE_ESCAPE = Symbol('connectionPage:escape');

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
   * Command preview: the command being authored, rendered as a
   * footer line (pre-rendered by CommandPreview.ts).
   */
  preview?: string;
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
 * page declines it entirely (PAGE_ESCAPE). The password row masks its
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
  { host?: string; username?: string; password?: string } | typeof PAGE_ESCAPE
>;

const connectionPageImpl = createPrompt(
  (config: ConnectionPageConfig, done: (value: unknown) => void) => {
    const [rows, setRows] = useState<ConnectionPageRow[]>(config.rows);
    // The Done row sits after the field rows.
    const doneIndex = config.rows.length;
    const [active, setActive] = useState(0);
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
    const resolvingRef = useRef(false);

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
          setEditing(null);
          setDraft('');
          rl.clearLine(0);
        } else {
          setDraft(rl.line);
        }
        return;
      }
      if (key.name === 'escape') {
        setStatus('escaped');
        done(PAGE_ESCAPE);
      } else if (isEnterKey(key)) {
        if (active === doneIndex) {
          conclude();
        } else {
          const row = rows[active];
          setEditing(row.key);
          setDraft('');
          rl.clearLine(0);
        }
      } else if (isUpKey(key) || isDownKey(key)) {
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
    // Done), so the item names both.
    const menu = renderNavigationMenu(
      navigationMenuItems({
        enter: 'edit / done',
        escape: 'cancel page',
      })
    );
    const lines = [
      menu,
      `${prefix} ${config.message}${resolvingNote}`,
      ...rows.map((row, index) => {
        const isEditing = editing === row.key;
        const cursor = isEditing ? '›' : index === active ? '›' : ' ';
        const note = !isEditing && row.note ? c.muted(` (${row.note})`) : '';
        const line = `${cursor} ${row.label}: ${renderValue(row, isEditing)}${note}`;
        return index === active || isEditing ? c.command(line) : line;
      }),
      `${active === doneIndex ? '›' : ' '} ${c.command('Done — run with these values')}`,
      config.preview,
    ];
    return lines.join('\n');
  }
);

export const connectionPage = ((config) => {
  notePromptRendered();
  // Erase-on-conclude: see EscapableSelectPrompt's wrapper comment.
  return connectionPageImpl(config, { clearPromptOnDone: true });
}) as unknown as ConnectionPageFn;
