import type { InsertableObjectType, Page, Point } from './model';
import { automaticMathLineCount } from './mathLineFlow';

export const WRITING_LEFT = 82;
export const WRITING_TOP = 20;
export const WRITING_LINE_HEIGHT = 44;
// Leave a narrow calculation/controls gutter on the right while using nearly
// the full ruled line for handwriting-style Math and Text.
export const WRITING_CONTENT_WIDTH = 590;

export interface FlowObjectInput {
  type: InsertableObjectType;
  content: string;
}

export function flowObjectHeight(type: InsertableObjectType, content: string): number {
  if (type === 'math') {
    const structuralLines = /\\(?:frac|int|sum|prod|begin)(?![A-Za-z])/.test(content) ? 2 : 1;
    return WRITING_LINE_HEIGHT * Math.max(structuralLines, automaticMathLineCount(content));
  }
  const visualLines = Math.max(1, Math.ceil(content.trim().length / 78));
  return WRITING_LINE_HEIGHT * visualLines;
}

export function snapToWritingLine(y: number, pageHeight: number): number {
  const lastLine = Math.max(WRITING_TOP, pageHeight - WRITING_LINE_HEIGHT);
  const lineIndex = Math.max(0, Math.round((y - WRITING_TOP) / WRITING_LINE_HEIGHT));
  return Math.min(lastLine, WRITING_TOP + lineIndex * WRITING_LINE_HEIGHT);
}

export function nextWritingPoint(page: Page): Point {
  const furthestWritingEdge = page.objects.reduce((furthest, object) => {
    if (object.type === 'research') return Math.max(furthest, object.y + object.height);
    const content = object.type === 'math' ? object.latex : object.text;
    const occupiedHeight = flowObjectHeight(object.type, content);
    return Math.max(furthest, object.y + occupiedHeight);
  }, WRITING_TOP);
  const lineIndex = Math.max(
    0,
    Math.ceil((furthestWritingEdge - WRITING_TOP) / WRITING_LINE_HEIGHT),
  );
  return {
    x: WRITING_LEFT,
    y: Math.min(page.height - WRITING_LINE_HEIGHT, WRITING_TOP + lineIndex * WRITING_LINE_HEIGHT),
  };
}
