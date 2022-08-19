import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo connections delete --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'delete' Usage should be expected english", async () => {
  // Arrange
  const expected = `
        Usage: frodo conn delete [options] <host>
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('Usage:'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'conn delete' description at line 2 should be expected english", async () => {
  // Arrange
  const expected = `
  Delete connection profiles.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .map((line) => line.trim())
    .at(2);
  // Assert
  expect(testLine).toBe(expected);
});
