import wordwrap from './Wordwrap';

describe('wordwrap', () => {
  test('wraps long strings with spaces correctly', () => {
    const testString =
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';
    const result = wordwrap(testString, 32);
    expect(result).toMatchSnapshot();
  });
  test('wraps long strings with no spaces correctly', () => {
    const testString =
      'https://backstage.forgerock.com/docs/idcloud-am/latest/oauth2-guide/token-exchange-configuration.html';
    const result = wordwrap(testString, 16);
    expect(result).toMatchSnapshot();
  });
  test('wraps long strings with no spaces correctly with indentation', () => {
    const testString =
      'https://backstage.forgerock.com/docs/idcloud-am/latest/oauth2-guide/token-exchange-configuration.html';
    const result = wordwrap(testString, 16, '    ');
    expect(result).toMatchSnapshot();
  });
});
