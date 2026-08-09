import http from 'node:http';
import { StringDecoder } from 'node:string_decoder';

export const LOCAL_AION_HOST = '127.0.0.1';
export const LOCAL_AION_PORT = 11434;
export const LOCAL_AION_MODEL = 'qwen3:8b';

export function validateAionPayload(payload) {
  if (!payload || !Array.isArray(payload.messages) || payload.messages.length < 1 || payload.messages.length > 24) {
    throw new Error('AION request is malformed.');
  }
  let contentLength = 0;
  const messages = payload.messages.map((message) => {
    if (!['system', 'user', 'assistant'].includes(message?.role) || typeof message.content !== 'string') {
      throw new Error('AION message is malformed.');
    }
    contentLength += message.content.length;
    if (contentLength > 200_000) throw new Error('AION request is too large.');
    return { role: message.role, content: message.content };
  });
  const sourceOptions = payload.options || {};
  const finite = (value, fallback, minimum, maximum) => Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
  return {
    model: LOCAL_AION_MODEL,
    stream: true,
    think: false,
    ...(payload.format === 'json' ? { format: 'json' } : {}),
    options: {
      temperature: finite(sourceOptions.temperature, 0.35, 0, 2),
      top_p: finite(sourceOptions.top_p, 0.9, 0.05, 1),
      num_ctx: finite(sourceOptions.num_ctx, 16384, 2048, 32768),
      num_predict: finite(sourceOptions.num_predict, 1536, 64, 4096),
    },
    messages,
  };
}

export function requestLocalAion(
  apiPath,
  {
    method = 'GET',
    body,
    timeoutMs = 10_000,
    host = LOCAL_AION_HOST,
    port = LOCAL_AION_PORT,
    maxBytes = 16 * 1024 * 1024,
    onChunk,
    signal,
  } = {},
) {
  if (typeof apiPath !== 'string' || !apiPath.startsWith('/api/')) {
    return Promise.reject(new Error('AION endpoint is invalid.'));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    let request;
    const aborted = () => {
      const error = signal?.reason instanceof Error
        ? signal.reason
        : Object.assign(new Error('AION request was cancelled.'), { name: 'AbortError' });
      request?.destroy(error);
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', aborted);
      callback(value);
    };
    if (signal?.aborted) {
      aborted();
      finish(reject, signal.reason instanceof Error
        ? signal.reason
        : Object.assign(new Error('AION request was cancelled.'), { name: 'AbortError' }));
      return;
    }
    request = http.request({
      hostname: host,
      port,
      path: apiPath,
      method,
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : undefined,
    }, (response) => {
      const chunks = [];
      const decoder = new StringDecoder('utf8');
      let total = 0;
      response.on('data', (chunk) => {
        total += chunk.length;
        if (total > maxBytes) {
          response.destroy(new Error('AION response exceeded the safe size limit.'));
          return;
        }
        chunks.push(chunk);
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
          try {
            const decoded = decoder.write(chunk);
            if (decoded) onChunk?.(decoded);
          } catch (error) {
            response.destroy(error instanceof Error ? error : new Error('AION stream consumer failed.'));
          }
        }
      });
      response.on('error', (error) => finish(reject, error));
      response.on('end', () => {
        try {
          const decoded = decoder.end();
          if (decoded && response.statusCode && response.statusCode >= 200 && response.statusCode < 300) onChunk?.(decoded);
          finish(resolve, {
            ok: Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300),
            status: response.statusCode || 0,
            text: Buffer.concat(chunks).toString('utf8'),
          });
        } catch (error) {
          finish(reject, error instanceof Error ? error : new Error('AION stream consumer failed.'));
        }
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('AION local service timed out.')));
    request.on('error', (error) => finish(reject, error));
    signal?.addEventListener('abort', aborted, { once: true });
    request.end(body);
  });
}
