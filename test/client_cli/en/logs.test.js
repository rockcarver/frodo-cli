import cp from 'child_process';
import { promisify } from 'util';
import { node14Compatibility } from '../utils/utils.js';

node14Compatibility();

const exec = promisify(cp.exec);
const CMD = 'frodo logs --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'logs' Usage should be expected english", async () => {
  // Arrange
  const expected = `
  Usage: frodo logs [options] [command]
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
  View Identity Cloud logs. If valid tenant admin credentials are specified, a log API key and secret are automatically created for that admin user.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .map((line) => line.trim())
    .at(2);
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'logs commands list' description should be expected english", async () => {
  // Arrange
  const expected = `
  list            List available ID Cloud log sources.
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
        tail            Tail Identity Cloud logs.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('tail'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});
