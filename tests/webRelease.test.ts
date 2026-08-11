import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('public web replica boundary', () => {
  it('keeps MathLive layout styles while restricting public network access', () => {
    const headers = readFileSync(path.resolve('public/_headers'), 'utf8');

    expect(headers).toContain("script-src 'self'");
    expect(headers).toContain("style-src 'self' 'unsafe-inline'");
    expect(headers).toContain("font-src 'self' data:");
    expect(headers).toContain("connect-src 'self'");
    expect(headers).not.toContain('127.0.0.1');
    expect(headers).not.toContain('localhost');
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
});
