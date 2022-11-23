import cp from 'child_process';
import { promisify } from 'util';
import {
  crudeMultilineTakeUntil,
  collapseWhitespace,
  node14Compatibility,
} from '../utils/utils.js';

node14Compatibility();

const exec = promisify(cp.exec);
const CMD = 'frodo logs fetch --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'logs fetch' Usage should be expected english", async () => {
  // Arrange
  const expected = `
  Usage: frodo logs fetch [options] <host> [user] [password]
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('Usage:'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'logs fetch' description at line 2 should be expected english", async () => {
  // Arrange
  const expected = `
        Fetch Identity Cloud logs between a specified begin and end time period. WARNING: depending on filters and time period specified, this could take substantial time to complete.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .map((line) => line.trim())
    .at(2);
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'fetch argument host' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  host                         Access Management base URL, e.g.: https://cdk.iam.example.com/am. To use a connection profile, just
  specify a unique substring.
    `).trim();
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  host                         ',
      '  user                         '
    )
  );
  // Assert
  expect(collapseWhitespace(testLine)).toBe(expected);
});

test("CLI help interface 'fetch argument key' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  user                         Username to login with. Must be an admin user with appropriate rights to manage authentication
  journeys/trees.
    `).trim();
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  user                         ',
      '  password                     '
    )
  );
  // Assert
  expect(collapseWhitespace(testLine)).toBe(expected);
});

test("CLI help interface 'fetch argument secret' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  password                     Password.
    `).trim();
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  password                     ',
      'Options:'
    )
  );
  // Assert
  expect(collapseWhitespace(testLine)).toBe(expected);
});

test("CLI help interface 'fetch option -k, --insecure' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  -k, --insecure Allow insecure connections when using SSL/TLS. Has no effect when using a network proxy for https (HTTPS_PROXY=http://<host>:<port>), in that case the proxy must provide this capability. (default: Don't allow insecure connections)
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -k, --insecure           ',
      '  --verbose                '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'fetch option --verbose' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  --verbose                        Verbose output during command execution. If specified, may or may not produce additional output.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  --verbose                        ',
      '  --debug                          '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'fetch option --debug' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  --debug                          Debug output during command execution. If specified, may or may not produce additional output helpful for troubleshooting.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  --debug                          ',
      '  --curlirize                      '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'fetch option --curlirize' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
    --curlirize                      Output all network calls in curl format.
      `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  --curlirize                      ',
      '  -c, --sources <sources>          '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'fetch option -c, --sources <sources>' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
    -c, --sources <sources> Comma separated list of log sources (default: Log everything)
      `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -c, --sources <sources>',
      '  -l, --level <level>    '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'fetch option -t, --transaction-id' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
    -t, --transaction-id <txid> Filter by transactionId
      `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -t, --transaction-id <txid>      ',
      '  -b, --begin-timestamp <beginTs>  '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'fetch option -b, --begin-timestamp' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  -b, --begin-timestamp <beginTs>  Begin timestamp for period (in ISO8601, example: "2022-10-13T19:06:28Z", or "2022-09.30". Cannot be more than
  30 days in the past. If not specified, logs from one hour ago are fetched (-e is ignored)
        `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -b, --begin-timestamp <beginTs>  ',
      '  -e, --end-timestamp <endTs>      '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'fetch option -e, --end-timestamp' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
    -e, --end-timestamp <endTs> End timestamp for period. Default: "now"
          `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -e, --end-timestamp <endTs>      ',
      '  -s, --search-string <ss>         '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'fetch option -s, --search-string' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        -s, --search-string <ss> Filter by a specific string (ANDed with transactionID filter)
            `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -s, --search-string <ss>         ',
      '  -d, --defaults                   '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'fetch option -d, --defaults' description should be expected english multiline", async () => {
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -d, --defaults                   ',
      '  -h, --help                       '
    )
  );

  // Assert
  expect(testLine).toMatch(
    /-d, --defaults Use default logging noise filters \(default: Use custom logging noise filters defined in (\w|\/|\.)+\)/gm
  );
});
