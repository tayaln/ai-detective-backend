import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';
import { getCourse } from './content.ts';

const SYSTEM_PROMPT_FILE = 'system-prompt.txt';
const CONTENT_SUFFIX = '.content.txt';
const CODE_SUFFIX = '.code.txt';

export interface SaralBlock {
  courseId: string;
  chapterStepIds: ReadonlySet<string>;
  systemPrompt: string;
}

let blocks: ReadonlyMap<string, SaralBlock> | undefined;

export function loadSaralContent(): number {
  const root = config.SARAL_BLOCK_PATH;
  const problems: string[] = [];

  const systemPrompt = loadFile(path.join(root, SYSTEM_PROMPT_FILE), SYSTEM_PROMPT_FILE, problems);

  const loaded = new Map<string, SaralBlock>();

  if (systemPrompt) {
    const courseIds = discoverCourseIds(root);
    for (const courseId of courseIds) {
      loadMission(root, courseId, systemPrompt, loaded, problems);
    }
  }

  if (problems.length === 0 && loaded.size === 0) {
    problems.push(`no mission content/code files found under ${root}`);
  }

  if (problems.length > 0) {
    process.stderr.write(`Invalid Saral content:\n${problems.map((p) => `  ${p}`).join('\n')}\n`);
    process.exit(1);
  }

  blocks = loaded;
  return loaded.size;
}

function discoverCourseIds(root: string): string[] {
  const ids = new Set<string>();
  let entries: string[];
  try {
    entries = readdirSync(root).sort();
  } catch {
    return [];
  }
  for (const name of entries) {
    if (name.endsWith(CONTENT_SUFFIX)) {
      ids.add(name.slice(0, -CONTENT_SUFFIX.length));
    } else if (name.endsWith(CODE_SUFFIX)) {
      ids.add(name.slice(0, -CODE_SUFFIX.length));
    }
  }
  return [...ids].sort();
}

function loadMission(
  root: string,
  courseId: string,
  systemPrompt: string,
  loaded: Map<string, SaralBlock>,
  problems: string[],
): void {
  const contentFile = `${courseId}${CONTENT_SUFFIX}`;
  const codeFile = `${courseId}${CODE_SUFFIX}`;

  const content = loadFile(path.join(root, contentFile), contentFile, problems);
  const code = loadFile(path.join(root, codeFile), codeFile, problems);
  if (!content || !code) return;

  const course = getCourse(courseId);
  if (!course) {
    problems.push(`${courseId}: content/code files exist but no matching course in content bundle`);
    return;
  }

  const chapterStepIds = new Set<string>();
  for (const step of course.steps) {
    if (step.type === 'chapter') {
      chapterStepIds.add(step.id);
    }
  }

  loaded.set(courseId, {
    courseId,
    chapterStepIds,
    systemPrompt: [systemPrompt, content, code].join('\n\n'),
  });
}

function loadFile(filePath: string, label: string, problems: string[]): string | null {
  if (!existsSync(filePath)) {
    problems.push(`${label}: file not found (${filePath})`);
    return null;
  }
  const text = readFileSync(filePath, 'utf8').trim();
  if (!text) {
    problems.push(`${label}: file is empty (${filePath})`);
    return null;
  }
  return text;
}

function loadedBlocks(): ReadonlyMap<string, SaralBlock> {
  if (!blocks) {
    throw new Error('Saral content has not been loaded');
  }
  return blocks;
}

export function getSaralBlock(courseId: string): SaralBlock | undefined {
  return loadedBlocks().get(courseId);
}
