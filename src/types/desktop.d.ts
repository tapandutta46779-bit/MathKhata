export {};

type DesktopCommand = 'save' | 'undo' | 'redo' | 'print';

interface DesktopAionBridge {
  check(): Promise<{ models?: Array<{ name?: string; model?: string }> }>;
  chat(requestId: string, payload: {
    format?: 'json';
    options?: { temperature?: number; top_p?: number; num_ctx?: number; num_predict?: number };
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  }, onChunk: (chunk: string) => void): Promise<{ completed: true }>;
  cancel(requestId: string): void;
}

interface MathKhataDesktopBridge {
  readonly isDesktop: true;
  readonly platform: 'darwin' | 'win32' | 'linux';
  readonly version: string;
  onCommand(callback: (command: DesktopCommand) => void): () => void;
  readonly aion: DesktopAionBridge;
}

declare global {
  interface Window {
    mathKhataDesktop?: MathKhataDesktopBridge;
  }
}
