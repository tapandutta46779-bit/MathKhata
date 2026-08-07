import type { InsertableObjectType, Page, Point } from './model';

export const WRITING_LEFT = 82;
export const WRITING_TOP = 20;
export const WRITING_LINE_HEIGHT = 44;
export const WRITING_CONTENT_WIDTH = 610;

export interface FlowObjectInput {
  type: InsertableObjectType;
  content: string;
}

export function flowObjectHeight(type: InsertableObjectType, content: string): number {
  if (type === 'math') {
    return /\\(?:frac|int|sum|prod|begin)(?![A-Za-z])/.test(content)
      ? WRITING_LINE_HEIGHT * 2
      : WRITING_LINE_HEIGHT;
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
