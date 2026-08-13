import { useEffect, useState } from 'react';

interface KeyboardGeometry {
  visible: boolean;
  bottomOffset: number;
}

function readKeyboardGeometry(): KeyboardGeometry {
  const keyboard = window.mathVirtualKeyboard;
  const bounds = keyboard.boundingRect;
  return {
    visible: keyboard.visible,
    bottomOffset: keyboard.visible
      ? Math.max(12, window.innerHeight - bounds.top + 12)
      : 12,
  };
}

export function MathKeyboardDismiss() {
  const [geometry, setGeometry] = useState<KeyboardGeometry>(() => readKeyboardGeometry());

  useEffect(() => {
    const update = () => requestAnimationFrame(() => setGeometry(readKeyboardGeometry()));
    const keyboard = window.mathVirtualKeyboard;
    keyboard.addEventListener('virtual-keyboard-toggle', update);
    keyboard.addEventListener('geometrychange', update);
    window.addEventListener('resize', update);
    update();
    return () => {
      keyboard.removeEventListener('virtual-keyboard-toggle', update);
      keyboard.removeEventListener('geometrychange', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  if (!geometry.visible) return null;
  return (
    <button
      type="button"
      className="math-keyboard-dismiss"
      aria-label="Close math keyboard"
      style={{ bottom: geometry.bottomOffset }}
      onClick={() => window.mathVirtualKeyboard.hide()}
    >
      <span aria-hidden="true">⌄</span> Close keyboard
    </button>
  );
}
