import { useNotebookStore } from '../store/notebookStore';
import { insertIntoMathfield } from '../editor/mathfieldRegistry';
import type { NotebookVoiceCandidate, VoiceInsertionController } from './types';

export class NotebookVoiceInsertionController implements VoiceInsertionController {
  accept(candidate: NotebookVoiceCandidate): string[] {
    const state = useNotebookStore.getState();
    const selected = state.notebook
      ?.pages.find((page) => page.id === state.currentPageId)
      ?.objects.find((object) => object.id === state.selectedObjectId);
    const onlySegment = candidate.segments.length === 1 ? candidate.segments[0] : null;
    if (
      selected?.type === 'math' &&
      onlySegment?.kind === 'math' &&
      onlySegment.latex &&
      onlySegment.unknownTokens.length === 0 &&
      insertIntoMathfield(selected.id, onlySegment.latex)
    ) {
      return [selected.id];
    }
    return state.createFlowObjects(
      candidate.segments.map((segment) => ({
        type: segment.kind,
        content: segment.kind === 'math' ? (segment.latex ?? '') : (segment.text ?? segment.sourceText),
      })),
    );
  }

  cancel(): void {
    // Candidates are provisional UI state; cancellation intentionally writes nothing.
  }
}
