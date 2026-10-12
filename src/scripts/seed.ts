// Creates two test learners with known emails, completed profiles and fixed
// progress. Safe to run repeatedly: it deletes only the learners it creates
// (matched by exact email) and recreates them. Never runs in production.
import { prisma } from '../db/client.ts';
import { auth } from '../lib/auth.ts';
import { config } from '../lib/config.ts';

if (config.NODE_ENV === 'production') {
  process.stderr.write('Refusing to seed: NODE_ENV is production.\n');
  process.exit(1);
}

// IDs match the frontend content: mission 1 is "search-agent".
const SEED_LEARNERS = [
  {
    email: 'learner.one@example.test',
    profile: { detectiveName: 'Detective Asha', avatarId: 'female-1', soundOn: true },
    // Partway through mission 1, just past the first quiz.
    progress: [{ courseId: 'search-agent', currentStepId: 'sa-ch-5-send-your-first-ai-request' }],
  },
  {
    email: 'learner.two@example.test',
    profile: { detectiveName: 'Detective Ravi', avatarId: 'male-2', soundOn: false },
    progress: [],
  },
];

const emails = SEED_LEARNERS.map((learner) => learner.email);

// Cascades to profiles, progress, attempts, feedback, Saral messages and sessions.
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
  for (const progress of learner.progress) {
    await prisma.courseProgress.create({ data: { learnerId: user.id, ...progress } });
  }
}

await prisma.$disconnect();

process.stdout.write(
  [
    `Seeded ${SEED_LEARNERS.length} learners (replaced ${removed.count}).`,
    ...SEED_LEARNERS.map(
      (learner) =>
        `  ${learner.email}  ${learner.profile.detectiveName}  ` +
        (learner.progress.length
          ? learner.progress.map((p) => `${p.courseId} at ${p.currentStepId}`).join(', ')
          : 'no progress'),
    ),
    '',
  ].join('\n'),
);
