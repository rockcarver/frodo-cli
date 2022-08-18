import cp from 'child_process';
import { promisify } from 'util';
import { crudeMultilineTakeUntil, collapseWhitespace } from '../utils/utils.js';

const exec = promisify(cp.exec);
const CMD = 'frodo journey --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'journey' Usage should be expected english", async () => {
  // Arrange
  const expected = `
        Usage: frodo journey [options] [command]
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('Usage:'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'journey' description at line 2 should be expected english", async () => {
  // Arrange
  const expected = `
        Manage journeys/trees.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .map((line) => line.trim())
    .at(2);
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'journey commands list' description should be expected english", async () => {
  // Arrange
  const expected = `
        list [options] <host> [realm] [user] [password]       List all the journeys/trees in a realm.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('list'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'journey commands describe' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        describe [options] [host] [realm] [user] [password]   If -h is supplied, describe the journey/tree
                                                              indicated by -t, or all journeys/trees in the
                                                              realm if no -t is supplied, otherwise describe
                                                              the journey/tree export file indicated by -f.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  describe [options] [host] [realm] [user] [password]   ',
      '  export [options] <host> [realm] [user] [password]     '
    )
  );
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'journey commands export' description should be expected english", async () => {
  // Arrange
  const expected = `
        export [options] <host> [realm] [user] [password]     Export journeys/trees.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('export'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'journey commands import' description should be expected english", async () => {
  // Arrange
  const expected = `
        import [options] <host> [realm] [user] [password]     Import journey/tree.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('import'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'journey commands importAll' description should be expected english", async () => {
  // Arrange
  const expected = `
        importAll [options] <host> [realm] [user] [password]  Import all the trees in a realm.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('importAll'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'journey commands prune' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        prune [options] <host> [realm] [user] [password]      Prune orphaned configuration artifacts left behind after deleting authentication trees.
                                                              You will be prompted before any destructive operations are performed.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  prune [options] <host> [realm] [user] [password]      ',
      '  help [command]                                        '
    )
  );
  // Assert
  expect(testLine).toBe(expected);
});
