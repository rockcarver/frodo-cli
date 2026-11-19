import http from 'http';
import net from 'net';

/**
 * A forward proxy for tests, in this process, on a loopback port, that writes
 * down what the CLI asked it for. It speaks the two things a real proxy does:
 *
 * - a plain request for an `http://` target (`GET http://host:port/path`), which
 *   it forwards to the target, and
 * - `CONNECT host:port`, the tunnel an `https://` target is reached through,
 *   which it opens to the target and then only pipes bytes through, so what
 *   happens inside the tunnel stays invisible, as with a real proxy.
 *
 * It needs this process's event loop, so a test that uses it must run the CLI
 * with the asynchronous `child_process.spawn`, never `spawnSync`.
 *
 * @param {object} [options]
 * @param {string} [options.credentials] `user:password` the proxy demands as
 *   `Proxy-Authorization: Basic ...`; without them it answers 407 and logs the
 *   request all the same.
 * @returns {Promise<{
 *   port: number,
 *   requests: { kind: 'connect' | 'forward', target: string, line: string, absolute: boolean, authorization?: string }[],
 *   forwarded: () => string[],
 *   tunnels: () => string[],
 *   stop: () => Promise<void>,
 * }>}
 */
export async function startForwardProxy({ credentials } = {}) {
  const requests = [];
  const sockets = new Set();
  const expected = credentials
    ? `Basic ${Buffer.from(credentials).toString('base64')}`
    : undefined;
  const authorized = (req) =>
    !expected || req.headers['proxy-authorization'] === expected;

  const server = http.createServer((req, res) => {
    // A proxy gets an absolute-form line (`GET http://host:port/path`); a
    // request that arrives in origin-form (`GET /path`) is addressed by its
    // Host header, as a reused connection of a keep-alive agent does.
    const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(req.url);
    const url = new URL(req.url, `http://${req.headers.host}`);
    requests.push({
      kind: 'forward',
      target: url.host,
      line: `${req.method} ${url.pathname}${url.search}`,
      absolute,
      authorization: req.headers['proxy-authorization'],
    });
    if (!authorized(req)) {
      res.writeHead(407, { 'proxy-authenticate': 'Basic realm="test"' });
      return res.end();
    }
    const headers = { ...req.headers };
    delete headers['proxy-authorization'];
    delete headers['proxy-connection'];
    const upstream = http.request(
      {
        host: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: req.method,
        headers,
      },
      (answer) => {
        res.writeHead(answer.statusCode, answer.headers);
        answer.pipe(res);
      }
    );
    upstream.on('error', () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  });

  server.on('connect', (req, client, head) => {
    sockets.add(client);
    client.on('close', () => sockets.delete(client));
    client.on('error', () => {});
    requests.push({
      kind: 'connect',
      target: req.url,
      line: `CONNECT ${req.url}`,
      absolute: false,
      authorization: req.headers['proxy-authorization'],
    });
    if (!authorized(req)) {
      client.end(
        'HTTP/1.1 407 Proxy Authentication Required\r\n' +
          'Proxy-Authenticate: Basic realm="test"\r\n' +
          'Content-Length: 0\r\n\r\n'
      );
      return;
    }
    const [host, port] = req.url.split(':');
    const target = net.connect(Number(port), host, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) target.write(head);
      target.pipe(client);
      client.pipe(target);
    });
    sockets.add(target);
    target.on('close', () => sockets.delete(target));
    target.on('error', () => {
      client.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n');
    });
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    requests,
    /** `METHOD /path` of every request forwarded to a plain http target, in order. */
    forwarded: () =>
      requests.filter((r) => r.kind === 'forward').map((r) => r.line),
    /** `host:port` of every CONNECT tunnel that was asked for, in order. */
    tunnels: () =>
      requests.filter((r) => r.kind === 'connect').map((r) => r.target),
    stop: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

/** A loopback port nothing listens on: it was free a moment ago and is closed again. */
export async function closedPort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}
