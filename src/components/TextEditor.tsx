import { useLayoutEffect, useRef } from 'react';
import type { TextObject } from '../domain/model';
import { useNotebookStore } from '../store/notebookStore';
import { effectiveTextStyle, TEXT_FONT_STACKS } from '../domain/textStyle';

interface TextEditorProps {
  object: TextObject;
}

export function TextEditor({ object }: TextEditorProps) {
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const updateText = useNotebookStore((state) => state.updateText);
  const setSelectedObject = useNotebookStore((state) => state.setSelectedObject);
  const setEditingObject = useNotebookStore((state) => state.setEditingObject);
  const editingObjectId = useNotebookStore((state) => state.editingObjectId);
  const style = effectiveTextStyle(object.style);

  function fitContent(element: HTMLTextAreaElement) {
    element.style.height = 'auto';
    element.style.height = `${Math.max(40, element.scrollHeight)}px`;
  }

  useLayoutEffect(() => {
    if (fieldRef.current) fitContent(fieldRef.current);
  }, [object.text]);

  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field || editingObjectId !== object.id) return;
    field.focus({ preventScroll: true });
    field.setSelectionRange(field.value.length, field.value.length);
  }, [editingObjectId, object.id]);

  return (
    <textarea
      ref={fieldRef}
      className="text-editor"
      aria-label="Text note"
      data-testid={`text-field-${object.id}`}
      value={object.text}
      rows={1}
      placeholder="Write a thought…"
      style={{
        color: style.color,
        fontFamily: TEXT_FONT_STACKS[style.fontFamily],
        fontSize: style.fontSize,
        fontWeight: style.bold ? 700 : 400,
        fontStyle: style.italic ? 'italic' : 'normal',
      }}
      onChange={(event) => {
        fitContent(event.currentTarget);
        updateText(object.id, event.target.value);
      }}
      onFocus={() => {
        setSelectedObject(object.id);
        setEditingObject(object.id);
      }}
      onBlur={() => {
        if (useNotebookStore.getState().editingObjectId === object.id) {
          setEditingObject(null);
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
    />
  );
}
