import {
  createPrompt,
  isDownKey,
  isEnterKey,
  isSpaceKey,
  isUpKey,
  useEffect,
  useKeypress,
  useMemo,
  usePagination,
  usePrefix,
  useRef,
  useState,
} from '@inquirer/core';
import type { InquirerReadline } from '@inquirer/type';
import c from '../ColorTheme';
import {
  buildSectionRows,
  initialExpanded,
  rowIndexOf,
  type SectionChoice,
  type SectionGroup,
  type SectionRow,
} from './ChoiceSections';
import { armEscapeGrace, EXIT_ALL } from './ExitAll';
import {
  descriptionPanelLines,
  navigationMenuItems,
  renderFramedBox,
  renderNavigationMenu,
  stripAnsi,
} from './NavigationMenu';
import { notePromptRendered } from './PromptGateState';
import { useTerminalWidth } from './TerminalWidth';

/**
 * Distinct return value `escapableMultiSelect` resolves with when the user
 * presses Escape instead of committing -- callers branch on this to back
 * out (skip the editor entirely) instead of treating it as a real
 * selection. Nothing selected + Enter commits the empty set (a deliberate
 * "run with defaults"), distinct from Escape's "don't touch this step".
 * The ← key (query empty) is an alias for Escape -- the "return
 * to the segment that invoked this editor" key; with text typed it stays
 * readline cursor movement.
 */
export const MULTISEL_ESCAPE = Symbol('escapableMultiSelect:escape');

export type EscapableMultiSelectChoice<Value> = {
  value: Value;
  name: string;
  description?: string;
  /**
   * The collapsible section this choice folds under (the invocation
   * editor's shared-option groups). Absent = the command's own options,
   * which render flat and always visible. Sections only engage when the
   * config also passes `groups` -- a lone group id changes nothing.
   */
  group?: string;
};

export type EscapableMultiSelectConfig<Value> = {
  message: string;
  choices: EscapableMultiSelectChoice<Value>[];
  /**
   * The collapsible sections, in render order (the invocation editor
   * passes the -hh help order). Omitted: the exact pre-grouping flat
   * list -- grouping is strictly opt-in per config.
   */
  groups?: SectionGroup[];
  /** Members pre-selected when the prompt opens. */
  defaultValues?: Value[];
  pageSize?: number;
  /**
   * Command preview footer, like escapableSelect's -- with one widening:
   * the function form receives the CURRENTLY SELECTED values (the space-
   * toggled set, in choice order) INSTEAD of the highlighted one, so the
   * footer reflects what the user has MARKED, not merely what the cursor
   * sits on -- a multiselect's influence on the command is the set, not
   * the cursor. Empty array when nothing is selected: fall back to the
   * committed state.
   */
  preview?: string | ((selected: unknown[]) => string);
  /**
   * Members that need a VALUE before they can be marked (the invocation
   * editor's valued options): <space> on one switches this prompt into
   * an INLINE value editor (same readline-mirror pattern as the
   * connection page -- no nested prompt, no second readline over stdin;
   * the previous async-hook design nested a second @inquirer prompt
   * inside the keypress handler and the two readlines fought over stdin,
   * freezing the frame). An option that declares commander `.choices()`
   * (`choicesFor`) gets an in-frame PICKER (↑↓ + enter); the rest get
   * free text. The option is marked only once a real value is committed;
   * <esc> rejects (an option that needs a value cannot be marked without
   * one). `onValue` receives the member and its collected value as soon
   * as <enter> commits it.
   */
  needsValue?: (value: Value) => boolean;
  /** The enum members of a valued option, when it has any. */
  choicesFor?: (value: Value) => string[] | undefined;
  /**
   * The option's current value (commander's, as text) -- the inline
   * editor starts there (picker cursor on it, text draft pre-filled)
   * instead of from empty.
   */
  currentValueFor?: (value: Value) => string | undefined;
  onValue?: (value: Value, collected: string) => void;
};

/**
 * A small sibling of the packaged `@inquirer/checkbox`, differing in one
 * core way: Escape resolves with the `MULTISEL_ESCAPE` sentinel instead of
 * doing nothing, so the editor can back out without committing. The
 * packaged checkbox has no Escape keybinding and no way to configure one
 * (same rationale as EscapableSelectPrompt for not adopting the packaged
 * prompt family).
 *
 * Interaction contract (the user's stated paradigm):
 * - ↑/↓ navigate (clamped at the ends -- a list with a beginning and an
 *   end, not an endless loop)
 * - <space> toggles the highlighted entry; on a member that needs a
 *   value, it opens the inline value editor instead
 * - <enter> commits the currently-selected set (possibly empty)
 * - Escape backs out without committing (MULTISEL_ESCAPE)
 * - type-to-search filters live, cursor resets to top on query change,
 *   two-stage Escape (clear query first, then back out) -- identical to
 *   EscapableSelectPrompt's contract
 */
// Same createPrompt-generics note as EscapableSelectPrompt: the view is
// written loosely against `unknown` and the export carries a precise
// hand-written generic type.
type EscapableMultiSelectFn = <Value>(
  config: EscapableMultiSelectConfig<Value>
) => Promise<Value[] | typeof MULTISEL_ESCAPE | typeof EXIT_ALL>;

const escapableMultiSelectImpl = createPrompt(
  (
    config: EscapableMultiSelectConfig<unknown>,
    done: (value: unknown) => void
  ) => {
    const { pageSize = 20, choices } = config;
    const [status, setStatus] = useState<'idle' | 'done' | 'escaped'>('idle');
    const prefix = usePrefix({
      status: status === 'escaped' ? 'done' : status,
    });

    const [query, setQuery] = useState('');
    // Which sections are expanded right now. Starts from the config's
    // defaultValues: a group holding an option the user already set
    // (CLI/env/saved default) opens expanded -- state never hides
    // behind a collapsed header.
    const [expandedState, setExpandedState] = useState<Set<string>>(() =>
      (config.groups?.length ?? 0) > 0
        ? initialExpanded(
            config.groups ?? [],
            choices,
            config.defaultValues ?? []
          )
        : new Set<string>()
    );
    const [selected, setSelected] = useState<Set<unknown>>(
      () => new Set(config.defaultValues ?? [])
    );
    // INLINE value editing (see the needsValue config doc for why NOT a
    // nested prompt): the highlighted member being valued right now, the
    // mode it edits in (a PICKER for options with commander `.choices()`,
    // free TEXT otherwise), the readline-mirror draft, and the picker's
    // cursor.
    const [editing, setEditing] = useState<unknown>(null);
    const [editingChoices, setEditingChoices] = useState<string[]>([]);
    const [draft, setDraft] = useState('');
    const [pickerActive, setPickerActive] = useState(0);

    // The sectioned row model (ChoiceSections.ts): with a query the
    // list FLATTENS to the cross-group name matches (type-to-find must
    // reach into collapsed groups); without one, own options then
    // header rows + the expanded groups' children. When the config
    // passes no groups this is the pre-grouping flat list.
    const rows = useMemo(
      () =>
        buildSectionRows({
          choices: choices as SectionChoice<unknown>[],
          groups: config.groups,
          expanded: expandedState,
          query,
          selected,
        }) as SectionRow<unknown>[],
      // `selected` intentionally re-derives rows: a collapsed header's
      // "N selected" badge must update on every toggle.
      [choices, config.groups, query, selected, expandedState]
    );

    // Cursor resets to the top of the FILTERED list whenever the query
    // TEXT changes (useEffect, not a render-time write -- see
    // EscapableSelectPrompt's TDZ note). Text-compared, not
    // reference-compared: closeInlineEditor's setQuery('') after a
    // value commit must NOT yank the cursor to the top when the query
    // was already empty (that was the "cursor is nowhere" report --
    // the cursor flew to row 0 on every value commit, and with the
    // color-only cursor nothing showed where it went).
    const lastQueryRef = useRef(query);
    useEffect(() => {
      if (lastQueryRef.current === query) return;
      lastQueryRef.current = query;
      setActive(0);
    }, [query]);

    // A render-time mirror for the keypress closure (hooks state is
    // otherwise stale there); re-assigned every render, read-only in
    // handlers.
    const expandedRef2 = expandedState;
    const [active, setActive] = useState(0);
    // Headers are cursor stops; a "highlighted choice" exists only when
    // the cursor sits on a choice row.
    const highlighted = rows[active];
    const highlightedChoice =
      highlighted?.kind === 'choice' ? highlighted.choice : undefined;

    // Leaving the inline value editor: clear editing state, reset the
    // filter query (the buffer was scrubbed -- the query MIRROR must go
    // with it, or the list stays filtered by a query that no longer
    // exists -- the "cannot navigate anywhere" report: a one-row
    // filtered list clamps the cursor no matter what the arrows do),
    // scrub the readline buffer, and put the cursor BACK on the option
    // that was just edited or rejected -- the user's question "where am
    // I" must have a visible, correct answer (the › glyph + the option's
    // description in the panel).
    // The double-ESC grace (see ExitAll.ts): the first ESC opens a short
    // window instead of acting; a second ESC inside it exits all, an
    // expired window (or any other key) performs the per-branch
    // single-ESC action. Works from inside the value editor too -- two
    // fast ESCs there reject the value AND leave everything.
    const escapeGraceRef = useRef<
      ReturnType<typeof armEscapeGrace> | undefined
    >(undefined);
    const [escapeGraceOpen, setEscapeGraceOpen] = useState(false);
    // The [LEFT]-with-uncommitted-selections guard's inline explanation
    // (see the keypress handler). Any other key clears it.
    const [leftGuard, setLeftGuard] = useState('');
    // The frame follows the terminal (re-drawn on resize). Declared after
    // every other useState so their hook order is unchanged.
    const width = useTerminalWidth();

    // Grace teardown on unmount (a timer firing after the prompt
    // resolved would call a stale handler).
    useEffect(() => () => escapeGraceRef.current?.dispose(), []);

    const closeInlineEditor = (rl: InquirerReadline, returnTo?: unknown) => {
      setEditing(null);
      setEditingChoices([]);
      setDraft('');
      setPickerActive(0);
      // Pre-seed the query-ref so the cursor-reset effect sees the
      // reset as already-applied and does not clobber the setActive
      // below (a query 'retry' -> '' change would otherwise fire the
      // effect AFTER this handler and yank the cursor to row 0).
      lastQueryRef.current = '';
      setQuery('');
      if (returnTo !== undefined) {
        // Row-model lookup, not raw choices.findIndex: with sections the
        // choice may sit under a header, so its group must be expanded
        // for a row to exist to land on. (Without groups the flat rows
        // make this exactly the old behavior.)
        const groupId = choices.find(
          (choice) => choice.value === returnTo
        )?.group;
        if (groupId !== undefined && !expandedRef2.has(groupId)) {
          setExpandedState((previous) => {
            const next = new Set(previous);
            next.add(groupId);
            return next;
          });
        }
        const index = rowIndexOf(
          buildSectionRows({
            choices: choices as SectionChoice<unknown>[],
            groups: config.groups,
            expanded:
              groupId !== undefined && !expandedRef2.has(groupId)
                ? new Set([...expandedRef2, groupId])
                : expandedRef2,
            query: '',
            selected,
          }) as SectionRow<unknown>[],
          returnTo
        );
        if (index >= 0) setActive(index);
      }
      // Replay readline's own ctrl+u binding: buffer + cursor + display
      // all clear together (the declared InquirerReadline type only
      // lists write(data: string), but the runtime object is a real
      // readline.Interface -- see create-prompt's createInterface).
      (
        rl.write as InquirerReadline['write'] & {
          (data: null, key: { ctrl: boolean; name: string }): void;
        }
      )(null, { ctrl: true, name: 'u' });
      rl.clearLine(0);
    };

    useKeypress((key, rl) => {
      if (editing !== null) {
        // The inline value editor owns every key until it concludes.
        if (editingChoices.length > 0) {
          // PICKER mode: an enum option's value comes from its declared
          // choices -- free typing is not an input here, so the keys are
          // the list's, not readline's.
          if (isEnterKey(key)) {
            escapeGraceRef.current?.otherKey();
            escapeGraceRef.current = undefined;
            const value = editingChoices[pickerActive] ?? editingChoices[0];
            config.onValue?.(editing, value);
            setSelected((previous) => {
              const next = new Set(previous);
              next.add(editing);
              return next;
            });
            closeInlineEditor(rl, editing);
            return;
          }
          if (key.name === 'escape') {
            // Double-ESC inside the value editor: exit all the way out
            // (reject + unwind) via the shared grace (see ExitAll.ts);
            // a single press (grace expiry or another key) rejects the
            // value ("back one level" -- nothing changes).
            if (escapeGraceRef.current) {
              const grace = escapeGraceRef.current;
              escapeGraceRef.current = undefined;
              grace.secondEscape();
              return;
            }
            setEscapeGraceOpen(true);
            escapeGraceRef.current = armEscapeGrace({
              onSecondEscape: () => {
                closeInlineEditor(rl, editing);
                setStatus('escaped');
                done(EXIT_ALL);
              },
              // Grace expired with no second press: reject the value.
              onGraceExpire: () => {
                setEscapeGraceOpen(false);
                closeInlineEditor(rl, editing);
              },
            });
            return;
          }
          if (isUpKey(key) || isDownKey(key)) {
            escapeGraceRef.current?.otherKey();
            escapeGraceRef.current = undefined;
            const offset = isUpKey(key) ? -1 : 1;
            setPickerActive((previous) =>
              Math.min(
                editingChoices.length - 1,
                Math.max(0, previous + offset)
              )
            );
            return;
          }
          return;
        }
        if (isEnterKey(key)) {
          escapeGraceRef.current?.otherKey();
          escapeGraceRef.current = undefined;
          // readline already consumed its buffer (textPrompt pattern);
          // read the mirror.
          const line = draft || rl.line || '';
          if (line.trim().length === 0) return; // empty = no value yet
          config.onValue?.(editing, line);
          setSelected((previous) => {
            const next = new Set(previous);
            next.add(editing);
            return next;
          });
          closeInlineEditor(rl, editing);
          return;
        }
        if (key.name === 'escape') {
          // Double-ESC inside the value editor: exit all (see the picker
          // branch above); a single press rejects the value.
          if (escapeGraceRef.current) {
            const grace = escapeGraceRef.current;
            escapeGraceRef.current = undefined;
            grace.secondEscape();
            return;
          }
          setEscapeGraceOpen(true);
          escapeGraceRef.current = armEscapeGrace({
            onSecondEscape: () => {
              closeInlineEditor(rl, editing);
              setStatus('escaped');
              done(EXIT_ALL);
            },
            onGraceExpire: () => {
              setEscapeGraceOpen(false);
              closeInlineEditor(rl, editing);
            },
          });
          return;
        }
        escapeGraceRef.current?.otherKey();
        escapeGraceRef.current = undefined;
        setDraft(rl.line);
        return;
      }
      if (
        key.name === 'escape' ||
        (key.name === 'left' &&
          // Segment navigation only when the filter query is
          // empty; with text typed, ←/→ stay readline cursor movement.
          rl.line.length === 0)
      ) {
        // Two-stage escape with an active query.
        if (rl.line.length > 0) {
          rl.clearLine(0);
          setQuery('');
          escapeGraceRef.current?.otherKey();
          escapeGraceRef.current = undefined;
          return;
        }
        // UNCOMMITTED SELECTIONS GUARD (user rule 2026-10-13: "LEFT
        // navigation disabled if options are selected but not
        // committed"): selections marked in this editor session that
        // are NOT part of the command's pre-editor state are
        // uncommitted -- leaving now would either silently discard
        // them (the dismissed-editor report) or leak them as if
        // committed. [LEFT] does nothing (an inline hint says why);
        // [ESC] still backs out, and it RESETS: every uncommitted mark
        // is cleared before resolving (dismiss = nothing authored).
        const uncommitted = [...selected].filter(
          (value) => !config.defaultValues?.includes(value as never)
        );
        if (uncommitted.length > 0) {
          if (key.name === 'left') {
            setLeftGuard(
              `select or reset first -- ${uncommitted.length} option${uncommitted.length === 1 ? '' : 's'} not committed ([ESC] resets, [ENTER] commits)`
            );
            return;
          }
          // ESC: open the normal grace window, but its single-ESC
          // action resets the uncommitted marks before resolving.
          const resetThenResolve = () => {
            setSelected((previous) => {
              const next = new Set(previous);
              for (const value of uncommitted) next.delete(value);
              return next;
            });
            setStatus('escaped');
            done(MULTISEL_ESCAPE);
          };
          if (escapeGraceRef.current) {
            const grace = escapeGraceRef.current;
            escapeGraceRef.current = undefined;
            grace.secondEscape();
            return;
          }
          setEscapeGraceOpen(true);
          escapeGraceRef.current = armEscapeGrace({
            onSecondEscape: () => {
              setEscapeGraceOpen(false);
              setStatus('escaped');
              done(EXIT_ALL);
            },
            onGraceExpire: resetThenResolve,
          });
          return;
        }
        // Double-ESC exits ALL the way out (see ExitAll.ts grace); ← and
        // single ESC keep "back one level" (single ESC after the grace
        // expires).
        if (key.name === 'escape') {
          if (escapeGraceRef.current) {
            const grace = escapeGraceRef.current;
            escapeGraceRef.current = undefined;
            grace.secondEscape();
            return;
          }
          setEscapeGraceOpen(true);
          escapeGraceRef.current = armEscapeGrace({
            onSecondEscape: () => {
              setEscapeGraceOpen(false);
              setStatus('escaped');
              done(EXIT_ALL);
            },
            onGraceExpire: () => {
              setEscapeGraceOpen(false);
              setStatus('escaped');
              done(MULTISEL_ESCAPE);
            },
          });
          return;
        }
        // ←: not part of the gesture.
        escapeGraceRef.current?.otherKey();
        escapeGraceRef.current = undefined;
        setStatus('escaped');
        done(MULTISEL_ESCAPE);
      } else if (isEnterKey(key)) {
        escapeGraceRef.current?.otherKey();
        escapeGraceRef.current = undefined;
        setLeftGuard('');
        // Commit whatever is selected -- an empty set is a valid outcome
        // ("run with defaults"), unlike select where nothing-picked is a
        // no-op.
        setStatus('done');
        done([...selected]);
      } else if (isSpaceKey(key)) {
        escapeGraceRef.current?.otherKey();
        escapeGraceRef.current = undefined;
        setLeftGuard('');
        if (!highlighted) return;
        // The toggle is not text input: scrub the buffer so the space
        // never leaks into the filter query (or blocks the [LEFT]
        // buffer-empty check -- user report 2026-10-13: after marking,
        // LEFT mirrored a polluted buffer and the guard never fired;
        // typing 'curl' filtered on ' curl' and found nothing).
        // Same replay mechanism as closeInlineEditor.
        (
          rl.write as InquirerReadline['write'] & {
            (data: null, key: { ctrl: boolean; name: string }): void;
          }
        )(null, { ctrl: true, name: 'u' });
        rl.clearLine(0);
        if (highlighted.kind === 'header') {
          // [space] on a section header expands/collapses it in place;
          // the cursor stays on the header either way.
          const id = highlighted.group.id;
          setExpandedState((previous) => {
            const next = new Set(previous);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
          return;
        }
        const togglingOn = !selected.has(highlighted.choice.value);
        if (togglingOn) {
          // Selecting an option expands its section, so clearing the
          // filter (or scrolling up) never hides what was just picked.
          const groupId = highlighted.choice.group;
          if (groupId !== undefined && !expandedRef2.has(groupId)) {
            setExpandedState((previous) => {
              const next = new Set(previous);
              next.add(groupId);
              return next;
            });
          }
        }
        const togglingOnValue = !selected.has(highlighted.choice.value);
        if (togglingOnValue && config.needsValue?.(highlighted.choice.value)) {
          // A valued option cannot be marked without its real value:
          // switch into the inline value editor instead of marking.
          // A PICKER for options with declared choices, free text
          // otherwise. The value starts at the option's current value
          // (picker cursor on it; text draft pre-filled) -- "just wanted
          // to change one thing" costs an edit, not a retyping session.
          // The readline buffer is scrubbed too: the filter query that
          // brought the cursor here would otherwise survive as a
          // prefix of the typed value (see closeInlineEditor for the
          // replay mechanism).
          const choicesFor =
            config.choicesFor?.(highlighted.choice.value) ?? undefined;
          const current =
            config.currentValueFor?.(highlighted.choice.value) ?? '';
          setEditing(highlighted.choice.value);
          setEditingChoices(choicesFor ?? []);
          setPickerActive(
            choicesFor ? Math.max(0, choicesFor.indexOf(current)) : 0
          );
          setDraft(current);
          (
            rl.write as InquirerReadline['write'] & {
              (data: null, key: { ctrl: boolean; name: string }): void;
            }
          )(null, { ctrl: true, name: 'u' });
          rl.clearLine(0);
          return;
        }
        setSelected((previous) => {
          const next = new Set(previous);
          if (next.has(highlighted.choice.value)) {
            next.delete(highlighted.choice.value);
          } else {
            next.add(highlighted.choice.value);
          }
          return next;
        });
      } else if (isUpKey(key) || isDownKey(key)) {
        escapeGraceRef.current?.otherKey();
        escapeGraceRef.current = undefined;
        setLeftGuard('');
        if (rows.length === 0) return;
        const offset = isUpKey(key) ? -1 : 1;
        // Clamp at the ends -- a list with a beginning and an end, not
        // an endless loop (matches EscapableSelectPrompt). FUNCTIONAL
        // update: several keypresses can arrive inside one render
        // cycle -- a closure over `active` would compute every step
        // from the same stale value and eat the extra moves.
        setActive((previous) =>
          Math.min(rows.length - 1, Math.max(0, previous + offset))
        );
      } else {
        // Everything else is readline's business (typing, paste,
        // backspace, ctrl+u); mirror the buffer into the query -- same
        // pattern as EscapableSelectPrompt. Any non-ESC key breaks the
        // double-ESC streak.
        escapeGraceRef.current?.otherKey();
        escapeGraceRef.current = undefined;
        setLeftGuard('');
        setQuery(rl.line);
      }
    });

    if (status === 'escaped') {
      return `${prefix} ${config.message} ${c.muted('(cancelled)')}`;
    }
    if (status === 'done') {
      const picked = choices.filter((choice) => selected.has(choice.value));
      const summary =
        picked.length === 0
          ? c.muted('(none -- run with defaults)')
          : c.positive(picked.map((choice) => choice.name).join(', '));
      return `${prefix} ${config.message} ${summary}`;
    }

    const page = usePagination({
      items: rows,
      active,
      renderItem: ({ item, isActive }) => {
        if (item.kind === 'header') {
          // The twisty sits in the marker column so the cursor column
          // (›) stays aligned with the choice rows; a collapsed header
          // with selections shows the badge -- nothing readable hides.
          const twisty = item.expanded ? '▾' : '▸';
          const badge =
            !item.expanded && item.selectedCount > 0
              ? ` · ${item.selectedCount} selected`
              : '';
          const line = `${twisty} ${item.group.label} (${item.count})${badge}`;
          return isActive ? c.command(line) : line;
        }
        const marker = selected.has(item.choice.value) ? '◉' : '○';
        // The cursor gets a GLYPH (› between marker and name), not just
        // color -- color alone is invisible when the cursor sits on an
        // already-marked row (user feedback 2026-10-12: after the value
        // editor closed, "the cursor is nowhere"). The single-select's
        // '› ' pattern, married to the multiselect's ◉/○ column.
        const cursor = isActive ? '› ' : '  ';
        const line = `${marker} ${cursor}${item.indent ? '  ' : ''}${item.choice.name}`;
        return isActive ? c.command(line) : line;
      },
      pageSize,
      loop: false,
    });

    const queryEcho = query.length > 0 ? c.command(` query: ${query}`) : '';
    // PANEL PER SURFACE (user feedback 2026-10-12): the Navigate box is
    // PERMANENT at the top -- it swaps its key hints to the active
    // surface (list vs value editor) instead of disappearing, so the
    // frame layout never jumps and the keys never lie. The question +
    // list + description form one framed panel; the inline value editor
    // is its own framed box UNDER the panel (the old bottom collector
    // was easy to miss; directly beneath the list it edits is where the
    // eye finds it -- and the description stays beside its list).
    const editingName =
      editing !== null
        ? (choices.find((choice) => choice.value === editing)?.name ??
          String(editing))
        : '';
    const menu = renderNavigationMenu(
      navigationMenuItems(
        editing !== null
          ? {
              // Value-editor surface: typing does not filter (a picker
              // owns the values; a text draft IS the value).
              enter: editingChoices.length > 0 ? 'pick' : 'commit value',
              escape: 'rejects',
            }
          : {
              filter: true,
              space:
                highlighted?.kind === 'header'
                  ? highlighted.expanded
                    ? 'collapse'
                    : 'expand'
                  : 'select',
              enter: 'commit',
              left: true,
              escape: 'back · [ESC]×2 exit all',
            }
      ),
      width
    );

    // The question+list panel: list rows, then the highlighted option's
    // description trailing INSIDE the panel (description at the bottom,
    // option at the top = the two halves of the decision frames apart).
    const panelLines: { text: string; plain: string }[] = [];
    if (leftGuard) {
      panelLines.push({
        text: c.negative(leftGuard),
        plain: leftGuard,
      });
    } else if (escapeGraceOpen) {
      panelLines.push({
        text: c.muted('esc again to exit all -- or wait to go back one level'),
        plain: 'esc again to exit all -- or wait to go back one level',
      });
    }
    if (rows.length > 0) {
      for (const row of page.split('\n')) {
        panelLines.push({ text: row, plain: stripAnsi(row) });
      }
    } else {
      panelLines.push({
        text: c.muted('(no matches -- backspace to edit)'),
        plain: '(no matches -- backspace to edit)',
      });
    }
    if (highlighted?.kind === 'header') {
      // A header's panel description: the group's options as flags, so
      // "what is inside?" costs one cursor move, not an expand.
      const members = choices.filter(
        (choice) =>
          (choice as { group?: string }).group === highlighted.group.id
      );
      panelLines.push({ text: '', plain: '' });
      panelLines.push(
        ...descriptionPanelLines(
          `${highlighted.group.label}: ${members
            .map((choice) => choice.name)
            .join(', ')}`,
          width
        )
      );
    } else if (highlightedChoice?.description) {
      panelLines.push({ text: '', plain: '' });
      panelLines.push(
        ...descriptionPanelLines(highlightedChoice.description, width)
      );
    }
    const panel = renderFramedBox({
      title: {
        text: `${prefix} ${config.message}${queryEcho}`,
        plain: `? ${config.message}${queryEcho}`,
      },
      lines: panelLines,
      width,
    });

    // The inline value editor: its own framed box directly under the
    // panel. An enum option renders its choices as a picker list; a
    // free text option renders the draft with readline's echo muted.
    const valueBox =
      editing === null
        ? ''
        : editingChoices.length > 0
          ? renderFramedBox({
              title: `Value for ${editingName}`,
              lines: editingChoices.map((choice, index) => {
                const marker = index === pickerActive ? '›' : ' ';
                const line = `${marker} ${choice}`;
                return {
                  text: index === pickerActive ? c.command(line) : line,
                  plain: line,
                };
              }),
              width,
            })
          : renderFramedBox({
              title: `Value for ${editingName}`,
              lines: [
                {
                  text: c.command(draft || '(type a value)'),
                  plain: draft || '(type a value)',
                },
              ],
              width,
            });

    const lines = [
      menu,
      panel,
      ...(editing !== null ? [valueBox] : []),
      typeof config.preview === 'function'
        ? config.preview(
            choices
              .filter((choice) => selected.has(choice.value))
              .map((choice) => choice.value)
          )
        : config.preview,
    ].filter(Boolean);
    return lines.join('\n');
  }
);

export const escapableMultiSelect = ((config) => {
  notePromptRendered();
  // Erase-on-conclude: see EscapableSelectPrompt's wrapper comment.
  return escapableMultiSelectImpl(config, { clearPromptOnDone: true });
}) as unknown as EscapableMultiSelectFn;
