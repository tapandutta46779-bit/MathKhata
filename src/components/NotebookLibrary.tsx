import { useNotebookStore } from '../store/notebookStore';

export function NotebookLibrary() {
  const open = useNotebookStore((state) => state.libraryOpen);
  const setOpen = useNotebookStore((state) => state.setLibraryOpen);
  const library = useNotebookStore((state) => state.library);
  const currentId = useNotebookStore((state) => state.notebook?.id);
  const openNotebook = useNotebookStore((state) => state.openNotebook);
  const createNewNotebook = useNotebookStore((state) => state.createNewNotebook);
  const deleteNotebook = useNotebookStore((state) => state.deleteNotebook);
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onPointerDown={() => setOpen(false)}>
      <section
        className="notebook-library"
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">Stored on this Mac</span>
            <h2 id="library-title">Notebooks</h2>
          </div>
          <button type="button" aria-label="Close notebooks" onClick={() => setOpen(false)}>×</button>
        </div>
        <div className="library-list">
          {library.map((item) => (
            <div
              className={item.id === currentId ? 'is-current' : ''}
              key={item.id}
            >
              <button type="button" className="library-open-notebook" onClick={() => void openNotebook(item.id)}>
                <strong>{item.title}</strong>
                <span>{item.pageCount} {item.pageCount === 1 ? 'page' : 'pages'}</span>
                <time dateTime={item.updatedAt}>
                  {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.updatedAt))}
                </time>
              </button>
              <button
                type="button"
                className="library-delete-notebook"
                aria-label={`Delete notebook ${item.title}`}
                onClick={() => {
                  if (!window.confirm(`Delete notebook “${item.title}”? Its locally stored pages will be removed from this browser.`)) return;
                  void deleteNotebook(item.id);
                }}
              >Delete</button>
            </div>
          ))}
        </div>
        <button type="button" className="primary-button new-notebook" onClick={() => void createNewNotebook()}>
          + New notebook
        </button>
      </section>
    </div>
  );
}
