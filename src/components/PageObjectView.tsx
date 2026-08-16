import type { PageObject } from '../domain/model';
import { focusMathfield } from '../editor/mathfieldRegistry';
import { useNotebookStore } from '../store/notebookStore';
import { MathEditor } from './MathEditor';
import { TextEditor } from './TextEditor';
import { ResearchObjectView } from './ResearchObjectView';

export function PageObjectView({ object }: { object: PageObject }) {
  const selected = useNotebookStore((state) => state.selectedObjectId === object.id);
  const setSelectedObject = useNotebookStore((state) => state.setSelectedObject);
  const setInsertionPoint = useNotebookStore((state) => state.setInsertionPoint);

  return (
    <section
      className={`page-object page-object--${object.type}${selected ? ' is-selected' : ''}`}
      data-testid={`page-object-${object.type}`}
      data-object-id={object.id}
      style={{
        left: object.x,
        top: object.y,
        width: object.width,
        minHeight: object.height,
        zIndex: object.zIndex,
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        setSelectedObject(object.id);
        setInsertionPoint({ x: object.x, y: object.y });
      }}
      onDoubleClick={() => {
        if (object.type === 'math') focusMathfield(object.id);
      }}
    >
      {object.type === 'math'
        ? <MathEditor object={object} />
        : object.type === 'text' ? <TextEditor object={object} /> : <ResearchObjectView object={object} />}
    </section>
  );
}
