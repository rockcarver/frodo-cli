import cp from 'child_process';
import { promisify } from 'util';
import { crudeMultilineTakeUntil, collapseWhitespace } from '../utils/utils.js';

const exec = promisify(cp.exec);
const CMD = 'frodo script export --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'script export' Usage should be expected english", async () => {
  // Arrange
  const expected = `
        Usage: frodo script export [options] <host> [realm] [user] [password]
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('Usage:'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'script export' description at line 2 should be expected english", async () => {
  // Arrange
  const expected = `
        Export scripts.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .map((line) => line.trim())
    .at(2);
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'export argument host' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
    host                Access Management base URL, e.g.:
                        https://cdk.iam.example.com/am. To use a connection
                        profile, just specify a unique substring.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  host               ',
      '  realm              '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'export argument realm' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        realm              Realm. Specify realm as '/' for the root realm or 'realm'
                           or '/parent/child' otherwise. (default: "__default__realm__")
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  realm              ',
      '  user               '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'export argument user' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        user                     Username to login with. Must be an admin user with appropriate
                                 rights to manage authentication journeys/trees.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  user               ',
      '  password           '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'export argument password' description should be expected english", async () => {
  // Arrange
  const expectedDescription = `
        password               Password.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('password'))
    .trim();
  // Assert
  expect(testLine).toBe(expectedDescription);
});

test("CLI help interface 'export option -m, --type <type>' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
    -m, --type <type>  Override auto-detected deployment type. Valid values for
                       type:
                       classic:  A classic Access Management-only deployment
                       with custom layout and configuration.
                       cloud:    A ForgeRock Identity Cloud environment.
                       forgeops: A ForgeOps CDK or CDM deployment.
                       The detected or provided deployment type controls certain
                       behavior like obtaining an Identity Management admin
                       token or not and whether to export/import referenced
                       email templates or how to walk through the tenant admin
                       login flow of Identity Cloud and handle MFA (choices:
                       "classic", "cloud", "forgeops")
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -m, --type <type>  ',
      '  -k, --insecure     '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'export option -k, --insecure' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        -k, --insecure           Allow insecure connections when using SSL/TLS (default: Don't
                                 allow insecure connections)
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -k, --insecure         ',
      '  -s, --script <script>  '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'export option -s, --script <script>' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        -s, --script <script>  Name of a script. If specified, -a and -A are
                               ignored.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      ' -s, --script <script>  ',
      ' -f, --file <file>  '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'export option -f, --file <file>' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        -f, --file <file>  Name of the file to write the exported script(s) to.
                           Ignored with -A.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      ' -f, --file <file>  ',
      ' -a, --all          '
    )
  );
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'export option -a, --all' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
    -a, --all          Export all the scripts in a realm. Ignored with
                       -t.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      ' -a, --all          ',
      ' -A, --allSeparate  '
    )
  );
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'export option -A, --allSeparate' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        -A, --allSeparate  Export all the scripts in a realm as separate
                           files <script>.json. Ignored with -s or -a.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      ' -A, --allSeparate  ',
      '  -h, --help         '
    )
  );
  // Assert
  expect(testLine).toBe(expected);
});
