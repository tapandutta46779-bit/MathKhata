import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
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
