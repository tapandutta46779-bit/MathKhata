import { create } from 'zustand';
import type { Notebook, PageObject, Point } from '../domain/model';
import {
  addObject as addObjectToNotebook,
  addPage as addPageToNotebook,
  clampObjectToPage,
  convertMathObjectToText as convertMathObjectToTextDomain,
  createMathObject,
  createNotebook,
  createTextObject,
  deletePage as deletePageFromNotebook,
  duplicateObject as duplicateNotebookObject,
  getObject,
  getPage,
  movePage as moveNotebookPage,
  removeObject,
  renameNotebook as renameNotebookDomain,
  updateObject,
} from '../domain/notebook';
import { validateNotebook } from '../domain/schema';
import {
  flowObjectHeight,
  nextWritingPoint,
  WRITING_CONTENT_WIDTH,
  WRITING_LINE_HEIGHT,
  type FlowObjectInput,
} from '../domain/writingFlow';
import {
  hasNotebook,
  listNotebooks,
  loadMostRecentNotebook,
  loadNotebook,
  saveNotebook,
  type NotebookSummary,
} from '../persistence/database';

export type SaveStatus = 'loading' | 'unsaved' | 'saving' | 'saved' | 'error';
export type NotebookTool = 'select' | 'math' | 'text' | 'voice';

interface HistoryEntry {
  notebook: Notebook;
  label: string;
}

interface NotebookState {
  notebook: Notebook | null;
  library: NotebookSummary[];
  currentPageId: string | null;
  selectedObjectId: string | null;
  editingObjectId: string | null;
  insertionPoint: Point;
  tool: NotebookTool;
  navigatorCollapsed: boolean;
  paletteOpen: boolean;
  libraryOpen: boolean;
  saveStatus: SaveStatus;
  errorMessage: string | null;
  hydrated: boolean;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  lastHistoryGroup: string | null;
  lastHistoryAt: number;
  initialize: () => Promise<void>;
  refreshLibrary: () => Promise<void>;
  createNewNotebook: () => Promise<void>;
  openNotebook: (id: string) => Promise<void>;
  importNotebook: (notebook: Notebook) => Promise<void>;
  renameNotebook: (title: string) => void;
  setCurrentPage: (pageId: string) => void;
  setSelectedObject: (objectId: string | null) => void;
  setEditingObject: (objectId: string | null) => void;
  setInsertionPoint: (point: Point) => void;
  setTool: (tool: NotebookTool) => void;
  setNavigatorCollapsed: (collapsed: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setLibraryOpen: (open: boolean) => void;
  clearError: () => void;
  createObject: (type: 'math' | 'text', point?: Point, initialContent?: string) => string | null;
  createFlowObjects: (items: FlowObjectInput[]) => string[];
  convertMathObjectToText: (objectId: string, text: string) => void;
  updateMath: (objectId: string, latex: string) => void;
  updateText: (objectId: string, text: string) => void;
  moveObject: (objectId: string, point: Point) => void;
  deleteSelectedObject: () => void;
  duplicateSelectedObject: () => string | null;
  addPage: () => void;
  deletePage: (pageId: string) => void;
  movePage: (pageId: string, direction: -1 | 1) => void;
  undo: () => void;
  redo: () => void;
  saveNow: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saveRevision = 0;
let initializationPromise: Promise<void> | null = null;

function scheduleSave(notebook: Notebook, set: (partial: Partial<NotebookState>) => void) {
  saveRevision += 1;
  const revision = saveRevision;
  if (saveTimer) clearTimeout(saveTimer);
  set({ saveStatus: 'unsaved' });
  saveTimer = setTimeout(async () => {
    set({ saveStatus: 'saving' });
    try {
      await saveNotebook(notebook);
      if (revision === saveRevision) set({ saveStatus: 'saved', errorMessage: null });
    } catch (error) {
      if (revision === saveRevision) {
        set({
          saveStatus: 'error',
          errorMessage: `Autosave failed: ${error instanceof Error ? error.message : 'Unknown storage error'}`,
        });
      }
    }
  }, 350);
}

function nowForHistory(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

export const useNotebookStore = create<NotebookState>((set, get) => {
  function commit(
    label: string,
    transform: (notebook: Notebook) => Notebook,
    historyGroup: string | null = null,
  ) {
    const state = get();
    if (!state.notebook) return;
    const next = transform(state.notebook);
    if (next === state.notebook) return;
    const at = nowForHistory();
    const continueGroup =
      historyGroup !== null &&
      state.lastHistoryGroup === historyGroup &&
      at - state.lastHistoryAt < 900;
    const undoStack = continueGroup
      ? state.undoStack
      : [...state.undoStack, { notebook: state.notebook, label }].slice(-100);
    set({
      notebook: next,
      undoStack,
      redoStack: [],
      lastHistoryGroup: historyGroup,
      lastHistoryAt: at,
      errorMessage: null,
    });
    scheduleSave(next, set);
  }

  return {
    notebook: null,
    library: [],
    currentPageId: null,
    selectedObjectId: null,
    editingObjectId: null,
    insertionPoint: { x: 82, y: 20 },
    tool: 'select',
    navigatorCollapsed: false,
    paletteOpen: false,
    libraryOpen: false,
    saveStatus: 'loading',
    errorMessage: null,
    hydrated: false,
    undoStack: [],
    redoStack: [],
    lastHistoryGroup: null,
    lastHistoryAt: 0,

    async initialize() {
      if (get().hydrated) return;
      if (initializationPromise) return initializationPromise;
      initializationPromise = (async () => {
        try {
          let notebook = await loadMostRecentNotebook();
          if (!notebook) {
            notebook = createNotebook('My MathKhata');
            await saveNotebook(notebook);
          }
          set({
            notebook,
            currentPageId: notebook.pages[0]?.id ?? null,
            selectedObjectId: null,
            editingObjectId: null,
            saveStatus: 'saved',
            hydrated: true,
          });
          await get().refreshLibrary();
        } catch (error) {
          const recovery = createNotebook('Recovery notebook');
          set({
            notebook: recovery,
            currentPageId: recovery.pages[0].id,
            saveStatus: 'error',
            hydrated: true,
            errorMessage:
              `Stored notebook could not be opened and was left untouched. ` +
              `${error instanceof Error ? error.message : 'Unknown loading error'}`,
          });
        }
      })();
      try {
        await initializationPromise;
      } finally {
        initializationPromise = null;
      }
    },

    async refreshLibrary() {
      try {
        set({ library: await listNotebooks() });
      } catch (error) {
        set({
          errorMessage: `Could not list notebooks: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    },

    async createNewNotebook() {
      const notebook = createNotebook('Untitled notebook');
      try {
        await saveNotebook(notebook);
        set({
          notebook,
          currentPageId: notebook.pages[0].id,
          selectedObjectId: null,
          editingObjectId: null,
          undoStack: [],
          redoStack: [],
          saveStatus: 'saved',
          libraryOpen: false,
        });
        await get().refreshLibrary();
      } catch (error) {
        set({
          errorMessage: `Could not create notebook: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    },

    async openNotebook(id: string) {
      try {
        const notebook = await loadNotebook(id);
        if (!notebook) throw new Error('Notebook no longer exists.');
        set({
          notebook,
          currentPageId: notebook.pages[0].id,
          selectedObjectId: null,
          editingObjectId: null,
          undoStack: [],
          redoStack: [],
          saveStatus: 'saved',
          libraryOpen: false,
          errorMessage: null,
        });
      } catch (error) {
        set({
          errorMessage: `Could not open notebook: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    },

    async importNotebook(value: Notebook) {
      try {
        let notebook = validateNotebook(value);
        if (await hasNotebook(notebook.id)) {
          notebook = {
            ...notebook,
            id: crypto.randomUUID(),
            title: `${notebook.title} (imported)`,
            updatedAt: new Date().toISOString(),
          };
        }
        await saveNotebook(notebook);
        set({
          notebook,
          currentPageId: notebook.pages[0].id,
          selectedObjectId: null,
          editingObjectId: null,
          undoStack: [],
          redoStack: [],
          saveStatus: 'saved',
          errorMessage: null,
        });
        await get().refreshLibrary();
      } catch (error) {
        set({
          errorMessage: `Import failed without changing your notebook: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    },

    renameNotebook(title) {
      commit('Rename notebook', (notebook) => renameNotebookDomain(notebook, title));
    },

    setCurrentPage(pageId) {
      if (!get().notebook?.pages.some((page) => page.id === pageId)) return;
      set({
        currentPageId: pageId,
        selectedObjectId: null,
        editingObjectId: null,
        insertionPoint: { x: 82, y: 20 },
        lastHistoryGroup: null,
      });
    },

    setSelectedObject(objectId) {
      set({ selectedObjectId: objectId });
    },

    setEditingObject(objectId) {
      set({ editingObjectId: objectId, lastHistoryGroup: objectId ? get().lastHistoryGroup : null });
    },

    setInsertionPoint(point) {
      set({ insertionPoint: point });
    },

    setTool(tool) {
      set({ tool, editingObjectId: tool === 'select' ? null : get().editingObjectId });
    },

    setNavigatorCollapsed(navigatorCollapsed) {
      set({ navigatorCollapsed });
    },

    setPaletteOpen(paletteOpen) {
      set({ paletteOpen });
    },

    setLibraryOpen(libraryOpen) {
      set({ libraryOpen });
      if (libraryOpen) void get().refreshLibrary();
    },

    clearError() {
      set({ errorMessage: null });
    },

    createObject(type, point, initialContent = '') {
      const state = get();
      const pageId = state.currentPageId;
      const notebook = state.notebook;
      if (!pageId || !notebook) return null;
      const page = getPage(notebook, pageId);
      if (!page) return null;
      const flowPoint = point ?? nextWritingPoint(page);
      const rawObject =
        type === 'math'
          ? createMathObject(flowPoint, initialContent)
          : createTextObject(flowPoint, initialContent);
      rawObject.height = flowObjectHeight(type, initialContent);
      // A click chooses the writing line, not a small floating textbox. Give
      // normal Math/Text writing the remaining ruled-paper width while still
      // allowing the finished object to be dragged spatially afterwards.
      rawObject.width = Math.min(
        WRITING_CONTENT_WIDTH,
        Math.max(120, page.width - flowPoint.x - 28),
      );
      const safePoint = clampObjectToPage(rawObject, page, rawObject);
      const object = { ...rawObject, ...safePoint } as PageObject;
      commit(`Create ${type} object`, (current) => addObjectToNotebook(current, pageId, object));
      set({
        selectedObjectId: object.id,
        editingObjectId: object.id,
        tool: 'select',
        lastHistoryGroup: null,
      });
      return object.id;
    },

    createFlowObjects(items) {
      const state = get();
      const pageId = state.currentPageId;
      const notebook = state.notebook;
      if (!pageId || !notebook || items.length === 0) return [];
      const page = getPage(notebook, pageId);
      if (!page) return [];

      const firstPoint = nextWritingPoint(page);
      let nextY = firstPoint.y;
      const objects = items.map((item) => {
        const point = { x: firstPoint.x, y: nextY };
        const object = item.type === 'math'
          ? createMathObject(point, item.content)
          : createTextObject(point, item.content);
        object.width = WRITING_CONTENT_WIDTH;
        object.height = flowObjectHeight(item.type, item.content);
        nextY += Math.max(WRITING_LINE_HEIGHT, object.height);
        const safePoint = clampObjectToPage(object, page, object);
        return { ...object, ...safePoint } as PageObject;
      });

      commit('Insert notebook lines', (current) =>
        objects.reduce(
          (next, object) => addObjectToNotebook(next, pageId, object),
          current,
        ),
      );
      const lastObject = objects.at(-1) ?? null;
      set({
        selectedObjectId: lastObject?.id ?? null,
        editingObjectId: lastObject?.id ?? null,
        insertionPoint: {
          x: firstPoint.x,
          y: Math.min(page.height - WRITING_LINE_HEIGHT, nextY),
        },
        tool: 'select',
        lastHistoryGroup: null,
      });
      return objects.map((object) => object.id);
    },

    convertMathObjectToText(objectId, text) {
      const pageId = get().currentPageId;
      if (!pageId) return;
      commit(
        'Convert mathematics to text',
        (notebook) => convertMathObjectToTextDomain(notebook, pageId, objectId, text),
      );
      set({ selectedObjectId: objectId, editingObjectId: null, lastHistoryGroup: null });
    },

    updateMath(objectId, latex) {
      const pageId = get().currentPageId;
      if (!pageId) return;
      commit(
        'Edit mathematics',
        (notebook) => {
          const page = getPage(notebook, pageId);
          const source = page?.objects.find((object) => object.id === objectId);
          if (!page || !source || source.type !== 'math') return notebook;
          const nextHeight = flowObjectHeight('math', latex);
          const delta = nextHeight - source.height;
          let next = updateObject(notebook, pageId, objectId, { latex, height: nextHeight });
          if (delta === 0) return next;
          // Flow-created writing shares the ruled-paper column. When a math
          // line grows into a multiline expression, move only later objects in
          // that same column so handwriting order stays intact. Freely placed
          // objects elsewhere on the page are deliberately left untouched.
          for (const candidate of page.objects) {
            if (
              candidate.id === objectId
              || Math.abs(candidate.x - source.x) > 8
              || candidate.y < source.y + Math.min(source.height, WRITING_LINE_HEIGHT)
            ) continue;
            const maxY = Math.max(12, page.height - candidate.height - 12);
            next = updateObject(next, pageId, candidate.id, {
              y: Math.max(12, Math.min(maxY, candidate.y + delta)),
            });
          }
          return next;
        },
        `math:${objectId}`,
      );
    },

    updateText(objectId, text) {
      const pageId = get().currentPageId;
      if (!pageId) return;
      commit(
        'Edit text',
        (notebook) => updateObject(notebook, pageId, objectId, { text }),
        `text:${objectId}`,
      );
    },

    moveObject(objectId, point) {
      const state = get();
      if (!state.notebook || !state.currentPageId) return;
      const page = getPage(state.notebook, state.currentPageId);
      const object = getObject(state.notebook, state.currentPageId, objectId);
      if (!page || !object) return;
      const safe = clampObjectToPage(object, page, point);
      commit('Move object', (notebook) =>
        updateObject(notebook, state.currentPageId!, objectId, safe),
      );
    },

    deleteSelectedObject() {
      const state = get();
      if (!state.notebook || !state.currentPageId || !state.selectedObjectId) return;
      const objectId = state.selectedObjectId;
      commit('Delete object', (notebook) =>
        removeObject(notebook, state.currentPageId!, objectId),
      );
      set({ selectedObjectId: null, editingObjectId: null, lastHistoryGroup: null });
    },

    duplicateSelectedObject() {
      const state = get();
      if (!state.notebook || !state.currentPageId || !state.selectedObjectId) return null;
      const result = duplicateNotebookObject(
        state.notebook,
        state.currentPageId,
        state.selectedObjectId,
      );
      if (!result.objectId) return null;
      commit('Duplicate object', () => result.notebook);
      set({ selectedObjectId: result.objectId, editingObjectId: null });
      return result.objectId;
    },

    addPage() {
      const notebook = get().notebook;
      if (!notebook) return;
      const next = addPageToNotebook(notebook);
      const pageId = next.pages.at(-1)?.id ?? null;
      commit('Add page', () => next);
      set({ currentPageId: pageId, selectedObjectId: null, editingObjectId: null });
    },

    deletePage(pageId) {
      const state = get();
      if (!state.notebook || state.notebook.pages.length <= 1) return;
      const index = state.notebook.pages.findIndex((page) => page.id === pageId);
      const next = deletePageFromNotebook(state.notebook, pageId);
      if (next === state.notebook) return;
      const nextPage = next.pages[Math.min(Math.max(index, 0), next.pages.length - 1)];
      commit('Delete page', () => next);
      set({
        currentPageId: nextPage.id,
        selectedObjectId: null,
        editingObjectId: null,
      });
    },

    movePage(pageId, direction) {
      commit('Reorder page', (notebook) => moveNotebookPage(notebook, pageId, direction));
    },

    undo() {
      const state = get();
      const entry = state.undoStack.at(-1);
      if (!entry || !state.notebook) return;
      const currentPageStillExists = entry.notebook.pages.some(
        (page) => page.id === state.currentPageId,
      );
      set({
        notebook: entry.notebook,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, { notebook: state.notebook, label: entry.label }].slice(-100),
        currentPageId: currentPageStillExists
          ? state.currentPageId
          : (entry.notebook.pages[0]?.id ?? null),
        selectedObjectId: null,
        editingObjectId: null,
        lastHistoryGroup: null,
      });
      scheduleSave(entry.notebook, set);
    },

    redo() {
      const state = get();
      const entry = state.redoStack.at(-1);
      if (!entry || !state.notebook) return;
      set({
        notebook: entry.notebook,
        undoStack: [...state.undoStack, { notebook: state.notebook, label: entry.label }].slice(-100),
        redoStack: state.redoStack.slice(0, -1),
        currentPageId: entry.notebook.pages.some((page) => page.id === state.currentPageId)
          ? state.currentPageId
          : (entry.notebook.pages[0]?.id ?? null),
        selectedObjectId: null,
        editingObjectId: null,
        lastHistoryGroup: null,
      });
      scheduleSave(entry.notebook, set);
    },

    async saveNow() {
      const notebook = get().notebook;
      if (!notebook) return;
      if (saveTimer) clearTimeout(saveTimer);
      saveRevision += 1;
      set({ saveStatus: 'saving' });
      try {
        await saveNotebook(notebook);
        set({ saveStatus: 'saved', errorMessage: null });
        await get().refreshLibrary();
      } catch (error) {
        set({
          saveStatus: 'error',
          errorMessage: `Save failed: ${error instanceof Error ? error.message : 'Unknown storage error'}`,
        });
      }
    },
  };
});
