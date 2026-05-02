import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

const SYSTEM_PROMPT =
  'You are a professional newsletter editor. Improve the following newsletter post written in Markdown. ' +
  'Keep the same structure, topics, and meaning. Improve clarity, grammar, flow, and reader engagement. ' +
  'Return ONLY the improved Markdown content — no preamble, no explanation, no code fences.';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const POST: APIRoute = async ({ request }) => {
  const e = env as unknown as { OPENROUTER_API_KEY?: string };
  if (!e.OPENROUTER_API_KEY) {
    return json({ error: 'OPENROUTER_API_KEY is not configured' }, 500);
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

  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${e.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: contentMd },
        ],
      }),
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'network error' }, 502);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return json({ error: `OpenRouter error ${res.status}: ${text}` }, 502);
  }

  type OpenRouterResponse = {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  const data = (await res.json().catch(() => ({}))) as OpenRouterResponse;

  if (data.error) {
    return json({ error: data.error.message ?? 'model error' }, 502);
  }

  const improved = data.choices?.[0]?.message?.content;
  if (typeof improved !== 'string' || !improved.trim()) {
    return json({ error: 'empty response from model' }, 502);
  }

  return json({ contentMd: improved.trim() });
};
