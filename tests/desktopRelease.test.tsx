import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { askAIONLocal, checkAIONLocal } from '../src/aion/ollamaProvider';
import { AppErrorBoundary } from '../src/components/AppErrorBoundary';

function BrokenView(): never {
  throw new Error('render failed');
}

function desktopBridge(overrides: Partial<NonNullable<Window['mathKhataDesktop']>['aion']> = {}) {
  return {
    isDesktop: true as const,
    platform: 'darwin' as const,
    version: '1.0.0',
    onCommand: () => () => {},
    aion: {
      check: vi.fn().mockResolvedValue({ models: [{ name: 'qwen3:8b' }] }),
      chat: vi.fn().mockImplementation(async (_requestId, _payload, onChunk) => {
        onChunk('{"message":{"content":"\\\\[x=6\\\\]"}}\n');
        return { completed: true as const };
      }),
      cancel: vi.fn(),
      ...overrides,
    },
  };
}

describe('desktop public-release boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, 'mathKhataDesktop');
  });

  it('keeps a renderer crash inside a restartable recovery screen', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<AppErrorBoundary><BrokenView /></AppErrorBoundary>);

    expect(screen.getByRole('alert')).toHaveTextContent('Your last locally saved notebook remains on this device');
    expect(screen.getByRole('button', { name: 'Restart MathKhata' })).toBeEnabled();
  });

  it('uses the narrow desktop AION bridge instead of a renderer network request', async () => {
    const bridge = desktopBridge();
    Object.defineProperty(window, 'mathKhataDesktop', { configurable: true, value: bridge });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const status = await checkAIONLocal();
    const answer = await askAIONLocal('Solve x=6');

    expect(status.modelReady).toBe(true);
    expect(answer.text).toBe('\\[x=6\\]');
    expect(bridge.aion.check).toHaveBeenCalledOnce();
    expect(bridge.aion.chat).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        messages: expect.arrayContaining([expect.objectContaining({ role: 'user', content: 'Solve x=6' })]),
      }),
      expect.any(Function),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('renders multiple ordered desktop chunks before the request completes', async () => {
    let finish!: () => void;
    const completion = new Promise<void>((resolve) => { finish = resolve; });
    const chat = vi.fn().mockImplementation(async (_requestId, _payload, onChunk) => {
      onChunk('{"message":{"content":"First"}}\n');
      onChunk('{"message":{"content":" second"}}\n');
      await completion;
      return { completed: true as const };
    });
    const bridge = desktopBridge({ chat });
    Object.defineProperty(window, 'mathKhataDesktop', { configurable: true, value: bridge });
    const updates: string[] = [];

    const answerPromise = askAIONLocal('Stream an answer', { onUpdate: (text) => updates.push(text) });
    await vi.waitFor(() => expect(updates).toEqual(['First', 'First second']));
    let completed = false;
    void answerPromise.then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);

    finish();
    await expect(answerPromise).resolves.toMatchObject({ text: 'First second' });
  });

  it('cancels the matching desktop request and never exposes streamed hidden thinking', async () => {
    let rejectChat!: (error: Error) => void;
    const chat = vi.fn().mockImplementation((_requestId, _payload, onChunk) => {
      onChunk('{"message":{"content":"<thi"}}\n');
      return new Promise((_resolve, reject) => { rejectChat = reject; });
    });
    const bridge = desktopBridge({ chat });
    Object.defineProperty(window, 'mathKhataDesktop', { configurable: true, value: bridge });
    const controller = new AbortController();
    const updates: string[] = [];
    const answerPromise = askAIONLocal('Cancel me', { signal: controller.signal, onUpdate: (text) => updates.push(text) });
    await vi.waitFor(() => expect(chat).toHaveBeenCalledOnce());
    const requestId = chat.mock.calls[0][0];

    controller.abort();
    rejectChat(Object.assign(new Error('cancelled'), { name: 'AbortError' }));

    await expect(answerPromise).rejects.toMatchObject({ name: 'AbortError' });
    expect(bridge.aion.cancel).toHaveBeenCalledWith(requestId);
    expect(updates).toEqual([]);
  });

  it('keeps interleaved concurrent desktop answers isolated by request ID', async () => {
    const streams = new Map<string, { onChunk: (chunk: string) => void; finish: () => void }>();
    const chat = vi.fn().mockImplementation((requestId, _payload, onChunk) => new Promise((resolve) => {
      streams.set(requestId, { onChunk, finish: () => resolve({ completed: true as const }) });
    }));
    const bridge = desktopBridge({ chat });
    Object.defineProperty(window, 'mathKhataDesktop', { configurable: true, value: bridge });
    const firstUpdates: string[] = [];
    const secondUpdates: string[] = [];
    const first = askAIONLocal('First request', { onUpdate: (text) => firstUpdates.push(text) });
    const second = askAIONLocal('Second request', { onUpdate: (text) => secondUpdates.push(text) });
    await vi.waitFor(() => expect(streams.size).toBe(2));
    const [firstStream, secondStream] = [...streams.values()];

    secondStream.onChunk('{"message":{"content":"Beta"}}\n');
    firstStream.onChunk('{"message":{"content":"Alpha"}}\n');
    secondStream.onChunk('{"message":{"content":" two"}}\n');
    firstStream.onChunk('{"message":{"content":" one"}}\n');
    firstStream.finish();
    secondStream.finish();

    await expect(first).resolves.toMatchObject({ text: 'Alpha one' });
    await expect(second).resolves.toMatchObject({ text: 'Beta two' });
    expect(firstUpdates).toEqual(['Alpha', 'Alpha one']);
    expect(secondUpdates).toEqual(['Beta', 'Beta two']);
  });

  it('locks the desktop renderer behind Electron security controls', () => {
    const source = readFileSync(path.resolve('desktop/main.mjs'), 'utf8');
    const preload = readFileSync(path.resolve('desktop/preload.cjs'), 'utf8');
    expect(source).toContain('app.enableSandbox()');
    expect(source).toMatch(/nodeIntegration:\s*false/);
    expect(source).toMatch(/contextIsolation:\s*true/);
    expect(source).toMatch(/sandbox:\s*true/);
    expect(source).toMatch(/webSecurity:\s*true/);
    expect(source).toContain("frame-ancestors 'none'");
    expect(source).toContain("return { action: 'deny' }");
    expect(source).toContain("preload: path.join(moduleDirectory, 'preload.cjs')");
    expect(preload).toContain("contextBridge.exposeInMainWorld('mathKhataDesktop'");
    expect(preload).toContain("ipcRenderer.invoke('aion:check')");
    expect(preload).toContain("ipcRenderer.invoke('aion:chat'");
    expect(preload).toContain("ipcRenderer.on('aion:stream'");
    expect(preload).toContain("ipcRenderer.send('aion:cancel'");
    expect(source).toContain("event.sender.send('aion:stream'");
    expect(source).toContain("ipcMain.on('aion:cancel'");
    expect(source).toContain("['.woff2', 'font/woff2']");
    expect(source).toContain("!mediaTypes.includes('video')");
    expect(source).toContain('https://huggingface.co');
    expect(readFileSync(path.resolve('src/main.tsx'), 'utf8')).toContain("import 'mathlive/static.css'");
    expect(readFileSync(path.resolve('src/components/VoicePanel.tsx'), 'utf8')).toContain('new DesktopSpeechProvider()');
    expect(readFileSync(path.resolve('src/voice/desktopSpeech.worker.ts'), 'utf8')).toContain("dtype: 'q4'");
    const assistant = readFileSync(path.resolve('src/components/PageAssistantRail.tsx'), 'utf8');
    expect(assistant).toContain('followStreamingAnswerRef.current = distanceFromBottom <= 56');
    expect(assistant).toContain('if (!activeTurnId || !followStreamingAnswerRef.current) return');
    expect(assistant).toContain('if (!followStreamingAnswerRef.current) return');
    expect(assistant).toContain('onWheelCapture={(event) =>');
    expect(assistant).toContain('onPointerDownCapture={() =>');
  });
});
