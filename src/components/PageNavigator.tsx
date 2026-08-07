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
          aria-label="Collapse page navigator"
          title="Collapse pages"
          onClick={() => setCollapsed(true)}
        >
          ‹
        </button>
      </div>
      <div className="page-list">
        {notebook.pages.map((page, index) => (
          <div className="page-list-item" key={page.id}>
            <button
              type="button"
              className={`page-thumbnail${page.id === currentPageId ? ' is-current' : ''}`}
              aria-label={`Open page ${index + 1}`}
              onClick={() => setCurrentPage(page.id)}
            >
              <span className="thumbnail-paper" aria-hidden="true">
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
            <div className="page-order-controls">
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
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="add-page-button" onClick={addPage}>
        + Add page
      </button>
    </aside>
  );
}

