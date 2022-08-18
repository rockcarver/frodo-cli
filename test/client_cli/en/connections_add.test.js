import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo connections add --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'add' Usage should be expected english", async () => {
  // Arrange
  const expected = `
        Usage: frodo connections add [options] <host> <user> <password> [key] [secret]
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('Usage:'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'connections add' description at line 2 should be expected english", async () => {
  // Arrange
  const expected = `
    Add a new connection. You have to specify a URL, username and password at a minimum.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .map((line) => line.trim())
    .at(2);
  // Assert
  expect(testLine).toBe(expected);
});
