import type { APIRoute } from 'astro';
import { eq, sql } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { aiUsage, getDbInstance } from '../../../db';

const MAX_INPUT_CHARS = 50_000;
const MAX_OUTPUT_TOKENS = 8192;
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const SYSTEM_PROMPT =
  'You are a professional newsletter editor. Improve the following newsletter post written in Markdown. ' +
  'Keep the same structure, topics, and meaning. Improve clarity, grammar, flow, and reader engagement. ' +
  'Preserve every image markdown ![alt](url), every <video>/<img>/<a> HTML tag, and every link verbatim — ' +
  'do not modify their URLs, attributes, alt text, or surrounding positions. ' +
  'Return ONLY the improved Markdown content — no preamble, no explanation, no code fences.';

type AiTextResponse = {
  response?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const today = (): string => new Date().toISOString().slice(0, 10);

const projectWorstCaseTokens = (inputChars: number): number =>
  Math.ceil(inputChars / 3.5) + MAX_OUTPUT_TOKENS;

export const POST: APIRoute = async ({ request }) => {
  const limitRaw = (env as unknown as { AI_REVIEW_DAILY_TOKEN_LIMIT?: string }).AI_REVIEW_DAILY_TOKEN_LIMIT;
  const limit = Number.parseInt(limitRaw ?? '', 10);
  if (!Number.isFinite(limit) || limit <= 0) {
    return json({ error: 'AI_REVIEW_DAILY_TOKEN_LIMIT is not configured' }, 500);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'expected JSON body' }, 400);
  }

  const contentMd =
    body && typeof body === 'object' && 'contentMd' in body
      ? (body as { contentMd: unknown }).contentMd
      : undefined;

  if (typeof contentMd !== 'string' || !contentMd.trim()) {
    return json({ error: 'contentMd is required' }, 400);
  }
  if (contentMd.length > MAX_INPUT_CHARS) {
    return json(
      { error: `contentMd too large (${contentMd.length} > ${MAX_INPUT_CHARS} chars)` },
      413,
    );
  }

  const db = getDbInstance();
  const day = today();

  const existing = await db.select().from(aiUsage).where(eq(aiUsage.day, day)).limit(1);
  const usedToday = existing[0]?.tokensUsed ?? 0;
  const worstCase = projectWorstCaseTokens(contentMd.length);
  if (usedToday + worstCase > limit) {
    return json(
      {
        error: 'daily AI review token budget exhausted — try again tomorrow or shorten the post',
        used: usedToday,
        limit,
      },
      429,
    );
  }

  let result: AiTextResponse;
  try {
    result = (await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: contentMd },
      ],
      max_tokens: MAX_OUTPUT_TOKENS,
    })) as AiTextResponse;
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Workers AI error' }, 502);
  }

  const improved = result?.response;
  if (typeof improved !== 'string' || !improved.trim()) {
    return json({ error: 'empty response from model' }, 502);
  }

  const usage = result.usage;
  const actualTokens =
    usage?.total_tokens ??
    (usage?.prompt_tokens != null || usage?.completion_tokens != null
      ? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0)
      : worstCase);

  await db
    .insert(aiUsage)
    .values({ day, tokensUsed: actualTokens })
    .onConflictDoUpdate({
      target: aiUsage.day,
      set: { tokensUsed: sql`${aiUsage.tokensUsed} + ${actualTokens}` },
    });

  return json({ contentMd: improved.trim() });
};
