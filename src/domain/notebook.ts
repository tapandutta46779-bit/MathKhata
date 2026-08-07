import {
  DEFAULT_PAGE_HEIGHT,
  DEFAULT_PAGE_WIDTH,
  MIN_OBJECT_HEIGHT,
  MIN_OBJECT_WIDTH,
  SCHEMA_VERSION,
  type MathObject,
  type Notebook,
  type Page,
  type PageObject,
  type Point,
  type TextObject,
} from './model';

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
): TextObject {
  return {
    ...baseObject(point, options),
    type: 'text',
    text,
    width: 280,
    height: 92,
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
    Partial<Pick<TextObject, 'text'>>,
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

