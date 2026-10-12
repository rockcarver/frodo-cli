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
import c from '../ColorTheme';
import { navigationMenuItems, renderNavigationMenu } from './NavigationMenu';
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
   * Async side step for a just-toggled-ON member (the invocation
   * editor's value steps): when set, <space> on a member the caller
   * declines to accept as-is resolves this promise FIRST -- the prompt
   * pauses (further keypresses ignored), the hook collects the value
   * (typically a nested prompt), and the member is only added to the
   * selection when it resolves. The hook may also CANCEL the toggle by
   * resolving with `false` (e.g. the user escaped the nested value
   * prompt -- a valued option cannot be marked without a real value).
   * Toggle-OFF never consults the hook.
   */
  onToggleOn?: (value: Value) => Promise<boolean | void>;
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
 * - ↑/↓ navigate
 * - <space> toggles the highlighted entry
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
    // While a just-toggled member's side step (onToggleOn) runs, every
    // keypress is ignored -- the nested prompt owns the keyboard. The
    // prefix shows the working state (usePrefix 'loading') so the pause
    // reads as intentional, not frozen.
    const [sideStepping, setSideStepping] = useState(false);
    const prefix = usePrefix({
      status: sideStepping ? 'loading' : status === 'escaped' ? 'done' : status,
    });

    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<Set<unknown>>(
      () => new Set(config.defaultValues ?? [])
    );

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

    useKeypress((key, rl) => {
      if (sideStepping) return; // the nested value prompt owns the keyboard
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
        if (togglingOn && config.onToggleOn) {
          // Side step FIRST (typically the value prompt for a valued
          // option): the member joins the selection only if the hook
          // accepts it. A rejected toggle (nested escape) changes
          // nothing -- a valued option cannot be marked without its
          // real value.
          setSideStepping(true);
          void config
            .onToggleOn(highlighted.value)
            .then((accepted) => {
              if (accepted !== false) {
                setSelected((previous) => {
                  const next = new Set(previous);
                  next.add(highlighted.value);
                  return next;
                });
              }
            })
            .finally(() => setSideStepping(false));
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

    // The navigation menu (see NavigationMenu.ts): framed box at the
    // TOP of the frame; the multi-select's space/enter roles and the
    // editor's <- back alias are its extra affordances.
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
      menu,
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
