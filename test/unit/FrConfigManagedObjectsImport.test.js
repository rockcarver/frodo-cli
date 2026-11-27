import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jest } from '@jest/globals';

/**
 * `frodo config-manager push managed-objects` writes the managed configuration, and then the custom
 * relationship schema files that `pull managed-objects --custom-relationships` leaves in the `schema`
 * folder of each object: one write for each file, with the file as the body. The operation is run
 * here on a real temporary tree. The library is real where a function only reads a file or builds a
 * path (`getFilePath`, `readJsonFile` with its placeholders), and what it sends is a recording mock,
 * so the order of the writes and every body are seen. The real CLI against a fake tenant is in
 * ConfigManagerPushCustomRelationshipsFakeTenant.test.js.
 */

const realLib = await import('@rockcarver/frodo-lib');

/** Every write, in the order it was made: `config` (all objects), `object` (one), `property`. */
const writes = [];
const importConfigEntities = jest.fn();
const importSubConfigEntity = jest.fn();
const updateManagedObjectSchemaProperty = jest.fn();
/** What the three writes do unless a test says otherwise: they are recorded, in order. */
function recordWrites() {
  importConfigEntities.mockReset().mockImplementation(async (data) => {
    writes.push({ step: 'config', data });
  });
  importSubConfigEntity.mockReset().mockImplementation(async (id, data) => {
    writes.push({ step: 'object', id, data });
  });
  updateManagedObjectSchemaProperty
    .mockReset()
    .mockImplementation(async (object, property, body) => {
      writes.push({ step: 'property', object, property, body });
    });
}
const printed = [];
const messages = () => printed.map((entry) => entry.msg).join('\n');
/** What was said at debug level: it never reaches the console of a run, so it has its own list. */
const debugged = [];

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    idm: {
      config: {
        readConfigEntity: jest.fn(),
        importConfigEntities,
        importSubConfigEntity,
      },
      managed: {
        schema: {
          readManagedObjectSchemaProperty: jest.fn(),
          updateManagedObjectSchemaProperty,
        },
      },
    },
    utils: {
      getFilePath: (file, mkdirs) =>
        realLib.frodo.utils.getFilePath(file, mkdirs),
      saveJsonToFile: jest.fn(),
      readJsonFile: (file) => realLib.frodo.utils.readJsonFile(file),
    },
  },
  state: realLib.state,
  FrodoError: realLib.FrodoError,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  debugMessage: (msg) => debugged.push(String(msg)),
  printMessage: (msg, type) => printed.push({ msg: String(msg), type }),
  printError: (error, message) =>
    printed.push({
      msg: `${message ?? ''} ${error?.message ?? error}`.trim(),
      type: 'error',
    }),
}));
jest.unstable_mockModule('../../src/utils/Config', () => ({
  extractFrConfigDataToFile: jest.fn(),
}));

const { configManagerImportManagedObjects } =
  await import('../../src/configManagerOps/FrConfigManagedObjectsOps.ts');

let root;
let tree;

/** A relationship schema as a pull writes it: the keys of a real read, `_id` included. */
const schemaOf = (object, property, reverse) => ({
  _id: property,
  description: `The ${property} of ${object}`,
  id: property,
  notifySelf: true,
  properties: { _ref: { type: 'string' } },
  required: false,
  resourceCollection: [
    {
      path: `managed/${reverse}`,
      label: reverse,
      query: { queryFilter: 'true', fields: ['userName'], sortKeys: [] },
    },
  ],
  returnByDefault: false,
  reversePropertyName: `${property}Of${object}`,
  reverseRelationship: true,
  searchable: false,
  title: property,
  type: 'relationship',
  userEditable: false,
  validate: true,
  viewable: true,
});

/** Writes files below the tree: a string as it is, anything else as JSON. */
function write(files) {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(tree, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      typeof content === 'string' ? content : JSON.stringify(content)
    );
  }
}

const objectFile = (name, extra = {}) => ({
  [`managed-objects/${name}/${name}.json`]: {
    name,
    schema: { type: 'object', properties: {} },
    ...extra,
  },
});
const schemaFile = (
  folder,
  property,
  body = schemaOf(folder, property, 'x')
) => ({
  [`managed-objects/${folder}/schema/${folder}.schema.${property}.json`]: body,
});

/** alpha_role has no schema folder, alpha_user has two files. */
const TWO_OBJECTS = {
  ...objectFile('alpha_role'),
  ...objectFile('alpha_user'),
  ...schemaFile(
    'alpha_user',
    'manager',
    schemaOf('alpha_user', 'manager', 'alpha_user')
  ),
  ...schemaFile(
    'alpha_user',
    'reports',
    schemaOf('alpha_user', 'reports', 'alpha_user')
  ),
};

const propertyWrites = () => writes.filter(({ step }) => step === 'property');
const bodyOf = (folder, property) =>
  JSON.parse(
    fs.readFileSync(
      path.join(
        tree,
        `managed-objects/${folder}/schema/${folder}.schema.${property}.json`
      ),
      'utf8'
    )
  );

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-managed-import-'));
  tree = path.join(root, 'tree');
  fs.mkdirSync(tree);
  realLib.state.setDirectory(tree);
  realLib.state.setEnvs({}, true);
  writes.length = 0;
  printed.length = 0;
  debugged.length = 0;
  recordWrites();
});

afterEach(() => {
  realLib.state.setEnvs({}, true);
  fs.rmSync(root, { recursive: true, force: true });
});

describe('push managed-objects, every object', () => {
  test('the configuration is written once with both objects, then each schema file once, with the file as the body', async () => {
    write(TWO_OBJECTS);

    expect(await configManagerImportManagedObjects()).toBe(true);

    expect(writes.map(({ step }) => step)).toEqual([
      'config',
      'property',
      'property',
    ]);
    expect(importSubConfigEntity).not.toHaveBeenCalled();
    expect(
      writes[0].data.idm.managed.objects.map((object) => object.name)
    ).toEqual(['alpha_role', 'alpha_user']);
    expect(propertyWrites()).toEqual([
      {
        step: 'property',
        object: 'alpha_user',
        property: 'manager',
        body: bodyOf('alpha_user', 'manager'),
      },
      {
        step: 'property',
        object: 'alpha_user',
        property: 'reports',
        body: bodyOf('alpha_user', 'reports'),
      },
    ]);
    // the body is the file as pull wrote it, `_id` and `required` included
    expect(propertyWrites()[0].body._id).toBe('manager');
    expect(propertyWrites()[0].body.required).toBe(false);
  });

  test('the configuration is written before the first property, not after it', async () => {
    write(TWO_OBJECTS);
    const order = [];
    importConfigEntities.mockImplementationOnce(async () => {
      order.push('config');
    });
    updateManagedObjectSchemaProperty.mockImplementation(async () => {
      order.push('property');
    });

    await configManagerImportManagedObjects();

    expect(order).toEqual(['config', 'property', 'property']);
  });

  test('a tree without any schema folder writes the configuration and nothing more', async () => {
    write({ ...objectFile('alpha_role'), ...objectFile('alpha_user') });

    expect(await configManagerImportManagedObjects()).toBe(true);

    expect(writes.map(({ step }) => step)).toEqual(['config']);
    expect(messages()).toBe('');
  });

  test('a folder that holds no object sends nothing: it would write an empty list of managed objects, so the command says so and fails', async () => {
    fs.mkdirSync(path.join(tree, 'managed-objects'));

    expect(await configManagerImportManagedObjects()).toBe(false);

    // not the configuration and not a property: an empty list would remove the managed objects of the tenant
    expect(writes).toEqual([]);
    expect(importConfigEntities).not.toHaveBeenCalled();
    expect(importSubConfigEntity).not.toHaveBeenCalled();
    expect(updateManagedObjectSchemaProperty).not.toHaveBeenCalled();
    expect(messages()).toContain(
      'The managed-objects folder holds no managed object: nothing was sent'
    );
    expect(
      printed.find(({ msg }) => msg.includes('holds no managed')).type
    ).toBe('error');
  });

  test('an empty folder fails whatever --allow-failures says: it is no operation that can be forgiven', async () => {
    fs.mkdirSync(path.join(tree, 'managed-objects'));

    expect(await configManagerImportManagedObjects(undefined, true)).toBe(
      false
    );

    expect(writes).toEqual([]);
  });

  test('a folder with one object is still written: the check is for none at all', async () => {
    write(objectFile('alpha_role'));

    expect(await configManagerImportManagedObjects()).toBe(true);

    expect(writes.map(({ step }) => step)).toEqual(['config']);
  });
});

describe('push managed-objects -i', () => {
  test('writes that object and its own files only', async () => {
    write(TWO_OBJECTS);
    write({
      ...objectFile('alpha_group'),
      ...schemaFile(
        'alpha_group',
        'owner',
        schemaOf('alpha_group', 'owner', 'alpha_user')
      ),
    });

    expect(await configManagerImportManagedObjects('alpha_user')).toBe(true);

    expect(writes.map(({ step }) => step)).toEqual([
      'object',
      'property',
      'property',
    ]);
    expect(importConfigEntities).not.toHaveBeenCalled();
    expect(writes[0].data.name).toBe('alpha_user');
    expect(
      propertyWrites().map(({ object, property }) => `${object}.${property}`)
    ).toEqual(['alpha_user.manager', 'alpha_user.reports']);
  });

  test('an object without a schema folder is written and no property is', async () => {
    write(TWO_OBJECTS);

    expect(await configManagerImportManagedObjects('alpha_role')).toBe(true);

    expect(writes.map(({ step }) => step)).toEqual(['object']);
  });

  test('a name that matches no folder fails and sends nothing, whatever --allow-failures says', async () => {
    write(TWO_OBJECTS);

    expect(await configManagerImportManagedObjects('nosuch')).toBe(false);
    expect(await configManagerImportManagedObjects('nosuch', true)).toBe(false);

    expect(writes).toEqual([]);
    expect(messages()).toContain('nosuch');
  });

  test.each([['..'], ['.']])(
    '%j is not the name of an object: it fails with that sentence and sends nothing',
    async (selector) => {
      write(TWO_OBJECTS);

      expect(await configManagerImportManagedObjects(selector)).toBe(false);

      expect(writes).toEqual([]);
      expect(messages()).toContain(
        `'${selector}' does not name an object: an id or a name is not a path`
      );
    }
  );
});

describe('which files of the schema folder are relationship schemas', () => {
  test('only files `<folder>.schema.<property>.json`: another stem, no marker, another extension, a folder and a bare marker are ignored', async () => {
    write({
      ...objectFile('alpha_user'),
      ...schemaFile('alpha_user', 'manager'),
      // the stem of another object
      'managed-objects/alpha_user/schema/alpha_role.schema.members.json':
        schemaOf('alpha_role', 'members', 'x'),
      // starts with the folder name, is not `<folder>.schema.`
      'managed-objects/alpha_user/schema/alpha_user_extra.schema.other.json':
        schemaOf('alpha_user', 'other', 'x'),
      // no `.schema.` marker
      'managed-objects/alpha_user/schema/alpha_user.relationship.json':
        schemaOf('alpha_user', 'plain', 'x'),
      // not JSON
      'managed-objects/alpha_user/schema/alpha_user.schema.notes.txt':
        'not a schema',
      'managed-objects/alpha_user/schema/README.md': 'not a schema',
      // the marker and no property
      'managed-objects/alpha_user/schema/alpha_user.schema.json': schemaOf(
        'alpha_user',
        'bare',
        'x'
      ),
      // a folder that is named like a schema file
      'managed-objects/alpha_user/schema/alpha_user.schema.folder.json/inside.json':
        schemaOf('alpha_user', 'inside', 'x'),
    });

    expect(await configManagerImportManagedObjects()).toBe(true);

    expect(propertyWrites().map(({ property }) => property)).toEqual([
      'manager',
    ]);
  });

  test('what is ignored is said at debug level, by the name it has in its folder, and never on the console', async () => {
    write({
      ...objectFile('alpha_user'),
      ...schemaFile('alpha_user', 'manager'),
      'managed-objects/alpha_user/schema/alpha_role.schema.members.json':
        schemaOf('alpha_role', 'members', 'x'),
      'managed-objects/alpha_user/schema/README.md': 'not a schema',
      'managed-objects/alpha_user/schema/alpha_user.schema.folder.json/inside.json':
        schemaOf('alpha_user', 'inside', 'x'),
    });

    expect(await configManagerImportManagedObjects()).toBe(true);

    expect(debugged).toHaveLength(1);
    expect(debugged[0]).toContain('alpha_user/schema');
    expect(debugged[0]).toContain('README.md');
    expect(debugged[0]).toContain('alpha_role.schema.members.json');
    expect(debugged[0]).toContain('alpha_user.schema.folder.json');
    // the file that is a relationship schema is not among them
    expect(debugged[0]).not.toContain('alpha_user.schema.manager.json');
    expect(messages()).toBe('');
  });

  test('a schema folder in which every file is a relationship schema says nothing, and so does a tree without one', async () => {
    write({ ...TWO_OBJECTS, ...objectFile('alpha_group') });

    expect(await configManagerImportManagedObjects()).toBe(true);

    expect(debugged).toEqual([]);
  });

  test('a property that is literally named `a%20b` is never pushed as `a b`: the object file holds its name, which a request cannot carry, so the file is one failed operation', async () => {
    write({
      ...objectFile('alpha_user', {
        schema: {
          type: 'object',
          properties: { 'a%20b': { type: 'relationship' } },
        },
      }),
      // a pull writes a percent sign as it is: this file name is also the encoding of `a b`
      ...schemaFile('alpha_user', 'a%20b'),
    });

    expect(await configManagerImportManagedObjects('alpha_user')).toBe(false);

    // the property of the file is the one that the object holds, and no write names `a b`
    expect(propertyWrites()).toEqual([]);
    expect(messages()).toContain('1 of 1 relationship schema failed:');
    expect(messages()).toContain(
      'alpha_user/schema/alpha_user.schema.a%20b.json'
    );
  });

  test('the property is the name in the file name, decoded: `a%20b` is `a b`', async () => {
    write({
      ...objectFile('alpha_user'),
      ...schemaFile('alpha_user', 'a%20b'),
    });

    expect(await configManagerImportManagedObjects('alpha_user')).toBe(true);

    expect(propertyWrites().map(({ property }) => property)).toEqual(['a b']);
  });

  test('a property name that holds `.schema.` is a property name', async () => {
    write({
      ...objectFile('alpha_user'),
      ...schemaFile('alpha_user', 'a.schema.b'),
    });

    expect(await configManagerImportManagedObjects('alpha_user')).toBe(true);

    expect(propertyWrites().map(({ property }) => property)).toEqual([
      'a.schema.b',
    ]);
  });

  test('a folder name that pull wrote encoded (`a%2Fb`) is found by -i with the name as typed', async () => {
    write({ ...objectFile('a%2Fb', { name: 'a/b' }) });

    expect(await configManagerImportManagedObjects('a/b')).toBe(true);

    expect(writes.map(({ step }) => step)).toEqual(['object']);
    expect(writes[0].data.name).toBe('a/b');
  });
});

describe('the names that a pull shortened are not read back as names', () => {
  test('the object of a relationship schema is the name that the object file holds, not the name of its folder', async () => {
    write({
      ...objectFile('renamed-folder', { name: 'alpha_user' }),
      ...schemaFile('renamed-folder', 'manager'),
    });

    expect(await configManagerImportManagedObjects()).toBe(true);

    expect(
      propertyWrites().map(({ object, property }) => [object, property])
    ).toEqual([['alpha_user', 'manager']]);
  });

  test('the object of a relationship schema is found when its folder has the shortened name of a long name', async () => {
    // the shortened name of a name of 305 characters for the longest ending of its files, `.schema.manager.json` (the independent
    // implementation of FileNameVectors.js made the checksum): 226 bytes of the name, `~` and the checksum of the whole name
    const name = `User-${'u'.repeat(300)}`;
    const folder = `User-${'u'.repeat(221)}~7782c47b`;
    write({
      ...objectFile(folder, { name }),
      [`managed-objects/${folder}/schema/${folder}.schema.manager.json`]:
        schemaOf(name, 'manager', 'x'),
    });

    expect(await configManagerImportManagedObjects()).toBe(true);

    expect(
      propertyWrites().map(({ object, property }) => [object, property])
    ).toEqual([[name, 'manager']]);
    // the object that the configuration holds is the one of the file too
    expect(writes[0].data.idm.managed.objects.map((o) => o.name)).toEqual([
      name,
    ]);
  });

  test('the property of a file is the property that the object file holds when the file names it', async () => {
    write({
      ...objectFile('alpha_user', {
        schema: { type: 'object', properties: { manager: {}, reports: {} } },
      }),
      ...schemaFile('alpha_user', 'reports'),
      ...schemaFile('alpha_user', 'manager'),
    });

    expect(await configManagerImportManagedObjects()).toBe(true);

    expect(propertyWrites().map(({ property }) => property)).toEqual([
      'manager',
      'reports',
    ]);
  });

  test('a file that names no property of the object has the property of its name, decoded, as before', async () => {
    write({
      ...objectFile('alpha_user', {
        schema: { type: 'object', properties: { manager: {} } },
      }),
      ...schemaFile('alpha_user', 'a%20b'),
      ...schemaFile('alpha_user', 'manager'),
    });

    expect(await configManagerImportManagedObjects()).toBe(true);

    expect(propertyWrites().map(({ property }) => property)).toEqual([
      'a b',
      'manager',
    ]);
  });
});

describe('a file whose name cannot be written is one failed operation that names the file', () => {
  test.each([
    ['%2E%2E', 'the decoded name is ..'],
    ['%2E', 'the decoded name is .'],
    ['', 'the name is empty'],
    ['custom%2Frel', 'the decoded name holds a /'],
    ['..%2F..%2Fconfig%2Fmanaged', 'the decoded name leaves the endpoint'],
    ['a%3Fb', 'the decoded name holds a ?'],
    ['a%23b', 'the decoded name holds a #'],
    ['a%zz', 'the name is not a percent encoding and holds a %'],
    ['a%00b', 'the decoded name holds a control character'],
  ])(
    '`%s` (%s): nothing is sent for it, the others are, the summary names the file, the command fails',
    async (encoded) => {
      write({
        ...objectFile('alpha_user'),
        ...schemaFile('alpha_user', 'manager'),
        ...schemaFile('alpha_user', encoded),
      });

      expect(await configManagerImportManagedObjects()).toBe(false);

      expect(propertyWrites().map(({ property }) => property)).toEqual([
        'manager',
      ]);
      expect(messages()).toContain('1 of 2 relationship schemas failed:');
      expect(messages()).toContain(
        `alpha_user/schema/alpha_user.schema.${encoded}.json`
      );
    }
  );

  test('with --allow-failures the command succeeds and says so', async () => {
    write({
      ...objectFile('alpha_user'),
      ...schemaFile('alpha_user', 'manager'),
      ...schemaFile('alpha_user', '%2E%2E'),
    });

    expect(await configManagerImportManagedObjects(undefined, true)).toBe(true);

    expect(propertyWrites().map(({ property }) => property)).toEqual([
      'manager',
    ]);
    expect(messages()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('an object whose name is not one name that a request can carry has no property written', async () => {
    write({
      ...objectFile('a%2Fb', { name: 'a/b' }),
      ...schemaFile('a%2Fb', 'rel'),
    });

    expect(await configManagerImportManagedObjects('a/b')).toBe(false);

    // the object itself is written as the pull wrote it, its property is not
    expect(writes.map(({ step }) => step)).toEqual(['object']);
    expect(messages()).toContain('1 of 1 relationship schema failed:');
  });
});

describe('a schema file that holds JSON that is not an object is one failed operation that names the file', () => {
  test.each([
    ['null', 'null'],
    ['[1,2]', 'an array'],
    ['[]', 'an empty array'],
    ['"text"', 'a string'],
    ['7', 'a number'],
    ['true', 'a boolean'],
  ])(
    '%s (%s): nothing is sent for it, the others are, the summary names the file, the command fails',
    async (content) => {
      write({
        ...objectFile('alpha_user'),
        ...schemaFile('alpha_user', 'manager'),
        ...schemaFile('alpha_user', 'broken', content),
        ...schemaFile('alpha_user', 'reports'),
      });

      expect(await configManagerImportManagedObjects()).toBe(false);

      // the canary: no write carries the property of the file that is not an object
      expect(propertyWrites().map(({ property }) => property)).toEqual([
        'manager',
        'reports',
      ]);
      expect(messages()).toContain('1 of 3 relationship schemas failed:');
      expect(messages()).toContain(
        'alpha_user/schema/alpha_user.schema.broken.json: the file does not hold a JSON object'
      );
      expect(messages()).toContain(
        'The file alpha_user.schema.broken.json of the managed object alpha_user is not pushed: it does not hold a JSON object.'
      );
    }
  );

  test('--allow-failures keeps the exit at 0 for it, as for any failed file, and says so', async () => {
    write({
      ...objectFile('alpha_user'),
      ...schemaFile('alpha_user', 'manager'),
      ...schemaFile('alpha_user', 'broken', 'null'),
    });

    expect(await configManagerImportManagedObjects(undefined, true)).toBe(true);

    expect(propertyWrites().map(({ property }) => property)).toEqual([
      'manager',
    ]);
    expect(messages()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('an object is a JSON object whatever it holds: an empty one is pushed as it is', async () => {
    write({
      ...objectFile('alpha_user'),
      ...schemaFile('alpha_user', 'manager', '{}'),
    });

    expect(await configManagerImportManagedObjects()).toBe(true);

    expect(propertyWrites()).toEqual([
      expect.objectContaining({ property: 'manager', body: {} }),
    ]);
  });
});

describe('placeholders', () => {
  test('are filled in an object and in a schema file', async () => {
    realLib.state.setEnv('OBJECT_DESCRIPTION', 'from the environment');
    realLib.state.setEnv('RELATIONSHIP_TITLE', 'Reporting line');
    write({
      ...objectFile('alpha_user', { description: '${OBJECT_DESCRIPTION}' }),
      ...schemaFile('alpha_user', 'manager', {
        ...schemaOf('alpha_user', 'manager', 'alpha_user'),
        title: '${RELATIONSHIP_TITLE}',
      }),
    });

    expect(await configManagerImportManagedObjects('alpha_user')).toBe(true);

    expect(writes[0].data.description).toBe('from the environment');
    expect(propertyWrites()[0].body.title).toBe('Reporting line');
  });

  test('a missing variable in an object fails before anything is written', async () => {
    realLib.state.setEnv('RELATIONSHIP_TITLE', 'Reporting line');
    write({
      ...objectFile('alpha_user', { description: '${NO_SUCH_VARIABLE_1}' }),
      ...schemaFile('alpha_user', 'manager', {
        ...schemaOf('alpha_user', 'manager', 'alpha_user'),
        title: '${RELATIONSHIP_TITLE}',
      }),
    });

    expect(await configManagerImportManagedObjects()).toBe(false);

    expect(writes).toEqual([]);
    expect(messages()).toContain('NO_SUCH_VARIABLE_1');
  });

  test('a missing variable in a schema file fails before anything is written, the configuration included', async () => {
    write({
      ...objectFile('alpha_user'),
      ...objectFile('alpha_role'),
      ...schemaFile('alpha_user', 'manager', {
        ...schemaOf('alpha_user', 'manager', 'alpha_user'),
        title: '${NO_SUCH_VARIABLE_2}',
      }),
    });

    expect(await configManagerImportManagedObjects()).toBe(false);
    expect(await configManagerImportManagedObjects('alpha_user', true)).toBe(
      false
    );

    expect(writes).toEqual([]);
    expect(messages()).toContain('NO_SUCH_VARIABLE_2');
  });
});

describe('failures', () => {
  const THREE = {
    ...objectFile('alpha_user'),
    ...schemaFile('alpha_user', 'manager'),
    ...schemaFile('alpha_user', 'middle'),
    ...schemaFile('alpha_user', 'reports'),
  };

  /** The write of one property is refused with the error a library function throws. */
  const refuse = (property) =>
    updateManagedObjectSchemaProperty.mockImplementation(
      async (object, name, body) => {
        writes.push({ step: 'property', object, property: name, body });
        if (name === property) {
          throw new realLib.FrodoError(
            `Error updating managed ${object} schema property ${name}`,
            new Error('the tenant refused this property')
          );
        }
      }
    );

  test('one of three properties failing: the other two are still written, one summary names the failed one, the command fails', async () => {
    write(THREE);
    refuse('middle');

    expect(await configManagerImportManagedObjects()).toBe(false);

    expect(propertyWrites().map(({ property }) => property)).toEqual([
      'manager',
      'middle',
      'reports',
    ]);
    expect(messages()).toContain(
      'Error pushing relationship schema alpha_user.middle'
    );
    expect(messages()).toContain('1 of 3 relationship schemas failed:');
    expect(messages()).toContain(
      '  - alpha_user.middle: the tenant refused this property'
    );
    expect(messages()).not.toContain('alpha_user.manager:');
    expect(messages()).not.toContain('--allow-failures was given');
  });

  test('the first property failing does not end the loop', async () => {
    write(THREE);
    refuse('manager');

    expect(await configManagerImportManagedObjects()).toBe(false);

    expect(propertyWrites()).toHaveLength(3);
  });

  test('with --allow-failures the same run succeeds, still writes all three and still names the failure', async () => {
    write(THREE);
    refuse('middle');

    expect(await configManagerImportManagedObjects(undefined, true)).toBe(true);

    expect(propertyWrites()).toHaveLength(3);
    expect(messages()).toContain(
      '  - alpha_user.middle: the tenant refused this property'
    );
    expect(messages()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('a failure of every property fails the command and the summary counts them', async () => {
    write(THREE);
    updateManagedObjectSchemaProperty.mockRejectedValue(
      new Error('endpoint missing')
    );

    expect(await configManagerImportManagedObjects()).toBe(false);

    expect(messages()).toContain('3 of 3 relationship schemas failed:');
  });

  test('the managed configuration failing: no property is tried, the command fails whatever --allow-failures says', async () => {
    write(THREE);
    importConfigEntities.mockRejectedValue(
      new Error('the configuration was refused')
    );
    importSubConfigEntity.mockRejectedValue(
      new Error('the configuration was refused')
    );

    expect(await configManagerImportManagedObjects()).toBe(false);
    expect(await configManagerImportManagedObjects(undefined, true)).toBe(
      false
    );
    expect(await configManagerImportManagedObjects('alpha_user')).toBe(false);
    expect(await configManagerImportManagedObjects('alpha_user', true)).toBe(
      false
    );

    expect(updateManagedObjectSchemaProperty).not.toHaveBeenCalled();
    expect(messages()).toContain('Error importing IDM managed objects');
    // no summary of failed files: none was tried
    expect(messages()).not.toContain('relationship schemas failed');
    expect(messages()).not.toContain('relationship schema failed');
  });

  test('a failed configuration write names the schema files that were not attempted, one by its name in the tree, in the order they would have been written', async () => {
    write(THREE);
    importConfigEntities.mockRejectedValue(
      new Error('the configuration was refused')
    );

    expect(await configManagerImportManagedObjects()).toBe(false);

    const said = printed.find(({ msg }) => msg.includes('not attempted'));
    expect(said.type).toBe('error');
    expect(said.msg).toContain(
      'The managed configuration was not written, so these relationship schema files were not attempted:'
    );
    expect(said.msg).toContain(
      'alpha_user/schema/alpha_user.schema.manager.json'
    );
    expect(said.msg).toContain(
      'alpha_user/schema/alpha_user.schema.middle.json'
    );
    expect(said.msg).toContain(
      'alpha_user/schema/alpha_user.schema.reports.json'
    );
    expect(said.msg.indexOf('manager')).toBeLessThan(
      said.msg.indexOf('middle')
    );
    expect(said.msg.indexOf('middle')).toBeLessThan(
      said.msg.indexOf('reports')
    );
  });

  test('so does a failed write of one object with -i, and an object without schema files has nothing to name', async () => {
    write({ ...THREE, ...objectFile('alpha_role') });
    importSubConfigEntity.mockRejectedValue(
      new Error('the configuration was refused')
    );

    expect(await configManagerImportManagedObjects('alpha_user')).toBe(false);
    expect(messages()).toContain('alpha_user.schema.manager.json');

    printed.length = 0;
    expect(await configManagerImportManagedObjects('alpha_role')).toBe(false);
    expect(messages()).not.toContain('not attempted');
  });

  test('a read that fails before anything is written names no file: none was going to be written yet', async () => {
    write({
      ...objectFile('alpha_user'),
      ...schemaFile('alpha_user', 'manager', '{ not json'),
    });

    expect(await configManagerImportManagedObjects()).toBe(false);

    expect(writes).toEqual([]);
    expect(messages()).not.toContain('not attempted');
  });

  test('a failed configuration write does not print the summary of the files that were never tried', async () => {
    write({
      ...objectFile('alpha_user'),
      ...schemaFile('alpha_user', 'manager'),
      ...schemaFile('alpha_user', '%2E%2E'),
    });
    importConfigEntities.mockRejectedValue(
      new Error('the configuration was refused')
    );

    expect(await configManagerImportManagedObjects(undefined, true)).toBe(
      false
    );

    expect(messages()).not.toContain('The exit code stays 0');
  });
});
