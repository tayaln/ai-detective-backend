// Creates two test learners with known emails, completed profiles and fixed
// step completions. Safe to run repeatedly: it deletes only the learners it
// creates (matched by exact email) and recreates them. Never runs in production.
import { prisma } from '../db/client.ts';
import { auth } from '../lib/auth.ts';
import { config } from '../lib/config.ts';

if (config.NODE_ENV === 'production') {
  process.stderr.write('Refusing to seed: NODE_ENV is production.\n');
  process.exit(1);
}

// Mission 1's step ids, copied in order from the frontend's
// content/courses/search-agent/course.json. The backend stores step ids as
// given; this order exists only to build realistic fixtures.
const SEARCH_AGENT_STEPS = [
  'sa-briefing',
  'sa-ch-1-install-ai-toolkit',
  'sa-ch-2-read-the-response',
  'sa-ch-3-getting-the-api-key',
  'sa-media-alert',
  'sa-ch-4-give-the-ai-a-task',
  'sa-quiz-1',
  'sa-ch-5-send-your-first-ai-request',
  'sa-ch-6-read-the-response',
  'sa-nova-alert',
  'sa-ch-7-give-the-ai-a-search-tool',
  'sa-ch-8-connect-the-search-service',
  'sa-quiz-2',
  'sa-ch-9-give-your-ai-a-search-tool',
  'sa-ch-10-create-the-ai-agent',
  'sa-competitor-funding',
  'sa-ch-11-run-the-ai-agent',
  'sa-ch-12-read-the-agents-response',
  'sa-closing-media-alert',
  'sa-notebook-download',
  'sa-case-report',
];

/** Every step before `stepId`, i.e. completed up to the point of standing on it. */
function stepsBefore(stepId: string): string[] {
  return SEARCH_AGENT_STEPS.slice(0, SEARCH_AGENT_STEPS.indexOf(stepId));
}

const SEED_LEARNERS = [
  {
    email: 'learner.one@example.test',
    profile: { detectiveName: 'Detective Asha', avatarId: 'female-1', soundOn: true },
    // Partway through mission 1: everything through chapter 4 (so the media
    // alert too) is complete, and there is no row for the quiz that follows.
    // The resolver lands this learner mid-quiz.
    completions: [{ courseId: 'search-agent', stepIds: stepsBefore('sa-quiz-1') }],
  },
  {
    email: 'learner.two@example.test',
    profile: { detectiveName: 'Detective Ravi', avatarId: 'male-2', soundOn: false },
    // Mission 1 finished, ending included; mission 2 (semantic-cache) not started.
    completions: [{ courseId: 'search-agent', stepIds: SEARCH_AGENT_STEPS }],
  },
];

const MINUTE = 60 * 1000;

const emails = SEED_LEARNERS.map((learner) => learner.email);

// Cascades to profiles, step completions, attempts, feedback, Saral messages and sessions.
const removed = await prisma.user.deleteMany({ where: { email: { in: emails } } });

// Created through Better Auth so its tables are written its way, and its
// user-create hook adds the empty profile exactly as for a real sign-up.
const authContext = await auth.$context;
for (const learner of SEED_LEARNERS) {
  const user = await authContext.internalAdapter.createUser(
    { email: learner.email, name: '', emailVerified: true },
    { method: 'email-otp' },
  );
  await prisma.profile.update({ where: { learnerId: user.id }, data: learner.profile });
  for (const { courseId, stepIds } of learner.completions) {
    // A minute apart in step order, ending now, so the timestamps read like a journey.
    const start = Date.now() - stepIds.length * MINUTE;
    await prisma.courseStepCompletion.createMany({
      data: stepIds.map((stepId, index) => ({
        learnerId: user.id,
        courseId,
        stepId,
        completedAt: new Date(start + (index + 1) * MINUTE),
      })),
    });
  }
}

await prisma.$disconnect();

process.stdout.write(
  [
    `Seeded ${SEED_LEARNERS.length} learners (replaced ${removed.count}).`,
    ...SEED_LEARNERS.map(
      (learner) =>
        `  ${learner.email}  ${learner.profile.detectiveName}  ` +
        learner.completions
          .map(
            (c) => `${c.courseId}: ${c.stepIds.length} steps completed, last ${c.stepIds.at(-1)}`,
          )
          .join('; '),
    ),
    '',
  ].join('\n'),
);
