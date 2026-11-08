/**
 * Unit tests for `config-manager delete email-templates`
 * (configManagerDeleteEmailTemplates in
 * src/configManagerOps/FrConfigEmailTemplatesOps.ts), without a tenant. The
 * facade and the console are mocked before the module is imported (the bundled
 * ESM of frodo-lib cannot load under jest's ESM runtime). What these tests guard:
 * nothing is deleted in a dry run, one template that cannot be deleted does not
 * hide the others, a named template that does not exist is an error, and a
 * tenant without email templates is not.
 */
import { jest } from '@jest/globals';

const printed = [];
const messages = (type) =>
  printed.filter((entry) => entry.type === type).map((entry) => entry.msg);

const deleted = [];
let templates = [];
let failingNames = new Set();
let readFails = false;

const template = (name) => ({ _id: `emailTemplate/${name}`, displayName: name });

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    utils: {
      getFilePath: (file) => file,
      saveJsonToFile: () => {},
      readJsonFile: () => ({}),
      getWorkingDirectory: () => '.',
    },
    email: {
      template: {
        readEmailTemplates: async () => {
          if (readFails) throw new Error('read refused');
          return templates;
        },
        readEmailTemplate: async () => ({}),
        importEmailTemplates: async () => {},
        deleteEmailTemplate: async (name) => {
          if (failingNames.has(name)) throw new Error(`refused ${name}`);
          deleted.push(name);
          return {};
        },
      },
    },
  },
}));

jest.unstable_mockModule('../../src/utils/Config', () => ({
  extractFrConfigDataToFile: () => {},
}));

jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: (msg, type) => printed.push({ msg: String(msg), type }),
  printError: (error, message) =>
    printed.push({
      msg: `${message ?? ''} ${error?.message ?? error}`.trim(),
      type: 'error',
    }),
}));

const { configManagerDeleteEmailTemplates } = await import(
  '../../src/configManagerOps/FrConfigEmailTemplatesOps.ts'
);

beforeEach(() => {
  printed.length = 0;
  deleted.length = 0;
  failingNames = new Set();
  readFails = false;
  templates = [template('welcome'), template('registration'), template('test')];
});

describe('delete all email templates', () => {
  test('every template is deleted, in the order IDM lists them, and each is named', async () => {
    expect(await configManagerDeleteEmailTemplates(undefined, false)).toBe(true);

    expect(deleted).toEqual(['welcome', 'registration', 'test']);
    expect(messages(undefined)).toEqual([
      'Deleting emailTemplate: welcome',
      'Deleting emailTemplate: registration',
      'Deleting emailTemplate: test',
    ]);
  });

  test('a template that cannot be deleted does not hide the others, is named, and the result is false', async () => {
    failingNames = new Set(['registration']);

    expect(await configManagerDeleteEmailTemplates(undefined, false)).toBe(false);

    expect(deleted).toEqual(['welcome', 'test']);
    expect(messages(undefined)).toEqual([
      'Deleting emailTemplate: welcome',
      'Deleting emailTemplate: test',
    ]);
    const errors = messages('error').join('\n');
    expect(errors).toContain('Failed to delete email template registration refused registration');
    expect(errors).toContain(
      '1 of 3 email templates failed:\n  - registration: refused registration'
    );
  });

  test('a tenant without email templates is told so and it is not an error', async () => {
    templates = [];

    expect(await configManagerDeleteEmailTemplates(undefined, false)).toBe(true);

    expect(deleted).toEqual([]);
    expect(messages(undefined)).toEqual(['No email templates found to delete.']);
    expect(messages('error')).toEqual([]);
  });

  test('a read that fails is reported and nothing is deleted', async () => {
    readFails = true;

    expect(await configManagerDeleteEmailTemplates(undefined, false)).toBe(false);

    expect(deleted).toEqual([]);
    expect(messages('error').join('\n')).toContain('Error deleting email templates read refused');
  });
});

describe('dry run', () => {
  test('sends no delete and lists what would be deleted', async () => {
    expect(await configManagerDeleteEmailTemplates(undefined, true)).toBe(true);

    expect(deleted).toEqual([]);
    expect(messages(undefined)).toEqual([
      'Dry run: Deleting emailTemplate: welcome',
      'Dry run: Deleting emailTemplate: registration',
      'Dry run: Deleting emailTemplate: test',
    ]);
  });

  test('a tenant without email templates is told so', async () => {
    templates = [];

    expect(await configManagerDeleteEmailTemplates(undefined, true)).toBe(true);

    expect(messages(undefined)).toEqual(['No email templates found to delete.']);
  });
});

describe('one template by name', () => {
  test('only that template is deleted', async () => {
    expect(await configManagerDeleteEmailTemplates('registration', false)).toBe(true);

    expect(deleted).toEqual(['registration']);
    expect(messages(undefined)).toEqual(['Deleting emailTemplate: registration']);
  });

  test('a template that does not exist is an error and nothing is deleted', async () => {
    expect(await configManagerDeleteEmailTemplates('nothing', false)).toBe(false);

    expect(deleted).toEqual([]);
    expect(messages('error')).toEqual(["Email template 'nothing' not found."]);
  });

  test('the name must match exactly, not as a prefix', async () => {
    expect(await configManagerDeleteEmailTemplates('regist', false)).toBe(false);

    expect(deleted).toEqual([]);
  });

  test('the dry run of a missing template is an error too, and deletes nothing', async () => {
    expect(await configManagerDeleteEmailTemplates('nothing', true)).toBe(false);

    expect(deleted).toEqual([]);
    expect(messages('error')).toEqual(["Email template 'nothing' not found."]);
  });

  test('the dry run of an existing template deletes nothing', async () => {
    expect(await configManagerDeleteEmailTemplates('test', true)).toBe(true);

    expect(deleted).toEqual([]);
    expect(messages(undefined)).toEqual(['Dry run: Deleting emailTemplate: test']);
  });

  test('a template that cannot be deleted is an error', async () => {
    failingNames = new Set(['test']);

    expect(await configManagerDeleteEmailTemplates('test', false)).toBe(false);

    expect(deleted).toEqual([]);
    expect(messages('error').join('\n')).toContain('refused test');
  });
});
