import c from '../ColorTheme';

/**
 * The navigation menu (docs/INTERACTIVE-COMMANDS.md): a framed box at
 * the TOP of every prompt frame, so the user reads the available keys
 * BEFORE the question. Only keys that apply to the current prompt
 * appear, each rendered in its theme color -- the visual grammar:
 *
 * - movement (up/down, and space/enter in multi-selects) -- `muted`
 *   (always available, so it reads as furniture, not news);
 * - the segment keys (-> where a hint arms it, <- in the editor) --
 *   `command` (the navigation actions worth spotting);
 * - conclude (enter in single-selects, space+enter in multi-selects) --
 *   `positive` (the committing action);
 * - exit (esc) -- `negative` (the backing-out action).
 *
 * Zero-import aside from the theme (same constraint as EditableOptions):
 * every prompt module renders this, so it must not drag frodo-lib
 * graphs into tests that mock frodo-lib wholesale.
 */

/**
 * The direction keys as the bar draws them: Unicode medium triangles
 * (heavier than the slim arrows, no arrow shaft), shown in [] like every
 * key label.
 */
const DIRECTION_KEYS = { upDown: '⏶⏷', left: '⏴', right: '⏵' } as const;

export type NavigationMenuItem = {
  /** The key labels, in [] (key notation), e.g. '[⏶⏷]' or '[ENTER]'. */
  keys: string;
  /** What the keys do, e.g. 'move'. */
  action: string;
  /** The theme intent the item renders in. */
  intent: 'muted' | 'command' | 'positive' | 'negative';
};

/**
 * Builds the menu items for one prompt frame from the affordances it
 * actually has -- callers pass what applies; absent keys simply don't
 * render (silence = that key does nothing here, the same "counted,
 * truthful" discipline the -> hint follows).
 */
export function navigationMenuItems(options: {
  /** space toggles (multi-selects only). */
  space?: string;
  /** enter concludes (the label varies: 'conclude', 'commit'). */
  enter?: string;
  /** The -> hint, e.g. '3 options' (segments exist). */
  right?: string;
  /** A <- segment exists (the editor's back navigation). */
  left?: boolean;
  /** The prompt has a filterable list (type-to-search applies). */
  filter?: boolean;
  /** esc backs out (always true for our escapable prompts). */
  escape?: string;
}): NavigationMenuItem[] {
  const items: NavigationMenuItem[] = [];
  items.push({
    keys: `[${DIRECTION_KEYS.upDown}]`,
    action: 'move',
    intent: 'muted',
  });
  if (options.filter) {
    items.push({ keys: 'type', action: 'to filter', intent: 'muted' });
  }
  if (options.space) {
    items.push({ keys: '[space]', action: options.space, intent: 'muted' });
  }
  if (options.enter) {
    items.push({
      keys: '[ENTER]',
      action: options.enter,
      intent: 'positive',
    });
  }
  if (options.right) {
    items.push({
      keys: `[${DIRECTION_KEYS.right}]`,
      action: options.right,
      intent: 'command',
    });
  }
  if (options.left) {
    items.push({
      keys: `[${DIRECTION_KEYS.left}]`,
      action: 'back',
      intent: 'command',
    });
  }
  items.push({
    keys: '[ESC]',
    action: options.escape ?? 'back out',
    intent: 'negative',
  });
  return items;
}

/**
 * The status-title convention for the live dashboards (the debug
 * prompts): a `heading` main label followed by muted suffixes carrying
 * the ambient state -- '(3 tracked)', '[filter label]',
 * '(volker-dev · alpha)'. Returns the {text, plain} pair
 * `renderFramedBox` wants as its title: text is what draws, plain
 * mirrors it ANSI-free (the suffixes' brackets/parens belong to the
 * caller, so the composition stays verbatim).
 */
export function frameStatusTitle(
  main: string,
  suffixes: string[] = []
): { text: string; plain: string } {
  return {
    text: [c.heading(main), ...suffixes.map((s) => c.muted(s))].join(' '),
    plain: [main, ...suffixes].join(' '),
  };
}

const INTENT_COLOR: Record<
  NavigationMenuItem['intent'],
  (text: string) => string
> = {
  muted: (text) => c.muted(text),
  command: (text) => c.command(text),
  positive: (text) => c.positive(text),
  negative: (text) => c.negative(text),
};

/**
 * The ANSI-stripped width input for the box math: every SGR sequence
 * (ESC [ ... m) carries no cells, everything the frames render is plain
 * UTF-8 or SGR -- the same assumption the wall alignment already makes.
 */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex -- the control character IS the point
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/** The columns every frame is drawn at unless the caller says otherwise. */
const DEFAULT_FRAME_WIDTH = 120;
const FRAME_BORDER = 2; // the │ ... │ walls
const FRAME_PADDING = 1; // one space inside each border

/**
 * The text width available INSIDE a frame drawn at `width` columns --
 * the one place the wall + padding math lives, so box renderers and the
 * wrappers feeding them can never disagree about where the wall is.
 */
export function frameInnerWidth(width = DEFAULT_FRAME_WIDTH): number {
  return Math.max(10, width - FRAME_BORDER - FRAME_PADDING * 2);
}

/**
 * Word-wraps text to `width` columns (ANSI stripped first, so the measured
 * text is the drawn text). Line breaks (LF, CRLF, CR) start a new logical
 * line and tabs become four spaces, so log text, stack traces and other
 * raw tenant strings can never carry a control character into a frame;
 * blank lines and each line's own indentation survive. Within a logical
 * line, spacing between words is kept (aligned "key:   text" columns
 * survive a wrap), leading indentation repeats on continuation rows, and a
 * word longer than a whole row is hard-split rather than pushed through
 * the right wall. Always returns at least one row.
 */
export function wrapLine(line: string, width: number): string[] {
  return stripAnsi(line)
    .replace(/\t/g, '    ')
    .trimEnd()
    .split(/\r\n|\r|\n/)
    .flatMap((logicalLine) => wrapLogicalLine(logicalLine, width));
}

/** The word-wrap for ONE logical line (no line breaks, no tabs, no ANSI). */
function wrapLogicalLine(line: string, width: number): string[] {
  // An indent as wide as the row leaves no room for text: drop it rather
  // than hard-split every word into single characters.
  const trimmed = line.trimEnd();
  const text =
    (/^\s*/.exec(trimmed)?.[0].length ?? 0) >= width
      ? trimmed.trimStart()
      : trimmed;
  if (text.length <= width) return [text];
  const indent = /^\s*/.exec(text)?.[0] ?? '';
  const room = Math.max(1, width - indent.length);
  const rows: string[] = [];
  let current = '';
  for (const chunk of text.slice(indent.length).match(/\S+\s*/g) ?? []) {
    let piece = chunk;
    while (piece.trimEnd().length > room) {
      if (current) {
        rows.push(indent + current.trimEnd());
        current = '';
      }
      rows.push(indent + piece.slice(0, room));
      piece = piece.slice(room);
    }
    if (current && current.length + piece.trimEnd().length > room) {
      rows.push(indent + current.trimEnd());
      current = piece;
    } else {
      current += piece;
    }
  }
  if (current.trim()) rows.push(indent + current.trimEnd());
  return rows.length > 0 ? rows : [''];
}

/**
 * A highlighted entry's description as muted panel rows, wrapped to the
 * frame so a long description can never push past the right wall (a
 * multi-line description keeps its own line breaks; each line wraps on
 * its own).
 */
export function descriptionPanelLines(
  description: string,
  width = DEFAULT_FRAME_WIDTH
): { text: string; plain: string }[] {
  const inner = frameInnerWidth(width);
  return description
    .split('\n')
    .flatMap((row) => wrapLine(row, inner))
    .map((row) => ({ text: c.muted(row), plain: row }));
}

/**
 * One body row, made safe for the frame: a row that fits and carries no
 * control character is returned as is; otherwise the drawn text is
 * re-wrapped to `innerWidth` (see `wrapLine`) into plain rows.
 */
function fitFrameRow(
  line: { text: string; plain: string },
  innerWidth: number
): { text: string; plain: string }[] {
  const drawn = stripAnsi(line.text);
  if (
    !/[\r\n\t]/.test(drawn) &&
    drawn.length <= innerWidth &&
    line.plain.length <= innerWidth
  ) {
    return [line];
  }
  return wrapLine(drawn, innerWidth).map((row) => ({ text: row, plain: row }));
}

/**
 * One framed box renderer for all prompt-frame furniture (the Navigate
 * menu, every prompt's question+list panel, the inline value editor's
 * Value box): the title (a plain string, or a {text, plain} pair when it
 * carries colored content -- e.g. the question line with its prefix and
 * query echo), the body lines (pre-colored), and the width the frame is
 * drawn at -- so every box in a frame shares the same silhouette and the
 * same wrap/measure discipline (ANSI excluded from every measurement).
 *
 * The {text, plain} pair exists for ONE historical reason -- the query
 * echo used to be conditional on the caller's search configuration, so
 * the colored and measured forms could diverge (the bare-stub picker's
 * panel top wall came out short by the query's length: the renderer
 * drew to a text WITHOUT the echo, the walls measured a plain WITH it).
 * The renderer now measures the title on stripAnsi(title.text) itself,
 * so the pair is belt-and-braces: callers may still pass plain for
 * clarity, but a divergent plain can no longer skew the walls.
 *
 * No input can break the silhouette: a title wider than the top bar is cut
 * with an ellipsis, and a body row that carries a line break or tab, or is
 * wider than the box, is re-wrapped to rows that fit (plain -- a wrapped
 * row cannot keep its colors). A row that already fits passes through
 * untouched, colors included.
 */
export function renderFramedBox(options: {
  title: string | { text: string; plain: string };
  /** Body lines, already colored; measured on their plain text. */
  lines: { text: string; plain: string }[];
  width?: number;
}): string {
  const width = options.width ?? DEFAULT_FRAME_WIDTH;
  const PADDING = FRAME_PADDING;
  const innerWidth = frameInnerWidth(width);
  const lines = options.lines.flatMap((line) => fitFrameRow(line, innerWidth));
  const givenTitle =
    typeof options.title === 'string' ? { text: options.title } : options.title;
  const title =
    stripAnsi(givenTitle.text).length > innerWidth
      ? {
          text: `${stripAnsi(givenTitle.text).slice(0, innerWidth - 1)}…`,
        }
      : givenTitle;
  // One space between wall and title content on both sides -- the
  // Navigate menu's ' Navigate ' convention, applied to every box.
  // Measured on the STRIPPED TEXT: one source of truth, the walls can
  // never drift from what is drawn.
  const titleText = ` ${title.text} `;
  const titlePlain = ` ${stripAnsi(title.text)} `;
  const top = `┌${titleText}${'─'.repeat(Math.max(0, innerWidth + PADDING * 2 - titlePlain.length))}┐`;
  const bottom = `└${'─'.repeat(innerWidth + PADDING * 2)}┘`;
  const body = lines
    .map((line) => {
      const pad = ' '.repeat(Math.max(0, innerWidth - line.plain.length));
      return `│ ${line.text}${pad} │`;
    })
    .join('\n');
  return `${top}\n${body}\n${bottom}`;
}

/**
 * Renders the framed box, wrapped to `width` columns (the prompt frames
 * live in a real terminal -- the PTY pins 120; the box respects the
 * caller's width so narrow terminals wrap the ITEMS, not the border).
 * Returns '' when there are no items.
 */
export function renderNavigationMenu(
  items: NavigationMenuItem[],
  width = DEFAULT_FRAME_WIDTH
): string {
  if (items.length === 0) return '';

  // Render item texts first (colored), then lay them out row by row --
  // rows break on DISPLAY width (ANSI excluded from the measurement).
  const rendered = items.map((item) => ({
    text: `${INTENT_COLOR[item.intent](item.keys)} ${c.muted(item.action)}`,
    plainWidth: item.keys.length + 1 + item.action.length,
    plain: `${item.keys} ${item.action}`,
  }));

  // Separator between items inside a row.
  const GAP = ' · ';
  const GAP_WIDTH = GAP.length;
  const innerWidth = frameInnerWidth(width);

  const rows: (typeof rendered)[] = [];
  let current: typeof rendered = [];
  let currentWidth = 0;
  for (const item of rendered) {
    const addition =
      current.length === 0 ? item.plainWidth : GAP_WIDTH + item.plainWidth;
    if (current.length > 0 && currentWidth + addition > innerWidth) {
      rows.push(current);
      current = [item];
      currentWidth = item.plainWidth;
    } else {
      current.push(item);
      currentWidth += addition;
    }
  }
  if (current.length > 0) rows.push(current);

  const title = 'Navigate';
  return renderFramedBox({
    title,
    lines: rows.map((row) => {
      const plainWidth = row.reduce(
        (sum, item, index) =>
          sum + item.plainWidth + (index > 0 ? GAP_WIDTH : 0),
        0
      );
      const pad = ' '.repeat(Math.max(0, innerWidth - plainWidth));
      return {
        text: `${row.map((item) => item.text).join(GAP)}${pad}`,
        plain: `${row.map((item) => item.plain).join(GAP)}${pad}`,
      };
    }),
    width,
  });
}
