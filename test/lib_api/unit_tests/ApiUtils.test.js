import {
  applyNameCollisionPolicy,
  escapeRegExp,
  getCurrentRealmPath,
  getRealmManagedUser,
  getTenantURL,
  isEqualJson,
  replaceAll,
} from '../../../src/api/utils/ApiUtils';
import sessionStorage from '../../../src/storage/SessionStorage';

test.skip('replaceAll should be deleted because it works like native String.replaceAll', () => {
  // Arrange
  // Act
  // Assert
  expect(true).toBe(false);
});

test('getCurrentRealmPath should prepend realmPath to specified realm', () => {
  // Arrange
  const REALM_PATH = 'alpha';
  sessionstate.default.session.setItem('realm', REALM_PATH);
  // Act
  const testString = getCurrentRealmPath(REALM_PATH);
  // Assert
  expect(testString).toBe('/realms/root/realms/alpha');
});

test('getCurrentRealmPath should prepend realmPath to specified realm with leading slash', () => {
  // Arrange
  const REALM_PATH = '/alpha';
  sessionstate.default.session.setItem('realm', REALM_PATH);
  // Act
  const testString = getCurrentRealmPath(REALM_PATH);
  // Assert
  expect(testString).toBe('/realms/root/realms/alpha');
});

test('getCurrentRealmPath "/" should resolve to root', () => {
  // Arrange
  const REALM_PATH = '/';
  sessionstate.default.session.setItem('realm', REALM_PATH);
  // Act
  const testString = getCurrentRealmPath(REALM_PATH);
  // Assert
  expect(testString).toBe('/realms/root');
});

test('getCurrentRealmPath should not handle multiple leading slash', () => {
  // Arrange
  const REALM_PATH = '//alpha';
  sessionstate.default.session.setItem('realm', REALM_PATH);
  // Act
  const testString = getCurrentRealmPath(REALM_PATH);
  // Assert
  expect(testString).toBe('/realms/root/realms//alpha');
});

test('getCurrentRealmPath should not handle nested depth realms', () => {
  // Arrange
  const REALM_PATH = '/alpha/erm';
  sessionstate.default.session.setItem('realm', REALM_PATH);
  // Act
  const testString = getCurrentRealmPath(REALM_PATH);
  // Assert
  expect(testString).toBe('/realms/root/realms/alpha/erm');
});

test('getTenantURL should parse the https protocol and the hostname', () => {
  // Arrange
  const URL_WITH_TENANT =
    'https://example.frodo.com/am/ui-admin/#realms/%2Falpha/dashboard';

  // Act
  const parsed = getTenantURL(URL_WITH_TENANT);

  // Assert
  expect(parsed).toBe('https://example.frodo.com');
});

test('getTenantURL should not validate protocol', () => {
  // Arrange
  const URL_WITH_TENANT =
    'ftp://example.frodo.com/am/ui-admin/#realms/%2Falpha/dashboard';
  // Act
  const parsed = getTenantURL(URL_WITH_TENANT);
  // Assert
  expect(parsed).toBe('ftp://example.frodo.com');
});

test('getTenantURL Invalid URL should throw', () => {
  // Arrange
  const URL_WITH_TENANT =
    '//:example.frodo.com/am/ui-admin/#realms/%2Falpha/dashboard';
  // Act
  const trap = () => {
    getTenantURL(URL_WITH_TENANT);
  };
  // Assert
  expect(trap).toThrow('Invalid URL');
});

test('applyNameCollisionPolicy should format correctly', () => {
  // Arrange
  const NAME = 'hello';
  const EXPECTED = 'hello - imported (1)';
  // Act
  const result = applyNameCollisionPolicy(NAME);
  // Assert
  expect(result).toBe(EXPECTED);
});

test('applyNameCollisionPolicy undefined name throws', () => {
  // Act
  const trap = () => {
    applyNameCollisionPolicy();
  };
  // Assert
  expect(trap).toThrow();
});

test('applyNameCollisionPolicy blank string name does not throw', () => {
  // Arrange
  const NAME = '';
  // Act
  const trap = () => {
    applyNameCollisionPolicy(NAME);
  };
  // Assert
  expect(trap).not.toThrow();
});

test('applyNameCollisionPolicy name can have spaces', () => {
  // Arrange
  const NAME = 'hello world';
  const EXPECTED = 'hello world - imported (1)';
  // Act
  const result = applyNameCollisionPolicy(NAME);
  // Assert
  expect(result).toBe(EXPECTED);
});

test('escapeRegExp should escape the Regular Expression special characters “^”, “$”, “”, “.”, “*”, “+”, “?”, “(“, “)”, “[“, “]”, “{“, “}”, and “|” in string.', () => {
  // Arrange
  const EXPECTED = /\*\?\{\}\./;
  // Act
  const result = escapeRegExp('/*?{}./');
  // Assert
  expect(result.toString()).toBe(EXPECTED.toString());
});

test.skip('getRealmManagedUser in cloud environments should return differnt value', () => {
  properties.CLOUD_DEPLOYMENT_TYPE_KEY;
  console.log(global);
  expect(true).toBe(true);
});

test('getRealmManagedUser in prem environments should return differnt value', () => {
  // Arrange
  sessionstate.default.session.setItem('deploymentType', 'cloud');
  sessionstate.default.session.setItem('realm', 'foxtrot');
  // Act
  const result = getRealmManagedUser();
  // Assert
  expect(result).toBe('foxtrot_user');
});

test('isEqualJson should check that two json formatted strings are the same', () => {
  // Arrange
  const json1 = JSON.stringify({ frodo: 123 });
  const json2 = JSON.stringify({ frodo: 123 });
  // Act
  const result = isEqualJson(json1, json2);
  // Assert
  expect(result).toBe(true);
});

test.skip('isEqualJson should check that two json formatted strings are the same ignoring keys', () => {
  // Arrange
  const json1 = JSON.stringify({ frodo: 123, ignoreme: 0 });
  const json2 = JSON.stringify({ frodo: 123 });
  // Act
  const result = isEqualJson(json1, json2, ['ignoreme']);
  // Assert
  expect(result).toBe(true);
});
