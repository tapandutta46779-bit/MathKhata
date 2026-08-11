const MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
const MAX_PROMPT_CHARACTERS = 48_000;

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
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function onRequestGet({ env }: FunctionContext): Response {
  if (!env.AI) return json({ ready: false, message: 'AION is temporarily unavailable.' }, 503);
  return json({ ready: true, name: 'AION' });
}

export async function onRequestPost({ request, env }: FunctionContext): Promise<Response> {
  if (!env.AI) return json({ error: 'AION is temporarily unavailable.' }, 503);

  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_PROMPT_CHARACTERS * 2) {
    return json({ error: 'This page is too large for one AION request.' }, 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
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
      max_tokens: 1536,
      temperature: 0.35,
      top_p: 0.9,
      messages: [
        {
          role: 'system',
          content: [
            'You are AION inside MathKhata, a mathematical notebook.',
            'Be precise and pedagogical. Show visible, checkable solution steps, but never reveal hidden chain-of-thought.',
            'Separate independent questions and use only the supplied page context. State uncertainty and assumptions honestly.',
            'Never claim that you edited notebook content. Never use Markdown code fences.',
            'Put inline mathematics in \\( ... \\) and display mathematics in \\[ ... \\].',
            'Render every formula as mathematics, never as raw LaTeX source or programming code.',
          ].join(' '),
        },
        { role: 'user', content: prompt.trim() },
      ],
    });

    return new Response(stream, {
      headers: {
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
        ? 'AION has reached today\'s free public-beta allowance. Please try again after the daily reset.'
        : 'AION could not complete this request. Please try again.',
    }, quotaReached ? 429 : 503);
  }
}
