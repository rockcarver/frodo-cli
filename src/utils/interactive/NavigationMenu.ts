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

export type NavigationMenuItem = {
  /** The key labels, e.g. '↑↓' or 'enter'. */
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
  /** The -> hint, e.g. '3 options to configure' (segments exist). */
  right?: string;
  /** A <- segment exists (the editor's back navigation). */
  left?: boolean;
  /** The prompt has a filterable list (type-to-search applies). */
  filter?: boolean;
  /** esc backs out (always true for our escapable prompts). */
  escape?: string;
}): NavigationMenuItem[] {
  const items: NavigationMenuItem[] = [];
  items.push({ keys: '↑↓', action: 'move', intent: 'muted' });
  if (options.filter) {
    items.push({ keys: 'type', action: 'filter', intent: 'muted' });
  }
  if (options.space) {
    items.push({ keys: 'space', action: options.space, intent: 'muted' });
  }
  if (options.enter) {
    items.push({ keys: 'enter', action: options.enter, intent: 'positive' });
  }
  if (options.right) {
    items.push({ keys: '→', action: options.right, intent: 'command' });
  }
  if (options.left) {
    items.push({ keys: '←', action: 'back', intent: 'command' });
  }
  items.push({
    keys: 'esc',
    action: options.escape ?? 'back out',
    intent: 'negative',
  });
  return items;
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
 * One framed box renderer for all prompt-frame furniture (the Navigate
 * menu, the inline value editor's Value box): the title, the body lines
 * (pre-colored), and the width the frame is drawn at -- so every box in
 * a frame shares the same silhouette and the same wrap/measure
 * discipline (ANSI excluded from every measurement).
 */
export function renderFramedBox(options: {
  title: string;
  /** Body lines, already colored; measured on their plain text. */
  lines: { text: string; plain: string }[];
  width?: number;
}): string {
  const { title, lines } = options;
  const width = options.width ?? 120;
  const PADDING = 1;
  const BORDER = 2;
  const innerWidth = Math.max(10, width - BORDER - PADDING * 2);
  const top = `┌${title}${'─'.repeat(Math.max(0, innerWidth + PADDING * 2 - title.length))}┐`;
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
  width = 120
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
  const PADDING = 1; // one space inside each border
  const BORDER = 2; // the │ ... │ walls
  const innerWidth = Math.max(10, width - BORDER - PADDING * 2);

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

  const title = ' Navigate ';
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
