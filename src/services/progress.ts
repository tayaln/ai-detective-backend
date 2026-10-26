import { findCompletions, findPositions, markStepCompleted } from '../db/progress.ts';
import { findStep, getCourse, listCourses, type Course } from '../lib/content.ts';
import { AppError } from '../lib/errors.ts';
import {
  chapterStates,
  knownCompletions,
  missionState,
  reachableSteps,
  resolveResumeStep,
} from './progress-rules.ts';

// Completions are the stored facts; everything the learner sees about their
// progress is worked out here from those and the course content, so the
// frontend displays it without calculating anything.

/**
 * Records a completion for a step that exists in that mission's content, and
 * returns the mission's progress after it, so the client never works it out.
 */
export async function completeStep(learnerId: string, courseId: string, stepId: string) {
  if (!getCourse(courseId)) {
    throw courseNotFound();
  }
  if (!findStep(courseId, stepId)) {
    throw new AppError(404, 'NOT_FOUND', 'That step does not exist in this mission.');
  }
  await markStepCompleted(learnerId, courseId, stepId);
  return getCourseProgress(learnerId, courseId);
}

/** One mission's progress; a mission never started is reported as not started. */
export async function getCourseProgress(learnerId: string, courseId: string) {
  const course = getCourse(courseId);
  if (!course) {
    throw courseNotFound();
  }
  const [rows, [position]] = await Promise.all([
    findCompletions(learnerId, courseId),
    findPositions(learnerId, courseId),
  ]);
  return summarize(
    course,
    rows.map((row) => row.stepId),
    position?.stepId,
  );
}

/** Every mission in the content, including ones never started. */
export async function getAllProgress(learnerId: string) {
  const completedByCourse = new Map<string, string[]>();
  const [rows, positions] = await Promise.all([
    findCompletions(learnerId),
    findPositions(learnerId),
  ]);
  for (const { courseId, stepId } of rows) {
    const stepIds = completedByCourse.get(courseId) ?? [];
    stepIds.push(stepId);
    completedByCourse.set(courseId, stepIds);
  }
  const lastStepByCourse = new Map(positions.map(({ courseId, stepId }) => [courseId, stepId]));
  return {
    courses: listCourses().map((course) =>
      summarize(course, completedByCourse.get(course.id) ?? [], lastStepByCourse.get(course.id)),
    ),
  };
}

function summarize(course: Course, completedStepIds: readonly string[], lastStepId?: string) {
  const { steps } = course;
  const chapters = chapterStates(steps, completedStepIds);
  const completed = knownCompletions(steps, completedStepIds);
  return {
    courseId: course.id,
    status: missionState(steps, completedStepIds),
    resumeStepId: resolveResumeStep(steps, completedStepIds, lastStepId),
    reachableStepIds: reachableSteps(steps, completedStepIds),
    completedChapters: chapters.filter((chapter) => chapter.state === 'complete').length,
    totalChapters: chapters.length,
    chapters,
    // In course order, and only steps still in the content.
    completedStepIds: steps.filter((step) => completed.has(step.id)).map((step) => step.id),
  };
}

function courseNotFound(): AppError {
  return new AppError(404, 'NOT_FOUND', 'That mission does not exist.');
}
