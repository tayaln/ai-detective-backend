import { countTodayMessages, createSaralMessages, getRecentMessages } from '../db/saral.ts';
import { config } from '../lib/config.ts';
import { AppError } from '../lib/errors.ts';
import { logger } from '../lib/logger.ts';
import { getSaralBlock } from '../lib/saral-content.ts';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const REQUEST_TIMEOUT_MS = 30_000;

interface GeminiPart {
  text: string;
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  cachedContentTokenCount?: number;
}

interface GeminiResponse {
  candidates?: { content: { parts: GeminiPart[]; role: string } }[];
  usageMetadata?: GeminiUsageMetadata;
  error?: { code: number; message: string; status: string };
}

export async function chatWithSaral(
  learnerId: string,
  courseId: string,
  stepId: string,
  message: string,
): Promise<{ reply: string }> {
  const block = getSaralBlock(courseId);
  if (!block) {
    throw new AppError(404, 'NOT_FOUND', 'Course not found.');
  }

  if (!block.chapterStepIds.has(stepId)) {
    throw new AppError(400, 'INVALID_INPUT', 'Saral is only available on chapter steps.');
  }

  const todayCount = await countTodayMessages(learnerId);
  if (todayCount >= config.SARAL_DAILY_LIMIT) {
    throw new AppError(429, 'RATE_LIMITED', 'You have reached your daily question limit. Try again tomorrow.');
  }

  const history = await getRecentMessages(learnerId, courseId);

  const contents: GeminiContent[] = history.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [
      { text: m.role === 'user' ? `<user_input>\n${m.content}\n</user_input>` : m.content },
    ],
  }));
  contents.push({
    role: 'user',
    parts: [{ text: `<user_input>\n${message}\n</user_input>` }],
  });

  const url = `${GEMINI_BASE_URL}/${config.AI_MODEL}:generateContent?key=${config.AI_PROVIDER_API_KEY}`;

  const body = {
    system_instruction: {
      parts: [{ text: block.systemPrompt }],
    },
    contents,
    generationConfig: {
      maxOutputTokens: 1024,
    },
  };

  let data: GeminiResponse;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    data = (await res.json()) as GeminiResponse;

    if (!res.ok) {
      const errMsg = data.error?.message ?? `HTTP ${res.status}`;
      throw new Error(errMsg);
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      502,
      'SERVICE_UNAVAILABLE',
      'The AI mentor is temporarily unavailable. Please try again shortly.',
      { cause: err },
    );
  }

  const reply =
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text)
      .join('') ?? '';

  const usage = data.usageMetadata;

  createSaralMessages(learnerId, [
    {
      courseId,
      stepId,
      role: 'user',
      content: message,
      inputTokens: usage?.promptTokenCount ?? null,
      outputTokens: null,
      cachedTokens: usage?.cachedContentTokenCount ?? null,
    },
    {
      courseId,
      stepId,
      role: 'assistant',
      content: reply,
      inputTokens: null,
      outputTokens: usage?.candidatesTokenCount ?? null,
      cachedTokens: null,
    },
  ]).catch((err) => {
    logger.error({ err, learnerId, courseId, stepId }, 'Failed to store Saral exchange');
  });

  return { reply };
}
