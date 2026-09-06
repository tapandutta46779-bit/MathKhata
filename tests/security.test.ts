// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { onRequest } from '../functions/api/assistant';
import { validateNotebook } from '../src/domain/schema';

describe('AION request security', () => {
  const run = vi.fn(async () => new ReadableStream({ start(c) { c.close(); } }));
  const send = (body: string, headers: Record<string, string> = {}, method = 'POST') => onRequest({
    request: new Request('https://mathkhata.pages.dev/api/assistant', {
      method, headers: { 'content-type': 'application/json', ...headers },
      ...(method === 'POST' ? { body } : {}),
    }), env: { AI: { run } },
  });
  it('rejects cross-site requests before inference', async () => {
    run.mockClear();
    expect((await send('{"prompt":"hello"}', { origin: 'https://evil.example' })).status).toBe(403);
    expect(run).not.toHaveBeenCalled();
  });
  it('rejects non JSON content', async () => {
    expect((await send('{}', { 'content-type': 'text/plain' })).status).toBe(415);
  });
  it('bounds actual bytes with no content-length header', async () => {
    expect((await send(JSON.stringify({ prompt: 'a'.repeat(384_001) }))).status).toBe(413);
  });
  it('rejects malformed and empty prompts', async () => {
    expect((await send('{')).status).toBe(400);
    expect((await send('{"prompt":" "}')).status).toBe(400);
  });
  it('does not serve a notebook shell for unsupported API methods', async () => {
    const response = await send('', {}, 'HEAD');
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, POST');
  });
  it('preserves valid inference and secure streaming response headers', async () => {
    const response = await send('{"prompt":"x+1"}', { origin: 'https://mathkhata.pages.dev' });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });
});

describe('import security', () => {
  it('rejects deeply nested and cyclic inputs without stack overflow', () => {
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    expect(() => validateNotebook(cyclic)).toThrow('safe structural limits');
    let nested: unknown = {};
    for (let i = 0; i < 100; i++) nested = { child: nested };
    expect(() => validateNotebook(nested)).toThrow('safe structural limits');
  });
  it('rejects prototype-related imported keys', () => {
    expect(() => validateNotebook(JSON.parse('{"__proto__":{"polluted":true}}'))).toThrow('unsafe property');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('service worker security', () => {
  function harness(response: Response) {
    const handlers: Record<string, (event: any) => void> = {};
    const put = vi.fn();
    runInNewContext(readFileSync('public/sw.js', 'utf8'), {
      URL, Response,
      self: { location: { origin: 'https://mathkhata.pages.dev' }, registration: { scope: 'https://mathkhata.pages.dev/' },
        addEventListener: (name: string, fn: (event: any) => void) => { handlers[name] = fn; } },
      caches: { match: async () => undefined, open: async () => ({ put }) },
      fetch: async () => response,
    });
    return { handlers, put };
  }
  it('never intercepts or caches API requests', () => {
    const { handlers } = harness(new Response('{}'));
    const respondWith = vi.fn();
    handlers.fetch({ request: new Request('https://mathkhata.pages.dev/api/assistant'), respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  });
  it('honors no-store responses', async () => {
    const { handlers, put } = harness(new Response('private', { headers: { 'cache-control': 'no-store' } }));
    let pending: Promise<Response> | undefined;
    handlers.fetch({ request: new Request('https://mathkhata.pages.dev/private.json'), respondWith: (p: Promise<Response>) => { pending = p; } });
    await pending;
    expect(put).not.toHaveBeenCalled();
  });
  it('does not replace the notebook shell with an information page', async () => {
    const { handlers, put } = harness(new Response('privacy'));
    let pending: Promise<Response> | undefined;
    handlers.fetch({ request: { url: 'https://mathkhata.pages.dev/privacy', method: 'GET', mode: 'navigate' }, respondWith: (p: Promise<Response>) => { pending = p; } });
    await pending;
    expect(put).not.toHaveBeenCalled();
  });
});
