import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import {
  extractExamples,
  fullName,
  leafCommands,
  loadCommandTree,
  renderFullHelp,
} from '../utils/CommandExamples.js';

/**
 * The AI agent commands as the real command tree has them (cli#1271): the root
 * group `frodo aiagent`, and `frodo agent ai` registered from the same commands
 * and marked deprecated. The tree is built the way src/app.ts builds it.
 */

const VERBS = ['delete', 'describe', 'export', 'import', 'list'];
const originalArgv = process.argv;
let aiagent;
let agentAi;
let agent;

beforeAll(async () => {
  // The examples are only rendered for -hhh (see FrodoCommand.addHelpText).
  process.argv = [...originalArgv, '--help-all'];
  const { groups } = await loadCommandTree();
  aiagent = groups.find((group) => group.name() === 'aiagent');
  agent = groups.find((group) => group.name() === 'agent');
  agentAi = agent?.commands.find((command) => command.name() === 'ai');
});

afterAll(() => {
  process.argv = originalArgv;
});

const names = (group) =>
  group.commands
    .map((command) => command.name())
    .filter((name) => name !== 'help')
    .sort();
const flagsOf = (command) => command.options.map((option) => option.flags);
/** What the help says a command is: its description, with the stability badge in front (an option may carry a badge of its own). */
const descriptionOf = (command) => renderFullHelp(command).split('\n\n')[1];

describe('the root group frodo aiagent', () => {
  it('is a group of the command tree (app.ts imports it) with the five usual verbs', () => {
    expect(aiagent).toBeDefined();
    expect(aiagent.description()).toBe('Manage AI agents.');
    expect(names(aiagent)).toEqual(VERBS);
  });

  it('is not deprecated, and neither are its commands', () => {
    for (const command of [aiagent, ...leafCommands(aiagent)]) {
      expect(descriptionOf(command)).not.toContain('[Deprecated]');
    }
  });

  it('never names the old path in its help', () => {
    for (const leaf of leafCommands(aiagent)) {
      expect(renderFullHelp(leaf)).not.toMatch(/agent ai\b/);
    }
  });

  it('has usage examples on every command, and they all use the new path', () => {
    for (const leaf of leafCommands(aiagent)) {
      const examples = extractExamples(renderFullHelp(leaf));
      expect(examples.length).toBeGreaterThan(0);
      for (const example of examples) {
        expect(example).toMatch(
          new RegExp(`^frodo aiagent ${leaf.name()}( |$)`)
        );
      }
    }
  });
});

describe('the deprecated group frodo agent ai', () => {
  it('stays registered under agent, with the same commands and options as frodo aiagent', () => {
    expect(agentAi).toBeDefined();
    expect(names(agentAi)).toEqual(VERBS);
    for (const verb of VERBS) {
      const old = agentAi.commands.find((command) => command.name() === verb);
      const current = aiagent.commands.find(
        (command) => command.name() === verb
      );
      expect(flagsOf(old)).toEqual(flagsOf(current));
      expect(old.description()).toBe(current.description());
      expect(old.registeredArguments.map((a) => a.name())).toEqual(
        current.registeredArguments.map((a) => a.name())
      );
    }
  });

  it('is a group of its own, not the instance of frodo aiagent', () => {
    expect(agentAi).not.toBe(aiagent);
    expect(agentAi.parent).toBe(agent);
    expect(aiagent.parent).toBeNull();
  });

  it('starts its description with the deprecation and names frodo aiagent', () => {
    expect(agentAi.description()).toBe(
      'Deprecated: use frodo aiagent. Manage AI agents.'
    );
  });

  it('marks the group and every command deprecated in the help', () => {
    expect(descriptionOf(agentAi)).toBe(
      '[Deprecated] Deprecated: use frodo aiagent. Manage AI agents.'
    );
    expect(renderFullHelp(agent)).toMatch(/\bai\s+\[Deprecated\]/);
    for (const leaf of leafCommands(agentAi)) {
      expect(renderFullHelp(agentAi)).toMatch(
        new RegExp(`${leaf.name()}\\s+\\[Deprecated\\]`)
      );
      expect(descriptionOf(leaf)).toMatch(/^\[Deprecated\] /);
    }
  });

  it('is the only deprecated group of agent', () => {
    for (const group of agent.commands.filter(
      (command) => command.name() !== 'ai'
    )) {
      expect(descriptionOf(group)).not.toContain('[Deprecated]');
    }
    expect(fullName(agentAi)).toBe('frodo agent ai');
  });
});
