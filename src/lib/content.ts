import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { config } from './config.ts';

// The course content, loaded once at startup from the bundle the frontend build
// emits: <CONTENT_BUNDLE_PATH>/<courseId>/course-bundle.json. Only what progress
// needs is checked here; the rest of each step passes through untouched.

const BUNDLE_FILE = 'course-bundle.json';
// The source file the bundle is built from. Same id and steps, so local
// development can point straight at the frontend's content/courses folder.
const SOURCE_FILE = 'course.json';

const stepSchema = z.looseObject({
  id: z.string().min(1),
  type: z.string().min(1),
});

const courseSchema = z.looseObject({
  id: z.string().min(1),
  steps: z.array(stepSchema).min(1, 'must have at least one step'),
});

export type Step = z.infer<typeof stepSchema>;
export type Course = z.infer<typeof courseSchema>;

let courses: ReadonlyMap<string, Course> | undefined;

/**
 * Reads and checks every mission. Any problem stops startup: without content,
 * progress cannot be worked out. Messages name the file, never its contents.
 */
export function loadContent(): number {
  const root = config.CONTENT_BUNDLE_PATH;
  const problems: string[] = [];
  const loaded = new Map<string, Course>();

  let folders: string[] = [];
  try {
    folders = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    problems.push(`CONTENT_BUNDLE_PATH is not a readable directory: ${root}`);
  }

  for (const folder of folders) {
    const bundle = path.join(root, folder, BUNDLE_FILE);
    const source = path.join(root, folder, SOURCE_FILE);
    const file = existsSync(bundle) ? bundle : existsSync(source) ? source : undefined;
    if (!file) {
      continue;
    }
    const problem = readCourse(file, folder, loaded);
    if (problem) {
      problems.push(problem);
    }
  }

  if (problems.length === 0 && loaded.size === 0) {
    problems.push(`no ${BUNDLE_FILE} found under CONTENT_BUNDLE_PATH: ${root}`);
  }
  if (problems.length > 0) {
    // Runs before the server starts; like config, it writes to stderr and exits.
    process.stderr.write(`Invalid course content:\n${problems.map((p) => `  ${p}`).join('\n')}\n`);
    process.exit(1);
  }

  courses = loaded;
  return loaded.size;
}

/** Parses one course file into `loaded`. Returns a problem, or an empty string. */
function readCourse(file: string, folder: string, loaded: Map<string, Course>): string {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return `${file}: not readable JSON`;
  }
  const result = courseSchema.safeParse(raw);
  if (!result.success) {
    const [issue] = result.error.issues;
    const where = issue?.path.map(String).join('.') || '(root)';
    return `${file}: ${where} ${issue?.message ?? 'is not a valid course'}`;
  }
  const course = result.data;
  if (course.id !== folder) {
    return `${file}: id "${course.id}" does not match its folder "${folder}"`;
  }
  const seen = new Set<string>();
  for (const step of course.steps) {
    if (seen.has(step.id)) {
      return `${file}: step id "${step.id}" appears more than once`;
    }
    seen.add(step.id);
  }
  loaded.set(course.id, course);
  return '';
}

function loadedCourses(): ReadonlyMap<string, Course> {
  if (!courses) {
    throw new Error('Course content has not been loaded');
  }
  return courses;
}

/** Every mission, in course id order. */
export function listCourses(): Course[] {
  return [...loadedCourses().values()];
}

export function getCourse(courseId: string): Course | undefined {
  return loadedCourses().get(courseId);
}

export function findStep(courseId: string, stepId: string): Step | undefined {
  return getCourse(courseId)?.steps.find((step) => step.id === stepId);
}
