import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

const MAX_INPUT_CHARS = 50_000;
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const SYSTEM_PROMPT =
  'You are a professional newsletter editor. Improve the following newsletter post written in Markdown. ' +
  'Keep the same structure, topics, and meaning. Improve clarity, grammar, flow, and reader engagement. ' +
  'Preserve every image markdown ![alt](url), every <video>/<img>/<a> HTML tag, and every link verbatim — ' +
  'do not modify their URLs, attributes, alt text, or surrounding positions. ' +
  'Return ONLY the improved Markdown content — no preamble, no explanation, no code fences.';

type AiTextResponse = { response?: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const POST: APIRoute = async ({ request }) => {
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

  let result: AiTextResponse;
  try {
    result = (await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: contentMd },
      ],
      max_tokens: 8192,
    })) as AiTextResponse;
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Workers AI error' }, 502);
  }

  const improved = result?.response;
  if (typeof improved !== 'string' || !improved.trim()) {
    return json({ error: 'empty response from model' }, 502);
  }

  return json({ contentMd: improved.trim() });
};
