import type { Point } from '../domain/model';
import { useNotebookStore } from '../store/notebookStore';
import { insertIntoMathfield } from '../editor/mathfieldRegistry';
import type { MathCandidate, VoiceInsertionController } from './types';

export class NotebookVoiceInsertionController implements VoiceInsertionController {
  accept(candidate: MathCandidate, point: Point): string | null {
    const state = useNotebookStore.getState();
    const selected = state.notebook
      ?.pages.find((page) => page.id === state.currentPageId)
      ?.objects.find((object) => object.id === state.selectedObjectId);
    if (selected?.type === 'math' && insertIntoMathfield(selected.id, candidate.latex)) {
      return selected.id;
    }
    return state.createObject('math', point, candidate.latex);
  }

  cancel(): void {
    // Candidates are provisional UI state; cancellation intentionally writes nothing.
  }
}

