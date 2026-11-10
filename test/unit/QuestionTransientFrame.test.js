import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, jest, test } from '@jest/globals';

/**
 * The synchronous question of the second factor (src/utils/Prompt.ts) reads the
 * terminal itself, so a frame that the connection page left on the screen while
 * the login runs (decision record 0046) has to be gone before the question is
 * written. The read of standard input is replaced; the screen is recorded.
 */
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);

jest.unstable_mockModule(path.resolve(root, 'src/utils/StdinSync'), () => ({
  readStdinChunkSync: (buffer) => buffer.write('123456\r\n'),
}));

const { question } = await import(path.resolve(root, 'src/utils/Prompt.ts'));
const { clearTransientFrame, showTransientFrame, transientFrameShown } =
  await import(path.resolve(root, 'src/utils/interactive/TransientFrame.ts'));

afterEach(() => {
  clearTransientFrame();
  jest.restoreAllMocks();
});

describe('question', () => {
  test('takes a frame that is on the screen away before it asks', () => {
    const written = [];
    jest.spyOn(process.stdout, 'write').mockImplementation((text) => {
      written.push(text);
      return true;
    });
    showTransientFrame('Logging in...');
    written.length = 0;

    const answer = question('Enter verification code: ');

    expect(transientFrameShown()).toBe(false);
    const erased = written.findIndex((text) => text.includes('\x1b[2K'));
    const asked = written.indexOf('Enter verification code: ');
    expect(erased).toBeGreaterThan(-1);
    expect(asked).toBeGreaterThan(erased);
    // the answer is what was typed, without the line break
    expect(answer).toBe('123456');
  });

  test('writes only the question when no frame is on the screen', () => {
    const written = [];
    jest.spyOn(process.stdout, 'write').mockImplementation((text) => {
      written.push(text);
      return true;
    });
    question('Code: ');
    expect(written).toEqual(['Code: ']);
  });
});
