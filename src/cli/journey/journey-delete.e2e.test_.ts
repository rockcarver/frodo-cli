// import { jest } from '@jest/globals';
import { spawn, spawnSync } from 'child_process';

const ansiEscapeCodes =
  // eslint-disable-next-line no-control-regex
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

/**
 * Run once before running the suites in this file
 */
beforeAll(async () => {});

/**
 * Run before every test in every suite in this file
 */
beforeEach(async () => {
  // delete all journeys
  const deleteJourneysCmd = spawnSync('frodo', [
    'journey',
    'delete',
    '--all',
    'frodo-dev',
  ]);
  if (deleteJourneysCmd.status > 0) {
    console.error(deleteJourneysCmd.stderr.toString());
    console.log(deleteJourneysCmd.stdout.toString());
  }

  // import test journeys
  const importTestJourneysCmd = spawnSync(
    'frodo',
    ['journey', 'import', '--all-separate', 'frodo-dev'],
    {
      cwd: `test/e2e/journey/delete`,
    }
  );
  if (importTestJourneysCmd.status > 0) {
    console.error(importTestJourneysCmd.stderr.toString());
    console.log(importTestJourneysCmd.stdout.toString());
  }
});

describe('frodo journey delete', () => {
  it('"frodo journey delete -i deleteMe": should delete the deleteMe journey and all its nodes', (done) => {
    const deleteJourneyCmd = spawn('frodo', [
      'journey',
      'delete',
      '-i',
      'deleteMe',
      'frodo-dev',
    ]);
    const expected = ['✔ Deleted deleteMe and 7/7 nodes.', ''].join('\n');
    const chunks = [];
    deleteJourneyCmd.stderr.on('data', (chunk) => {
      chunks.push(chunk);
    });
    deleteJourneyCmd.stderr.on('end', () => {
      const output = Buffer.concat(chunks)
        .toString()
        .replace(ansiEscapeCodes, '');
      try {
        expect(output).toContain(expected);
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  it('"frodo journey delete -i deleteMe --verbose": should delete the deleteMe journey and all its nodes with verbose output', (done) => {
    const deleteJourneyCmd = spawn('frodo', [
      'journey',
      'delete',
      '-i',
      'deleteMe',
      '--verbose',
      'frodo-dev',
    ]);
    const expected = [
      'Deleted deleteMe (tree)\n',
      'Read 3c89697f-c114-4d36-907f-6c36f820cde7 (PageNode) from deleteMe\n',
      'Deleted 68e23c54-0c9e-4991-9b25-daf306d6ec65 (ZeroPageLoginNode) from deleteMe\n',
      'Deleted 9cd184fc-9453-4666-b667-2875d9301b5e (DataStoreDecisionNode) from deleteMe\n',
      'Read 2d564be0-325e-439a-aeb0-6c884270c756 (PageNode) from deleteMe\n',
      'Deleted 3c89697f-c114-4d36-907f-6c36f820cde7 (PageNode) from deleteMe\n',
      'Deleted fab1f53e-cda4-458a-b458-b07f75c75d5f (ValidatedUsernameNode) from deleteMe\n',
      'Deleted 2d564be0-325e-439a-aeb0-6c884270c756 (PageNode) from deleteMe\n',
      'Deleted 9d146833-e8d1-4802-8c35-0d7772290807 (DisplayUserNameNode) from deleteMe\n',
      'Deleted c22373f9-252b-4d0b-b80e-e4b392a17d98 (ValidatedPasswordNode) from deleteMe\n',
      '✔ Deleted deleteMe and 7/7 nodes.\n',
    ];
    const chunks = [];
    deleteJourneyCmd.stderr.on('data', (chunk) => {
      chunks.push(chunk);
    });
    deleteJourneyCmd.stderr.on('end', () => {
      const output = Buffer.concat(chunks)
        .toString()
        .replace(ansiEscapeCodes, '');
      try {
        for (const str of expected) {
          expect(output).toContain(str);
        }
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  it('"frodo journey delete -i deleteMe --no-deep": should delete the deleteMe journey and none of its nodes', (done) => {
    const deleteJourneyCmd = spawn('frodo', [
      'journey',
      'delete',
      '-i',
      'deleteMe',
      '--no-deep',
      'frodo-dev',
    ]);
    const expected = ['✔ Deleted deleteMe and 0/0 nodes.', ''].join('\n');
    const chunks = [];
    deleteJourneyCmd.stderr.on('data', (chunk) => {
      chunks.push(chunk);
    });
    deleteJourneyCmd.stderr.on('end', () => {
      const output = Buffer.concat(chunks)
        .toString()
        .replace(ansiEscapeCodes, '');
      try {
        expect(output).toContain(expected);
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  it('"frodo journey delete -i deleteMe --no-deep --verbose": should delete the deleteMe journey and none of its nodes with verbose output', (done) => {
    const deleteJourneyCmd = spawn('frodo', [
      'journey',
      'delete',
      '-i',
      'deleteMe',
      '--no-deep',
      '--verbose',
      'frodo-dev',
    ]);
    const expected = [
      'Deleted deleteMe (tree)\n',
      '✔ Deleted deleteMe and 0/0 nodes.\n',
    ];
    const chunks = [];
    deleteJourneyCmd.stderr.on('data', (chunk) => {
      chunks.push(chunk);
    });
    deleteJourneyCmd.stderr.on('end', () => {
      const output = Buffer.concat(chunks)
        .toString()
        .replace(ansiEscapeCodes, '');
      try {
        for (const str of expected) {
          expect(output).toContain(str);
        }
        done();
      } catch (error) {
        done(error);
      }
    });
  });
});

describe('frodo journey delete --all', () => {
  it(
    '"frodo journey delete -a": should delete all journeys and all their nodes',
    (done) => {
      const deleteJourneyCmd = spawn('frodo', [
        'journey',
        'delete',
        '-a',
        'frodo-dev',
      ]);
      const expected = [
        '[========================================] 100% | 8/8 | Deleted 8/8 journeys and 51/51 nodes.',
        '',
      ].join('\n');
      const chunks = [];
      deleteJourneyCmd.stderr.on('data', (chunk) => {
        chunks.push(chunk);
      });
      deleteJourneyCmd.stderr.on('end', () => {
        const output = Buffer.concat(chunks)
          .toString()
          .replace(ansiEscapeCodes, '');
        try {
          expect(output).toContain(expected);
          done();
        } catch (error) {
          done(error);
        }
      });
    },
    // increase timeout for long-running test
    10 * 1000
  );

  it(
    '"frodo journey delete -a --verbose": should delete all journeys and all their nodes with verbose output',
    (done) => {
      const deleteJourneyCmd = spawn('frodo', [
        'journey',
        'delete',
        '-a',
        '--verbose',
        'frodo-dev',
      ]);
      const expected = [
        '[----------------------------------------] 0% | 0/8 | Deleting journeys...\n',
        'Deleted ResetPassword (tree)\n',
        'Read cc3e1ed2-25f1-47bf-83c6-17084f8b2b2b (PageNode) from ResetPassword\n',
        'Deleted 06c97be5-7fdd-4739-aea1-ecc7fe082865 (EmailSuspendNode) from ResetPassword\n',
        'Deleted 989f0bf8-a328-4217-b82b-5275d79ca8bd (PatchObjectNode) from ResetPassword\n',
        'Deleted 21b8ddf3-0203-4ae1-ab05-51cf3a3a707a (IdentifyExistingUserNode) from ResetPassword\n',
        'Read e4c752f9-c625-48c9-9644-a58802fa9e9c (PageNode) from ResetPassword\n',
        'Deleted cc3e1ed2-25f1-47bf-83c6-17084f8b2b2b (PageNode) from ResetPassword\n',
        'Deleted 276afa7c-a680-4cf4-a5f6-d6c78191f5c9 (AttributeCollectorNode) from ResetPassword\n',
        'Deleted e4c752f9-c625-48c9-9644-a58802fa9e9c (PageNode) from ResetPassword\n',
        'Deleted 009c19c8-9572-47bb-adb2-1f092c559a43 (ValidatedPasswordNode) from ResetPassword\n',
        'Deleted Registration (tree)\n',
        'Read 0c091c49-f3af-48fb-ac6f-07fba0499dd6 (PageNode) from Registration\n',
        'Deleted d3ce2036-1523-4ce8-b1a2-895a2a036667 (AttributeCollectorNode) from Registration\n',
        'Deleted 0c091c49-f3af-48fb-ac6f-07fba0499dd6 (PageNode) from Registration\n',
        'Deleted 3d8709a1-f09f-4d1f-8094-2850e472c1db (ValidatedPasswordNode) from Registration\n',
        'Deleted 120c69d3-90b4-4ad4-b7af-380e8b119340 (KbaCreateNode) from Registration\n',
        'Deleted b4a0e915-c15d-4b83-9c9d-18347d645976 (AcceptTermsAndConditionsNode) from Registration\n',
        'Deleted ad5dcbb3-7335-49b7-b3e7-7d850bb88237 (CreateObjectNode) from Registration\n',
        'Deleted 7fcaf48e-a754-4959-858b-05b2933b825f (ValidatedUsernameNode) from Registration\n',
        'Deleted 97a15eb2-a015-4b6d-81a0-be78c3aa1a3b (IncrementLoginCountNode) from Registration\n',
        'Deleted PasswordGrant (tree)\n',
        'Read 6b9a715d-ea23-4eae-9a59-69797c147157 (PageNode) from PasswordGrant\n',
        'Deleted 59952413-9bc2-47e5-a9b2-b04c1d729e24 (UsernameCollectorNode) from PasswordGrant\n',
        'Deleted 6b9a715d-ea23-4eae-9a59-69797c147157 (PageNode) from PasswordGrant\n',
        'Deleted 8c217417-11dd-4a0f-a9e4-59c2390085be (PasswordCollectorNode) from PasswordGrant\n',
        'Deleted e2988546-a459-4c9a-b0e2-fa65ae136b34 (DataStoreDecisionNode) from PasswordGrant\n',
        'Deleted ProgressiveProfile (tree)\n',
        'Read a5aecad8-854a-4ed5-b719-ff6c90e858c0 (PageNode) from ProgressiveProfile\n',
        'Deleted 423a959a-a1b9-498a-b0f7-596b6b6e775a (PatchObjectNode) from ProgressiveProfile\n',
        'Deleted a1f45b44-5bf7-4c57-aa3f-75c619c7db8e (QueryFilterDecisionNode) from ProgressiveProfile\n',
        'Deleted 8afdaec3-275e-4301-bb53-34f03e6a4b29 (LoginCountDecisionNode) from ProgressiveProfile\n',
        'Deleted a5aecad8-854a-4ed5-b719-ff6c90e858c0 (PageNode) from ProgressiveProfile\n',
        'Deleted 0a042e10-b22e-4e02-86c4-65e26e775f7a (AttributeCollectorNode) from ProgressiveProfile\n',
        'Deleted ForgottenUsername (tree)\n',
        'Read 5e2a7c95-94af-4b23-8724-deb13853726a (PageNode) from ForgottenUsername\n',
        'Deleted 5e2a7c95-94af-4b23-8724-deb13853726a (PageNode) from ForgottenUsername\n',
        'Deleted 9f1e8d94-4922-481b-9e14-212b66548900 (AttributeCollectorNode) from ForgottenUsername\n',
        'Deleted bf9ea8d5-9802-4f26-9664-a21840faac23 (IdentifyExistingUserNode) from ForgottenUsername\n',
        'Deleted d9a79f01-2ce3-4be2-a28a-975f35c3c8ca (EmailSuspendNode) from ForgottenUsername\n',
        'Deleted b93ce36e-1976-4610-b24f-8d6760b5463b (InnerTreeEvaluatorNode) from ForgottenUsername\n',
        'Deleted deleteMe (tree)\n',
        'Read 3c89697f-c114-4d36-907f-6c36f820cde7 (PageNode) from deleteMe\n',
        'Deleted 9cd184fc-9453-4666-b667-2875d9301b5e (DataStoreDecisionNode) from deleteMe\n',
        'Read 2d564be0-325e-439a-aeb0-6c884270c756 (PageNode) from deleteMe\n',
        'Deleted 68e23c54-0c9e-4991-9b25-daf306d6ec65 (ZeroPageLoginNode) from deleteMe\n',
        'Deleted 3c89697f-c114-4d36-907f-6c36f820cde7 (PageNode) from deleteMe\n',
        'Deleted fab1f53e-cda4-458a-b458-b07f75c75d5f (ValidatedUsernameNode) from deleteMe\n',
        'Deleted c22373f9-252b-4d0b-b80e-e4b392a17d98 (ValidatedPasswordNode) from deleteMe\n',
        'Deleted 2d564be0-325e-439a-aeb0-6c884270c756 (PageNode) from deleteMe\n',
        'Deleted 9d146833-e8d1-4802-8c35-0d7772290807 (DisplayUserNameNode) from deleteMe\n',
        'Deleted UpdatePassword (tree)\n',
        'Read 20237b34-26cb-4a0b-958f-abb422290d42 (PageNode) from UpdatePassword\n',
        'Read d018fcd1-4e22-4160-8c41-63bee51c9cb3 (PageNode) from UpdatePassword\n',
        'Deleted 0f0904e6-1da3-4cdb-9abf-0d2545016fab (AttributePresentDecisionNode) from UpdatePassword\n',
        'Deleted 20237b34-26cb-4a0b-958f-abb422290d42 (PageNode) from UpdatePassword\n',
        'Deleted 7d1deabe-cd98-49c8-943f-ca12305775f3 (DataStoreDecisionNode) from UpdatePassword\n',
        'Deleted fe2962fc-4db3-4066-8624-553649afc438 (ValidatedPasswordNode) from UpdatePassword\n',
        'Deleted 3990ce1f-cce6-435b-ae1c-f138e89411c1 (PatchObjectNode) from UpdatePassword\n',
        'Deleted a3d97b53-e38a-4b24-aed0-a021050eb744 (EmailSuspendNode) from UpdatePassword\n',
        'Deleted d018fcd1-4e22-4160-8c41-63bee51c9cb3 (PageNode) from UpdatePassword\n',
        'Deleted 21a99653-a7a7-47ee-b650-f493a84bba09 (ValidatedPasswordNode) from UpdatePassword\n',
        'Deleted d1b79744-493a-44fe-bc26-7d324a8caa4e (SessionDataNode) from UpdatePassword\n',
        'Deleted Login (tree)\n',
        'Read a12bc72f-ad97-4f1e-a789-a1fa3dd566c8 (PageNode) from Login\n',
        'Deleted 33b24514-3e50-4180-8f08-ab6f4e51b07e (InnerTreeEvaluatorNode) from Login\n',
        'Deleted 2998c1c9-f4c8-4a00-b2c6-3426783ee49d (DataStoreDecisionNode) from Login\n',
        'Deleted 7354982f-57b6-4b04-9ddc-f1dd1e1e07d0 (ValidatedUsernameNode) from Login\n',
        'Deleted bba3e0d8-8525-4e82-bf48-ac17f7988917 (IncrementLoginCountNode) from Login\n',
        'Deleted 0c80c39b-4813-4e67-b4fb-5a0bba85f994 (ValidatedPasswordNode) from Login\n',
        'Deleted a12bc72f-ad97-4f1e-a789-a1fa3dd566c8 (PageNode) from Login\n',
        '[========================================] 100% | 8/8 | Deleted 8/8 journeys and 51/51 nodes.\n',
      ];
      const chunks = [];
      deleteJourneyCmd.stderr.on('data', (chunk) => {
        chunks.push(chunk);
      });
      deleteJourneyCmd.stderr.on('end', () => {
        const output = Buffer.concat(chunks)
          .toString()
          .replace(ansiEscapeCodes, '');
        try {
          for (const str of expected) {
            expect(output).toContain(str);
          }
          done();
        } catch (error) {
          done(error);
        }
      });
    },
    // increase timeout for long-running test
    10 * 1000
  );

  it('"frodo journey delete -a --no-deep": should delete all journeys but none of their nodes', (done) => {
    const deleteJourneyCmd = spawn('frodo', [
      'journey',
      'delete',
      '-a',
      '--no-deep',
      'frodo-dev',
    ]);
    const expected = [
      '[========================================] 100% | 8/8 | Deleted 8/8 journeys and 0/0 nodes.',
      '',
    ].join('\n');
    const chunks = [];
    deleteJourneyCmd.stderr.on('data', (chunk) => {
      chunks.push(chunk);
    });
    deleteJourneyCmd.stderr.on('end', () => {
      const output = Buffer.concat(chunks)
        .toString()
        .replace(ansiEscapeCodes, '');
      try {
        expect(output).toContain(expected);
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  it('"frodo journey delete -a --no-deep --verbose": should delete all journeys but none of their nodes with verbose output', (done) => {
    const deleteJourneyCmd = spawn('frodo', [
      'journey',
      'delete',
      '-a',
      '--no-deep',
      '--verbose',
      'frodo-dev',
    ]);
    const expected = [
      '[----------------------------------------] 0% | 0/8 | Deleting journeys...\n',
      'Deleted ResetPassword (tree)\n',
      'Deleted Registration (tree)\n',
      'Deleted PasswordGrant (tree)\n',
      'Deleted ProgressiveProfile (tree)\n',
      'Deleted ForgottenUsername (tree)\n',
      'Deleted deleteMe (tree)\n',
      'Deleted UpdatePassword (tree)\n',
      'Deleted Login (tree)\n',
      '[========================================] 100% | 8/8 | Deleted 8/8 journeys and 0/0 nodes.\n',
    ];
    const chunks = [];
    deleteJourneyCmd.stderr.on('data', (chunk) => {
      chunks.push(chunk);
    });
    deleteJourneyCmd.stderr.on('end', () => {
      const output = Buffer.concat(chunks)
        .toString()
        .replace(ansiEscapeCodes, '');
      try {
        for (const str of expected) {
          expect(output).toContain(str);
        }
        done();
      } catch (error) {
        done(error);
      }
    });
  });
});
