import { useCallback, useEffect, useState } from 'react';
import {
  blurActiveMathfield,
  dismissActiveMathfieldMenu,
} from './editor/mathfieldRegistry';
import { MathPalette } from './components/MathPalette';
import { NotebookLibrary } from './components/NotebookLibrary';
import { NotebookPage } from './components/NotebookPage';
import { PageNavigator } from './components/PageNavigator';
import { PageAssistantRail } from './components/PageAssistantRail';
import { ToolDock } from './components/ToolDock';
import { TopBar } from './components/TopBar';
import { VoicePanel } from './components/VoicePanel';
import { FloatingCalculator } from './components/FloatingCalculator';
import { ResearchToolsPanel } from './components/ResearchToolsPanel';
import { MathKeyboardDismiss } from './components/MathKeyboardDismiss';
import { PrintableNotebook } from './components/PrintableNotebook';
import type { WritingMode } from './components/ContinuousLineComposer';
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
  const [researchOpen, setResearchOpen] = useState(false);
  const [researchObjectId, setResearchObjectId] = useState<string | null>(null);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [writingMode, setWritingMode] = useState<WritingMode>('auto');
  const [printPageIds, setPrintPageIds] = useState<string[]>([]);
  const notebook = useNotebookStore((state) => state.notebook);
  const hydrated = useNotebookStore((state) => state.hydrated);
  const currentPageId = useNotebookStore((state) => state.currentPageId);
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
  const closeResearch = useCallback(() => { setResearchOpen(false); setResearchObjectId(null); }, []);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') void saveNow();
    };
    const flushOnPageHide = () => void saveNow();
    document.addEventListener('visibilitychange', flushWhenHidden);
    window.addEventListener('pagehide', flushOnPageHide);
    return () => {
      document.removeEventListener('visibilitychange', flushWhenHidden);
      window.removeEventListener('pagehide', flushOnPageHide);
    };
  }, [saveNow]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const editingTarget = isEditingTarget(event.target);
      const key = event.key.toLowerCase();
      const liveState = useNotebookStore.getState();
      const commandModifier = event.metaKey || event.ctrlKey;
      if (commandModifier && key === 's') {
        event.preventDefault();
        event.stopPropagation();
        void saveNow();
        return;
      }
      if (commandModifier && key === 'z') {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (commandModifier && key === 'd' && !editingTarget) {
        event.preventDefault();
        duplicateSelectedObject();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (dismissActiveMathfieldMenu()) return;
        if (window.mathVirtualKeyboard.visible) {
          window.mathVirtualKeyboard.hide();
          return;
        }
        if (liveState.editingObjectId || editingTarget) {
          blurActiveMathfield();
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          setEditingObject(null);
        } else if (liveState.tool !== 'select') {
          setTool('select');
        } else if (liveState.selectedObjectId) {
          setSelectedObject(null);
        }
        setPaletteOpen(false);
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && !editingTarget && !liveState.editingObjectId) {
        if (liveState.selectedObjectId) {
          event.preventDefault();
          deleteSelectedObject();
        }
        return;
      }
      if (!editingTarget && !liveState.editingObjectId && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && liveState.selectedObjectId) {
        const selected = liveState.notebook?.pages.find((page) => page.id === liveState.currentPageId)?.objects.find((object) => object.id === liveState.selectedObjectId);
        if (selected?.type === 'research') {
          event.preventDefault();
          const amount = event.shiftKey ? 10 : 1;
          liveState.moveObject(selected.id, {
            x: selected.x + (event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0),
            y: selected.y + (event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0),
          });
          return;
        }
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && !editingTarget) {
        if (key === 'm') {
          setWritingMode('math');
          setTool('select');
          requestAnimationFrame(() => window.dispatchEvent(new Event('mathnotebook:focus-writer')));
        }
        if (key === 't') {
          setWritingMode('text');
          setTool('select');
          requestAnimationFrame(() => window.dispatchEvent(new Event('mathnotebook:focus-writer')));
        }
        if (key === 'v') setTool('voice');
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    deleteSelectedObject,
    duplicateSelectedObject,
    redo,
    saveNow,
    setEditingObject,
    setPaletteOpen,
    setSelectedObject,
    setTool,
    undo,
  ]);

  useEffect(() => window.mathKhataDesktop?.onCommand((command) => {
    if (command === 'save') void saveNow();
    if (command === 'undo') undo();
    if (command === 'redo') redo();
    if (command === 'print') window.print();
  }), [redo, saveNow, undo]);

  useEffect(() => {
    const printPages = (event: Event) => {
      const ids = (event as CustomEvent<string[]>).detail;
      if (!Array.isArray(ids) || ids.length === 0) return;
      setPrintPageIds(ids);
      requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    };
    const clearPrintPages = () => setPrintPageIds([]);
    window.addEventListener('mathnotebook:print-pages', printPages);
    window.addEventListener('afterprint', clearPrintPages);
    return () => {
      window.removeEventListener('mathnotebook:print-pages', printPages);
      window.removeEventListener('afterprint', clearPrintPages);
    };
  }, []);

  useEffect(() => {
    const editResearchObject = (event: Event) => {
      const objectId = (event as CustomEvent<string>).detail;
      const exists = useNotebookStore.getState().notebook?.pages.some((page) => page.objects.some((object) => object.id === objectId && object.type === 'research'));
      if (!exists) return;
      window.dispatchEvent(new CustomEvent('mathkhata:overlay-open', { detail: 'research-tools' }));
      setResearchObjectId(objectId);
      setResearchOpen(true);
    };
    window.addEventListener('mathnotebook:edit-research-object', editResearchObject);
    return () => window.removeEventListener('mathnotebook:edit-research-object', editResearchObject);
  }, []);

  if (!hydrated || !notebook) {
    return (
      <main className="loading-screen">
        <span className="loading-mark" aria-hidden="true">∫</span>
        <p>Opening your notebook…</p>
      </main>
    );
  }

  const currentPage = notebook.pages.find((page) => page.id === currentPageId) ?? notebook.pages[0];
  const pageNumber = notebook.pages.findIndex((page) => page.id === currentPage.id) + 1;
  const editedResearchObject = notebook.pages.flatMap((page) => page.objects).find((object) => object.id === researchObjectId);

  return (
    <div className="app-shell">
      <TopBar notebook={notebook} pageNumber={pageNumber} />
      <div className="workspace">
        <PageNavigator notebook={notebook} />
        <main className="canvas-scroll" aria-label="Notebook workspace">
          <div className="page-frame">
            <NotebookPage page={currentPage} writingMode={writingMode} />
            <span className="page-foot">{pageNumber}</span>
          </div>
        </main>
      </div>
      <ToolDock
        writingMode={writingMode}
        onWritingModeChange={setWritingMode}
        onOpenResearch={() => {
          window.dispatchEvent(new CustomEvent('mathkhata:overlay-open', { detail: 'research-tools' }));
          setResearchObjectId(null);
          setResearchOpen(true);
        }}
        onToggleCalculator={() => setCalculatorOpen((open) => !open)}
      />
      <MathKeyboardDismiss />
      <MathPalette />
      {tool === 'voice' && <VoicePanel />}
      <PageAssistantRail />
      <NotebookLibrary />
      <ResearchToolsPanel
        notebookId={notebook.id}
        open={researchOpen}
        onClose={closeResearch}
        workspaceObjectId={researchObjectId}
        initialTool={editedResearchObject?.type === 'research' ? editedResearchObject.snapshot.kind : '2d'}
      />
      <FloatingCalculator open={calculatorOpen} onToggle={() => setCalculatorOpen((open) => !open)} />
      <PrintableNotebook pages={notebook.pages.filter((page) => printPageIds.includes(page.id))} allPages={notebook.pages} />
      {errorMessage && (
        <div className="error-toast" role="alert">
          <span>{errorMessage}</span>
          <button type="button" aria-label="Dismiss error" onClick={clearError}>×</button>
        </div>
      )}
    </div>
  );
}
