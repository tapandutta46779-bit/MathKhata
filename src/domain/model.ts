export const SCHEMA_VERSION = 2 as const;
export const DEFAULT_PAGE_WIDTH = 900;
export const DEFAULT_PAGE_HEIGHT = 1200;
export const MIN_OBJECT_WIDTH = 120;
export const MIN_OBJECT_HEIGHT = 54;

export type ISODateString = string;

export interface Notebook {
  id: string;
  schemaVersion: typeof SCHEMA_VERSION;
  title: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  pages: Page[];
}

export interface Page {
  id: string;
  order: number;
  width: number;
  height: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  objects: PageObject[];
  drawings: DrawingElement[];
}

export interface PageObjectBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface MathObject extends PageObjectBase {
  type: 'math';
  latex: string;
  editor: {
    smartFence: boolean;
    defaultMode: 'math';
  };
}

export interface TextObject extends PageObjectBase {
  type: 'text';
  text: string;
}

export type PageObject = MathObject | TextObject;

export type FuturePageObjectType =
  | 'handwriting'
  | 'graph'
  | 'geometry-diagram'
  | 'scientific-diagram'
  | 'image'
  | 'table'
  | 'physics-visualization'
  | 'ai-annotation'
  | 'citation'
  | 'aion-reasoning-artifact';

export type InsertableObjectType = PageObject['type'];

export interface Point {
  x: number;
  y: number;
}

export type DrawingKind =
  | 'pen'
  | 'highlighter'
  | 'line'
  | 'arrow'
  | 'rectangle'
  | 'ellipse'
  | 'polygon'
  | 'perpendicular';

export interface DrawingElement {
  id: string;
  kind: DrawingKind;
  color: string;
  width: number;
  opacity: number;
  points: Point[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface MathKhataExport {
  format: 'mathkhata-notebook';
  schemaVersion: typeof SCHEMA_VERSION;
  exportedAt: ISODateString;
  notebook: Notebook;
}
