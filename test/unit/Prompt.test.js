import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

/**
 * `question()` (src/utils/Prompt.ts): the synchronous prompt behind the MFA
 * code. Once anything in the process touches `process.stdin`, fd 0 is
 * non-blocking and a plain `readSync(0)` throws EAGAIN until the user has
 * typed (frodo-cli#887). The real-terminal proof lives in
 * MfaPrompt.pty.test.js; these tests pin the retry semantics.
 */
const readSync = jest.fn();
jest.unstable_mockModule('node:fs', () => ({ readSync }));
const { question } = await import('../../src/utils/Prompt.ts');

const errno = (code) => Object.assign(new Error(`${code}: mocked`), { code });
const answer = (text) => (_fd, buffer) => {
  const bytes = Buffer.from(text);
  bytes.copy(buffer);
  return bytes.length;
};

let waitSpy;
let writeSpy;
beforeEach(() => {
  readSync.mockReset();
  // Don't really sleep, and don't print the prompt into the test output.
  waitSpy = jest.spyOn(Atomics, 'wait').mockReturnValue('timed-out');
  writeSpy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
});
afterEach(() => {
  waitSpy.mockRestore();
  writeSpy.mockRestore();
});

describe('question', () => {
  it('prints the question and returns the line without its line break', () => {
    readSync.mockImplementationOnce(answer('123456\n'));
    expect(question('Enter verification code: ')).toBe('123456');
    expect(writeSpy).toHaveBeenCalledWith('Enter verification code: ');
    expect(readSync).toHaveBeenCalledWith(0, expect.any(Buffer), 0, 1024, null);
  });

  it('strips a CRLF line break too', () => {
    readSync.mockImplementationOnce(answer('123456\r\n'));
    expect(question('')).toBe('123456');
  });

  it('treats EAGAIN as "no input yet": waits and asks again until the line arrives', () => {
    readSync
      .mockImplementationOnce(() => {
        throw errno('EAGAIN');
      })
      .mockImplementationOnce(() => {
        throw errno('EAGAIN');
      })
      .mockImplementationOnce(answer('654321\n'));
    expect(question('code: ')).toBe('654321');
    expect(readSync).toHaveBeenCalledTimes(3);
    // It sleeps between tries (never a busy loop).
    expect(waitSpy).toHaveBeenCalledTimes(2);
    expect(waitSpy).toHaveBeenCalledWith(expect.any(Int32Array), 0, 0, 20);
  });

  it('does not swallow other errors', () => {
    readSync.mockImplementationOnce(() => {
      throw errno('EIO');
    });
    expect(() => question('code: ')).toThrow('EIO');
    expect(readSync).toHaveBeenCalledTimes(1);
    expect(waitSpy).not.toHaveBeenCalled();
  });

  it('returns an empty answer at end of input', () => {
    readSync.mockImplementationOnce(() => 0);
    expect(question('code: ')).toBe('');
  });
});
