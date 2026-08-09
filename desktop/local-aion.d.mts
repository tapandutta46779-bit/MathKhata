export const LOCAL_AION_HOST: '127.0.0.1';
export const LOCAL_AION_PORT: 11434;
export const LOCAL_AION_MODEL: 'qwen3:8b';

export interface AionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AionPayload {
  format?: 'json';
  options?: { temperature?: number; top_p?: number; num_ctx?: number; num_predict?: number };
  messages: AionMessage[];
}

export interface LocalAionResponse {
  ok: boolean;
  status: number;
  text: string;
}

export function validateAionPayload(payload: AionPayload): {
  model: string;
  stream: true;
  think: false;
  format?: 'json';
  options: { temperature: number; top_p: number; num_ctx: number; num_predict: number };
  messages: AionMessage[];
};

export function requestLocalAion(apiPath: string, options?: {
  method?: string;
  body?: string;
  timeoutMs?: number;
  host?: string;
  port?: number;
  maxBytes?: number;
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<LocalAionResponse>;
