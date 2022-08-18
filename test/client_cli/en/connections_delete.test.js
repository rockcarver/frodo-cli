import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo connections delete --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'delete' Usage should be expected english", async () => {
  // Arrange
  const expected = `
        Usage: frodo connections delete [options] <host>
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('Usage:'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'connections delete' description at line 2 should be expected english", async () => {
  // Arrange
  const expected = `
    Delete an existing connection profile (can also be done by editing '$HOME/.frodorc' in a text editor).
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .map((line) => line.trim())
    .at(2);
  // Assert
  expect(testLine).toBe(expected);
});
