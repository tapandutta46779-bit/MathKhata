import { AION_SYSTEM_PROMPT } from '../../src/aion/systemPrompt';

const MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct';
const MAX_PROMPT_CHARACTERS = 96_000;
const MAX_VISIBLE_TOKENS = 4_096;
const MAX_REQUEST_BYTES = 384_000;
const RESPONSE_SECURITY = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
};

async function readBoundedJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new RangeError('Request too large');
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}

interface WorkersAI {
  run(model: string, input: {
    messages: Array<{ role: 'system' | 'user'; content: string }>;
    stream: true;
    max_tokens: number;
    temperature: number;
    top_p: number;
  }): Promise<ReadableStream<Uint8Array>>;
}

interface Env {
  AI?: WorkersAI;
}

interface FunctionContext {
  request: Request;
  env: Env;
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: RESPONSE_SECURITY,
  });
}

export function onRequestGet({ env }: FunctionContext): Response {
  if (!env.AI) return json({ ready: false, message: 'AION online is temporarily unavailable.' }, 503);
  return json({ ready: true, name: 'AION', mode: 'online' });
}

export async function onRequestPost({ request, env }: FunctionContext): Promise<Response> {
  const origin = request.headers.get('origin');
  if ((origin !== null && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    return json({ error: 'Cross-site requests are not accepted.' }, 403);
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return json({ error: 'Send an application/json request.' }, 415);
  }
  if (!env.AI) return json({ error: 'AION online is temporarily unavailable.' }, 503);

  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_REQUEST_BYTES) {
    return json({ error: 'This page is too large for one AION request.' }, 413);
  }

  let body: unknown;
  try {
    body = await readBoundedJson(request);
  } catch (error) {
    if (error instanceof RangeError) return json({ error: 'This page is too large for one AION request.' }, 413);
    return json({ error: 'AION received an invalid request.' }, 400);
  }

  const prompt = typeof body === 'object' && body !== null && 'prompt' in body
    ? (body as { prompt?: unknown }).prompt
    : undefined;
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return json({ error: 'A question or page context is required.' }, 400);
  }
  if (prompt.length > MAX_PROMPT_CHARACTERS) {
    return json({ error: 'This page is too large for one AION request.' }, 413);
  }

  try {
    const stream = await env.AI.run(MODEL, {
      stream: true,
      max_tokens: MAX_VISIBLE_TOKENS,
      temperature: 0.2,
      top_p: 0.9,
      messages: [
        { role: 'system', content: AION_SYSTEM_PROMPT },
        { role: 'user', content: prompt.trim() },
      ],
    });

    return new Response(stream, {
      headers: {
        ...RESPONSE_SECURITY,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AION could not complete this request.';
    const quotaReached = /quota|limit|neurons|capacity/i.test(message);
    return json({
      error: quotaReached
        ? 'AION online has reached today\'s free allowance. Use Private on-device or try again after the daily reset.'
        : 'AION online could not complete this request. Please try again.',
    }, quotaReached ? 429 : 503);
  }
}

export function onRequest(context: FunctionContext): Response | Promise<Response> {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  const response = json({ error: 'Method not allowed.' }, 405);
  response.headers.set('Allow', 'GET, POST');
  return response;
}
