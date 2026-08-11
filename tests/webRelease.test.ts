import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('public web replica boundary', () => {
  it('keeps MathLive layout styles while restricting public network access', () => {
    const headers = readFileSync(path.resolve('public/_headers'), 'utf8');
    const privacy = readFileSync(path.resolve('public/privacy.html'), 'utf8');

    expect(headers).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(headers).toContain('https://static.cloudflareinsights.com/beacon.min.js');
    expect(headers).toContain("style-src 'self' 'unsafe-inline'");
    expect(headers).toContain("font-src 'self' data:");
    expect(headers).toContain("connect-src 'self' https://huggingface.co");
    expect(headers).toContain('https://raw.githubusercontent.com');
    expect(headers).not.toContain('127.0.0.1');
    expect(headers).not.toContain('localhost');
    expect(readFileSync(path.resolve('vite.config.ts'), 'utf8')).toContain(
      "mode === 'web'",
    );
    expect(privacy).toContain("Cloudflare's cookie-free Web Analytics");
    expect(privacy).toContain('only when you select Fast online');
    expect(privacy).not.toContain('optional Local Qwen Assistant');
  });

  it('ships every KaTeX size font used by large operators and structured notation', () => {
    for (const family of [
      'KaTeX_Main-Regular.woff2',
      'KaTeX_Math-Italic.woff2',
      'KaTeX_Size1-Regular.woff2',
      'KaTeX_Size2-Regular.woff2',
      'KaTeX_Size3-Regular.woff2',
      'KaTeX_Size4-Regular.woff2',
    ]) {
      expect(existsSync(path.resolve('public/fonts', family)), family).toBe(true);
    }

    expect(readFileSync(path.resolve('src/main.tsx'), 'utf8')).toContain(
      'MathfieldElement.fontsDirectory',
    );
  });

  it('ships private Qwen3 8B and an explicit free-tier Mistral 24B online option', () => {
    const wrangler = readFileSync(path.resolve('wrangler.toml'), 'utf8');
    const browserProvider = readFileSync(path.resolve('src/aion/webgpuProvider.ts'), 'utf8');
    const assistantUI = readFileSync(path.resolve('src/components/PageAssistantRail.tsx'), 'utf8');
    const topBar = readFileSync(path.resolve('src/components/TopBar.tsx'), 'utf8');
    const styles = readFileSync(path.resolve('src/styles.css'), 'utf8');

    expect(wrangler).toContain('[ai]');
    expect(wrangler).toContain('binding = "AI"');
    expect(browserProvider).toContain("AION_WEBGPU_MODEL = 'Qwen3-8B-q4f16_1-MLC'");
    expect(browserProvider).toContain('CreateWebWorkerMLCEngine');
    expect(browserProvider).toContain('enable_thinking: false');
    const onlineFunction = readFileSync(path.resolve('functions/api/assistant.ts'), 'utf8');
    expect(onlineFunction).toContain('@cf/mistralai/mistral-small-3.1-24b-instruct');
    expect(onlineFunction).not.toContain('/no_think');
    expect(assistantUI).toContain('Ask AION about this page');
    expect(assistantUI).not.toContain('Local Qwen');
    expect(assistantUI).toContain('Fast online');
    expect(assistantUI).toContain('Private on-device');
    expect(assistantUI).toContain('approximately 4.62 GB first download');
    expect(topBar).toContain('The AION private model is separate from the app shell.');
    expect(topBar).not.toContain('The Qwen3 8B on-device model is separate from the app shell.');
    expect(assistantUI).toContain('page-assistant-math-scroll');
    expect(styles).toContain('overscroll-behavior-inline: contain');
  });
});
