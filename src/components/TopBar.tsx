import { useEffect, useRef, useState } from 'react';
import type { Notebook } from '../domain/model';
import { deserializeNotebook, serializeNotebook } from '../domain/schema';
import { useNotebookStore } from '../store/notebookStore';

interface TopBarProps {
  notebook: Notebook;
  pageNumber: number;
}

const STATUS_LABELS = {
  loading: 'Loading…',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Saved locally',
  error: 'Save error',
};

function safeFilename(title: string): string {
  const safe = title.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '');
  return `${safe || 'MathKhata-notebook'}.mathkhata.json`;
}

export function TopBar({ notebook, pageNumber }: TopBarProps) {
  const renameNotebook = useNotebookStore((state) => state.renameNotebook);
  const saveStatus = useNotebookStore((state) => state.saveStatus);
  const saveNow = useNotebookStore((state) => state.saveNow);
  const undo = useNotebookStore((state) => state.undo);
  const redo = useNotebookStore((state) => state.redo);
  const canUndo = useNotebookStore((state) => state.undoStack.length > 0);
  const canRedo = useNotebookStore((state) => state.redoStack.length > 0);
  const setLibraryOpen = useNotebookStore((state) => state.setLibraryOpen);
  const createNewNotebook = useNotebookStore((state) => state.createNewNotebook);
  const importNotebook = useNotebookStore((state) => state.importNotebook);
  const [title, setTitle] = useState(notebook.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMessage, setMenuMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => setTitle(notebook.title), [notebook.id, notebook.title]);

  function exportNotebook() {
    const blob = new Blob([serializeNotebook(notebook)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = safeFilename(notebook.title);
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setMenuMessage('Structured notebook export created.');
  }

  return (
    <header className="top-bar">
      <div className="brand-mark" aria-label="MathKhata">
        <span aria-hidden="true">∫</span>
      </div>
      <input
        className="notebook-title"
        aria-label="Notebook title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => {
          renameNotebook(title);
          if (!title.trim()) setTitle(notebook.title);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setTitle(notebook.title);
            event.currentTarget.blur();
          }
        }}
      />
      <span className="page-status">Page {pageNumber} of {notebook.pages.length}</span>
      <div className="top-bar__spacer" />
      <button
        type="button"
        className="save-status"
        data-status={saveStatus}
        aria-label={`${STATUS_LABELS[saveStatus]}. Save now`}
        title="Save now (⌘S)"
        onClick={() => void saveNow()}
      >
        <span className="save-dot" aria-hidden="true" />
        {STATUS_LABELS[saveStatus]}
      </button>
      <div className="history-buttons" aria-label="History controls">
        <button type="button" aria-label="Undo" title="Undo (⌘Z)" disabled={!canUndo} onClick={undo}>↶</button>
        <button type="button" aria-label="Redo" title="Redo (⌘⇧Z)" disabled={!canRedo} onClick={redo}>↷</button>
      </div>
      <div className="overflow-wrap">
        <button
          type="button"
          aria-label="Notebook menu"
          aria-expanded={menuOpen}
          title="Notebook menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          •••
        </button>
        {menuOpen && (
          <div className="overflow-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => { setLibraryOpen(true); setMenuOpen(false); }}>
              Open notebook…
            </button>
            <button type="button" role="menuitem" onClick={() => { void createNewNotebook(); setMenuOpen(false); }}>
              New notebook
            </button>
            <button type="button" role="menuitem" onClick={exportNotebook}>Export structured JSON</button>
            <button type="button" role="menuitem" onClick={() => fileInput.current?.click()}>Import JSON…</button>
            <button type="button" role="menuitem" onClick={() => window.print()}>Print / Save PDF…</button>
            {menuMessage && <p role="status">{menuMessage}</p>}
          </div>
        )}
      </div>
      <input
        ref={fileInput}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        aria-label="Import MathKhata JSON"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          try {
            const imported = deserializeNotebook(await file.text());
            await importNotebook(imported);
            setMenuMessage(`Imported “${imported.title}” as a validated local notebook.`);
            setMenuOpen(false);
          } catch (error) {
            setMenuMessage(
              `Import rejected without changing your notebook: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
          }
        }}
      />
    </header>
  );
}

