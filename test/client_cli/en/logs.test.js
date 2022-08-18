import cp from 'child_process';
import { promisify } from 'util';
import { crudeMultilineTakeUntil, collapseWhitespace } from '../utils/utils.js';

const exec = promisify(cp.exec);
const CMD = 'frodo logs --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'logs' Usage should be expected english", async () => {
  // Arrange
  const expected = `
        Usage: frodo logs [options] [command] <host>
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('Usage:'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'logs' description at line 2 should be expected english", async () => {
  // Arrange
  const expected = `
        View Identity Cloud logs.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .map((line) => line.trim())
    .at(2);
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'logs argument host' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        host                                  Access Management base URL, e.g.: https://cdk.iam.example.com/am. To use a connection profile, just specify a unique substring.
    `).trim();
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  host                                  ',
      'Options:'
    )
  );
  // Assert
  expect(collapseWhitespace(testLine)).toBe(expected);
});

test("CLI help interface 'logs commands list' description should be expected english", async () => {
  // Arrange
  const expected = `
        list [options] <host> [key] [secret]  List available ID Cloud log sources.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('list'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'logs commands tail' description should be expected english", async () => {
  // Arrange
  const expected = `
        tail [options] <host> [key] [secret]  Tail Identity Cloud logs.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('tail'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});
