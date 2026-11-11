import { describe, expect, it } from '@jest/globals';
import {
  NEXT_LABEL,
  READY_ESCAPE_LABEL,
  readyChoices,
  readyEnterLabel,
  readyStepWanted,
} from './ReadyStep';

describe('readyStepWanted', () => {
  it('is wanted when the pass put a prompt on the screen', () => {
    expect(readyStepWanted(0, 1)).toBe(true);
    expect(readyStepWanted(0, 4)).toBe(true);
  });

  it('is not wanted when the pass rendered nothing: a complete command line', () => {
    expect(readyStepWanted(0, 0)).toBe(false);
  });

  it('does not count a prompt that came before the pass, such as the sub-command picker', () => {
    expect(readyStepWanted(1, 1)).toBe(false);
    expect(readyStepWanted(3, 4)).toBe(true);
  });
});

describe('readyEnterLabel', () => {
  it('says run only on the Run row', () => {
    expect(readyEnterLabel('run')).toBe('run');
    expect(readyEnterLabel('edit')).not.toBe('run');
    expect(readyEnterLabel('cancel')).not.toBe('run');
  });

  it('says what the other rows do', () => {
    expect(readyEnterLabel('edit')).toBe('edit options');
    expect(readyEnterLabel('cancel')).toBe('cancel');
  });

  it('hides the key when no row is highlighted', () => {
    expect(readyEnterLabel(undefined)).toBe('');
    expect(readyEnterLabel('something else')).toBe('');
  });
});

describe('labels', () => {
  it('names the prompts of the pass next, never run', () => {
    expect(NEXT_LABEL).toBe('next');
    expect(NEXT_LABEL).not.toBe(readyEnterLabel('run'));
  });

  it('says Escape cancels on the Ready step', () => {
    expect(READY_ESCAPE_LABEL).toBe('cancel');
  });
});

describe('readyChoices', () => {
  it('offers Run first, then Edit options, then Cancel', () => {
    const choices = readyChoices({ canEdit: true });
    expect(choices.map((choice) => choice.value)).toEqual([
      'run',
      'edit',
      'cancel',
    ]);
    expect(choices.map((choice) => choice.name)).toEqual([
      'Run',
      'Edit options',
      'Cancel',
    ]);
  });

  it('leaves out Edit options when there is nothing to edit', () => {
    const choices = readyChoices({ canEdit: false });
    expect(choices.map((choice) => choice.value)).toEqual(['run', 'cancel']);
  });

  it('says nothing about input that is still open: the pickers that need a login ran before the step', () => {
    for (const canEdit of [true, false]) {
      for (const choice of readyChoices({ canEdit })) {
        expect(choice.description).not.toContain('after login');
        expect(choice.description).not.toContain('still open');
      }
    }
    expect(readyChoices({ canEdit: true })[0].description).toBe(
      'Run the command shown below.'
    );
  });

  it('gives every row a description', () => {
    for (const choice of readyChoices({ canEdit: true })) {
      expect(choice.description).toBeTruthy();
    }
  });
});
