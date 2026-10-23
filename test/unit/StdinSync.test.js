import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

/**
 * The shared synchronous stdin reader (src/utils/StdinSync.ts). Once anything
 * in the process touches `process.stdin`, fd 0 is non-blocking and a plain
 * `readSync(0)` throws EAGAIN whenever no data has arrived yet: at a prompt
 * because the user has not typed (frodo-cli#887), on a pipe because the
 * producer is slower than the CLI (`config-manager push raw --stdin`). The
 * real-CLI proof lives in MfaPrompt.pty.test.js and
 * ConfigManagerPushRawStdin.test.js; these tests pin the read semantics.
 */
const readSync = jest.fn();
jest.unstable_mockModule('node:fs', () => ({ readSync }));
const { readStdinChunkSync, readStdinToEndSync } =
  await import('../../src/utils/StdinSync.ts');

const errno = (code) => Object.assign(new Error(`${code}: mocked`), { code });
/** A readSync step that delivers `data` (a string or Buffer). */
const deliver = (data) => (_fd, buffer) => {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
  bytes.copy(buffer);
  return bytes.length;
};
const throwing = (code) => () => {
  throw errno(code);
};

let waitSpy;
beforeEach(() => {
  readSync.mockReset();
  // Never really sleep.
  waitSpy = jest.spyOn(Atomics, 'wait').mockReturnValue('timed-out');
});
afterEach(() => {
  waitSpy.mockRestore();
});

describe('readStdinChunkSync', () => {
  it('reads fd 0 into the buffer and returns the byte count', () => {
    readSync.mockImplementationOnce(deliver('abc'));
    const buffer = Buffer.alloc(16);
    expect(readStdinChunkSync(buffer)).toBe(3);
    expect(buffer.subarray(0, 3).toString()).toBe('abc');
    expect(readSync).toHaveBeenCalledWith(0, buffer, 0, 16, null);
  });

  it('treats EAGAIN as "no input yet": waits 20 ms and asks again, never spinning', () => {
    readSync
      .mockImplementationOnce(throwing('EAGAIN'))
      .mockImplementationOnce(throwing('EAGAIN'))
      .mockImplementationOnce(deliver('late'));
    expect(readStdinChunkSync(Buffer.alloc(16))).toBe(4);
    expect(readSync).toHaveBeenCalledTimes(3);
    expect(waitSpy).toHaveBeenCalledTimes(2);
    expect(waitSpy).toHaveBeenCalledWith(expect.any(Int32Array), 0, 0, 20);
  });

  it('returns 0 at end of input', () => {
    readSync.mockImplementationOnce(() => 0);
    expect(readStdinChunkSync(Buffer.alloc(16))).toBe(0);
  });

  it('maps an EOF error (a closed pipe on Windows) to end of input', () => {
    readSync.mockImplementationOnce(throwing('EOF'));
    expect(readStdinChunkSync(Buffer.alloc(16))).toBe(0);
    expect(waitSpy).not.toHaveBeenCalled();
  });

  it('does not swallow other errors', () => {
    readSync.mockImplementationOnce(throwing('EIO'));
    expect(() => readStdinChunkSync(Buffer.alloc(16))).toThrow('EIO');
    expect(readSync).toHaveBeenCalledTimes(1);
    expect(waitSpy).not.toHaveBeenCalled();
  });
});

describe('readStdinToEndSync', () => {
  it('returns everything up to end of input, across several reads', () => {
    readSync
      .mockImplementationOnce(deliver('{"a":'))
      .mockImplementationOnce(deliver('1}'))
      .mockImplementationOnce(() => 0);
    expect(readStdinToEndSync()).toBe('{"a":1}');
    expect(readSync).toHaveBeenCalledTimes(3);
  });

  it('waits for a producer that is slower than the CLI, before the first byte and between chunks', () => {
    readSync
      .mockImplementationOnce(throwing('EAGAIN'))
      .mockImplementationOnce(throwing('EAGAIN'))
      .mockImplementationOnce(deliver('first,'))
      .mockImplementationOnce(throwing('EAGAIN'))
      .mockImplementationOnce(deliver('second'))
      .mockImplementationOnce(() => 0);
    expect(readStdinToEndSync()).toBe('first,second');
    expect(waitSpy).toHaveBeenCalledTimes(3);
  });

  it('ends on EAGAIN followed by end of input', () => {
    readSync
      .mockImplementationOnce(deliver('data'))
      .mockImplementationOnce(throwing('EAGAIN'))
      .mockImplementationOnce(() => 0);
    expect(readStdinToEndSync()).toBe('data');
  });

  it('ends on an EOF error code as it does on a 0 return', () => {
    readSync
      .mockImplementationOnce(deliver('data'))
      .mockImplementationOnce(throwing('EOF'));
    expect(readStdinToEndSync()).toBe('data');
  });

  it('returns an empty string for empty input', () => {
    readSync.mockImplementationOnce(() => 0);
    expect(readStdinToEndSync()).toBe('');
  });

  it('reads input larger than one chunk without losing or reordering bytes', () => {
    const total = 300 * 1024 + 123;
    const source = Buffer.alloc(total);
    for (let i = 0; i < total; i++) source[i] = 97 + (i % 26);
    let offset = 0;
    readSync.mockImplementation((_fd, buffer) => {
      const n = Math.min(buffer.length, total - offset);
      source.copy(buffer, 0, offset, offset + n);
      offset += n;
      return n;
    });
    const text = readStdinToEndSync();
    expect(text.length).toBe(total);
    expect(text).toBe(source.toString('utf8'));
    // More than one 64 KiB chunk was needed.
    expect(readSync.mock.calls.length).toBeGreaterThan(4);
  });

  it('decodes once at the end: a multi-byte character split across two reads stays intact', () => {
    const bytes = Buffer.from('café ☃', 'utf8'); // é is 2 bytes, the snowman 3
    const cut = 4; // inside the two bytes of é
    readSync
      .mockImplementationOnce(deliver(bytes.subarray(0, cut)))
      .mockImplementationOnce(deliver(bytes.subarray(cut, cut + 4)))
      .mockImplementationOnce(deliver(bytes.subarray(cut + 4)))
      .mockImplementationOnce(() => 0);
    expect(readStdinToEndSync()).toBe('café ☃');
  });

  it('propagates a real error instead of returning partial data', () => {
    readSync
      .mockImplementationOnce(deliver('partial'))
      .mockImplementationOnce(throwing('EIO'));
    expect(() => readStdinToEndSync()).toThrow('EIO');
  });
});
