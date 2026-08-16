import { useEffect, useState, type CSSProperties } from 'react';
import type { Notebook } from '../domain/model';
import { useNotebookStore } from '../store/notebookStore';

interface PageNavigatorProps {
  notebook: Notebook;
}

export function PageNavigator({ notebook }: PageNavigatorProps) {
  const collapsed = useNotebookStore((state) => state.navigatorCollapsed);
  const setCollapsed = useNotebookStore((state) => state.setNavigatorCollapsed);
  const currentPageId = useNotebookStore((state) => state.currentPageId);
  const setCurrentPage = useNotebookStore((state) => state.setCurrentPage);
  const addPage = useNotebookStore((state) => state.addPage);
  const deletePage = useNotebookStore((state) => state.deletePage);
  const movePage = useNotebookStore((state) => state.movePage);
  const updatePagesMetadata = useNotebookStore((state) => state.updatePagesMetadata);
  const deletePages = useNotebookStore((state) => state.deletePages);
  const resetPages = useNotebookStore((state) => state.resetPages);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const valid = new Set(notebook.pages.map((page) => page.id));
    setSelected((current) => new Set([...current].filter((id) => valid.has(id))));
  }, [notebook.pages]);

  const selectedIds = [...selected];
  const allSelected = selected.size === notebook.pages.length;

  function togglePage(pageId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  }

  if (collapsed) {
    return (
      <aside className="page-nav page-nav--collapsed">
        <button
          type="button"
          aria-label="Expand page navigator"
          title="Show pages"
          onClick={() => setCollapsed(false)}
        >
          ›
        </button>
      </aside>
    );
  }

  return (
    <aside className="page-nav" aria-label="Notebook pages">
      <div className="page-nav__heading">
        <span>Pages</span>
        <button
          type="button"
          className={selecting ? 'is-active' : ''}
          aria-label={selecting ? 'Finish selecting pages' : 'Select pages'}
          title={selecting ? 'Done' : 'Select pages'}
          onClick={() => {
            setSelecting((value) => !value);
            if (selecting) setSelected(new Set());
          }}
        >
          {selecting ? '✓' : '☑'}
        </button>
        <button
          type="button"
          aria-label="Collapse page navigator"
          title="Collapse pages"
          onClick={() => setCollapsed(true)}
        >
          ‹
        </button>
      </div>
      <div className="page-list">
        {notebook.pages.map((page, index) => (
          <div
            className={`page-list-item${selected.has(page.id) ? ' is-selected' : ''}`}
            key={page.id}
            style={{ '--page-highlight': page.highlightColor ?? 'transparent' } as CSSProperties}
          >
            {selecting && (
              <label className="page-select-check">
                <input
                  type="checkbox"
                  checked={selected.has(page.id)}
                  aria-label={`Select page ${index + 1}`}
                  onChange={() => togglePage(page.id)}
                />
              </label>
            )}
            <button
              type="button"
              className={`page-thumbnail${page.id === currentPageId ? ' is-current' : ''}`}
              aria-label={`Open page ${index + 1}`}
              onClick={() => selecting ? togglePage(page.id) : setCurrentPage(page.id)}
            >
              <span className="thumbnail-paper" aria-hidden="true">
                {page.favorite && <b className="thumbnail-favorite">★</b>}
                {page.objects.slice(0, 7).map((object) => (
                  <i
                    key={object.id}
                    className={`thumbnail-mark thumbnail-mark--${object.type}`}
                    style={{
                      left: `${(object.x / page.width) * 100}%`,
                      top: `${(object.y / page.height) * 100}%`,
                      width: `${Math.max(12, (object.width / page.width) * 100)}%`,
                    }}
                  />
                ))}
              </span>
              <span>Page {index + 1}</span>
            </button>
            {!selecting && <div className="page-order-controls">
              <button
                type="button"
                aria-label={`Move page ${index + 1} earlier`}
                disabled={index === 0}
                onClick={() => movePage(page.id, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move page ${index + 1} later`}
                disabled={index === notebook.pages.length - 1}
                onClick={() => movePage(page.id, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={`Delete page ${index + 1}`}
                disabled={notebook.pages.length === 1}
                onClick={() => {
                  if (window.confirm(`Delete page ${index + 1}? You can undo this action.`)) {
                    deletePage(page.id);
                  }
                }}
              >
                ×
              </button>
            </div>}
          </div>
        ))}
      </div>
      {selecting && (
        <section className="page-bulk-actions" aria-label="Selected page actions">
          <p><strong>{selected.size}</strong> selected</p>
          <div className="page-bulk-actions__selection">
            <button type="button" disabled={allSelected} onClick={() => setSelected(new Set(notebook.pages.map((page) => page.id)))}>Select all</button>
            <button type="button" disabled={selected.size === 0} onClick={() => setSelected(new Set())}>Clear</button>
          </div>
          <div className="page-bulk-actions__grid">
            <button type="button" disabled={!selected.size} onClick={() => updatePagesMetadata(selectedIds, { favorite: true })}>★ Favorite</button>
            <button type="button" disabled={!selected.size} onClick={() => updatePagesMetadata(selectedIds, { favorite: false })}>☆ Unfavorite</button>
            <label className="page-highlight-picker">
              Highlight
              <input
                type="color"
                aria-label="Page highlight color"
                defaultValue="#fff0a8"
                disabled={!selected.size}
                onChange={(event) => updatePagesMetadata(selectedIds, { highlightColor: event.target.value })}
              />
            </label>
            <button type="button" disabled={!selected.size} onClick={() => updatePagesMetadata(selectedIds, { highlightColor: null })}>Clear color</button>
            <button
              type="button"
              disabled={!selected.size}
              onClick={() => window.dispatchEvent(new CustomEvent('mathnotebook:print-pages', { detail: selectedIds }))}
            >Print</button>
            <button
              type="button"
              disabled={!selected.size}
              onClick={() => {
                if (window.confirm(`Reset content on ${selected.size} selected page${selected.size === 1 ? '' : 's'}? You can undo this action.`)) resetPages(selectedIds);
              }}
            >Reset</button>
            <button
              type="button"
              className="is-danger"
              disabled={!selected.size}
              onClick={() => {
                if (!window.confirm(`Delete ${selected.size} selected page${selected.size === 1 ? '' : 's'}? You can undo this action.`)) return;
                deletePages(selectedIds);
                setSelected(new Set());
              }}
            >Delete</button>
          </div>
        </section>
      )}
      <button type="button" className="add-page-button" onClick={addPage}>
        + Add page
      </button>
    </aside>
  );
}
