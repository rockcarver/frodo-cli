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
  useState,
} from '@inquirer/core';
import type { InquirerReadline } from '@inquirer/type';
import c from '../ColorTheme';
import {
  navigationMenuItems,
  renderFramedBox,
  renderNavigationMenu,
} from './NavigationMenu';
import { notePromptRendered } from './PromptGateState';

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
};

export type EscapableMultiSelectConfig<Value> = {
  message: string;
  choices: EscapableMultiSelectChoice<Value>[];
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
) => Promise<Value[] | typeof MULTISEL_ESCAPE>;

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

    const filtered = useMemo(() => {
      if (query.length === 0) return choices;
      const needle = query.toLowerCase();
      return choices.filter((choice) =>
        choice.name.toLowerCase().includes(needle)
      );
    }, [choices, query]);

    // Cursor resets to the top of the FILTERED list whenever the query
    // changes (useEffect, not a render-time write -- see
    // EscapableSelectPrompt's TDZ note).
    useEffect(() => {
      setActive(0);
    }, [query]);

    const [active, setActive] = useState(0);
    const highlighted = filtered[active];

    // Leaving the inline value editor: clear editing state AND scrub the
    // readline buffer -- the editor swaps key semantics (picker) or
    // hands the buffer to a value, and a surviving filter query would
    // prefix the next value or filter the next navigation.
    const closeInlineEditor = (rl: InquirerReadline) => {
      setEditing(null);
      setEditingChoices([]);
      setDraft('');
      setPickerActive(0);
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
            const value = editingChoices[pickerActive] ?? editingChoices[0];
            config.onValue?.(editing, value);
            setSelected((previous) => {
              const next = new Set(previous);
              next.add(editing);
              return next;
            });
            closeInlineEditor(rl);
            return;
          }
          if (key.name === 'escape') {
            // Reject: an option that needs a value cannot be marked
            // without one. Nothing changes.
            closeInlineEditor(rl);
            return;
          }
          if (isUpKey(key) || isDownKey(key)) {
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
          closeInlineEditor(rl);
          return;
        }
        if (key.name === 'escape') {
          // Reject: an option that needs a value cannot be marked
          // without one. Nothing changes.
          closeInlineEditor(rl);
          return;
        }
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
          return;
        }
        setStatus('escaped');
        done(MULTISEL_ESCAPE);
      } else if (isEnterKey(key)) {
        // Commit whatever is selected -- an empty set is a valid outcome
        // ("run with defaults"), unlike select where nothing-picked is a
        // no-op.
        setStatus('done');
        done([...selected]);
      } else if (isSpaceKey(key)) {
        if (!highlighted) return;
        const togglingOn = !selected.has(highlighted.value);
        if (togglingOn && config.needsValue?.(highlighted.value)) {
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
            config.choicesFor?.(highlighted.value) ?? undefined;
          const current = config.currentValueFor?.(highlighted.value) ?? '';
          setEditing(highlighted.value);
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
          if (next.has(highlighted.value)) {
            next.delete(highlighted.value);
          } else {
            next.add(highlighted.value);
          }
          return next;
        });
      } else if (isUpKey(key) || isDownKey(key)) {
        if (filtered.length === 0) return;
        const offset = isUpKey(key) ? -1 : 1;
        // Clamp at the ends -- a list with a beginning and an end, not
        // an endless loop (matches EscapableSelectPrompt).
        setActive(Math.min(filtered.length - 1, Math.max(0, active + offset)));
      } else {
        // Everything else is readline's business (typing, paste,
        // backspace, ctrl+u); mirror the buffer into the query -- same
        // pattern as EscapableSelectPrompt.
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
      items: filtered,
      active,
      renderItem: ({ item, isActive }) => {
        const marker = selected.has(item.value) ? '◉' : '○';
        const line = `${marker} ${item.name}`;
        return isActive ? c.command(line) : line;
      },
      pageSize,
      loop: false,
    });

    const queryEcho = query.length > 0 ? c.command(` query: ${query}`) : '';
    // The inline value editor takes the TOP slot of the frame -- the
    // same visual position as the Navigate menu, where the eye already
    // looks first (user feedback: the value collector at the bottom was
    // hard to see). While it is open the Navigate menu would lie about
    // the keys (typing filters nothing; space does not toggle), so the
    // Value box REPLACES it, and its rows state the keys that actually
    // apply. An enum option renders its choices as a picker list; a free
    // text option renders the draft with readline's echo muted.
    const editingName =
      editing !== null
        ? (choices.find((choice) => choice.value === editing)?.name ??
          String(editing))
        : '';
    const valueBox =
      editing === null
        ? ''
        : editingChoices.length > 0
          ? renderFramedBox({
              title: ` Value for ${editingName} `,
              lines: [
                ...editingChoices.map((choice, index) => {
                  const marker = index === pickerActive ? '›' : ' ';
                  const line = `${marker} ${choice}`;
                  return {
                    text: index === pickerActive ? c.command(line) : line,
                    plain: line,
                  };
                }),
                {
                  text: c.muted('↑↓ move · enter pick · esc rejects'),
                  plain: '↑↓ move · enter pick · esc rejects',
                },
              ],
            })
          : renderFramedBox({
              title: ` Value for ${editingName} `,
              lines: [
                {
                  text: c.command(draft || '(type a value)'),
                  plain: draft || '(type a value)',
                },
                {
                  text: c.muted('enter commits · esc rejects'),
                  plain: 'enter commits · esc rejects',
                },
              ],
            });

    // The navigation menu (see NavigationMenu.ts): framed box at the
    // TOP of the frame; the multi-select's space/enter roles and the
    // editor's <- back alias are its extra affordances. The inline
    // value editor replaces it while open (see valueBox).
    const menu = renderNavigationMenu(
      navigationMenuItems({
        filter: true,
        space: 'select',
        enter: 'commit',
        left: true,
        escape: 'back out',
      })
    );

    const lines = [
      editing !== null ? valueBox : menu,
      `${prefix} ${config.message}${queryEcho}`,
      filtered.length > 0
        ? page
        : c.muted(
            '  (no matches -- backspace to edit, esc clears then backs out)'
          ),
      highlighted && highlighted.description
        ? c.muted(highlighted.description)
        : '',
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
