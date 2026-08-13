import { useEffect, useState } from 'react';
import { focusActiveMathfield, showActiveMathfieldMenu } from '../editor/mathfieldRegistry';
import { useNotebookStore } from '../store/notebookStore';
import type { WritingMode } from './ContinuousLineComposer';

interface ToolDockProps {
  writingMode: WritingMode;
  onWritingModeChange: (mode: WritingMode) => void;
  onOpenResearch: () => void;
  onToggleCalculator: () => void;
}

export function ToolDock({ writingMode, onWritingModeChange, onOpenResearch, onToggleCalculator }: ToolDockProps) {
  const [writingToolsOpen, setWritingToolsOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(() => window.mathVirtualKeyboard.visible);
  const activeTool = useNotebookStore((state) => state.tool);
  const setTool = useNotebookStore((state) => state.setTool);
  const paletteOpen = useNotebookStore((state) => state.paletteOpen);
  const setPaletteOpen = useNotebookStore((state) => state.setPaletteOpen);

  useEffect(() => {
    if (activeTool === 'draw' || activeTool === 'voice') setWritingToolsOpen(false);
  }, [activeTool]);

  useEffect(() => {
    const update = () => setKeyboardVisible(window.mathVirtualKeyboard.visible);
    window.mathVirtualKeyboard.addEventListener('virtual-keyboard-toggle', update);
    window.mathVirtualKeyboard.addEventListener('geometrychange', update);
    return () => {
      window.mathVirtualKeyboard.removeEventListener('virtual-keyboard-toggle', update);
      window.mathVirtualKeyboard.removeEventListener('geometrychange', update);
    };
  }, []);

  function focusWriter() {
    setTool('select');
    requestAnimationFrame(() => window.dispatchEvent(new Event('mathnotebook:focus-writer')));
  }

  function targetMathComposer(command: 'keyboard' | 'menu') {
    if (command === 'menu' && showActiveMathfieldMenu()) return;
    if (command === 'keyboard' && focusActiveMathfield()) {
      if (window.mathVirtualKeyboard.visible) window.mathVirtualKeyboard.hide();
      else window.mathVirtualKeyboard.show();
      return;
    }
    onWritingModeChange('math');
    setTool('select');
    requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('mathnotebook:math-command', { detail: command })));
  }

  return (
    <>
      {writingToolsOpen && (
        <aside className="writing-tools" aria-label="Writing and mathematics tools">
          <header>
            <strong>Write on ruled lines</strong>
            <span>Enter moves to the next line</span>
          </header>
          <div className="writing-mode-buttons" aria-label="Writing recognition mode">
            {(['auto', 'text', 'math'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={writingMode === mode ? 'is-active' : ''}
                aria-pressed={writingMode === mode}
                onClick={() => {
                  onWritingModeChange(mode);
                  focusWriter();
                }}
              >
                {mode === 'auto' ? 'Auto text + math' : mode === 'text' ? 'Text only' : 'Math only'}
              </button>
            ))}
          </div>
          <div className="writing-math-actions">
            <button type="button" onClick={() => targetMathComposer('keyboard')}>
              {keyboardVisible ? '⌄ Close keyboard' : '⌨ Math keyboard'}
            </button>
            <button type="button" onClick={() => targetMathComposer('menu')}>☰ Insert structures</button>
            <button
              type="button"
              className={paletteOpen ? 'is-active' : ''}
              onClick={() => setPaletteOpen(!paletteOpen)}
            >
              Ω Symbols
            </button>
          </div>
        </aside>
      )}
      <nav className="tool-dock" aria-label="Notebook tools">
        <button
          type="button"
          className={activeTool === 'select' ? 'is-active' : ''}
          aria-pressed={activeTool === 'select'}
          aria-label="Write on ruled lines"
          title="Write on ruled lines"
          onClick={focusWriter}
        >
          <span className="tool-icon" aria-hidden="true">⌶</span><span>Write</span>
        </button>
        <button
          type="button"
          className={writingToolsOpen ? 'is-active' : ''}
          aria-expanded={writingToolsOpen}
          aria-label="Open writing and math controls"
          title="Writing and math controls"
          onClick={() => setWritingToolsOpen((open) => !open)}
        >
          <span className="tool-icon" aria-hidden="true">∑</span><span>Math tools</span>
        </button>
        <button
          type="button"
          className={activeTool === 'voice' ? 'is-active' : ''}
          aria-pressed={activeTool === 'voice'}
          aria-label="Voice writing"
          title="Voice writing"
          onClick={() => setTool('voice')}
        >
          <span className="tool-icon" aria-hidden="true">◉</span><span>Voice</span>
        </button>
        <button
          type="button"
          className={activeTool === 'draw' ? 'is-active' : ''}
          aria-pressed={activeTool === 'draw'}
          aria-label="Draw on page"
          title="Draw on page"
          onClick={() => setTool(activeTool === 'draw' ? 'select' : 'draw')}
        >
          <span className="tool-icon" aria-hidden="true">✎</span><span>Draw</span>
        </button>
        <span className="tool-separator" />
        <button type="button" aria-label="Open graph and research workspace" title="Research workspace" onClick={onOpenResearch}>
          <span className="tool-icon" aria-hidden="true">⌁</span><span>Research</span>
        </button>
        <button type="button" aria-label="Toggle floating calculator" title="Calculator" onClick={onToggleCalculator}>
          <span className="tool-icon tool-icon--calculator" aria-hidden="true">123</span><span>Calc</span>
        </button>
      </nav>
    </>
  );
}
