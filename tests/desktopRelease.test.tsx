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
      chat: vi.fn().mockResolvedValue('{"message":{"content":"\\\\[x=6\\\\]"}}\n'),
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
    expect(bridge.aion.chat).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([expect.objectContaining({ role: 'user', content: 'Solve x=6' })]),
    }));
    expect(fetchSpy).not.toHaveBeenCalled();
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
  });
});
