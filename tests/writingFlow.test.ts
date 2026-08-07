import { describe, expect, it } from 'vitest';
import { createMathObject, createNotebook, createTextObject } from '../src/domain/notebook';
import {
  flowObjectHeight,
  nextWritingPoint,
  snapToWritingLine,
  WRITING_LEFT,
  WRITING_LINE_HEIGHT,
  WRITING_TOP,
} from '../src/domain/writingFlow';

describe('notebook writing flow', () => {
  it('starts at the first ruled line', () => {
    const page = createNotebook('Flow').pages[0];

    expect(nextWritingPoint(page)).toEqual({ x: WRITING_LEFT, y: WRITING_TOP });
  });

  it('advances to the next ruled line after writing', () => {
    const page = createNotebook('Flow').pages[0];
    const first = createMathObject({ x: WRITING_LEFT, y: WRITING_TOP }, 'x=6');
    first.height = WRITING_LINE_HEIGHT;
    page.objects.push(first);

    expect(nextWritingPoint(page)).toEqual({
      x: WRITING_LEFT,
      y: WRITING_TOP + WRITING_LINE_HEIGHT,
    });
  });

  it('snaps manual insertion to the nearest ruled line', () => {
    expect(snapToWritingLine(62, 1200)).toBe(WRITING_TOP + WRITING_LINE_HEIGHT);
    expect(snapToWritingLine(-100, 1200)).toBe(WRITING_TOP);
  });

  it('reserves extra ruled lines for tall math and long notes', () => {
    expect(flowObjectHeight('math', '\\int_{0}^{2}x^2\\,dx')).toBe(WRITING_LINE_HEIGHT * 2);
    expect(flowObjectHeight('text', 'a'.repeat(160))).toBe(WRITING_LINE_HEIGHT * 3);

    const page = createNotebook('Flow').pages[0];
    const note = createTextObject({ x: WRITING_LEFT, y: WRITING_TOP }, 'a'.repeat(160));
    note.height = 92;
    page.objects.push(note);
    expect(nextWritingPoint(page).y).toBe(WRITING_TOP + WRITING_LINE_HEIGHT * 3);
  });
});
