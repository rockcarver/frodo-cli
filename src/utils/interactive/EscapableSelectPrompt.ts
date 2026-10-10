import {
  createPrompt,
  isDownKey,
  isEnterKey,
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
 * Distinct return value `escapableSelect` resolves with when the user
 * presses Escape instead of choosing something -- callers branch on this
 * to go back a menu level (or exit cleanly at the top level) instead of
 * treating it as a real selection.
 */
export const ESCAPE = Symbol('escapableSelect:escape');

export type EscapableSelectChoice<Value> = {
  value: Value;
  name: string;
  description?: string;
};

/**
 * Matches a choice against the current search query. `query` is the raw
 * (not lowercased) buffer content -- the predicate decides on casing
 * itself, so e.g. the connection-profile pickers can do case-insensitive
 * substring matching across BOTH host and alias while an entity picker
 * can demand a prefix match on `name` only. When no predicate is
 * configured, filtering falls back to a case-insensitive substring match
 * on `name`.
 */
export type EscapableSelectMatch<Value> = (
  choice: EscapableSelectChoice<Value>,
  query: string
) => boolean;

export type EscapableSelectConfig<Value> = {
  message: string;
  choices: EscapableSelectChoice<Value>[];
  default?: Value;
  pageSize?: number;
  /**
   * Custom match predicate for type-to-search (see the class doc for the
   * full interaction contract). Omitted, every list is still filterable --
   * the name-only fallback applies -- so callers only reach for this when
   * the match must span more than the visible label (host + alias) or use
   * different casing rules.
   */
  search?: EscapableSelectMatch<Value>;
};

/**
 * A small, deliberately reimplemented sibling of the packaged
 * `@inquirer/select` prompt, differing in one core way: Escape resolves
 * the prompt with the `ESCAPE` sentinel instead of doing nothing.
 *
 * The packaged `select` prompt has no Escape keybinding at all -- confirmed
 * by reading its installed source directly -- and no way to configure one;
 * only `@inquirer/core`'s lower-level `createPrompt`/`useKeypress` expose
 * the raw keypress needed to detect it (Node's `readline` keypress events
 * carry `key.name === 'escape'`, standard `emitKeypressEvents` behavior).
 *
 * Type-to-search is built in rather than adopting `@inquirer/search` for
 * the same reason: the packaged prompt throws on Escape, can't express
 * "clear query first, back out second", and offers no pluggable match
 * predicate -- all three are required by the connection-profile pickers
 * (host + alias, case-insensitive) and the escape-as-back menu loops this
 * CLI is built around. It is a universal capability, not an opt-in: every
 * list filters as you type (predicate or name fallback), short enums and
 * long pickers alike -- consistent muscle memory beats one more knob.
 */
// `createPrompt`'s view function can't itself be generic (its `Value` type
// parameter is inferred once, at the `createPrompt(view)` call site, from a
// non-generic view) -- so the implementation below is written loosely
// against `unknown`, matching the runtime, and the exported binding is
// given a precise, hand-written generic type instead. This is the same
// split `@inquirer/select` itself relies on (its compiled `.js` is
// similarly untyped; a separate `.d.ts` declares the generic public type).
type EscapableSelectFn = <Value>(
  config: EscapableSelectConfig<Value>
) => Promise<Value | typeof ESCAPE>;

const escapableSelectImpl = createPrompt(
  (config: EscapableSelectConfig<unknown>, done: (value: unknown) => void) => {
    // Default well above what any menu in this CLI actually needs: once
    // `pageSize` covers every choice, `usePagination` renders a static
    // list and the cursor moves through it directly on each ↑/↓ -- below
    // that threshold it switches to a scrolling viewport that keeps the
    // cursor near a fixed row and scrolls the list underneath it instead,
    // which reads as "the items move, not the selection."
    const { pageSize = 20, choices } = config;
    const [status, setStatus] = useState<'idle' | 'done' | 'escaped'>('idle');
    const prefix = usePrefix({
      status: status === 'escaped' ? 'done' : status,
    });

    // The search query mirrors the readline buffer (`rl.line`) on every
    // keystroke -- the same pattern `textPrompt` (PromptGate) uses, for
    // the same reason: readline does the editing (typing, backspace,
    // paste, ctrl+u), the prompt only mirrors and reads. Nothing here
    // reads `rl.line` on Enter/Escape, so the buffer-consumption
    // subtlety textPrompt works around doesn't apply.
    const [query, setQuery] = useState('');

    const filtered = useMemo(() => {
      if (!config.search) {
        if (query.length === 0) return choices;
        const needle = query.toLowerCase();
        return choices.filter((choice) =>
          choice.name.toLowerCase().includes(needle)
        );
      }
      return choices.filter((choice) => config.search!(choice, query));
    }, [choices, query, config.search]);

    // The cursor resets to the top of the FILTERED list whenever the
    // query changes -- predictable ("my text takes me to the first
    // match"). `useEffect` (not a render-time write) because the setter
    // must exist first and inquirer re-renders on every state change
    // anyway; a render-time `setActive` here would either run before
    // `useState` declared it (TDZ crash) or loop the render.
    useEffect(() => {
      setActive(0);
    }, [query]);

    const defaultIndex = useMemo(() => {
      if (!('default' in config)) return 0;
      const index = choices.findIndex(
        (choice) => choice.value === config.default
      );
      return index === -1 ? 0 : index;
    }, [config.default, choices]);
    const [active, setActive] = useState(defaultIndex);
    const selected = filtered[active];

    useKeypress((key, rl) => {
      if (key.name === 'escape') {
        // Two-stage escape with an active query (see `search` docs).
        if (rl.line.length > 0) {
          rl.clearLine(0);
          setQuery('');
          return;
        }
        setStatus('escaped');
        done(ESCAPE);
      } else if (isEnterKey(key)) {
        if (!selected) {
          // Filtered to nothing: Enter does nothing rather than crashing
          // (the view shows an explicit "no matches" state).
          return;
        }
        setStatus('done');
        done(selected.value);
      } else if (isUpKey(key) || isDownKey(key)) {
        if (filtered.length === 0) return;
        const offset = isUpKey(key) ? -1 : 1;
        setActive((active + offset + filtered.length) % filtered.length);
      } else {
        // Everything else is readline's business (typing, paste, backspace,
        // ctrl+u, any unhandled key); the buffer holds the result -- there
        // is no reliable "printable" predicate to read off the keypress
        // event (a printable char's `name` IS the character). Mirroring it
        // into state drives the filter; the same pattern textPrompt
        // (PromptGate) uses.
        setQuery(rl.line);
      }
    });

    if (status === 'escaped') {
      return `${prefix} ${config.message} ${c.muted('(cancelled)')}`;
    }
    if (status === 'done') {
      return `${prefix} ${config.message} ${c.positive(selected!.name)}`;
    }

    const page = usePagination({
      items: filtered,
      active,
      renderItem: ({ item, isActive }) => {
        const line = `${isActive ? '›' : ' '} ${item.name}`;
        return isActive ? c.command(line) : line;
      },
      pageSize,
      loop: true,
    });

    const searchHint = query.length === 0 ? c.muted('type to filter') : '';
    const queryEcho =
      config.search && query.length > 0 ? c.command(` query: ${query}`) : '';

    const lines = [
      `${prefix} ${config.message}${queryEcho}`,
      filtered.length > 0
        ? page
        : c.muted(
            '  (no matches -- backspace to edit, esc clears then backs out)'
          ),
      selected && selected.description ? c.muted(selected.description) : '',
      searchHint || c.muted('(↑↓ navigate · enter select · esc back)'),
    ].filter(Boolean);
    return lines.join('\n');
  }
);

export const escapableSelect = escapableSelectImpl as EscapableSelectFn;
