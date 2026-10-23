// The one-time code rules, which cannot realistically be checked by hand.
// Runs against the database in DATABASE_URL and removes everything it creates.
// The clock is mocked, so expiry tests do not wait in real time.
import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, mock, test } from 'node:test';
import { prisma } from '../src/db/client.ts';
import { AppError } from '../src/lib/errors.ts';
import { requestSignInCode, verifySignInCode } from '../src/services/auth.ts';

const MINUTE = 60 * 1000;
const TEST_DOMAIN = '@otp-rules.example.test';

let sequence = 0;
function newEmail(): string {
  sequence += 1;
  return `learner-${process.pid}-${sequence}${TEST_DOMAIN}`;
}

type Write = (chunk: string | Uint8Array, ...rest: unknown[]) => boolean;

/** Requests a code and reads it from the console-mode email. */
async function requestCode(email: string): Promise<string> {
  let output = '';
  // Take only the email; everything else, including the test runner's own
  // reporting, must still reach stdout.
  const realWrite = process.stdout.write.bind(process.stdout) as Write;
  const write = mock.method(process.stdout, 'write', ((chunk, ...rest) => {
    if (String(chunk).includes('[email:console]')) {
      output += String(chunk);
      return true;
    }
    return realWrite(chunk, ...rest);
  }) as Write);
  try {
    await requestSignInCode(email);
  } finally {
    write.mock.restore();
  }
  const match = new RegExp(`To: ${email}\\nSubject: (\\d{6}) `).exec(output);
  assert.ok(match?.[1], 'a console-mode email with a code was printed');
  return match[1];
}

function anotherCode(code: string): string {
  return code === '000000' ? '111111' : '000000';
}

async function assertRejected(email: string, otp: string, code: AppError['code']): Promise<void> {
  await assert.rejects(verifySignInCode(email, otp), (err: unknown) => {
    assert.ok(err instanceof AppError, `expected an AppError, got ${String(err)}`);
    assert.equal(err.code, code);
    return true;
  });
}

async function removeTestData(): Promise<void> {
  await prisma.user.deleteMany({ where: { email: { endsWith: TEST_DOMAIN } } });
  await prisma.verification.deleteMany({ where: { identifier: { contains: TEST_DOMAIN } } });
}

describe('one-time sign-in codes', () => {
  before(removeTestData);
  after(async () => {
    await removeTestData();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    mock.timers.enable({ apis: ['Date'], now: Date.now() });
  });
  afterEach(() => {
    mock.timers.reset();
  });

  test('a code still works just before 10 minutes', async () => {
    const email = newEmail();
    const code = await requestCode(email);
    mock.timers.tick(10 * MINUTE - 1000);
    assert.ok(await verifySignInCode(email, code));
  });

  test('a code expires 10 minutes after it is sent', async () => {
    const email = newEmail();
    const code = await requestCode(email);
    mock.timers.tick(10 * MINUTE + 1000);
    await assertRejected(email, code, 'CODE_EXPIRED');
  });

  test('a code works once and is rejected on reuse', async () => {
    const email = newEmail();
    const code = await requestCode(email);
    assert.ok(await verifySignInCode(email, code));
    await assertRejected(email, code, 'INVALID_CODE');
  });

  test('four wrong attempts do not lock the code, and the fourth warns of the last try', async () => {
    const email = newEmail();
    const code = await requestCode(email);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await assertRejected(email, anotherCode(code), 'INVALID_CODE');
    }
    await assertRejected(email, anotherCode(code), 'INVALID_CODE_LAST_ATTEMPT');
    assert.ok(await verifySignInCode(email, code));
  });

  test('the fifth wrong attempt locks the code, and the correct code then fails too', async () => {
    const email = newEmail();
    const code = await requestCode(email);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await assertRejected(email, anotherCode(code), 'INVALID_CODE');
    }
    await assertRejected(email, anotherCode(code), 'INVALID_CODE_LAST_ATTEMPT');
    await assertRejected(email, anotherCode(code), 'TOO_MANY_ATTEMPTS');
    await assertRejected(email, code, 'TOO_MANY_ATTEMPTS');
  });

  test('a new request replaces the previous code', async () => {
    const email = newEmail();
    let first = await requestCode(email);
    // Real requests are never in the same instant; Better Auth checks the newest code.
    mock.timers.tick(1000);
    let second = await requestCode(email);
    // One in a million: both codes identical. Request again so the test means something.
    while (second === first) {
      first = second;
      mock.timers.tick(1000);
      second = await requestCode(email);
    }
    await assertRejected(email, first, 'INVALID_CODE');
    assert.ok(await verifySignInCode(email, second));
  });
});
