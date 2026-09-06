import type { MathObject, Notebook, Page, PageObject, TextObject } from '../domain/model';

export interface MathCheckSuggestion {
  id: string;
  message: string;
  proposedLatex?: string;
  sourceObjectId: string;
  actions: Array<'keep' | 'apply'>;
}

export interface MathCheckInput {
  expression: MathObject;
  previousExpressions: MathObject[];
  nearbyObjects: PageObject[];
}

export interface MathCheckProvider {
  readonly id: string;
  readonly enabled: boolean;
  inspect(input: MathCheckInput): Promise<MathCheckSuggestion[]>;
}

export const disabledMathCheckProvider: MathCheckProvider = {
  id: 'disabled-stage-1',
  enabled: false,
  async inspect() {
    return [];
  },
};

export interface NotebookContext {
  notebook: Notebook;
  currentPage: Page;
  selectedObject: PageObject | null;
  nearbyObjects: PageObject[];
  previousEquations: MathObject[];
  textAnnotations: TextObject[];
  spatialRelationships: Array<{
    fromId: string;
    toId: string;
    relation: 'above' | 'below' | 'left-of' | 'right-of' | 'near';
  }>;
  recentEditLabels: string[];
}

export interface DocumentContextProvider {
  getContext(): NotebookContext | null;
}

export function createDocumentContext(
  notebook: Notebook,
  pageId: string,
  selectedObjectId: string | null,
  recentEditLabels: string[] = [],
  pendingObjects: PageObject[] = [],
): NotebookContext | null {
  const savedPage = notebook.pages.find((page) => page.id === pageId);
  if (!savedPage) return null;
  const currentPage = pendingObjects.length
    ? { ...savedPage, objects: [...savedPage.objects, ...pendingObjects] }
    : savedPage;
  const selectedObject =
    currentPage.objects.find((object) => object.id === selectedObjectId) ?? null;
  const nearbyObjects = selectedObject
    ? currentPage.objects.filter(
        (object) =>
          object.id !== selectedObject.id &&
          Math.hypot(object.x - selectedObject.x, object.y - selectedObject.y) < 420,
      )
    : currentPage.objects;
  const objectsBeforeSelection = selectedObject
    ? currentPage.objects.filter((object) => object.y <= selectedObject.y)
    : currentPage.objects;

  return {
    notebook,
    currentPage,
    selectedObject,
    nearbyObjects,
    previousEquations: objectsBeforeSelection.filter(
      (object): object is MathObject => object.type === 'math',
    ),
    textAnnotations: currentPage.objects.filter(
      (object): object is TextObject => object.type === 'text',
    ),
    spatialRelationships: selectedObject
      ? nearbyObjects.map((object) => {
          const dx = object.x - selectedObject.x;
          const dy = object.y - selectedObject.y;
          const relation =
            Math.hypot(dx, dy) < 140
              ? ('near' as const)
              : Math.abs(dx) > Math.abs(dy)
                ? dx < 0
                  ? ('left-of' as const)
                  : ('right-of' as const)
                : dy < 0
                  ? ('above' as const)
                  : ('below' as const);
          return { fromId: object.id, toId: selectedObject.id, relation };
        })
      : [],
    recentEditLabels,
  };
}
