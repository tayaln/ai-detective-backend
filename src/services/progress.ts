import { findCompletions, markStepCompleted } from '../db/progress.ts';

// Facts only: which steps the learner completed, and when. The frontend holds
// the content, so it alone decides where a learner resumes and whether a
// mission is finished. Nothing here knows step order or which step is the ending.

export interface Completion {
  stepId: string;
  completedAt: Date;
}

export function completeStep(learnerId: string, courseId: string, stepId: string): Promise<void> {
  return markStepCompleted(learnerId, courseId, stepId);
}

/** One mission's completions; a mission never started is an empty list. */
export async function getCourseCompletions(learnerId: string, courseId: string) {
  const rows = await findCompletions(learnerId, courseId);
  return {
    courseId,
    completions: rows.map(({ stepId, completedAt }): Completion => ({ stepId, completedAt })),
  };
}

/** Every completion, grouped by mission. Missions with none are absent. */
export async function getAllCompletions(learnerId: string) {
  const courses = new Map<string, Completion[]>();
  for (const { courseId, stepId, completedAt } of await findCompletions(learnerId)) {
    const completions = courses.get(courseId) ?? [];
    completions.push({ stepId, completedAt });
    courses.set(courseId, completions);
  }
  return {
    courses: [...courses].map(([courseId, completions]) => ({ courseId, completions })),
  };
}
