import { GoogleGenAI } from '@google/genai';
import { countTodayMessages, createSaralMessages, getRecentMessages } from '../db/saral.ts';
import { config } from '../lib/config.ts';
import { AppError } from '../lib/errors.ts';
import { logger } from '../lib/logger.ts';
import { getCourse } from '../lib/content.ts';
import { getSaralBlock } from '../lib/saral-content.ts';

const ai = new GoogleGenAI({
  vertexai: true,
  project: config.GOOGLE_CLOUD_PROJECT,
  location: config.GOOGLE_CLOUD_LOCATION,
});

const REQUEST_TIMEOUT_MS = 30_000;
let loggedFirstCachedTokens = false;

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

  const course = getCourse(courseId);
  const chapterSteps = course?.steps.filter((s) => s.type === 'chapter') ?? [];
  const chapterIndex = chapterSteps.findIndex((s) => s.id === stepId);
  const lessonNumber = chapterIndex + 1;

  const history = await getRecentMessages(learnerId, courseId);

  const contents: { role: 'user' | 'model'; parts: { text: string }[] }[] = [
    {
      role: 'user',
      parts: [{ text: `The learner is currently on Lesson ${lessonNumber}. Ground your answers in this lesson and earlier ones only.` }],
    },
    {
      role: 'model',
      parts: [{ text: 'Understood.' }],
    },
  ];

  for (const m of history) {
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [
        { text: m.role === 'user' ? `<user_input>\n${m.content}\n</user_input>` : m.content },
      ],
    });
  }
  contents.push({
    role: 'user',
    parts: [{ text: `<user_input>\n${message}\n</user_input>` }],
  });

  let reply: string;
  let promptTokenCount: number | undefined;
  let candidatesTokenCount: number | undefined;
  let cachedContentTokenCount: number | undefined;

  try {
    const response = await ai.models.generateContent({
      model: config.AI_MODEL,
      contents,
      config: {
        systemInstruction: block.systemPrompt,
        maxOutputTokens: 1024,
        thinkingConfig: { includeThoughts: false },
        abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    });

    reply =
      response.candidates?.[0]?.content?.parts
        ?.map((p) => p.text)
        .join('') ?? '';

    const usage = response.usageMetadata;
    promptTokenCount = usage?.promptTokenCount ?? undefined;
    candidatesTokenCount = usage?.candidatesTokenCount ?? undefined;
    cachedContentTokenCount = usage?.cachedContentTokenCount ?? undefined;

    if (!loggedFirstCachedTokens) {
      loggedFirstCachedTokens = true;
      logger.info(
        { courseId, cachedContentTokenCount: cachedContentTokenCount ?? 0 },
        'First Saral request after restart — cached token count',
      );
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

  createSaralMessages(learnerId, [
    {
      courseId,
      stepId,
      role: 'user',
      content: message,
      inputTokens: promptTokenCount ?? null,
      outputTokens: null,
      cachedTokens: cachedContentTokenCount ?? null,
    },
    {
      courseId,
      stepId,
      role: 'assistant',
      content: reply,
      inputTokens: null,
      outputTokens: candidatesTokenCount ?? null,
      cachedTokens: null,
    },
  ]).catch((err) => {
    logger.error({ err, learnerId, courseId, stepId }, 'Failed to store Saral exchange');
  });

  return { reply };
}
