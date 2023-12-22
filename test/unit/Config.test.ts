import * as Config from '../../src/utils/Config';
import { FullExportInterface } from '@rockcarver/frodo-lib/types/ops/ConfigOps';

describe('Config - isIdUsed()', () => {
  const exportObject = {
    meta: {},
    agents: {},
    application: {},
    authentication: {},
    config: {
      obj1: {
        obj2: [
          {
            obj3: "",
            obj4: "esv.test.var2"
          },
          {
            obj5: "const a = 'test-var3'; console.log(`&{esv.${a.replaceAll('-', '.')}}`);",
            obj6: "const a = 'test-var4'; console.log('&{esv.' + a + '}');",
            obj7: "//esv-test-var5 does not exist, neither does theesv.test.var6either, but esv.test.var7 does"
          }
        ]
      }
    },
    emailTemplate: {},
    idp: {},
    managedApplication: {},
    policy: {},
    policyset: {},
    resourcetype: {},
    saml: {
      hosted: {},
      remote: {},
      metadata: {},
      cot: {},
    },
    script: {
      "a271c7e6-5d49-4866-a1ab-5e0ee770a8c5": {
        _id: "a271c7e6-5d49-4866-a1ab-5e0ee770a8c5",
        name: "script1",
        default: true,
        language: "JAVASCRIPT",
        context: "SOCIAL_IDP_PROFILE_TRANSFORMATION",
        description: "test script 1",
        script: [
          "This",
          "is",
          "a",
          "very &{esv.test.variable} cool",
          "test"
        ],
        createdBy: "user",
        creationDate: 1433147666269,
        lastModifiedBy: "user",
        lastModifiedDate: 1433147666269
      },
      "8a1b71c6-51d4-42d7-85dd-dcc2a9553b1c": {
        _id: "8a1b71c6-51d4-42d7-85dd-dcc2a9553b1c",
        name: "script2",
        default: true,
        language: "JAVASCRIPT",
        context: "SOCIAL_IDP_PROFILE_TRANSFORMATION",
        description: "test script 2",
        script: [],
        createdBy: "user",
        creationDate: 1433147666269,
        lastModifiedBy: "user",
        lastModifiedDate: 1433147666269
      },
      "b8005c1c-e5a6-4718-878f-3c667142aa67": {
        _id: "b8005c1c-e5a6-4718-878f-3c667142aa67",
        name: "script3",
        default: true,
        language: "JAVASCRIPT",
        context: "SOCIAL_IDP_PROFILE_TRANSFORMATION",
        description: "test script 3",
        script: "",
        createdBy: null,
        creationDate: 1433147666269,
        lastModifiedBy: null,
        lastModifiedDate: 1433147666269
      },
      "SomeId": {
        _id: "SomeId",
        name: "script4",
        default: true,
        language: "JAVASCRIPT",
        context: "SOCIAL_IDP_PROFILE_TRANSFORMATION",
        description: "test script 4",
        script: "This\nis\na\n`${systemEnv.getProperty(\"esv.test.var\")}`\ntest",
        createdBy: "user",
        creationDate: 1433147666269,
        lastModifiedBy: "user",
        lastModifiedDate: 1433147666269
      }
    },
    secrets: {},
    service: {},
    theme: {},
    trees: {},
    variables: {},
  } as FullExportInterface;

  test('isIdUsed() 0: Method is implemented', async () => {
    expect(Config.isIdUsed).toBeDefined();
  });

  test('isIdUsed() 1: Correctly determines that ids are or are not being used', async () => {
    expect(Config.isIdUsed(exportObject, 'esv-test-var', true)).toStrictEqual({
      used: true,
      location: "script.SomeId(name: 'script4').script"
    });
    expect(Config.isIdUsed(exportObject, 'esv-test-variable', true)).toStrictEqual({
      used: true,
      location: "script.a271c7e6-5d49-4866-a1ab-5e0ee770a8c5(name: 'script1').script.3"
    });
    expect(Config.isIdUsed(exportObject, 'esv-test-va', true)).toStrictEqual({
      used: false,
      location: ''
    });
    expect(Config.isIdUsed(exportObject, 'esv-test-var2', true)).toStrictEqual({
      used: true,
      location: 'config.obj1.obj2.0.obj4'
    });
    expect(Config.isIdUsed(exportObject, 'esv-test-var3', true)).toStrictEqual({
      used: false,
      location: ''
    });
    expect(Config.isIdUsed(exportObject, 'esv-test-var4', true)).toStrictEqual({
      used: false,
      location: ''
    });
    expect(Config.isIdUsed(exportObject, 'esv-test-var5', true)).toStrictEqual({
      used: false,
      location: ''
    });
    expect(Config.isIdUsed(exportObject, 'esv-test-var6', true)).toStrictEqual({
      used: false,
      location: ''
    });
    expect(Config.isIdUsed(exportObject, 'esv-test-var7', true)).toStrictEqual({
      used: true,
      location: 'config.obj1.obj2.1.obj7'
    });
    expect(Config.isIdUsed(exportObject, 'esv-test-var8', true)).toStrictEqual({
      used: false,
      location: ''
    });
    expect(Config.isIdUsed(exportObject, 'SomeId', false)).toStrictEqual({
      used: true,
      location: 'script.SomeId(name: \'script4\')._id'
    });
    expect(Config.isIdUsed(exportObject, 'NotAnId', false)).toStrictEqual({
      used: false,
      location: ''
    });
    expect(Config.isIdUsed(exportObject, 'a271c7e6-5d49-4866-a1ab-5e0ee770a8c5', false)).toStrictEqual({
      used: true,
      location: "script.a271c7e6-5d49-4866-a1ab-5e0ee770a8c5(name: 'script1')._id"
    });
    expect(Config.isIdUsed(exportObject, '8a1b71c6-51d4-42d7-85dd-dcc2a9553b1c', false)).toStrictEqual({
      used: true,
      location: "script.8a1b71c6-51d4-42d7-85dd-dcc2a9553b1c(name: 'script2')._id"
    });
    expect(Config.isIdUsed(exportObject, 'b8005c1c-e5a6-4718-878f-3c667142aa67', false)).toStrictEqual({
      used: true,
      location: "script.b8005c1c-e5a6-4718-878f-3c667142aa67(name: 'script3')._id"
    });
  });
});
