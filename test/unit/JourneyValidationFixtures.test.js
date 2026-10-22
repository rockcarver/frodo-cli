import fs from 'fs';
import { validateJourneys } from '../../src/ops/JourneyValidationOps';

const classicFile =
  'test/e2e/exports/all-separate/classic/realm/root/journey/Agent.journey.json';
const cloudFile =
  'test/e2e/exports/all-separate/cloud/realm/root-alpha/journey/Login.journey.json';

describe('journey validation export fixtures', () => {
  test('validates a classic journey without tree.staticNodes', async () => {
    const journey = JSON.parse(fs.readFileSync(classicFile, 'utf8')).trees
      .Agent;
    expect(journey.tree).not.toHaveProperty('staticNodes');

    await expect(validateJourneys(['Agent'], classicFile)).resolves.toBe(true);
  });

  test('validates a cloud journey with Page Node inner outcomes', async () => {
    const journey = JSON.parse(fs.readFileSync(cloudFile, 'utf8')).trees.Login;
    expect(
      Object.values(journey.nodes).some(
        (node) => node._type?._id === 'PageNode'
      )
    ).toBe(true);
    expect(Object.keys(journey.innerNodes).length).toBeGreaterThan(0);

    await expect(validateJourneys(['Login'], cloudFile)).resolves.toBe(true);
  });
});
