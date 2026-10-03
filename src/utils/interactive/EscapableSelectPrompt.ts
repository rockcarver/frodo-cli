import {
  createPrompt,
  isDownKey,
  isEnterKey,
  isUpKey,
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

export type EscapableSelectConfig<Value> = {
  message: string;
  choices: EscapableSelectChoice<Value>[];
  default?: Value;
  pageSize?: number;
};

/**
 * A small, deliberately reimplemented sibling of the packaged
 * `@inquirer/select` prompt, differing in exactly one way: Escape resolves
 * the prompt with the `ESCAPE` sentinel instead of doing nothing.
 *
 * The packaged `select` prompt has no Escape keybinding at all -- confirmed
 * by reading its installed source directly -- and no way to configure one;
 * only `@inquirer/core`'s lower-level `createPrompt`/`useKeypress` expose
 * the raw keypress needed to detect it (Node's `readline` keypress events
 * carry `key.name === 'escape'`, standard `emitKeypressEvents` behavior).
 * Deliberately omits `select`'s type-to-search and number-jump features to
 * keep this small -- every menu in this CLI is short enough not to need
 * them.
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

    const defaultIndex = useMemo(() => {
      if (!('default' in config)) return 0;
      const index = choices.findIndex(
        (choice) => choice.value === config.default
      );
      return index === -1 ? 0 : index;
    }, [config.default, choices]);
    const [active, setActive] = useState(defaultIndex);
    const selected = choices[active];

    useKeypress((key) => {
      if (key.name === 'escape') {
        setStatus('escaped');
        done(ESCAPE);
      } else if (isEnterKey(key)) {
        setStatus('done');
        done(selected.value);
      } else if (isUpKey(key) || isDownKey(key)) {
        const offset = isUpKey(key) ? -1 : 1;
        setActive((active + offset + choices.length) % choices.length);
      }
    });

    if (status === 'escaped') {
      return `${prefix} ${config.message} ${c.muted('(cancelled)')}`;
    }
    if (status === 'done') {
      return `${prefix} ${config.message} ${c.positive(selected.name)}`;
    }

    const page = usePagination({
      items: choices,
      active,
      renderItem: ({ item, isActive }) => {
        const line = `${isActive ? '›' : ' '} ${item.name}`;
        return isActive ? c.command(line) : line;
      },
      pageSize,
      loop: true,
    });

    const lines = [
      `${prefix} ${config.message}`,
      page,
      selected.description ? c.muted(selected.description) : '',
      c.muted('(↑↓ navigate · enter select · esc back)'),
    ].filter(Boolean);
    return lines.join('\n');
  }
);

export const escapableSelect = escapableSelectImpl as EscapableSelectFn;
