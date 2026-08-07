import { useState } from 'react';
import type { MathObject } from '../domain/model';
import { focusMathfield, insertIntoMathfield } from '../editor/mathfieldRegistry';
import { useNotebookStore } from '../store/notebookStore';

interface PaletteItem {
  label: string;
  visual: string;
  template: string;
}

interface PaletteCategory {
  id: string;
  label: string;
  items: PaletteItem[];
}

const CATEGORIES: PaletteCategory[] = [
  {
    id: 'basic',
    label: 'Basic',
    items: [
      { label: 'Plus', visual: '+', template: '+' },
      { label: 'Minus', visual: '−', template: '-' },
      { label: 'Times', visual: '×', template: '\\times' },
      { label: 'Divide', visual: '÷', template: '\\div' },
      { label: 'Equals', visual: '=', template: '=' },
      { label: 'Not equal', visual: '≠', template: '\\ne' },
      { label: 'Less than', visual: '<', template: '<' },
      { label: 'Greater than', visual: '>', template: '>' },
      { label: 'Less or equal', visual: '≤', template: '\\le' },
      { label: 'Greater or equal', visual: '≥', template: '\\ge' },
      { label: 'Plus or minus', visual: '±', template: '\\pm' },
      { label: 'Fraction', visual: 'a⁄b', template: '\\frac{#0}{#?}' },
      { label: 'Square', visual: 'x²', template: '^{2}' },
      { label: 'Power', visual: 'xⁿ', template: '^{#0}' },
      { label: 'Square root', visual: '√x', template: '\\sqrt{#0}' },
      { label: 'Nth root', visual: 'ⁿ√x', template: '\\sqrt[#0]{#?}' },
      { label: 'Parentheses', visual: '( )', template: '\\left(#0\\right)' },
      { label: 'Absolute value', visual: '|x|', template: '\\left|#0\\right|' },
    ],
  },
  {
    id: 'calculus',
    label: 'Calculus',
    items: [
      { label: 'Integral', visual: '∫', template: '\\int #0\\,d#?' },
      { label: 'Definite integral', visual: '∫ₐᵇ', template: '\\int_{#0}^{#?}#?\\,d#?' },
      { label: 'Derivative', visual: 'd/dx', template: '\\frac{d}{d#0}' },
      { label: 'Partial derivative', visual: '∂/∂x', template: '\\frac{\\partial}{\\partial #0}' },
      { label: 'Limit', visual: 'lim', template: '\\lim_{#0\\to#?}' },
      { label: 'Summation', visual: 'Σ', template: '\\sum_{#0}^{#?}' },
      { label: 'Product', visual: 'Π', template: '\\prod_{#0}^{#?}' },
      { label: 'Infinity', visual: '∞', template: '\\infty' },
    ],
  },
  {
    id: 'functions',
    label: 'Functions',
    items: [
      { label: 'Sine', visual: 'sin', template: '\\sin\\left(#0\\right)' },
      { label: 'Cosine', visual: 'cos', template: '\\cos\\left(#0\\right)' },
      { label: 'Tangent', visual: 'tan', template: '\\tan\\left(#0\\right)' },
      { label: 'Secant', visual: 'sec', template: '\\sec\\left(#0\\right)' },
      { label: 'Cosecant', visual: 'csc', template: '\\csc\\left(#0\\right)' },
      { label: 'Cotangent', visual: 'cot', template: '\\cot\\left(#0\\right)' },
      { label: 'Inverse sine', visual: 'sin⁻¹', template: '\\sin^{-1}\\left(#0\\right)' },
      { label: 'Inverse cosine', visual: 'cos⁻¹', template: '\\cos^{-1}\\left(#0\\right)' },
      { label: 'Inverse tangent', visual: 'tan⁻¹', template: '\\tan^{-1}\\left(#0\\right)' },
      { label: 'Logarithm', visual: 'log', template: '\\log_{#0}\\left(#?\\right)' },
      { label: 'Natural log', visual: 'ln', template: '\\ln\\left(#0\\right)' },
      { label: 'Exponential', visual: 'exp', template: '\\exp\\left(#0\\right)' },
    ],
  },
  {
    id: 'greek',
    label: 'Greek',
    items: [
      ...[
        ['Alpha', 'Α', 'A'], ['Beta', 'Β', 'B'], ['Gamma', 'Γ', '\\Gamma'],
        ['Delta', 'Δ', '\\Delta'], ['Theta', 'Θ', '\\Theta'], ['Lambda', 'Λ', '\\Lambda'],
        ['Sigma', 'Σ', '\\Sigma'], ['Phi', 'Φ', '\\Phi'], ['Psi', 'Ψ', '\\Psi'],
        ['Omega', 'Ω', '\\Omega'], ['alpha', 'α', '\\alpha'], ['beta', 'β', '\\beta'],
        ['gamma', 'γ', '\\gamma'], ['delta', 'δ', '\\delta'], ['epsilon', 'ε', '\\epsilon'],
        ['theta', 'θ', '\\theta'], ['lambda', 'λ', '\\lambda'], ['mu', 'μ', '\\mu'],
        ['pi', 'π', '\\pi'], ['rho', 'ρ', '\\rho'], ['sigma', 'σ', '\\sigma'],
        ['phi', 'φ', '\\phi'], ['psi', 'ψ', '\\psi'], ['omega', 'ω', '\\omega'],
      ].map(([label, visual, template]) => ({ label, visual, template })),
    ],
  },
  {
    id: 'linear-algebra',
    label: 'Linear algebra',
    items: [
      { label: 'Vector', visual: 'v⃗', template: '\\vec{#0}' },
      { label: 'Column vector', visual: '[v]', template: '\\begin{pmatrix}#0\\\\#?\\end{pmatrix}' },
      { label: '2 by 2 matrix', visual: '2×2', template: '\\begin{pmatrix}#0&#?\\\\#?&#?\\end{pmatrix}' },
      { label: '3 by 3 matrix', visual: '3×3', template: '\\begin{pmatrix}#0&#?&#?\\\\#?&#?&#?\\\\#?&#?&#?\\end{pmatrix}' },
      { label: 'Determinant', visual: 'det', template: '\\det\\left(#0\\right)' },
    ],
  },
  {
    id: 'sets-logic',
    label: 'Sets & logic',
    items: [
      { label: 'Element of', visual: '∈', template: '\\in' },
      { label: 'Not element of', visual: '∉', template: '\\notin' },
      { label: 'Proper subset', visual: '⊂', template: '\\subset' },
      { label: 'Subset or equal', visual: '⊆', template: '\\subseteq' },
      { label: 'Union', visual: '∪', template: '\\cup' },
      { label: 'Intersection', visual: '∩', template: '\\cap' },
      { label: 'Empty set', visual: '∅', template: '\\varnothing' },
      { label: 'For all', visual: '∀', template: '\\forall' },
      { label: 'There exists', visual: '∃', template: '\\exists' },
      { label: 'Implies', visual: '⇒', template: '\\Rightarrow' },
      { label: 'Equivalent', visual: '⇔', template: '\\Leftrightarrow' },
    ],
  },
];

function selectedMathObject(): MathObject | null {
  const state = useNotebookStore.getState();
  const object = state.notebook
    ?.pages.find((page) => page.id === state.currentPageId)
    ?.objects.find((candidate) => candidate.id === state.selectedObjectId);
  return object?.type === 'math' ? object : null;
}

function insertTemplate(template: string) {
  const state = useNotebookStore.getState();
  const selected = selectedMathObject();
  if (selected && insertIntoMathfield(selected.id, template)) return;
  const id = state.createObject('math', state.insertionPoint);
  if (id) {
    requestAnimationFrame(() => {
      focusMathfield(id);
      insertIntoMathfield(id, template);
    });
  }
}

export function MathPalette() {
  const [categoryId, setCategoryId] = useState('basic');
  const open = useNotebookStore((state) => state.paletteOpen);
  const setOpen = useNotebookStore((state) => state.setPaletteOpen);
  if (!open) return null;
  const category = CATEGORIES.find((item) => item.id === categoryId) ?? CATEGORIES[0];

  return (
    <section className="math-palette" aria-label="Mathematical symbol palette" data-testid="math-palette">
      <div className="palette-header">
        <div>
          <strong>Symbols</strong>
          <span>Insert at the active caret</span>
        </div>
        <button type="button" aria-label="Close symbol palette" onClick={() => setOpen(false)}>
          ×
        </button>
      </div>
      <div className="palette-body">
        <div className="palette-tabs" role="tablist" aria-label="Symbol categories">
          {CATEGORIES.map((item) => (
            <button
              type="button"
              role="tab"
              aria-selected={item.id === category.id}
              className={item.id === category.id ? 'is-active' : ''}
              key={item.id}
              onClick={() => setCategoryId(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="palette-grid" role="tabpanel">
          {category.items.map((item) => (
            <button
              type="button"
              className="palette-key"
              key={`${category.id}-${item.label}`}
              aria-label={`Insert ${item.label}`}
              title={item.label}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertTemplate(item.template)}
            >
              {item.visual}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

