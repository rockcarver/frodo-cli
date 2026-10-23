/**
 * Plain-text layout helpers shared by the interactive frames
 * (`src/utils/interactive`) and the ops formatters that feed them
 * (`src/ops`). Pure functions on plain strings: no ANSI handling, no
 * theme, and NO imports -- the ops layer may not import from
 * `utils/interactive`, so anything both layers need lives here, never in
 * a prompt file.
 */

/** Truncates to `max` chars with a trailing ellipsis, never silently -- the reader can always tell a value was cut. */
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Pads plain (uncolored) text to `width` -- callers must pad *before* wrapping in a color function, since ANSI escape codes count toward `.length` and would otherwise throw the padding math off. */
export function padCell(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

/** Collapses every run of whitespace (line breaks and tabs included) to one space. */
export function singleLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** The first non-blank line of a multi-line text, as one line (a stack trace's headline). */
export function firstLine(text: string): string {
  return singleLine(
    text.split(/\r\n|\r|\n/).find((line) => line.trim() !== '') ?? ''
  );
}
