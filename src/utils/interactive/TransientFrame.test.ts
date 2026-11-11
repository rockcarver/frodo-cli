import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import {
  clearTransientFrame,
  rowsOf,
  showTransientFrame,
  transientFrameShown,
  whileShowing,
} from './TransientFrame';

describe('rowsOf', () => {
  it('counts one row per line', () => {
    expect(rowsOf('a\nb\nc', 80)).toBe(3);
    expect(rowsOf('a', 80)).toBe(1);
  });

  it('counts a blank line as a row', () => {
    expect(rowsOf('a\n\nb', 80)).toBe(3);
  });

  it('counts the rows a line wider than the terminal wraps to', () => {
    expect(rowsOf('x'.repeat(25), 10)).toBe(3);
    expect(rowsOf('x'.repeat(10), 10)).toBe(1);
    expect(rowsOf(`${'x'.repeat(10)}\n${'y'.repeat(11)}`, 10)).toBe(3);
  });

  it('measures what is seen, not the color codes', () => {
    expect(rowsOf(`\x1b[32m${'x'.repeat(10)}\x1b[0m`, 10)).toBe(1);
  });
});

describe('the transient frame', () => {
  let written: string[];
  let write: jest.SpiedFunction<typeof process.stdout.write>;

  beforeEach(() => {
    written = [];
    write = jest.spyOn(process.stdout, 'write').mockImplementation(((
      text: string
    ) => {
      written.push(text);
      return true;
    }) as typeof process.stdout.write);
    Object.defineProperty(process.stdout, 'columns', {
      configurable: true,
      value: 40,
    });
  });

  afterEach(() => {
    clearTransientFrame();
    write.mockRestore();
    delete (process.stdout as { columns?: number }).columns;
  });

  it('draws the frame and remembers that it is on the screen', () => {
    showTransientFrame('one\ntwo');
    expect(transientFrameShown()).toBe(true);
    expect(written.join('')).toContain('one\ntwo');
  });

  it('erases exactly the rows it drew, then puts the cursor back', () => {
    showTransientFrame('one\ntwo\nthree');
    written.length = 0;
    clearTransientFrame();
    const erase = written.join('');
    // three rows: erase, up, erase, up, erase, then the cursor to column 0
    expect(erase.match(/\x1b\[2K/g)).toHaveLength(3);
    expect(erase.match(/\x1b\[1A/g)).toHaveLength(2);
    expect(erase).toContain('\x1b[G');
    expect(transientFrameShown()).toBe(false);
  });

  it('counts a wrapped row', () => {
    showTransientFrame(`${'x'.repeat(100)}\nend`);
    written.length = 0;
    clearTransientFrame();
    // 100 columns on a 40-column terminal take 3 rows, plus the last line
    expect(written.join('').match(/\x1b\[2K/g)).toHaveLength(4);
  });

  it('writes nothing when no frame is shown, so every writer can call it first', () => {
    clearTransientFrame();
    expect(written).toEqual([]);
    expect(transientFrameShown()).toBe(false);
  });

  it('replaces a frame that is shown: the first is erased before the second is drawn', () => {
    showTransientFrame('first');
    written.length = 0;
    showTransientFrame('second');
    const all = written.join('');
    expect(all.indexOf('\x1b[2K')).toBeGreaterThan(-1);
    expect(all.indexOf('\x1b[2K')).toBeLessThan(all.indexOf('second'));
  });
});

describe('whileShowing', () => {
  let write: jest.SpiedFunction<typeof process.stdout.write>;

  beforeEach(() => {
    write = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((() => true) as typeof process.stdout.write);
  });

  afterEach(() => {
    clearTransientFrame();
    write.mockRestore();
  });

  it('shows the frame while the work runs and takes it away when the work is over', async () => {
    let shownDuring: boolean | undefined;
    const result = await whileShowing('Logging in...', async () => {
      shownDuring = transientFrameShown();
      return 'done';
    });
    expect(shownDuring).toBe(true);
    expect(result).toBe('done');
    expect(transientFrameShown()).toBe(false);
  });

  it('takes the frame away when the work throws, and passes the error on', async () => {
    await expect(
      whileShowing('Logging in...', async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(transientFrameShown()).toBe(false);
  });

  it('erases nothing at the end when the work took the frame away itself', async () => {
    await whileShowing('Logging in...', async () => {
      clearTransientFrame();
      write.mockClear();
    });
    expect(write).not.toHaveBeenCalled();
  });
});
