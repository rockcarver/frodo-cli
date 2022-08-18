import cp from 'child_process';
import { promisify } from 'util';
import { crudeMultilineTakeUntil, collapseWhitespace } from '../utils/utils.js';

const exec = promisify(cp.exec);
const CMD = 'frodo logs tail --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'logs tail' Usage should be expected english", async () => {
  // Arrange
  const expected = `
        Usage: frodo logs tail [options] <host> [key] [secret]
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('Usage:'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'logs tail' description at line 2 should be expected english", async () => {
  // Arrange
  const expected = `
        Tail Identity Cloud logs.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .map((line) => line.trim())
    .at(2);
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'tail argument host' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        host                    Access Management base URL, e.g.:
                                https://cdk.iam.example.com/am. To use a connection profile,
                                just specify a unique substring.
    `).trim();
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  host                     ',
      '  key                      '
    )
  );
  // Assert
  expect(collapseWhitespace(testLine)).toBe(expected);
});

test("CLI help interface 'tail argument key' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        key             API key for logging API.
    `).trim();
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  key                      ',
      '  secret                   '
    )
  );
  // Assert
  expect(collapseWhitespace(testLine)).toBe(expected);
});

test("CLI help interface 'tail argument secret' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        secret          API secret for logging API.
    `).trim();
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(stdout, '  secret                   ', 'Options:')
  );
  // Assert
  expect(collapseWhitespace(testLine)).toBe(expected);
});

test("CLI help interface 'list option -k, --insecure' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        -k, --insecure  Allow insecure connections when using SSL/TLS
                        (default: Don't allow insecure connections)
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -k, --insecure           ',
      '  -c, --sources <sources>  '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'list option -c, --sources <sources>' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        -c, --sources <sources>  Comma separated list of log sources (default: Log
                                 everything)
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -c, --sources <sources>',
      '  -h, --help               '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});
