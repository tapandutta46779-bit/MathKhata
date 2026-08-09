import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestLocalAion, validateAionPayload } from '../desktop/local-aion.mjs';

let server: Server | undefined;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()));
  server = undefined;
});

async function startLocalAionStub() {
  server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/api/tags') {
      response.end(JSON.stringify({ models: [{ name: 'qwen3:8b' }] }));
      return;
    }
    if (request.url === '/api/chat' && request.method === 'POST') {
      response.end('{"message":{"content":"AION desktop reply"}}\n');
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Stub address unavailable.');
  return address.port;
}

describe('packaged desktop AION transport', () => {
  it('reaches readiness and chat over a fixed loopback HTTP transport', async () => {
    const port = await startLocalAionStub();
    const tags = await requestLocalAion('/api/tags', { port });
    const chat = await requestLocalAion('/api/chat', {
      port,
      method: 'POST',
      body: JSON.stringify(validateAionPayload({ messages: [{ role: 'user', content: 'Hello' }] })),
    });

    expect(tags.ok).toBe(true);
    expect(JSON.parse(tags.text).models[0].name).toBe('qwen3:8b');
    expect(chat.ok).toBe(true);
    expect(chat.text).toContain('AION desktop reply');
  });

  it('delivers ordered chunks before the loopback response completes', async () => {
    let ended = false;
    server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'application/x-ndjson');
      response.write('{"message":{"content":"one"}}\n');
      setTimeout(() => response.write('{"message":{"content":" two"}}\n'), 15);
      setTimeout(() => {
        ended = true;
        response.end('{"done":true}\n');
      }, 50);
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Stub address unavailable.');
    const chunks: string[] = [];

    const responsePromise = requestLocalAion('/api/chat', {
      port: address.port,
      method: 'POST',
      body: '{}',
      onChunk: (chunk) => chunks.push(chunk),
    });
    await vi.waitFor(() => expect(chunks.length).toBeGreaterThanOrEqual(2));

    expect(ended).toBe(false);
    expect(chunks.join('')).toContain('one');
    expect(chunks.join('')).toContain(' two');
    await expect(responsePromise).resolves.toMatchObject({ ok: true });
  });

  it('aborts an in-flight loopback stream promptly', async () => {
    server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'application/x-ndjson');
      response.write('{"message":{"content":"started"}}\n');
      setTimeout(() => response.end('{"done":true}\n'), 1_000);
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Stub address unavailable.');
    const controller = new AbortController();
    const chunks: string[] = [];
    const responsePromise = requestLocalAion('/api/chat', {
      port: address.port,
      method: 'POST',
      body: '{}',
      signal: controller.signal,
      onChunk: (chunk) => chunks.push(chunk),
    });
    await vi.waitFor(() => expect(chunks).toHaveLength(1));

    controller.abort();

    await expect(responsePromise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('reports an unavailable local service without weakening the deterministic fallback', async () => {
    await expect(requestLocalAion('/api/tags', { port: 1, timeoutMs: 100 })).rejects.toThrow();
  });

  it('rejects arbitrary endpoints and malformed or oversized renderer payloads', async () => {
    await expect(requestLocalAion('https://example.com')).rejects.toThrow('endpoint is invalid');
    expect(() => validateAionPayload({ messages: [] })).toThrow('request is malformed');
    expect(() => validateAionPayload({
      messages: [{ role: 'user', content: 'x'.repeat(200_001) }],
    })).toThrow('request is too large');
  });
});
