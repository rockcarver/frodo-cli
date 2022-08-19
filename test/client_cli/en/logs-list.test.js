import cp from 'child_process';
import { promisify } from 'util';
import { crudeMultilineTakeUntil, collapseWhitespace } from '../utils/utils.js';

const exec = promisify(cp.exec);
const CMD = 'frodo logs list --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'logs list' Usage should be expected english", async () => {
  // Arrange
  const expected = `
  Usage: frodo journey list [options] <host> [user] [password]
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('Usage:'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'logs list' description at line 2 should be expected english", async () => {
  // Arrange
  const expected = `
        List available ID Cloud log sources.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .map((line) => line.trim())
    .at(2);
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'list argument host' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  host            Access Management base URL, e.g.: https://cdk.iam.example.com/am. To use a connection profile, just specify a
  unique substring.
    `).trim();
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(stdout, '  host            ', '  user            ')
  );
  // Assert
  expect(collapseWhitespace(testLine)).toBe(expected);
});

test("CLI help interface 'list argument user' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  user            Username to login with. Must be an admin user with appropriate rights to manage authentication journeys/trees.
    `).trim();
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(stdout, '  user            ', '  password        ')
  );
  // Assert
  expect(collapseWhitespace(testLine)).toBe(expected);
});

test("CLI help interface 'tail argument password' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  password        Password.
    `).trim();
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(stdout, '  password        ', 'Options:')
  );
  // Assert
  expect(collapseWhitespace(testLine)).toBe(expected);
});
