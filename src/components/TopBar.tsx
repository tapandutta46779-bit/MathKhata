import { useCallback, useEffect, useRef, useState } from 'react';
import type { Notebook } from '../domain/model';
import { deserializeNotebook, serializeNotebook, MAX_IMPORT_BYTES } from '../domain/schema';
import { checkOfflineAppReady } from '../offline';
import { useNotebookStore } from '../store/notebookStore';
import packageMetadata from '../../package.json';

interface TopBarProps {
  notebook: Notebook;
  pageNumber: number;
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface OfflineAIONSetupState {
  phase: 'idle' | 'installing' | 'preparing' | 'ready' | 'error';
  message?: string;
  progress?: number;
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
  return `${safe || 'Math-Notebook'}.mathkhata.json`;
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
  const resetNotebook = useNotebookStore((state) => state.resetNotebook);
  const [title, setTitle] = useState(notebook.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [offlineAIONSetup, setOfflineAIONSetup] = useState<OfflineAIONSetupState>({ phase: 'idle' });
  const [offlineAppReady, setOfflineAppReady] = useState<boolean | null>(null);
  const [menuMessage, setMenuMessage] = useState<string | null>(null);
  const offlineAIONSetupPromise = useRef<Promise<void> | null>(null);
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

  const prepareOfflineAION = useCallback(() => {
    if (offlineAIONSetupPromise.current) return offlineAIONSetupPromise.current;
    const setup = (async () => {
      setOfflineAIONSetup({
        phase: 'preparing',
        message: 'Preparing offline AION. Keep Math Notebook open and connected until setup finishes…',
        progress: 0,
      });
      try {
        setOfflineAppReady(await checkOfflineAppReady());
        await navigator.storage?.persist?.().catch(() => false);
        const { canUseAIONWebGPU, prepareAIONWebGPU } = await import('../aion/webgpuProvider');
        if (!canUseAIONWebGPU()) {
          throw new Error('Offline AION requires WebGPU and sufficient laptop memory. The notebook app is still installed and Fast online remains available.');
        }
        await prepareAIONWebGPU((message, progress) => {
          setOfflineAIONSetup({ phase: 'preparing', message, progress });
        });
        setOfflineAIONSetup({
          phase: 'ready',
          message: 'Math Notebook and offline AION are ready on this device.',
          progress: 100,
        });
        setOfflineAppReady(await checkOfflineAppReady());
        setMenuMessage('Math Notebook and offline AION are ready on this device.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Offline AION setup could not finish.';
        setOfflineAIONSetup({ phase: 'error', message });
        setMenuMessage('Math Notebook was installed, but offline AION setup needs attention.');
      }
    })().finally(() => {
      offlineAIONSetupPromise.current = null;
    });
    offlineAIONSetupPromise.current = setup;
    return setup;
  }, []);

  useEffect(() => {
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const installed = () => {
      setInstallPrompt(null);
      setInstallOpen(true);
      setMenuMessage('Math Notebook was installed. Preparing offline AION…');
      void prepareOfflineAION();
    };
    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', installed);
    };
  }, [prepareOfflineAION]);

  useEffect(() => {
    if (!installOpen || offlineAIONSetup.phase !== 'idle') return;
    let active = true;
    void Promise.all([
      checkOfflineAppReady(),
      import('../aion/webgpuProvider').then(({ isAIONWebGPUCached }) => isAIONWebGPUCached()),
    ])
      .then(([appReady, aionCached]) => {
        if (!active) return;
        setOfflineAppReady(appReady);
        if (aionCached) {
          setOfflineAIONSetup({
            phase: 'ready',
            message: 'Offline AION is already prepared on this device.',
            progress: 100,
          });
        }
      })
      .catch(() => {
        // Cache inspection is advisory; setup will report any actionable error.
      });
    return () => {
      active = false;
    };
  }, [installOpen, offlineAIONSetup.phase]);

  useEffect(() => {
    if (!installOpen) return;
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setInstallOpen(false);
    };
    window.addEventListener('keydown', closeFromEscape, true);
    return () => window.removeEventListener('keydown', closeFromEscape, true);
  }, [installOpen]);

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
      <div className="brand-mark" aria-label="Math Notebook">
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
            <button
              type="button"
              role="menuitem"
              className="overflow-menu__danger"
              onClick={() => {
                setMenuOpen(false);
                if (window.confirm('Reset this notebook to one blank page? Its title, preferences, and AION setup are preserved. You can undo this action.')) resetNotebook();
              }}
            >
              Reset current notebook…
            </button>
            {!window.mathKhataDesktop && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  window.dispatchEvent(new CustomEvent('mathkhata:overlay-open', { detail: 'install-app' }));
                  setInstallOpen(true);
                }}
              >
                Install Math Notebook…
              </button>
            )}
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
        aria-label="Import Math Notebook JSON"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          try {
            if (file.size > MAX_IMPORT_BYTES) throw new Error('Import exceeds the 64 MB safety limit.');
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
              <h2 id="about-title">Math Notebook</h2>
            </div>
            <button type="button" aria-label="Close About Math Notebook" onClick={() => setAboutOpen(false)}>×</button>
          </div>
          <p>A local-first mathematical notebook and research workspace. Your notebook stays in this browser unless you export it.</p>
          <dl className="about-dialog__facts">
            <div><dt>Version</dt><dd>{packageMetadata.version}</dd></div>
            <div><dt>Storage</dt><dd>Local browser database</dd></div>
            <div><dt>Analytics</dt><dd>{import.meta.env.MODE === 'web' ? 'Cookie-free page metrics' : 'None'}</dd></div>
          </dl>
          <div className="about-dialog__links">
            <a href="./privacy.html" target="_blank" rel="noreferrer">Privacy</a>
            <a href="./LICENSE.txt" target="_blank" rel="noreferrer">MIT License</a>
            <a href="./THIRD-PARTY-NOTICES.txt" target="_blank" rel="noreferrer">Third-party licenses</a>
            <a href={import.meta.env.VITE_FEEDBACK_URL || 'https://github.com/tapandutta46779-bit/MathKhata-Feedback/issues/new'} target="_blank" rel="noreferrer">Report an issue</a>
          </div>
          <p className="about-dialog__note">Browser speech availability depends on the browser. AION is optional, and notebook editing never depends on it.</p>
        </section>
      </div>
    )}
    {installOpen && (
      <div
        className="modal-backdrop"
        role="presentation"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) setInstallOpen(false);
        }}
      >
        <section className="about-dialog install-dialog" role="dialog" aria-modal="true" aria-labelledby="install-title">
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">Android · Mac · desktop</span>
              <h2 id="install-title">Install Math Notebook</h2>
            </div>
            <button type="button" aria-label="Close Install Math Notebook" onClick={() => setInstallOpen(false)}>×</button>
          </div>
          <p>Install the web app for a normal app window and offline notebook workspace. After installation, Math Notebook automatically prepares private AION for offline use.</p>
          {installPrompt ? (
            <button
              type="button"
              className="install-dialog__primary"
              disabled={offlineAIONSetup.phase === 'installing' || offlineAIONSetup.phase === 'preparing'}
              onClick={async () => {
                setOfflineAIONSetup({ phase: 'installing', message: 'Waiting for installation confirmation…' });
                try {
                  await installPrompt.prompt();
                  const choice = await installPrompt.userChoice;
                  if (choice.outcome === 'accepted') {
                    setInstallPrompt(null);
                    await prepareOfflineAION();
                  } else {
                    setOfflineAIONSetup({ phase: 'idle' });
                  }
                } catch (error) {
                  setOfflineAIONSetup({
                    phase: 'error',
                    message: error instanceof Error ? error.message : 'Installation could not start.',
                  });
                }
              }}
            >
              {offlineAIONSetup.phase === 'installing' ? 'Confirm installation…' : 'Install app + prepare offline AION'}
            </button>
          ) : (
            <div className="install-dialog__instructions">
              <p><strong>Android:</strong> open the browser menu and choose <em>Install app</em> or <em>Add to Home screen</em>.</p>
              <p><strong>Mac:</strong> in Chrome or Edge choose <em>Install Math Notebook</em>; in Safari choose <em>File → Add to Dock</em>.</p>
              <p><strong>iPhone/iPad:</strong> use <em>Share → Add to Home Screen</em>.</p>
              {offlineAIONSetup.phase !== 'ready' && (
                <button
                  type="button"
                  className="install-dialog__primary"
                  disabled={offlineAIONSetup.phase === 'preparing'}
                  onClick={() => void prepareOfflineAION()}
                >
                  {offlineAIONSetup.phase === 'preparing' ? 'Preparing offline AION…' : 'Prepare offline AION now'}
                </button>
              )}
            </div>
          )}
          {offlineAIONSetup.phase !== 'idle' && (
            <div className={`install-dialog__aion-status is-${offlineAIONSetup.phase}`} role="status" aria-live="polite">
              <strong>
                {offlineAIONSetup.phase === 'ready'
                  ? 'Offline AION ready'
                  : offlineAIONSetup.phase === 'error'
                    ? 'Offline AION needs attention'
                    : offlineAIONSetup.phase === 'installing'
                      ? 'Installing Math Notebook'
                      : 'Downloading offline AION'}
              </strong>
              {offlineAIONSetup.progress !== undefined && (
                <progress max="100" value={offlineAIONSetup.progress} aria-label="Offline AION setup progress" />
              )}
              {offlineAIONSetup.message && <p>{offlineAIONSetup.message}</p>}
            </div>
          )}
          <div className="install-dialog__readiness" aria-label="Offline readiness">
            <div className={offlineAppReady ? 'is-ready' : ''}>
              <span aria-hidden="true">{offlineAppReady ? '✓' : '○'}</span>
              <p><strong>Math Notebook offline app</strong><small>{offlineAppReady ? 'Complete browser-compatible workspace cached' : 'Finishing or checking the offline app cache'}</small></p>
            </div>
            <div className={offlineAIONSetup.phase === 'ready' ? 'is-ready' : ''}>
              <span aria-hidden="true">{offlineAIONSetup.phase === 'ready' ? '✓' : '○'}</span>
              <p><strong>Private AION offline</strong><small>{offlineAIONSetup.phase === 'ready' ? 'Model and runtime cached on this device' : 'Ready only after the separate setup finishes'}</small></p>
            </div>
          </div>
          <p className="about-dialog__note">The AION private model is separate from the app shell. Its first download is cached after successful setup, but the browser may remove it if site storage is cleared. Fast online AION requires no model download.</p>
        </section>
      </div>
    )}
    </>
  );
}
