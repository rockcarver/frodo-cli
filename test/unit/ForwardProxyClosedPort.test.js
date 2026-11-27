import net from 'node:net';
import { jest } from '@jest/globals';
import { closedPort } from '../utils/ForwardProxy.js';

/**
 * `closedPort` (test/utils/ForwardProxy.js) gives the tests a loopback port that refuses
 * connections: the dead proxy and the dead tenant of the proxy tests. Two of them in one
 * test must be two different ports, and a port that something listens on must never be one.
 */

/** Whether a connection to the loopback port is refused. */
const refuses = (port) =>
  new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', (error) => resolve(error.code === 'ECONNREFUSED'));
  });

/** A port that is free at this moment, found as the helper finds it. */
const freePort = async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('closedPort', () => {
  test('gives a port that refuses connections', async () => {
    const port = await closedPort();

    expect(port).toBeGreaterThan(0);
    await expect(refuses(port)).resolves.toBe(true);
  });

  test('gives a different port each time, also when the system offers the same one twice', async () => {
    const same = await freePort();
    const listen = net.Server.prototype.listen;
    let calls = 0;
    // the first two sockets are put on the same port, whatever the system would give
    jest
      .spyOn(net.Server.prototype, 'listen')
      .mockImplementation(function (port, ...rest) {
        calls++;
        return listen.call(this, calls <= 2 ? same : port, ...rest);
      });

    const first = await closedPort();
    const second = await closedPort();

    expect(first).toBe(same);
    expect(second).not.toBe(same);
    await expect(refuses(second)).resolves.toBe(true);
  });

  test('does not give a port that something has taken since it was closed', async () => {
    const close = net.Server.prototype.close;
    const takers = [];
    let taken;
    // the first socket of the helper lets go of its port, and another process takes the port before the helper looks at it
    jest
      .spyOn(net.Server.prototype, 'close')
      .mockImplementation(function (callback) {
        const { port } = this.address();
        return close.call(this, async () => {
          if (taken === undefined) {
            taken = port;
            const taker = net.createServer();
            takers.push(taker);
            await new Promise((resolve) => taker.listen(port, '127.0.0.1', resolve));
          }
          callback?.();
        });
      });

    try {
      const port = await closedPort();

      expect(taken).toBeDefined();
      expect(port).not.toBe(taken);
      await expect(refuses(port)).resolves.toBe(true);
    } finally {
      jest.restoreAllMocks();
      await Promise.all(takers.map((taker) => new Promise((resolve) => taker.close(resolve))));
    }
  });
});
