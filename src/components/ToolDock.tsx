import type { NotebookTool } from '../store/notebookStore';
import { useNotebookStore } from '../store/notebookStore';

const TOOLS: Array<{ id: NotebookTool; label: string; shortcut: string; icon: string }> = [
  { id: 'select', label: 'Select', shortcut: 'Esc', icon: '↖' },
  { id: 'text', label: 'Text', shortcut: 'T', icon: 'T' },
  { id: 'math', label: 'Math', shortcut: 'M', icon: '∑' },
  { id: 'voice', label: 'Voice', shortcut: 'V', icon: '◉' },
];

export function ToolDock() {
  const activeTool = useNotebookStore((state) => state.tool);
  const setTool = useNotebookStore((state) => state.setTool);
  const paletteOpen = useNotebookStore((state) => state.paletteOpen);
  const setPaletteOpen = useNotebookStore((state) => state.setPaletteOpen);

  return (
    <nav className="tool-dock" aria-label="Notebook tools">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className={activeTool === tool.id ? 'is-active' : ''}
          aria-pressed={activeTool === tool.id}
          aria-label={`${tool.label} tool (${tool.shortcut})`}
          title={`${tool.label} (${tool.shortcut})`}
          onClick={() => setTool(tool.id)}
        >
          <span className="tool-icon" aria-hidden="true">{tool.icon}</span>
          <span>{tool.label}</span>
        </button>
      ))}
      <span className="tool-separator" />
      <button
        type="button"
        className={paletteOpen ? 'is-active' : ''}
        aria-pressed={paletteOpen}
        aria-label="Toggle symbol palette"
        title="Symbol palette"
        onClick={() => setPaletteOpen(!paletteOpen)}
      >
        <span className="tool-icon" aria-hidden="true">Ω</span>
        <span>Symbols</span>
      </button>
    </nav>
  );
}

