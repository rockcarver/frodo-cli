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

/**
 * Distinct return value `escapableMultiSelect` resolves with when the user
 * presses Escape instead of committing -- callers branch on this to back
 * out (skip the editor entirely) instead of treating it as a real
 * selection. Nothing selected + Enter commits the empty set (a deliberate
 * "run with defaults"), distinct from Escape's "don't touch this step".
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
    const prefix = usePrefix({
      status: status === 'escaped' ? 'done' : status,
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
      if (key.name === 'escape') {
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
        setActive((active + offset + filtered.length) % filtered.length);
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
      loop: true,
    });

    const queryEcho = query.length > 0 ? c.command(` query: ${query}`) : '';

    const lines = [
      `${prefix} ${config.message}${queryEcho}`,
      filtered.length > 0
        ? page
        : c.muted(
            '  (no matches -- backspace to edit, esc clears then backs out)'
          ),
      highlighted && highlighted.description
        ? c.muted(highlighted.description)
        : '',
      c.muted('(↑↓ navigate · space toggles · enter commits · esc backs out)'),
    ].filter(Boolean);
    return lines.join('\n');
  }
);

export const escapableMultiSelect =
  escapableMultiSelectImpl as EscapableMultiSelectFn;
