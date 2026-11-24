import http from 'http';

/**
 * A small proxy in front of the fake AM of test/utils/FakeAm.mjs for the tests of the raw
 * configuration commands (`config-manager pull raw` and `push raw`). The fake AM serves the
 * login and the server information; this proxy serves the raw paths of the tenant
 * (`/openidm/config/...`, `/am/json/...`, `/environment/...`) from a map, takes writes to them,
 * and records every request WITH its `Accept-API-Version` header, which the request log of the
 * fake AM does not keep. Everything else goes to the fake AM unchanged.
 *
 * Run it in the process of the test: the CLI under test is a child process, so the event loop of
 * the test is free to answer.
 *
 * @param {object} options
 * @param {number} options.upstreamPort the port of the fake AM
 * @param {Record<string, object>} options.routes the objects served on a GET of a path (the path
 * without query), and accepted on a PUT of the same path
 * @param {string[]} [options.failPaths] paths that answer a GET with HTTP 500
 * @returns {Promise<{ port: number, stop: () => Promise<void>, requests: () => object[], tenantRequests: () => object[] }>}
 */
export async function startRawProxy({ upstreamPort, routes, failPaths = [] }) {
  const log = [];
  const failing = new Set(failPaths);
  const has = (pathname) => Object.hasOwn(routes, pathname);
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const pathname = req.url.split('?')[0];
      log.push({
        method: req.method,
        url: req.url,
        pathname,
        acceptApiVersion: req.headers['accept-api-version'] ?? null,
        body,
        raw: has(pathname) || failing.has(pathname),
      });
      const reply = (status, payload) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      if (req.method === 'GET' && failing.has(pathname)) {
        return reply(500, {
          code: 500,
          reason: 'Internal Server Error',
          message: `the fake tenant refuses ${pathname}`,
        });
      }
      if (req.method === 'GET' && has(pathname)) {
        return reply(200, routes[pathname]);
      }
      if (req.method === 'PUT' && has(pathname)) {
        return reply(200, body ? JSON.parse(body) : {});
      }
      const upstream = http.request(
        {
          host: '127.0.0.1',
          port: upstreamPort,
          path: req.url,
          method: req.method,
          headers: req.headers,
        },
        (answer) => {
          res.writeHead(answer.statusCode, answer.headers);
          answer.pipe(res);
        }
      );
      upstream.on('error', (error) => {
        res.writeHead(502);
        res.end(String(error));
      });
      upstream.end(body);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    /** Every request that reached the proxy, in order. */
    requests: () => log,
    /** The requests for the raw paths of the tenant: the reads and the writes of the commands under test. */
    tenantRequests: () => log.filter((request) => request.raw),
    stop: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
