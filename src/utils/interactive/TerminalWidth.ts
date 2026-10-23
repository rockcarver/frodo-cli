import { useEffect, useState } from '@inquirer/core';
import { DEFAULT_FRAME_WIDTH } from './NavigationMenu';

/** The narrowest frame drawn: below this the walls, titles and key hints stop making sense. */
export const MIN_FRAME_WIDTH = 40;

/**
 * The width prompt frames are drawn at: the terminal's own columns (never
 * below {@link MIN_FRAME_WIDTH}) when stdout is a TTY that reports them,
 * the 120-column default otherwise (pipes, CI, the PTY tests).
 */
export function terminalFrameWidth(): number {
  return process.stdout.isTTY && process.stdout.columns
    ? Math.max(MIN_FRAME_WIDTH, process.stdout.columns)
    : DEFAULT_FRAME_WIDTH;
}

/**
 * The frame width as prompt state: read once when the prompt opens, then
 * re-read on every terminal resize (the prompt re-renders at the new
 * width) -- the listener is removed again when the prompt closes. Call it
 * from a prompt's render function like any inquirer hook, and pass the
 * result as `width` to `renderNavigationMenu` / `renderFramedBox` and
 * derive inner widths with `frameInnerWidth(width)`.
 */
export function useTerminalWidth(): number {
  const [width, setWidth] = useState(terminalFrameWidth);
  useEffect(() => {
    const onResize = () => setWidth(terminalFrameWidth());
    process.stdout.on('resize', onResize);
    return () => {
      process.stdout.off('resize', onResize);
    };
  }, []);
  return width;
}
