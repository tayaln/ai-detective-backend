// The progress rules, as pure functions: completions and the mission's steps
// in, a decision out. No I/O. They are the only place that decides where a
// learner resumes and what state a mission is in; mission state is always
// derived, never stored.
//
// A completion means "the learner left this step going forwards" (or, for the
// ending, reached it), never "got it right"; attempts record that. The content
// is the authority on which steps exist and in what order: a completion whose
// step is no longer in the content is ignored.

/** The little a rule needs to know about a step. */
export interface StepRef {
  id: string;
  type: string;
}

export type MissionState = 'not-started' | 'in-progress' | 'complete';
export type ChapterState = 'complete' | 'current' | 'empty';

/** The completed step ids that still exist in the content. */
export function knownCompletions(
  steps: readonly StepRef[],
  completedStepIds: Iterable<string>,
): Set<string> {
  const known = new Set(steps.map((step) => step.id));
  return new Set([...completedStepIds].filter((id) => known.has(id)));
}

/** The mission's ending step (the last one of type "ending"), if it has one. */
function endingStep(steps: readonly StepRef[]): StepRef | undefined {
  return steps.findLast((step) => step.type === 'ending');
}

/**
 * Where a learner lands when they open a mission:
 * - the ending is complete (a finished mission, being replayed or not): the step
 *   after `lastStepId`, the last step the learner moved on from, so a replay picks
 *   up where it was left (its lead-in when that step is a quiz). When the last step
 *   moved on from is the ending, or there is none, the first step (the briefing),
 *   so a finished mission reopens from the start. It stays complete either way,
 *   since completions are never removed
 * - otherwise the first step, in content order, with no completion
 * - but when that step is a quiz, the step before it, so the learner re-enters
 *   the quiz through its lead-in
 * - every step complete but no ending: the last step
 *
 * `steps` must be non-empty; the content loader guarantees it.
 */
export function resolveResumeStep(
  steps: readonly StepRef[],
  completedStepIds: Iterable<string>,
  lastStepId?: string,
): string {
  const completed = knownCompletions(steps, completedStepIds);
  const ending = endingStep(steps);
  if (ending && completed.has(ending.id)) return replayStep(steps, ending, lastStepId);

  const index = steps.findIndex((step) => !completed.has(step.id));
  const next = steps[index];
  if (!next) return lastStep(steps).id;
  const leadIn = steps[index - 1];
  if (next.type === 'quiz' && leadIn) return leadIn.id;
  return next.id;
}

/** Where a finished mission resumes: after the last step moved on from (see above). */
function replayStep(steps: readonly StepRef[], ending: StepRef, lastStepId?: string): string {
  const index = steps.findIndex((step) => step.id === lastStepId);
  const next = steps[index + 1];
  if (index === -1 || lastStepId === ending.id || !next) return firstStep(steps).id;
  return next.type === 'quiz' ? (steps[index]?.id ?? next.id) : next.id;
}

function firstStep(steps: readonly StepRef[]): StepRef {
  const first = steps[0];
  if (!first) {
    throw new Error('A course must have at least one step');
  }
  return first;
}

function lastStep(steps: readonly StepRef[]): StepRef {
  const last = steps.at(-1);
  if (!last) {
    throw new Error('A course must have at least one step');
  }
  return last;
}

/** Not started (no completions), in progress, or complete (the ending is done). */
export function missionState(
  steps: readonly StepRef[],
  completedStepIds: Iterable<string>,
): MissionState {
  const completed = knownCompletions(steps, completedStepIds);
  if (completed.size === 0) return 'not-started';
  const ending = endingStep(steps);
  return ending && completed.has(ending.id) ? 'complete' : 'in-progress';
}

/**
 * The steps a learner may open by URL, in course order: every step up to the one
 * just after the furthest completed, or up to the resume step when that is further.
 * The client only checks whether a requested step is in this list.
 */
export function reachableSteps(
  steps: readonly StepRef[],
  completedStepIds: Iterable<string>,
): string[] {
  const completed = knownCompletions(steps, completedStepIds);
  const furthestCompleted = steps.findLastIndex((step) => completed.has(step.id));
  const resumeId = resolveResumeStep(steps, completed);
  const resumeIndex = steps.findIndex((step) => step.id === resumeId);
  const index = Math.min(Math.max(furthestCompleted + 1, resumeIndex), steps.length - 1);
  return steps.slice(0, index + 1).map((step) => step.id);
}

/**
 * One state per chapter, in course order. Only chapters count towards the bar.
 * A chapter is complete once the learner moved on from it (solved or not).
 * While the mission is in progress, the first incomplete chapter is current.
 */
export function chapterStates(
  steps: readonly StepRef[],
  completedStepIds: Iterable<string>,
): { stepId: string; state: ChapterState }[] {
  const status = missionState(steps, completedStepIds);
  const completed = knownCompletions(steps, completedStepIds);
  const chapters = steps.filter((step) => step.type === 'chapter');
  const done = chapters.map((chapter) => completed.has(chapter.id));
  const currentIndex = status === 'in-progress' ? done.indexOf(false) : -1;

  return chapters.map((chapter, i) => {
    let state: ChapterState = 'empty';
    if (done[i]) state = 'complete';
    else if (i === currentIndex) state = 'current';
    return { stepId: chapter.id, state };
  });
}
