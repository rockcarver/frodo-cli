import util from 'node:util';

/**
 * Interactive, collapsible object explorer for the frodo JS console
 * (`frodo shell`).
 *
 * The browser console renders results as collapsed objects that expand on
 * click. A terminal has no clickable disclosure triangles, so this module
 * provides the keyboard equivalent:
 *
 * - Results print as a one-line collapsed preview (`{users: Array(2), ...}`).
 * - Ctrl+O opens the last result here; `explore(value)` explores any value
 *   from a script (it awaits until the viewer closes).
 * - The viewer is a bounded live region drawn inline under the prompt (no
 *   alternate screen): at most MAX_BODY_ROWS rows tall, scrolling inside
 *   itself, redrawn in place on each keypress. Because its height is capped
 *   below the terminal height, the in-place redraw can never reach lines
 *   that have scrolled off the top. Arrows move, right/Enter expands, left
 *   collapses. q or Ctrl+O closes and erases the region; Esc closes and
 *   keeps what was on screen as plain text in the scrollback. Either way
 *   the prompt (with any draft text) comes back below.
 *
 * The viewer never reads process.stdin itself: the console's input filter
 * (ShellHistorySearchOps) hands it bytes while it is open, so the REPL's
 * readline never sees the viewer's keystrokes.
 */

const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const INVERSE = '\x1b[7m';

const ESC = 0x1b;
const CTRL_C = 0x03;
const CTRL_O = 0x0f;
const CR = 0x0d;
const LF = 0x0a;

/**
 * Default most node rows the inline region shows before it scrolls inside
 * itself. Always further limited to what fits on the terminal, and
 * adjustable at runtime (`.treerows`).
 */
export const MAX_BODY_ROWS = 30;
/** Rows the region needs beyond its body: header, footer, prompt, slack. */
const REGION_OVERHEAD = 5;
const MIN_BODY_ROWS = 3;
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';

/** Move the cursor up `n` lines; empty for 0 (ESC[0A would move one line). */
function cursorUp(n: number): string {
  return n > 0 ? `\x1b[${n}A` : '';
}

export type ExplorerNode = {
  /** Property key; empty for the root node. */
  key: string;
  value: unknown;
  depth: number;
  expandable: boolean;
  expanded: boolean;
  /** The value is an ancestor of itself along this path. */
  circular: boolean;
  /** Reading the property threw (a throwing getter). */
  error?: string;
  parent: ExplorerNode | null;
  children: ExplorerNode[] | null;
};

export type ViewerIO = {
  /** Route every input byte to the handler while it is set; null restores. */
  subscribe(handler: ((chunk: Buffer) => void) | null): void;
  write(text: string): void;
  width(): number;
  height(): number;
  /**
   * Redraw the prompt and its draft line after an at-prompt viewer closed
   * (the viewer erases its own region; the prompt row is rewritten by the
   * REPL's readline, which owns the draft text and cursor position).
   */
  restorePrompt(): void;
};

export type ExploreOptions = {
  /**
   * The viewer was opened with the prompt visible above it (Ctrl+O). The
   * region starts on the line below the prompt, and closing restores the
   * prompt. When false (`explore(value)` from a script, `.explore`), the
   * cursor is already on a fresh line and nothing needs restoring.
   */
  atPrompt?: boolean;
};

/**
 * Whether a value is an Error, from any realm. `instanceof Error` fails for
 * values made in the REPL's vm context, `util.types.isNativeError` is
 * deprecated and `Error.isError` needs Node 24+, so this reads the
 * internal class tag, which every realm sets the same way.
 */
function isErrorValue(value: unknown): value is Error {
  return Object.prototype.toString.call(value) === '[object Error]';
}

/**
 * Whether a value can be opened in the explorer: objects and arrays, but
 * not Promises (their value is not accessible synchronously) or typed
 * arrays/Buffers (thousands of byte-children).
 */
export function isExplorableValue(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !util.types.isPromise(value) &&
    !ArrayBuffer.isView(value)
  );
}

function childCount(value: object): number {
  if (Array.isArray(value)) return value.length;
  if (util.types.isMap(value)) return value.size;
  if (util.types.isSet(value)) return value.size;
  return Object.keys(value).length;
}

function makeNode(
  key: string,
  value: unknown,
  depth: number,
  parent: ExplorerNode | null,
  error?: string
): ExplorerNode {
  const base: ExplorerNode = {
    key,
    value,
    depth,
    expandable: false,
    expanded: false,
    circular: false,
    parent,
    children: null,
    error,
  };
  if (error !== undefined) return base;
  if (value === null || typeof value !== 'object') return base;
  if (util.types.isPromise(value)) return base;
  if (ArrayBuffer.isView(value)) return base;
  // Circular: this exact object is already on the path above this node.
  for (let a = parent; a !== null; a = a.parent) {
    if (a.value === value) {
      base.circular = true;
      return base;
    }
  }
  base.expandable = childCount(value) > 0;
  return base;
}

export function buildRoot(value: unknown): ExplorerNode {
  return makeNode('', value, 0, null);
}

/**
 * Compute (fresh, so mutations since the last expand are reflected) the
 * children of a node and mark it expanded.
 */
export function expandNode(node: ExplorerNode): void {
  if (!node.expandable || node.expanded) return;
  const value = node.value as object;
  const nextDepth = node.depth + 1;
  let children: ExplorerNode[];
  if (Array.isArray(value)) {
    children = value.map((element, index) =>
      makeNode(String(index), element, nextDepth, node)
    );
  } else if (util.types.isMap(value)) {
    children = [...value.entries()].map(([key, element]) =>
      makeNode(
        util.inspect(key, { breakLength: Infinity, depth: 0 }),
        element,
        nextDepth,
        node
      )
    );
  } else if (util.types.isSet(value)) {
    children = [...value.values()].map((element, index) =>
      makeNode(String(index), element, nextDepth, node)
    );
  } else {
    children = Object.keys(value).map((key) => {
      try {
        return makeNode(
          key,
          (value as Record<string, unknown>)[key],
          nextDepth,
          node
        );
      } catch (error) {
        return makeNode(key, undefined, nextDepth, node, String(error));
      }
    });
  }
  node.children = children;
  node.expanded = true;
}

/** Collapse a node and drop its cached children (re-expanded fresh). */
export function collapseNode(node: ExplorerNode): void {
  node.expanded = false;
  node.children = null;
}

/**
 * The visible rows, in display order: every node whose ancestors are all
 * expanded.
 */
export function flattenVisible(root: ExplorerNode): ExplorerNode[] {
  const rows: ExplorerNode[] = [];
  const walk = (node: ExplorerNode): void => {
    rows.push(node);
    if (node.expanded && node.children) {
      for (const child of node.children) walk(child);
    }
  };
  walk(root);
  return rows;
}

/**
 * A value in the shortest form that still tells you what it is, used inside
 * a collapsed container's one-line preview: primitives print as themselves
 * (long strings cut), containers as `Array(n)`, `Map(n)` or `{…}`.
 */
function brief(
  value: unknown,
  colors: boolean
): { text: string; hidden: boolean } {
  const show = (v: unknown) =>
    util.inspect(v, { depth: 0, breakLength: Infinity, colors });
  if (typeof value === 'string' && value.length > 36) {
    return { text: show(`${value.slice(0, 36)}…`), hidden: true };
  }
  if (value === null || typeof value !== 'object') {
    return { text: show(value), hidden: false };
  }
  if (Array.isArray(value)) {
    return value.length === 0
      ? { text: '[]', hidden: false }
      : { text: `Array(${value.length})`, hidden: true };
  }
  if (util.types.isMap(value)) {
    return { text: `Map(${value.size})`, hidden: value.size > 0 };
  }
  if (util.types.isSet(value)) {
    return { text: `Set(${value.size})`, hidden: value.size > 0 };
  }
  if (util.types.isDate(value) || util.types.isRegExp(value)) {
    return { text: show(value), hidden: false };
  }
  if (isErrorValue(value)) {
    return { text: `[${value.name}: ${value.message}]`, hidden: true };
  }
  if (ArrayBuffer.isView(value)) {
    return {
      text: `${value.constructor.name}(${value.byteLength})`,
      hidden: false,
    };
  }
  return Object.keys(value).length === 0
    ? { text: '{}', hidden: false }
    : { text: '{…}', hidden: true };
}

export type CollapsedPreviewOptions = {
  /** Most object keys listed before the rest is summarized as an ellipsis. */
  maxKeys: number;
  /** Most array items listed before the rest is summarized as an ellipsis. */
  maxItems: number;
  /** Colour the output (printed results); tree rows stay plain. */
  colors: boolean;
};

/**
 * The browser-console one-line summary of a container, with every nested
 * container itself collapsed: `{users: Array(2), meta: {…}}`,
 * `(3) [1, 2, 3]`. `hidden` says whether the line leaves anything out
 * (a nested container, an ellipsis, a cut string), which is when the user
 * has something to gain from opening the tree.
 */
export function collapsedPreview(
  value: object,
  options: CollapsedPreviewOptions
): { text: string; hidden: boolean } {
  const { maxKeys, maxItems, colors } = options;
  if (Array.isArray(value)) {
    if (value.length === 0) return { text: '[]', hidden: false };
    const items = value.slice(0, maxItems).map((item) => brief(item, colors));
    const more = value.length > maxItems;
    return {
      text: `(${value.length}) [${items.map((i) => i.text).join(', ')}${more ? ', …' : ''}]`,
      hidden: more || items.some((i) => i.hidden),
    };
  }
  if (util.types.isMap(value) || util.types.isSet(value)) {
    const kind = util.types.isMap(value) ? 'Map' : 'Set';
    return { text: `${kind}(${value.size})`, hidden: value.size > 0 };
  }
  const keys = Object.keys(value);
  const name = value.constructor?.name;
  const prefix = name && name !== 'Object' ? `${name} ` : '';
  if (keys.length === 0) return { text: `${prefix}{}`, hidden: false };
  const paint = (key: string) => (colors ? `${CYAN}${key}${RESET}` : key);
  const listed = keys.slice(0, maxKeys).map((key) => {
    try {
      const item = brief((value as Record<string, unknown>)[key], colors);
      return { text: `${paint(key)}: ${item.text}`, hidden: item.hidden };
    } catch {
      return { text: `${paint(key)}: <throws>`, hidden: true };
    }
  });
  const more = keys.length > maxKeys;
  return {
    text: `${prefix}{${listed.map((i) => i.text).join(', ')}${more ? ', …' : ''}}`,
    hidden: more || listed.some((i) => i.hidden),
  };
}

/**
 * Whether a displayed result should be shown as a collapsed one-liner:
 * explorable containers, but not values that already have a short custom
 * rendering (errors, dates, regular expressions).
 */
export function isCollapsibleResult(value: unknown): boolean {
  return (
    isExplorableValue(value) &&
    !isErrorValue(value) &&
    !util.types.isDate(value) &&
    !util.types.isRegExp(value)
  );
}

/**
 * One-line collapsed preview of a node's value, browser-console style:
 * collapsed containers summarize their contents, leaves print their value.
 */
export function previewOf(node: ExplorerNode): string {
  if (node.circular) return '[Circular]';
  if (node.error !== undefined) return `<throws: ${node.error}>`;
  const value = node.value;
  if (node.expandable && !node.expanded) {
    return collapsedPreview(value as object, {
      maxKeys: 4,
      maxItems: 3,
      colors: false,
    }).text;
  }
  if (node.expandable && node.expanded) {
    if (Array.isArray(value)) return `Array(${value.length})`;
    if (util.types.isMap(value)) return `Map(${value.size})`;
    if (util.types.isSet(value)) return `Set(${value.size})`;
    return `Object(${childCount(value as object)} keys)`;
  }
  return util.inspect(value, {
    depth: 0,
    breakLength: Infinity,
    maxArrayLength: 5,
  });
}

/**
 * Create the interactive viewer. One instance per console session; a
 * second `explore()` while one is open replaces the displayed value.
 */
export function createObjectViewer(io: ViewerIO): {
  explore(value: unknown, options?: ExploreOptions): Promise<void>;
  /** Set the most body rows the region may use; returns the effective cap. */
  setMaxBodyRows(rows: number): number;
  /** The body rows the region would use right now on this terminal. */
  currentBodyRows(): number;
} {
  let root: ExplorerNode | null = null;
  let rows: ExplorerNode[] = [];
  let cursor = 0;
  let scrollTop = 0;
  let open = false;
  let atPrompt = false;
  // Lines the region currently occupies on screen; 0 before the first draw.
  let drawnLines = 0;
  let resolveClosed: (() => void) | null = null;
  // Escape-sequence assembly: arrow keys and PgUp/PgDn arrive as multi-byte
  // sequences that can split across chunk boundaries.
  let pending: Buffer = Buffer.alloc(0);
  let escapeTimer: NodeJS.Timeout | null = null;
  let maxBodyRows = MAX_BODY_ROWS;

  /**
   * Rows of nodes the region shows. Capped so header + body + footer stay
   * well inside the terminal: the in-place redraw moves the cursor up over
   * the whole region, which only works while all of it is still on screen.
   */
  function viewportHeight(): number {
    return Math.max(
      MIN_BODY_ROWS,
      Math.min(maxBodyRows, io.height() - REGION_OVERHEAD)
    );
  }

  function clampScroll(): void {
    const height = viewportHeight();
    if (cursor < scrollTop) scrollTop = cursor;
    if (cursor >= scrollTop + height) scrollTop = cursor - height + 1;
    if (scrollTop < 0) scrollTop = 0;
  }

  function render(): void {
    if (!open || !root) return;
    // One column short of the terminal width: writing the last column makes
    // some terminals wrap early, which would break the line accounting.
    const width = Math.max(20, io.width() - 1);
    const height = viewportHeight();
    rows = flattenVisible(root);
    if (cursor >= rows.length) cursor = Math.max(rows.length - 1, 0);
    clampScroll();
    const overflow = rows.length > height;
    const lines: string[] = [
      fit(
        'frodo explore · ↑↓ move · →/Enter expand · ← collapse · Esc keep · q close',
        width,
        DIM
      ),
    ];
    const last = Math.min(scrollTop + height, rows.length);
    for (let i = scrollTop; i < last; i++) {
      lines.push(renderRow(rows[i], i === cursor, width));
    }
    if (overflow) {
      lines.push(
        fit(`rows ${scrollTop + 1}-${last} of ${rows.length}`, width, DIM)
      );
    }
    // Redraw in place: back to the first line of the region, clear from
    // there down, write the new frame. The first draw has nothing to undo.
    io.write(
      `${cursorUp(Math.max(drawnLines - 1, 0))}\r\x1b[J${lines.join('\n')}`
    );
    drawnLines = lines.length;
  }

  /** Plain text cut to `width` columns, wrapped in an optional style. */
  function fit(text: string, width: number, style = ''): string {
    const cut = truncatePlain(text, width);
    return style ? `${style}${cut}${RESET}` : cut;
  }

  function renderRow(
    node: ExplorerNode,
    selected: boolean,
    width: number
  ): string {
    // Indentation is capped so a very deep node still leaves room to read.
    const indent = '  '.repeat(
      Math.min(node.depth, Math.max(0, Math.floor((width - 20) / 2)))
    );
    const glyph = node.expandable ? (node.expanded ? '▾ ' : '▸ ') : '  ';
    const room = Math.max(width - indent.length - glyph.length, 4);
    const keyPlain =
      node.key === ''
        ? ''
        : truncatePlain(`${node.key}: `, Math.floor(room / 2));
    const preview = truncatePlain(
      previewOf(node),
      Math.max(room - keyPlain.length, 1)
    );
    // The selected row is plain text under INVERSE: an embedded RESET from
    // the key colour would cancel the highlight partway along the row.
    if (selected) {
      return `${INVERSE}${indent}${glyph}${keyPlain}${preview}${RESET}`;
    }
    // Colour only the key text; the ": " separator stays plain.
    const keyPart =
      keyPlain === ''
        ? ''
        : keyPlain.endsWith(': ')
          ? `${CYAN}${keyPlain.slice(0, -2)}${RESET}: `
          : `${CYAN}${keyPlain}${RESET}`;
    return indent + glyph + keyPart + preview;
  }

  function truncatePlain(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    if (maxLength <= 1) return text.slice(0, Math.max(maxLength, 0));
    return `${text.slice(0, maxLength - 1)}…`;
  }

  function selectedNode(): ExplorerNode | null {
    return rows[cursor] ?? null;
  }

  function toggle(node: ExplorerNode): void {
    if (!node.expandable) return;
    if (node.expanded) {
      collapseNode(node);
    } else {
      expandNode(node);
    }
    render();
  }

  function move(delta: number): void {
    const next = Math.min(Math.max(cursor + delta, 0), rows.length - 1);
    if (next !== cursor) {
      cursor = next;
      render();
    }
  }

  function page(delta: number): void {
    move(delta * viewportHeight());
  }

  function expandOrEnter(): void {
    const node = selectedNode();
    if (node && node.expandable && !node.expanded) {
      expandNode(node);
      render();
    }
  }

  function collapseOrParent(): void {
    const node = selectedNode();
    if (!node) return;
    if (node.expandable && node.expanded) {
      collapseNode(node);
      render();
      return;
    }
    if (node.parent) {
      const parentIndex = rows.indexOf(node.parent);
      if (parentIndex !== -1) {
        cursor = parentIndex;
        render();
      }
    }
  }

  function top(): void {
    cursor = 0;
    render();
  }

  function bottom(): void {
    cursor = Math.max(rows.length - 1, 0);
    render();
  }

  /**
   * The expanded view as plain text, for leaving behind in the scrollback:
   * the rows currently in the window, no header and no selection highlight,
   * plus the "rows a-b of n" note when the window is only part of the tree.
   */
  function keptFrame(): string {
    const width = Math.max(20, io.width() - 1);
    const height = viewportHeight();
    const last = Math.min(scrollTop + height, rows.length);
    const lines: string[] = [];
    for (let i = scrollTop; i < last; i++) {
      lines.push(renderRow(rows[i], false, width));
    }
    if (rows.length > height) {
      lines.push(
        fit(`rows ${scrollTop + 1}-${last} of ${rows.length}`, width, DIM)
      );
    }
    return lines.join('\n');
  }

  /**
   * Close the viewer. With `keep`, the final view stays on screen as static
   * text and the prompt returns below it; otherwise the region is erased.
   */
  function close(keep = false): void {
    if (!open) return;
    open = false;
    pending = Buffer.alloc(0);
    if (escapeTimer) {
      clearTimeout(escapeTimer);
      escapeTimer = null;
    }
    io.subscribe(null);
    if (process.stdout.isTTY) {
      process.stdout.removeListener('resize', onResize);
    }
    // Erase the region: back to its first line, then (when the prompt is
    // above it) one more line up onto the prompt row, and clear downward.
    // The prompt is then rewritten by the REPL, which owns the draft text
    // and the cursor column; for a script-opened viewer the cursor simply
    // rests at the start of the erased region. When keeping the view, the
    // static text is written where the old prompt row and region were, so
    // the scrollback reads: result, expanded view, fresh prompt with draft.
    const kept = keep && rows.length > 0 ? `${keptFrame()}\n` : '';
    io.write(
      `${cursorUp(Math.max(drawnLines - 1, 0) + (atPrompt ? 1 : 0))}\r\x1b[J${kept}${SHOW_CURSOR}`
    );
    drawnLines = 0;
    if (atPrompt) io.restorePrompt();
    const resolve = resolveClosed;
    resolveClosed = null;
    resolve?.();
  }

  function onResize(): void {
    render();
  }

  /** A parsed escape sequence or a single byte. */
  function applyKey(key: string): void {
    switch (key) {
      case 'up':
        move(-1);
        break;
      case 'down':
        move(1);
        break;
      case 'right':
        expandOrEnter();
        break;
      case 'left':
        collapseOrParent();
        break;
      case 'pageup':
        page(-1);
        break;
      case 'pagedown':
        page(1);
        break;
      case 'home':
        top();
        break;
      case 'end':
        bottom();
        break;
      case 'toggle':
        toggle(selectedNode() as ExplorerNode);
        break;
      case 'close':
        close();
        break;
      default:
        break;
    }
  }

  /**
   * Map a control byte; unmatched bytes are ignored while the viewer is
   * open. Ctrl+C closes (it must not kill the console).
   */
  function applyByte(byte: number): void {
    // Ctrl+O toggles: the key that opened the viewer also closes it.
    if (byte === CTRL_C || byte === CTRL_O) {
      close();
      return;
    }
    if (byte === CR || byte === LF) {
      const node = selectedNode();
      if (node) toggle(node);
      return;
    }
    if (byte < 0x20) return;
    const char = String.fromCharCode(byte);
    if (char === 'q' || char === 'Q') {
      close();
    } else if (char === 'j') {
      move(1);
    } else if (char === 'k') {
      move(-1);
    } else if (char === 'g') {
      top();
    } else if (char === 'G') {
      bottom();
    }
  }

  /** Parse a CSI/SS3 sequence at the front of `buffer`, if one is complete. */
  function tryParseSequence(
    buffer: Buffer
  ): { key: string; length: number } | null {
    if (buffer[1] === 0x5b) {
      // CSI: scan for the final byte (0x40-0x7e).
      for (let i = 2; i < buffer.length; i++) {
        if (buffer[i] >= 0x40 && buffer[i] <= 0x7e) {
          const params = buffer.subarray(2, i).toString('latin1');
          const final = String.fromCharCode(buffer[i]);
          const length = i + 1;
          if (final === 'A') return { key: 'up', length };
          if (final === 'B') return { key: 'down', length };
          if (final === 'C') return { key: 'right', length };
          if (final === 'D') return { key: 'left', length };
          if (final === 'H') return { key: 'home', length };
          if (final === 'F') return { key: 'end', length };
          if (params === '5' && final === '~') return { key: 'pageup', length };
          if (params === '6' && final === '~') {
            return { key: 'pagedown', length };
          }
          if (params === '1' && final === '~') return { key: 'home', length };
          if (params === '4' && final === '~') return { key: 'end', length };
          return { key: 'ignore', length };
        }
      }
      return null;
    }
    if (buffer[1] === 0x4f && buffer.length >= 3) {
      // SS3 (application cursor mode): ESC O A/B/C/D.
      const final = String.fromCharCode(buffer[2]);
      const length = 3;
      if (final === 'A') return { key: 'up', length };
      if (final === 'B') return { key: 'down', length };
      if (final === 'C') return { key: 'right', length };
      if (final === 'D') return { key: 'left', length };
      return { key: 'ignore', length };
    }
    // Not a recognized sequence shape: consume the modifier byte and move on.
    return { key: 'ignore', length: 2 };
  }

  function handleChunk(chunk: Buffer): void {
    pending = Buffer.concat([pending, chunk]);
    for (;;) {
      if (pending.length === 0) return;
      if (pending[0] === ESC) {
        if (pending.length === 1) {
          // Could be a lone Esc (close, keeping the view) or the start of a
          // sequence; wait a beat for the rest before deciding.
          if (!escapeTimer) {
            escapeTimer = setTimeout(() => {
              escapeTimer = null;
              pending = Buffer.alloc(0);
              close(true);
            }, 60);
          }
          return;
        }
        if (escapeTimer) {
          clearTimeout(escapeTimer);
          escapeTimer = null;
        }
        const parsed = tryParseSequence(pending);
        if (!parsed) return;
        pending = pending.subarray(parsed.length);
        if (parsed.key !== 'ignore') applyKey(parsed.key);
        continue;
      }
      const byte = pending[0];
      pending = pending.subarray(1);
      applyByte(byte);
    }
  }

  return {
    setMaxBodyRows(requested: number): number {
      maxBodyRows = Math.max(MIN_BODY_ROWS, Math.floor(requested));
      if (open) render();
      return viewportHeight();
    },
    currentBodyRows: viewportHeight,
    explore(value: unknown, options: ExploreOptions = {}): Promise<void> {
      root = buildRoot(value);
      // Start with the root expanded: the top level is visible immediately,
      // like the browser console's first click.
      expandNode(root);
      cursor = 0;
      scrollTop = 0;
      if (!open) {
        open = true;
        atPrompt = options.atPrompt === true;
        drawnLines = 0;
        // With the prompt visible, start on the line below it; otherwise
        // the cursor is already at the start of a fresh line.
        io.write(`${HIDE_CURSOR}${atPrompt ? '\n' : ''}`);
        io.subscribe(handleChunk);
        if (process.stdout.isTTY) {
          process.stdout.on('resize', onResize);
        }
      }
      render();
      return new Promise<void>((resolve) => {
        resolveClosed = resolve;
      });
    },
  };
}
