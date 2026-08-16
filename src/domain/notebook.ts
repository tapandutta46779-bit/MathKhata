import {
  DEFAULT_PAGE_HEIGHT,
  DEFAULT_PAGE_WIDTH,
  MIN_OBJECT_HEIGHT,
  MIN_OBJECT_WIDTH,
  SCHEMA_VERSION,
  type MathObject,
  type DrawingElement,
  type DrawingErasure,
  type Notebook,
  type Page,
  type PageObject,
  type Point,
  type TextObject,
  type TextStyle,
  type ResearchObject,
  type ResearchSnapshot,
  type ResearchValue,
} from './model';
import { DEFAULT_TEXT_STYLE } from './textStyle';

type IdFactory = () => string;
type DateFactory = () => string;

const defaultId: IdFactory = () => crypto.randomUUID();
const defaultDate: DateFactory = () => new Date().toISOString();

export interface FactoryOptions {
  id?: IdFactory;
  now?: DateFactory;
}

function factories(options: FactoryOptions = {}) {
  return { id: options.id ?? defaultId, now: options.now ?? defaultDate };
}

export function createPage(order = 0, options: FactoryOptions = {}): Page {
  const { id, now } = factories(options);
  const timestamp = now();
  return {
    id: id(),
    order,
    width: DEFAULT_PAGE_WIDTH,
    height: DEFAULT_PAGE_HEIGHT,
    createdAt: timestamp,
    updatedAt: timestamp,
    objects: [],
    drawings: [],
    favorite: false,
    highlightColor: null,
  };
}

export function createNotebook(title = 'Untitled notebook', options: FactoryOptions = {}): Notebook {
  const { id, now } = factories(options);
  const timestamp = now();
  return {
    id: id(),
    schemaVersion: SCHEMA_VERSION,
    title: title.trim() || 'Untitled notebook',
    createdAt: timestamp,
    updatedAt: timestamp,
    pages: [createPage(0, { id, now })],
    research: { values: {} },
  };
}

function baseObject(point: Point, options: FactoryOptions = {}) {
  const { id, now } = factories(options);
  const timestamp = now();
  return {
    id: id(),
    x: point.x,
    y: point.y,
    width: 300,
    height: MIN_OBJECT_HEIGHT,
    zIndex: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createMathObject(
  point: Point,
  latex = '',
  options: FactoryOptions = {},
): MathObject {
  return {
    ...baseObject(point, options),
    type: 'math',
    latex,
    editor: { smartFence: true, defaultMode: 'math' },
  };
}

export function createTextObject(
  point: Point,
  text = '',
  options: FactoryOptions = {},
  style?: TextStyle,
): TextObject {
  return {
    ...baseObject(point, options),
    type: 'text',
    text,
    ...(style ? { style } : {}),
    width: 280,
    height: 92,
  };
}

export function createResearchObject(
  point: Point,
  snapshot: ResearchSnapshot,
  options: FactoryOptions = {},
): ResearchObject {
  return {
    ...baseObject(point, options),
    type: 'research',
    snapshot,
    width: 440,
    height: 290,
  };
}

function updateNotebook(
  notebook: Notebook,
  pages: Page[],
  now: DateFactory = defaultDate,
): Notebook {
  return { ...notebook, pages, updatedAt: now() };
}

function updatePage(page: Page, objects: PageObject[], now: DateFactory): Page {
  const timestamp = now();
  return {
    ...page,
    objects,
    updatedAt: timestamp,
  };
}

export function renameNotebook(notebook: Notebook, title: string, now: DateFactory = defaultDate): Notebook {
  const cleanTitle = title.trim();
  if (!cleanTitle || cleanTitle === notebook.title) return notebook;
  return { ...notebook, title: cleanTitle, updatedAt: now() };
}

export function addPage(notebook: Notebook, options: FactoryOptions = {}): Notebook {
  const { id, now } = factories(options);
  const page = createPage(notebook.pages.length, { id, now });
  return updateNotebook(notebook, [...notebook.pages, page], now);
}

export function deletePage(notebook: Notebook, pageId: string, now: DateFactory = defaultDate): Notebook {
  if (notebook.pages.length === 1) return notebook;
  const remaining = notebook.pages.filter((page) => page.id !== pageId);
  if (remaining.length === notebook.pages.length) return notebook;
  const pages = remaining.map((page, order) => ({ ...page, order }));
  return updateNotebook(notebook, pages, now);
}

export function movePage(
  notebook: Notebook,
  pageId: string,
  direction: -1 | 1,
  now: DateFactory = defaultDate,
): Notebook {
  const from = notebook.pages.findIndex((page) => page.id === pageId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= notebook.pages.length) return notebook;
  const pages = [...notebook.pages];
  [pages[from], pages[to]] = [pages[to], pages[from]];
  return updateNotebook(
    notebook,
    pages.map((page, order) => ({ ...page, order })),
    now,
  );
}

export function updatePageMetadata(
  notebook: Notebook,
  pageIds: string[],
  patch: Partial<Pick<Page, 'favorite' | 'highlightColor'>>,
  now: DateFactory = defaultDate,
): Notebook {
  const targets = new Set(pageIds);
  let changed = false;
  const timestamp = now();
  const pages = notebook.pages.map((page) => {
    if (!targets.has(page.id)) return page;
    changed = true;
    return { ...page, ...patch, updatedAt: timestamp };
  });
  return changed ? updateNotebook(notebook, pages, now) : notebook;
}

export function resetPages(
  notebook: Notebook,
  pageIds: string[],
  now: DateFactory = defaultDate,
): Notebook {
  const targets = new Set(pageIds);
  let changed = false;
  const timestamp = now();
  const pages = notebook.pages.map((page) => {
    if (!targets.has(page.id) || (page.objects.length === 0 && page.drawings.length === 0)) return page;
    changed = true;
    return { ...page, objects: [], drawings: [], updatedAt: timestamp };
  });
  return changed ? updateNotebook(notebook, pages, now) : notebook;
}

export function deletePages(
  notebook: Notebook,
  pageIds: string[],
  options: FactoryOptions = {},
): Notebook {
  const targets = new Set(pageIds);
  if (targets.size === 0) return notebook;
  const { id, now } = factories(options);
  let pages = notebook.pages.filter((page) => !targets.has(page.id));
  if (pages.length === 0) pages = [createPage(0, { id, now })];
  if (pages.length === notebook.pages.length) return notebook;
  return updateNotebook(notebook, pages.map((page, order) => ({ ...page, order })), now);
}

export function resetNotebookContent(
  notebook: Notebook,
  options: FactoryOptions = {},
): Notebook {
  const { id, now } = factories(options);
  return {
    ...notebook,
    pages: [createPage(0, { id, now })],
    research: { values: {} },
    updatedAt: now(),
  };
}

export function updateResearchValue(
  notebook: Notebook,
  key: string,
  value: ResearchValue,
  now: DateFactory = defaultDate,
): Notebook {
  if (notebook.research.values[key] === value) return notebook;
  return {
    ...notebook,
    research: { values: { ...notebook.research.values, [key]: value } },
    updatedAt: now(),
  };
}

export function resetResearchValues(
  notebook: Notebook,
  prefixes: string[],
  now: DateFactory = defaultDate,
): Notebook {
  const values = Object.fromEntries(Object.entries(notebook.research.values)
    .filter(([key]) => !prefixes.some((prefix) => key.startsWith(prefix))));
  if (Object.keys(values).length === Object.keys(notebook.research.values).length) return notebook;
  return { ...notebook, research: { values }, updatedAt: now() };
}

export function addObject(
  notebook: Notebook,
  pageId: string,
  object: PageObject,
  now: DateFactory = defaultDate,
): Notebook {
  const pages = notebook.pages.map((page) => {
    if (page.id !== pageId) return page;
    const highestZ = page.objects.reduce((highest, item) => Math.max(highest, item.zIndex), 0);
    return updatePage(page, [...page.objects, { ...object, zIndex: highestZ + 1 }], now);
  });
  return updateNotebook(notebook, pages, now);
}

export function updateObject(
  notebook: Notebook,
  pageId: string,
  objectId: string,
  patch: Partial<Pick<PageObject, 'x' | 'y' | 'width' | 'height' | 'zIndex'>> &
    Partial<Pick<MathObject, 'latex'>> &
    Partial<Pick<TextObject, 'text' | 'style'>> &
    Partial<Pick<ResearchObject, 'snapshot'>>,
  now: DateFactory = defaultDate,
): Notebook {
  let changed = false;
  const pages = notebook.pages.map((page) => {
    if (page.id !== pageId) return page;
    const objects = page.objects.map((object) => {
      if (object.id !== objectId) return object;
      changed = true;
      return { ...object, ...patch, updatedAt: now() } as PageObject;
    });
    return changed ? updatePage(page, objects, now) : page;
  });
  return changed ? updateNotebook(notebook, pages, now) : notebook;
}

export function convertMathObjectToText(
  notebook: Notebook,
  pageId: string,
  objectId: string,
  text: string,
  now: DateFactory = defaultDate,
): Notebook {
  let changed = false;
  const pages = notebook.pages.map((page) => {
    if (page.id !== pageId) return page;
    const objects = page.objects.map((object) => {
      if (object.id !== objectId || object.type !== 'math') return object;
      changed = true;
      return {
        id: object.id,
        x: object.x,
        y: object.y,
        width: object.width,
        height: object.height,
        zIndex: object.zIndex,
        createdAt: object.createdAt,
        type: 'text' as const,
        text,
        style: { ...DEFAULT_TEXT_STYLE },
        updatedAt: now(),
      };
    });
    return changed ? updatePage(page, objects, now) : page;
  });
  return changed ? updateNotebook(notebook, pages, now) : notebook;
}

export function removeObject(
  notebook: Notebook,
  pageId: string,
  objectId: string,
  now: DateFactory = defaultDate,
): Notebook {
  let changed = false;
  const pages = notebook.pages.map((page) => {
    if (page.id !== pageId) return page;
    const objects = page.objects.filter((object) => object.id !== objectId);
    changed = objects.length !== page.objects.length;
    return changed ? updatePage(page, objects, now) : page;
  });
  return changed ? updateNotebook(notebook, pages, now) : notebook;
}

export function duplicateObject(
  notebook: Notebook,
  pageId: string,
  objectId: string,
  options: FactoryOptions = {},
): { notebook: Notebook; objectId: string | null } {
  const { id, now } = factories(options);
  const page = notebook.pages.find((item) => item.id === pageId);
  const source = page?.objects.find((item) => item.id === objectId);
  if (!page || !source) return { notebook, objectId: null };
  const duplicateId = id();
  const timestamp = now();
  const duplicate = {
    ...source,
    id: duplicateId,
    x: source.x + 24,
    y: source.y + 24,
    zIndex: page.objects.reduce((highest, item) => Math.max(highest, item.zIndex), 0) + 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  } as PageObject;
  return { notebook: addObject(notebook, pageId, duplicate, now), objectId: duplicateId };
}

export function clampObjectToPage(object: PageObject, page: Page, point: Point): Point {
  const padding = 12;
  const maxX = Math.max(padding, page.width - Math.max(MIN_OBJECT_WIDTH, object.width) - padding);
  const maxY = Math.max(padding, page.height - Math.max(MIN_OBJECT_HEIGHT, object.height) - padding);
  return {
    x: Math.round(Math.min(maxX, Math.max(padding, point.x))),
    y: Math.round(Math.min(maxY, Math.max(padding, point.y))),
  };
}

export function getPage(notebook: Notebook, pageId: string): Page | undefined {
  return notebook.pages.find((page) => page.id === pageId);
}

export function getObject(
  notebook: Notebook,
  pageId: string,
  objectId: string,
): PageObject | undefined {
  return getPage(notebook, pageId)?.objects.find((object) => object.id === objectId);
}

export function addDrawing(
  notebook: Notebook,
  pageId: string,
  drawing: DrawingElement,
  now: DateFactory = defaultDate,
): Notebook {
  let changed = false;
  const pages = notebook.pages.map((page) => {
    if (page.id !== pageId) return page;
    changed = true;
    const timestamp = now();
    return {
      ...page,
      drawings: [...page.drawings, { ...drawing, updatedAt: timestamp }],
      updatedAt: timestamp,
    };
  });
  return changed ? updateNotebook(notebook, pages, now) : notebook;
}

export function removeDrawing(
  notebook: Notebook,
  pageId: string,
  drawingId: string,
  now: DateFactory = defaultDate,
): Notebook {
  let changed = false;
  const pages = notebook.pages.map((page) => {
    if (page.id !== pageId) return page;
    const drawings = page.drawings.filter((drawing) => drawing.id !== drawingId);
    if (drawings.length === page.drawings.length) return page;
    changed = true;
    return { ...page, drawings, updatedAt: now() };
  });
  return changed ? updateNotebook(notebook, pages, now) : notebook;
}

export function eraseDrawingRegions(
  notebook: Notebook,
  pageId: string,
  drawingIds: string[],
  erasure: DrawingErasure,
  now: DateFactory = defaultDate,
): Notebook {
  const targets = new Set(drawingIds);
  if (targets.size === 0) return notebook;
  let changed = false;
  const pages = notebook.pages.map((page) => {
    if (page.id !== pageId) return page;
    const timestamp = now();
    const drawings = page.drawings.map((drawing) => {
      if (!targets.has(drawing.id)) return drawing;
      changed = true;
      return { ...drawing, erasures: [...drawing.erasures, erasure], updatedAt: timestamp };
    });
    return changed ? { ...page, drawings, updatedAt: timestamp } : page;
  });
  return changed ? updateNotebook(notebook, pages, now) : notebook;
}
