import { describe, expect, it } from 'vitest';
import { interpretTypedLine } from '../src/domain/lineIntent';

describe('continuous ruled-line intent detection', () => {
  it('treats a complete equation as mathematics', () => {
    expect(interpretTypedLine('x^2 + 6 = 42')).toEqual({
      intent: 'math',
      items: [{ type: 'math', content: 'x^2 + 6 = 42' }],
    });
  });

  it('keeps ordinary and unknown words as text', () => {
    expect(interpretTypedLine('quasarble research note')).toEqual({
      intent: 'text',
      items: [{ type: 'text', content: 'quasarble research note' }],
    });
  });

  it('creates editable text and math runs on one mixed line', () => {
    expect(interpretTypedLine('The curve $x^2+y^2=1$ is a circle')).toEqual({
      intent: 'mixed',
      items: [
        { type: 'text', content: 'The curve' },
        { type: 'math', content: 'x^2+y^2=1' },
        { type: 'text', content: 'is a circle' },
      ],
    });
  });

  it('supports explicit user override without changing the content silently', () => {
    expect(interpretTypedLine('x equals six', 'text').intent).toBe('text');
    expect(interpretTypedLine('research-note', 'math').intent).toBe('math');
  });
});
