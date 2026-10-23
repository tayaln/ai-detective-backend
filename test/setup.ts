// Loaded with --import before any test file and after --env-file has read
// .env, so these overrides win over anything set locally.
import os from 'node:os';
import path from 'node:path';

// A stray EMAIL_MODE=live must never burn the shared Brevo daily limit.
process.env.EMAIL_MODE = 'console';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'warn';
process.env.LOG_DIR = path.join(os.tmpdir(), 'ai-detective-test-logs');
// A small fixed course, so progress tests do not change when the real content does.
process.env.CONTENT_BUNDLE_PATH = path.join(import.meta.dirname, 'fixtures', 'content');

// Belt and braces: nothing in a test run may reach the network.
globalThis.fetch = () => Promise.reject(new Error('Network access is disabled in tests'));
