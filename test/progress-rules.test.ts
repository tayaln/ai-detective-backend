// The progress rules on their own: completed step ids in, a verdict out. No
// database. The steps mirror test/fixtures/content/demo.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  chapterStates,
  missionState,
  reachableSteps,
  resolveResumeStep,
  type StepRef,
} from '../src/lib/progress-rules.ts';

const STEPS: StepRef[] = [
  { id: 'briefing', type: 'briefing' },
  { id: 'ch-1', type: 'chapter' },
  { id: 'story-1', type: 'story' },
  { id: 'ch-2', type: 'chapter' },
  { id: 'quiz-1', type: 'quiz' },
  { id: 'ch-3', type: 'chapter' },
  { id: 'ending', type: 'ending' },
];

/** Every step before `stepId`: the learner is standing on it. */
function upTo(stepId: string): string[] {
  return STEPS.slice(
    0,
    STEPS.findIndex((step) => step.id === stepId),
  ).map((step) => step.id);
}

function states(completed: string[]): string {
  return chapterStates(STEPS, completed)
    .map((chapter) => chapter.state)
    .join(',');
}

describe('progress rules', () => {
  test('reachable steps are every step up to the furthest reachable one, in order', () => {
    assert.deepEqual(reachableSteps(STEPS, upTo('quiz-1')), [
      'briefing',
      'ch-1',
      'story-1',
      'ch-2',
      'quiz-1',
    ]);
  });

  test('a mission never started resumes at the briefing with every chapter empty', () => {
    assert.equal(missionState(STEPS, []), 'not-started');
    assert.equal(resolveResumeStep(STEPS, []), 'briefing');
    assert.equal(reachableSteps(STEPS, []).at(-1), 'briefing');
    assert.equal(states([]), 'empty,empty,empty');
  });

  test('after the briefing the first chapter is current', () => {
    const completed = ['briefing'];
    assert.equal(missionState(STEPS, completed), 'in-progress');
    assert.equal(resolveResumeStep(STEPS, completed), 'ch-1');
    assert.equal(reachableSteps(STEPS, completed).at(-1), 'ch-1');
    assert.equal(states(completed), 'current,empty,empty');
  });

  test('a story between chapters is not counted as a chapter', () => {
    const completed = upTo('ch-2');
    assert.equal(resolveResumeStep(STEPS, completed), 'ch-2');
    assert.equal(states(completed), 'complete,current,empty');
  });

  test('when the next step is a quiz, the learner resumes at its lead-in', () => {
    const completed = upTo('quiz-1');
    assert.equal(resolveResumeStep(STEPS, completed), 'ch-2');
    // The quiz itself can still be opened by URL.
    assert.equal(reachableSteps(STEPS, completed).at(-1), 'quiz-1');
    assert.equal(states(completed), 'complete,complete,current');
  });

  test('reaching the ending completes the mission, with no current chapter', () => {
    const completed = STEPS.map((step) => step.id);
    assert.equal(missionState(STEPS, completed), 'complete');
    // A finished mission reopens from its briefing; every step stays reachable.
    assert.equal(resolveResumeStep(STEPS, completed), 'briefing');
    assert.equal(reachableSteps(STEPS, completed).at(-1), 'ending');
    assert.equal(states(completed), 'complete,complete,complete');
  });

  test('a replay of a finished mission resumes after the last step moved on from', () => {
    const all = STEPS.map((step) => step.id);
    // Moved on from the ending (just finished): back to the briefing.
    assert.equal(resolveResumeStep(STEPS, all, 'ending'), 'briefing');
    // Replaying, moved on from the briefing and chapter 1: the story after it.
    assert.equal(resolveResumeStep(STEPS, all, 'ch-1'), 'story-1');
    assert.equal(resolveResumeStep(STEPS, all, 'story-1'), 'ch-2');
    // A quiz next: its lead-in, as on a first run.
    assert.equal(resolveResumeStep(STEPS, all, 'ch-2'), 'ch-2');
    // Still complete throughout: completions are never removed.
    assert.equal(missionState(STEPS, all), 'complete');
  });

  test('a replay position for a step no longer in the content falls back to the briefing', () => {
    const all = STEPS.map((step) => step.id);
    assert.equal(resolveResumeStep(STEPS, all, 'removed-step'), 'briefing');
  });

  test('the position is ignored for a mission not yet finished', () => {
    assert.equal(resolveResumeStep(STEPS, upTo('ch-2'), 'briefing'), 'ch-2');
  });

  test('every chapter done but the ending not reached is still in progress', () => {
    const completed = upTo('ending');
    assert.equal(missionState(STEPS, completed), 'in-progress');
    assert.equal(resolveResumeStep(STEPS, completed), 'ending');
    assert.equal(states(completed), 'complete,complete,complete');
  });

  test('a chapter skipped ahead to: resume at the gap, reach past the furthest done', () => {
    const completed = ['briefing', 'ch-3'];
    assert.equal(resolveResumeStep(STEPS, completed), 'ch-1');
    assert.equal(reachableSteps(STEPS, completed).at(-1), 'ending');
    assert.equal(states(completed), 'current,empty,complete');
  });

  test('completions for steps no longer in the content are ignored', () => {
    const completed = ['removed-step', 'another-old-step'];
    assert.equal(missionState(STEPS, completed), 'not-started');
    assert.equal(resolveResumeStep(STEPS, completed), 'briefing');
    assert.equal(states(completed), 'empty,empty,empty');
  });

  test('a mission without an ending, every step done, resumes at its last step', () => {
    const steps: StepRef[] = [
      { id: 'b', type: 'briefing' },
      { id: 'c', type: 'chapter' },
    ];
    assert.equal(missionState(steps, ['b', 'c']), 'in-progress');
    assert.equal(resolveResumeStep(steps, ['b', 'c']), 'c');
    assert.equal(reachableSteps(steps, ['b', 'c']).at(-1), 'c');
  });

  test('a quiz as the very first step is resumed at itself', () => {
    const steps: StepRef[] = [
      { id: 'q', type: 'quiz' },
      { id: 'c', type: 'chapter' },
    ];
    assert.equal(resolveResumeStep(steps, []), 'q');
  });
});
