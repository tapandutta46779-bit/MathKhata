import type { TextObject } from '../domain/model';
import { useNotebookStore } from '../store/notebookStore';

interface TextEditorProps {
  object: TextObject;
}

export function TextEditor({ object }: TextEditorProps) {
  const updateText = useNotebookStore((state) => state.updateText);
  const setSelectedObject = useNotebookStore((state) => state.setSelectedObject);
  const setEditingObject = useNotebookStore((state) => state.setEditingObject);

  return (
    <textarea
      className="text-editor"
      aria-label="Text note"
      data-testid={`text-field-${object.id}`}
      value={object.text}
      placeholder="Write a thought…"
      onChange={(event) => updateText(object.id, event.target.value)}
      onFocus={() => {
        setSelectedObject(object.id);
        setEditingObject(object.id);
      }}
      onBlur={() => setEditingObject(null)}
      onPointerDown={(event) => event.stopPropagation()}
    />
  );
}

