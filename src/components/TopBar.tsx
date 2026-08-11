import { useEffect, useRef, useState } from 'react';
import type { Notebook } from '../domain/model';
import { deserializeNotebook, serializeNotebook } from '../domain/schema';
import { useNotebookStore } from '../store/notebookStore';
import packageMetadata from '../../package.json';

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
  const [aboutOpen, setAboutOpen] = useState(false);
  const [menuMessage, setMenuMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const overflow = useRef<HTMLDivElement>(null);

  useEffect(() => setTitle(notebook.title), [notebook.id, notebook.title]);

  useEffect(() => {
    const closeForOtherOverlay = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== 'notebook-menu') {
        setMenuOpen(false);
      }
    };
    window.addEventListener('mathkhata:overlay-open', closeForOtherOverlay);
    return () => window.removeEventListener('mathkhata:overlay-open', closeForOtherOverlay);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => {
      setMenuOpen(false);
      requestAnimationFrame(() => window.scrollTo({ left: 0, top: window.scrollY }));
    };
    const closeFromOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !overflow.current?.contains(event.target)) close();
    };
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    };
    document.addEventListener('pointerdown', closeFromOutside, true);
    window.addEventListener('keydown', closeFromEscape, true);
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside, true);
      window.removeEventListener('keydown', closeFromEscape, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!aboutOpen) return;
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setAboutOpen(false);
    };
    window.addEventListener('keydown', closeFromEscape, true);
    return () => window.removeEventListener('keydown', closeFromEscape, true);
  }, [aboutOpen]);

  function toggleMenu() {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    window.dispatchEvent(new CustomEvent('mathkhata:overlay-open', { detail: 'notebook-menu' }));
    setMenuOpen(true);
  }

  function exportNotebook() {
    const blob = new Blob([serializeNotebook(notebook)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = safeFilename(notebook.title);
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setMenuMessage('Structured notebook export created.');
    setMenuOpen(false);
  }

  return (
    <>
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
      <div className="overflow-wrap" ref={overflow}>
        <button
          type="button"
          aria-label="Notebook menu"
          aria-expanded={menuOpen}
          title="Notebook menu"
          onClick={toggleMenu}
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
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); fileInput.current?.click(); }}>Import JSON…</button>
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); window.print(); }}>Print / Save PDF…</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                window.dispatchEvent(new CustomEvent('mathkhata:overlay-open', { detail: 'about' }));
                setAboutOpen(true);
              }}
            >
              About &amp; feedback…
            </button>
          </div>
        )}
      </div>
      {menuMessage && <p className="top-bar-message" role="status">{menuMessage}</p>}
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
    {aboutOpen && (
      <div
        className="modal-backdrop"
        role="presentation"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) setAboutOpen(false);
        }}
      >
        <section className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title">
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">Public Beta</span>
              <h2 id="about-title">MathKhata</h2>
            </div>
            <button type="button" aria-label="Close About MathKhata" onClick={() => setAboutOpen(false)}>×</button>
          </div>
          <p>A local-first mathematical notebook and research workspace. Your notebook stays in this browser unless you export it.</p>
          <dl className="about-dialog__facts">
            <div><dt>Version</dt><dd>{packageMetadata.version}</dd></div>
            <div><dt>Storage</dt><dd>Local browser database</dd></div>
            <div><dt>Telemetry</dt><dd>None</dd></div>
          </dl>
          <div className="about-dialog__links">
            <a href="./privacy.html" target="_blank" rel="noreferrer">Privacy</a>
            <a href={import.meta.env.VITE_FEEDBACK_URL || 'https://github.com/tapandutta46779-bit/MathKhata-Feedback/issues/new'} target="_blank" rel="noreferrer">Report an issue</a>
          </div>
          <p className="about-dialog__note">Browser speech availability depends on the browser. AION is optional, and notebook editing never depends on it.</p>
        </section>
      </div>
    )}
    </>
  );
}
