import { describe, expect, it } from 'vitest';
import { AION_BASE_MODEL, AION_DISPLAY_NAME, createAIONPagePrompt } from '../src/aion/runtime';
import { createNotebook, createMathObject, createTextObject, addObject } from '../src/domain/notebook';
import { createDocumentContext } from '../src/extensions/providers';

describe('AION local-runtime boundary', () => {
  it('uses the exact AION name and discloses a real base model', () => {
    expect(AION_DISPLAY_NAME).toBe('AION');
    expect(AION_BASE_MODEL).toBe('onnx-community/Qwen2.5-0.5B-Instruct');
  });

  it('creates a spatially ordered, read-only page prompt', () => {
    const notebook = createNotebook('Analysis notes');
    const page = notebook.pages[0];
    let withObjects = addObject(notebook, page.id, createTextObject({ x: 82, y: 64 }, 'Solve separately'));
    withObjects = addObject(withObjects, page.id, createMathObject({ x: 82, y: 20 }, 'x^2=4'));
    const context = createDocumentContext(withObjects, page.id, null);

    expect(context).not.toBeNull();
    const prompt = createAIONPagePrompt(context!);
    expect(prompt).toContain('You are AION');
    expect(prompt.indexOf('x^2=4')).toBeLessThan(prompt.indexOf('Solve separately'));
    expect(prompt).toContain('Do not claim that you edited the notebook');
  });
});
