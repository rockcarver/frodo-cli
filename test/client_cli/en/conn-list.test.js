import cp from 'child_process';
import { promisify } from 'util';
import { node14Compatibility } from '../utils/utils.js';

node14Compatibility();

const exec = promisify(cp.exec);
const CMD = 'frodo connections list --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'list' Usage should be expected english", async () => {
  // Arrange
  const expected = `
  Usage: frodo conn list [options]
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('Usage:'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'connections List' description at line 2 should be expected english", async () => {
  // Arrange
  const expected = `
  List connection profiles.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .map((line) => line.trim())
    .at(2);
  // Assert
  expect(testLine).toBe(expected);
});
