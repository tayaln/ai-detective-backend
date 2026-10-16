// The progress endpoints end to end: a real app on a local port, real bearer
// tokens, and the database in DATABASE_URL. The content is the fixture course in
// test/fixtures/content. Removes every learner it creates.
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../src/app/app.ts';
import { prisma } from '../src/db/client.ts';
import { auth, AUTH_TOKEN_HEADER } from '../src/lib/auth.ts';
import { loadContent } from '../src/lib/content.ts';

const TEST_DOMAIN = '@progress.example.test';

let server: http.Server;
let port = 0;

interface Reply {
  status: number;
  body: Record<string, unknown>;
}

/** One request to the app. `fetch` is disabled in tests, so this uses node:http. */
function call(method: string, path: string, token?: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port,
        path: `/api${path}`,
        method,
        headers: token ? { authorization: `Bearer ${token}` } : {},
      },
      (response) => {
        let raw = '';
        response.on('data', (chunk: Buffer) => (raw += chunk.toString()));
        response.on('end', () => {
          const body = JSON.parse(raw || '{}') as Record<string, unknown>;
          resolve({ status: response.statusCode ?? 0, body });
        });
      },
    );
    request.on('error', reject);
    request.end();
  });
}

/** Signs a new learner in, the way the OTP flow does, and returns their token and id. */
async function newLearner(name: string): Promise<{ token: string; id: string }> {
  const email = `${name}-${process.pid}${TEST_DOMAIN}`;
  const otp = await auth.api.createVerificationOTP({ body: { email, type: 'sign-in' } });
  const { headers, response } = await auth.api.signInEmailOTP({
    body: { email, otp },
    returnHeaders: true,
  });
  const token = headers.get(AUTH_TOKEN_HEADER);
  assert.ok(token, 'sign-in returned a token');
  return { token, id: response.user.id };
}

function course(reply: Reply, courseId: string): Record<string, unknown> {
  const courses = reply.body.courses as Record<string, unknown>[];
  const found = courses.find((entry) => entry.courseId === courseId);
  assert.ok(found, `${courseId} is in the reply`);
  return found;
}

async function removeTestData(): Promise<void> {
  await prisma.user.deleteMany({ where: { email: { endsWith: TEST_DOMAIN } } });
  await prisma.verification.deleteMany({ where: { identifier: { contains: TEST_DOMAIN } } });
}

describe('progress endpoints', () => {
  before(async () => {
    await removeTestData();
    loadContent();
    server = createApp().listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    port = (server.address() as AddressInfo).port;
  });
  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await removeTestData();
    await prisma.$disconnect();
  });

  test('every progress endpoint needs a token', async () => {
    assert.equal((await call('GET', '/progress')).status, 401);
    assert.equal((await call('GET', '/progress/demo')).status, 401);
    assert.equal((await call('PUT', '/progress/demo/steps/demo-briefing')).status, 401);
  });

  test('a new learner sees every mission, not started, resuming at the briefing', async () => {
    const { token } = await newLearner('fresh');
    const reply = await call('GET', '/progress', token);
    assert.equal(reply.status, 200);
    assert.deepEqual(
      (reply.body.courses as { courseId: string }[]).map((entry) => entry.courseId),
      ['demo', 'no-ending'],
    );
    assert.deepEqual(course(reply, 'demo'), {
      courseId: 'demo',
      status: 'not-started',
      resumeStepId: 'demo-briefing',
      reachableStepIds: ['demo-briefing'],
      completedChapters: 0,
      totalChapters: 3,
      chapters: [
        { stepId: 'demo-ch-1', state: 'empty' },
        { stepId: 'demo-ch-2', state: 'empty' },
        { stepId: 'demo-ch-3', state: 'empty' },
      ],
      completedStepIds: [],
    });
  });

  test('completing a step replies with the progress after it', async () => {
    const { token } = await newLearner('mover');
    await call('PUT', '/progress/demo/steps/demo-briefing', token);
    const reply = await call('PUT', '/progress/demo/steps/demo-ch-1', token);
    assert.equal(reply.status, 200);
    assert.equal(reply.body.status, 'in-progress');
    assert.equal(reply.body.resumeStepId, 'demo-story-1');
    assert.equal(reply.body.completedChapters, 1);
    assert.deepEqual(reply.body.completedStepIds, ['demo-briefing', 'demo-ch-1']);
    // The GET agrees with the PUT's reply.
    assert.deepEqual((await call('GET', '/progress/demo', token)).body, reply.body);
  });

  test('an unsubmitted quiz is where the learner resumes; a submitted one is passed', async () => {
    const { token } = await newLearner('quiz');
    for (const step of ['demo-briefing', 'demo-ch-1', 'demo-story-1', 'demo-ch-2']) {
      await call('PUT', `/progress/demo/steps/${step}`, token);
    }
    const reply = await call('GET', '/progress/demo', token);
    assert.equal(reply.body.resumeStepId, 'demo-quiz-1');
    assert.deepEqual(reply.body.reachableStepIds, [
      'demo-briefing',
      'demo-ch-1',
      'demo-story-1',
      'demo-ch-2',
      'demo-quiz-1',
    ]);
    const submitted = await call('PUT', '/progress/demo/steps/demo-quiz-1', token);
    assert.equal(submitted.body.resumeStepId, 'demo-ch-3');
  });

  test('reaching the ending completes the mission', async () => {
    const { token } = await newLearner('finisher');
    const reply = await call('PUT', '/progress/demo/steps/demo-ending', token);
    assert.equal(reply.body.status, 'complete');
    // A finished mission reopens from its briefing, with every step reachable.
    assert.equal(reply.body.resumeStepId, 'demo-briefing');
    assert.equal((reply.body.reachableStepIds as string[]).at(-1), 'demo-ending');
  });

  test('a replay of a finished mission resumes where the replay was left', async () => {
    const { token, id } = await newLearner('replayer');
    const all = [
      'demo-briefing',
      'demo-ch-1',
      'demo-story-1',
      'demo-ch-2',
      'demo-quiz-1',
      'demo-ch-3',
      'demo-ending',
    ];
    for (const step of all) {
      await call('PUT', `/progress/demo/steps/${step}`, token);
    }
    const finished = await call('GET', '/progress/demo', token);
    assert.equal(finished.body.status, 'complete');
    assert.equal(finished.body.resumeStepId, 'demo-briefing');

    const where = {
      learnerId_courseId_stepId: { learnerId: id, courseId: 'demo', stepId: 'demo-ch-1' },
    };
    const firstRun = await prisma.courseStepCompletion.findUniqueOrThrow({ where });

    // Replay: move on from the briefing and chapter 1, then leave.
    await call('PUT', '/progress/demo/steps/demo-briefing', token);
    const replay = await call('PUT', '/progress/demo/steps/demo-ch-1', token);
    assert.equal(replay.body.status, 'complete');
    assert.equal(replay.body.resumeStepId, 'demo-story-1');
    // The courses screen agrees.
    assert.equal(
      course(await call('GET', '/progress', token), 'demo').resumeStepId,
      'demo-story-1',
    );
    // The first run's completion time is kept.
    const afterReplay = await prisma.courseStepCompletion.findUniqueOrThrow({ where });
    assert.equal(afterReplay.completedAt.getTime(), firstRun.completedAt.getTime());

    // Reaching the ending again: the next visit starts from the briefing.
    const again = await call('PUT', '/progress/demo/steps/demo-ending', token);
    assert.equal(again.body.resumeStepId, 'demo-briefing');
  });

  test('completing a step twice keeps the first completion time', async () => {
    const { token, id } = await newLearner('repeat');
    await call('PUT', '/progress/demo/steps/demo-briefing', token);
    const where = {
      learnerId_courseId_stepId: { learnerId: id, courseId: 'demo', stepId: 'demo-briefing' },
    };
    const first = await prisma.courseStepCompletion.findUniqueOrThrow({ where });
    const again = await call('PUT', '/progress/demo/steps/demo-briefing', token);
    assert.equal(again.status, 200);
    const second = await prisma.courseStepCompletion.findUniqueOrThrow({ where });
    assert.equal(second.completedAt.getTime(), first.completedAt.getTime());
    assert.equal(second.createdAt.getTime(), first.createdAt.getTime());
    assert.equal(second.updatedAt.getTime(), first.updatedAt.getTime());
    // The position row is overwritten, keeping when it was first made.
    const position = await prisma.coursePosition.findUniqueOrThrow({
      where: { learnerId_courseId: { learnerId: id, courseId: 'demo' } },
    });
    assert.ok(position.updatedAt.getTime() >= position.createdAt.getTime());
  });

  test('an unknown mission or step is 404, and nothing is stored', async () => {
    const { token, id } = await newLearner('unknown');
    const noCourse = await call('GET', '/progress/no-such-mission', token);
    assert.equal(noCourse.status, 404);
    assert.equal(noCourse.body.code, 'NOT_FOUND');
    assert.equal((await call('PUT', '/progress/no-such-mission/steps/x', token)).status, 404);
    const noStep = await call('PUT', '/progress/demo/steps/no-such-step', token);
    assert.equal(noStep.status, 404);
    assert.equal(noStep.body.code, 'NOT_FOUND');
    assert.equal(await prisma.courseStepCompletion.count({ where: { learnerId: id } }), 0);
  });

  test('a completion for a step since removed from the content is ignored', async () => {
    const { token, id } = await newLearner('stale');
    await prisma.courseStepCompletion.create({
      data: { learnerId: id, courseId: 'demo', stepId: 'demo-removed-step' },
    });
    const reply = await call('GET', '/progress/demo', token);
    assert.equal(reply.body.status, 'not-started');
    assert.deepEqual(reply.body.completedStepIds, []);
  });

  test("one learner's progress never shows in another's", async () => {
    const a = await newLearner('owner-a');
    const b = await newLearner('owner-b');
    await call('PUT', '/progress/demo/steps/demo-ending', a.token);
    assert.equal((await call('GET', '/progress/demo', a.token)).body.status, 'complete');
    assert.equal((await call('GET', '/progress/demo', b.token)).body.status, 'not-started');
    assert.equal(course(await call('GET', '/progress', b.token), 'demo').status, 'not-started');
  });
});
