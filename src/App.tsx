import { useEffect } from 'react';
import { blurActiveMathfield } from './editor/mathfieldRegistry';
import { MathPalette } from './components/MathPalette';
import { NotebookLibrary } from './components/NotebookLibrary';
import { NotebookPage } from './components/NotebookPage';
import { PageNavigator } from './components/PageNavigator';
import { ToolDock } from './components/ToolDock';
import { TopBar } from './components/TopBar';
import { VoicePanel } from './components/VoicePanel';
import { useNotebookStore } from './store/notebookStore';

function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'MATH-FIELD' ||
    target.isContentEditable
  );
}

export default function App() {
  const notebook = useNotebookStore((state) => state.notebook);
  const hydrated = useNotebookStore((state) => state.hydrated);
  const currentPageId = useNotebookStore((state) => state.currentPageId);
  const editingObjectId = useNotebookStore((state) => state.editingObjectId);
  const selectedObjectId = useNotebookStore((state) => state.selectedObjectId);
  const tool = useNotebookStore((state) => state.tool);
  const errorMessage = useNotebookStore((state) => state.errorMessage);
  const initialize = useNotebookStore((state) => state.initialize);
  const saveNow = useNotebookStore((state) => state.saveNow);
  const undo = useNotebookStore((state) => state.undo);
  const redo = useNotebookStore((state) => state.redo);
  const setTool = useNotebookStore((state) => state.setTool);
  const setEditingObject = useNotebookStore((state) => state.setEditingObject);
  const setSelectedObject = useNotebookStore((state) => state.setSelectedObject);
  const setPaletteOpen = useNotebookStore((state) => state.setPaletteOpen);
  const deleteSelectedObject = useNotebookStore((state) => state.deleteSelectedObject);
  const duplicateSelectedObject = useNotebookStore((state) => state.duplicateSelectedObject);
  const clearError = useNotebookStore((state) => state.clearError);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const editingTarget = isEditingTarget(event.target);
      const key = event.key.toLowerCase();
      if (event.metaKey && key === 's') {
        event.preventDefault();
        void saveNow();
        return;
      }
      if (event.metaKey && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (event.metaKey && key === 'd' && !editingTarget) {
        event.preventDefault();
        duplicateSelectedObject();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        if (editingObjectId || editingTarget) {
          blurActiveMathfield();
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          setEditingObject(null);
        } else if (tool !== 'select') {
          setTool('select');
        } else if (selectedObjectId) {
          setSelectedObject(null);
        }
        setPaletteOpen(false);
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && !editingTarget && !editingObjectId) {
        if (selectedObjectId) {
          event.preventDefault();
          deleteSelectedObject();
        }
        return;
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && !editingTarget) {
        if (key === 'm') setTool('math');
        if (key === 't') setTool('text');
        if (key === 'v') setTool('voice');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    deleteSelectedObject,
    duplicateSelectedObject,
    editingObjectId,
    redo,
    saveNow,
    selectedObjectId,
    setEditingObject,
    setPaletteOpen,
    setSelectedObject,
    setTool,
    tool,
    undo,
  ]);

  if (!hydrated || !notebook) {
    return (
      <main className="loading-screen">
        <span className="loading-mark" aria-hidden="true">∫</span>
        <p>Opening your khata…</p>
      </main>
    );
  }

  const currentPage = notebook.pages.find((page) => page.id === currentPageId) ?? notebook.pages[0];
  const pageNumber = notebook.pages.findIndex((page) => page.id === currentPage.id) + 1;

  return (
    <div className="app-shell">
      <TopBar notebook={notebook} pageNumber={pageNumber} />
      <div className="workspace">
        <PageNavigator notebook={notebook} />
        <main className="canvas-scroll" aria-label="Notebook workspace">
          <div className="page-frame">
            <NotebookPage page={currentPage} />
            <span className="page-foot">{pageNumber}</span>
          </div>
        </main>
      </div>
      <ToolDock />
      <MathPalette />
      {tool === 'voice' && <VoicePanel />}
      <NotebookLibrary />
      {errorMessage && (
        <div className="error-toast" role="alert">
          <span>{errorMessage}</span>
          <button type="button" aria-label="Dismiss error" onClick={clearError}>×</button>
        </div>
      )}
    </div>
  );
}

