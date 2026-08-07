export interface VoiceNotationExample {
  phrase: string;
  latex: string;
}

export interface MathPaletteItem {
  label: string;
  visual: string;
  template: string;
  voice: VoiceNotationExample;
}

export interface MathPaletteCategory {
  id: string;
  label: string;
  items: MathPaletteItem[];
}

export const MATH_PALETTE_CATEGORIES: MathPaletteCategory[] = [
  {
    id: 'basic',
    label: 'Basic',
    items: [
      { label: 'Plus', visual: '+', template: '+', voice: { phrase: 'x plus y', latex: 'x+y' } },
      { label: 'Minus', visual: '−', template: '-', voice: { phrase: 'x minus y', latex: 'x-y' } },
      { label: 'Times', visual: '×', template: '\\times', voice: { phrase: 'x times y', latex: 'x\\times y' } },
      { label: 'Divide', visual: '÷', template: '\\div', voice: { phrase: 'x divided by y', latex: '\\frac{x}{y}' } },
      { label: 'Equals', visual: '=', template: '=', voice: { phrase: 'x equals y', latex: 'x=y' } },
      { label: 'Not equal', visual: '≠', template: '\\ne', voice: { phrase: 'x is not equal to y', latex: 'x\\ne y' } },
      { label: 'Less than', visual: '<', template: '<', voice: { phrase: 'x is less than y', latex: 'x<y' } },
      { label: 'Greater than', visual: '>', template: '>', voice: { phrase: 'x is greater than y', latex: 'x>y' } },
      { label: 'Less or equal', visual: '≤', template: '\\le', voice: { phrase: 'x is less than or equal to y', latex: 'x\\le y' } },
      { label: 'Greater or equal', visual: '≥', template: '\\ge', voice: { phrase: 'x is greater than or equal to y', latex: 'x\\ge y' } },
      { label: 'Plus or minus', visual: '±', template: '\\pm', voice: { phrase: 'x plus or minus y', latex: 'x\\pm y' } },
      { label: 'Fraction', visual: 'a⁄b', template: '\\frac{#0}{#?}', voice: { phrase: 'one over two', latex: '\\frac{1}{2}' } },
      { label: 'Square', visual: 'x²', template: '^{2}', voice: { phrase: 'x square', latex: 'x^2' } },
      { label: 'Power', visual: 'xⁿ', template: '^{#0}', voice: { phrase: 'x to the power of n', latex: 'x^{n}' } },
      { label: 'Square root', visual: '√x', template: '\\sqrt{#0}', voice: { phrase: 'square root of x', latex: '\\sqrt{x}' } },
      { label: 'Nth root', visual: 'ⁿ√x', template: '\\sqrt[#0]{#?}', voice: { phrase: 'fourth root of x', latex: '\\sqrt[4]{x}' } },
      { label: 'Parentheses', visual: '( )', template: '\\left(#0\\right)', voice: { phrase: 'open parenthesis x plus one close parenthesis', latex: '\\left(x+1\\right)' } },
      { label: 'Absolute value', visual: '|x|', template: '\\left|#0\\right|', voice: { phrase: 'absolute value of x', latex: '\\left|x\\right|' } },
    ],
  },
  {
    id: 'calculus',
    label: 'Calculus',
    items: [
      { label: 'Integral', visual: '∫', template: '\\int #0\\,d#?', voice: { phrase: 'integral x d x', latex: '\\int x\\,dx' } },
      { label: 'Definite integral', visual: '∫ₐᵇ', template: '\\int_{#0}^{#?}#?\\,d#?', voice: { phrase: 'integral from zero to two of x squared d x', latex: '\\int_{0}^{2}x^2\\,dx' } },
      { label: 'Derivative', visual: 'd/dx', template: '\\frac{d}{d#0}', voice: { phrase: 'derivative of x squared with respect to x', latex: '\\frac{d}{dx}\\left(x^2\\right)' } },
      { label: 'Partial derivative', visual: '∂/∂x', template: '\\frac{\\partial}{\\partial #0}', voice: { phrase: 'partial derivative of x squared with respect to x', latex: '\\frac{\\partial}{\\partial x}\\left(x^2\\right)' } },
      { label: 'Limit', visual: 'lim', template: '\\lim_{#0\\to#?}', voice: { phrase: 'limit as x approaches zero of sine x over x', latex: '\\lim_{x\\to0}\\frac{\\sin\\left(x\\right)}{x}' } },
      { label: 'Summation', visual: 'Σ', template: '\\sum_{#0}^{#?}', voice: { phrase: 'summation from n equals one to infinity of one over n squared', latex: '\\sum_{n=1}^{\\infty}\\frac{1}{n^2}' } },
      { label: 'Product', visual: 'Π', template: '\\prod_{#0}^{#?}', voice: { phrase: 'product from n equals one to five of n', latex: '\\prod_{n=1}^{5}n' } },
      { label: 'Infinity', visual: '∞', template: '\\infty', voice: { phrase: 'infinity', latex: '\\infty' } },
    ],
  },
  {
    id: 'functions',
    label: 'Functions',
    items: [
      { label: 'Sine', visual: 'sin', template: '\\sin\\left(#0\\right)', voice: { phrase: 'sine of x', latex: '\\sin\\left(x\\right)' } },
      { label: 'Cosine', visual: 'cos', template: '\\cos\\left(#0\\right)', voice: { phrase: 'cosine of x', latex: '\\cos\\left(x\\right)' } },
      { label: 'Tangent', visual: 'tan', template: '\\tan\\left(#0\\right)', voice: { phrase: 'tangent of x', latex: '\\tan\\left(x\\right)' } },
      { label: 'Secant', visual: 'sec', template: '\\sec\\left(#0\\right)', voice: { phrase: 'secant of x', latex: '\\sec\\left(x\\right)' } },
      { label: 'Cosecant', visual: 'csc', template: '\\csc\\left(#0\\right)', voice: { phrase: 'cosecant of x', latex: '\\csc\\left(x\\right)' } },
      { label: 'Cotangent', visual: 'cot', template: '\\cot\\left(#0\\right)', voice: { phrase: 'cotangent of x', latex: '\\cot\\left(x\\right)' } },
      { label: 'Inverse sine', visual: 'sin⁻¹', template: '\\sin^{-1}\\left(#0\\right)', voice: { phrase: 'inverse sine of x', latex: '\\sin^{-1}\\left(x\\right)' } },
      { label: 'Inverse cosine', visual: 'cos⁻¹', template: '\\cos^{-1}\\left(#0\\right)', voice: { phrase: 'inverse cosine of x', latex: '\\cos^{-1}\\left(x\\right)' } },
      { label: 'Inverse tangent', visual: 'tan⁻¹', template: '\\tan^{-1}\\left(#0\\right)', voice: { phrase: 'inverse tangent of x', latex: '\\tan^{-1}\\left(x\\right)' } },
      { label: 'Logarithm', visual: 'log', template: '\\log_{#0}\\left(#?\\right)', voice: { phrase: 'log base two of x', latex: '\\log_{2}\\left(x\\right)' } },
      { label: 'Natural log', visual: 'ln', template: '\\ln\\left(#0\\right)', voice: { phrase: 'natural log of x', latex: '\\ln\\left(x\\right)' } },
      { label: 'Exponential', visual: 'exp', template: '\\exp\\left(#0\\right)', voice: { phrase: 'exponential of x', latex: '\\exp\\left(x\\right)' } },
    ],
  },
  {
    id: 'greek',
    label: 'Greek',
    items: [
      ...[
        ['Alpha', 'Α', 'A', 'capital alpha', 'A'],
        ['Beta', 'Β', 'B', 'capital beta', 'B'],
        ['Gamma', 'Γ', '\\Gamma', 'capital gamma', '\\Gamma'],
        ['Delta', 'Δ', '\\Delta', 'capital delta', '\\Delta'],
        ['Theta', 'Θ', '\\Theta', 'capital theta', '\\Theta'],
        ['Lambda', 'Λ', '\\Lambda', 'capital lambda', '\\Lambda'],
        ['Sigma', 'Σ', '\\Sigma', 'capital sigma', '\\Sigma'],
        ['Phi', 'Φ', '\\Phi', 'capital phi', '\\Phi'],
        ['Psi', 'Ψ', '\\Psi', 'capital psi', '\\Psi'],
        ['Omega', 'Ω', '\\Omega', 'capital omega', '\\Omega'],
        ['alpha', 'α', '\\alpha', 'alpha', '\\alpha'],
        ['beta', 'β', '\\beta', 'beta', '\\beta'],
        ['gamma', 'γ', '\\gamma', 'gamma', '\\gamma'],
        ['delta', 'δ', '\\delta', 'delta', '\\delta'],
        ['epsilon', 'ε', '\\epsilon', 'epsilon', '\\epsilon'],
        ['theta', 'θ', '\\theta', 'theta', '\\theta'],
        ['lambda', 'λ', '\\lambda', 'lambda', '\\lambda'],
        ['mu', 'μ', '\\mu', 'mu', '\\mu'],
        ['pi', 'π', '\\pi', 'pi', '\\pi'],
        ['rho', 'ρ', '\\rho', 'rho', '\\rho'],
        ['sigma', 'σ', '\\sigma', 'sigma', '\\sigma'],
        ['phi', 'φ', '\\phi', 'phi', '\\phi'],
        ['psi', 'ψ', '\\psi', 'psi', '\\psi'],
        ['omega', 'ω', '\\omega', 'omega', '\\omega'],
      ].map(([label, visual, template, phrase, latex]) => ({
        label,
        visual,
        template,
        voice: { phrase, latex },
      })),
    ],
  },
  {
    id: 'linear-algebra',
    label: 'Linear algebra',
    items: [
      { label: 'Vector', visual: 'v⃗', template: '\\vec{#0}', voice: { phrase: 'vector x', latex: '\\vec{x}' } },
      { label: 'Column vector', visual: '[v]', template: '\\begin{pmatrix}#0\\\\#?\\end{pmatrix}', voice: { phrase: 'column vector x y', latex: '\\begin{pmatrix}x\\\\y\\end{pmatrix}' } },
      { label: '2 by 2 matrix', visual: '2×2', template: '\\begin{pmatrix}#0&#?\\\\#?&#?\\end{pmatrix}', voice: { phrase: 'two by two matrix one two three four', latex: '\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}' } },
      { label: '3 by 3 matrix', visual: '3×3', template: '\\begin{pmatrix}#0&#?&#?\\\\#?&#?&#?\\\\#?&#?&#?\\end{pmatrix}', voice: { phrase: 'three by three matrix one two three four five six seven eight nine', latex: '\\begin{pmatrix}1&2&3\\\\4&5&6\\\\7&8&9\\end{pmatrix}' } },
      { label: 'Determinant', visual: 'det', template: '\\det\\left(#0\\right)', voice: { phrase: 'determinant of x', latex: '\\det\\left(x\\right)' } },
    ],
  },
  {
    id: 'sets-logic',
    label: 'Sets & logic',
    items: [
      { label: 'Element of', visual: '∈', template: '\\in', voice: { phrase: 'x is an element of a', latex: 'x\\in a' } },
      { label: 'Not element of', visual: '∉', template: '\\notin', voice: { phrase: 'x is not an element of a', latex: 'x\\notin a' } },
      { label: 'Proper subset', visual: '⊂', template: '\\subset', voice: { phrase: 'a is a proper subset of b', latex: 'a\\subset b' } },
      { label: 'Subset or equal', visual: '⊆', template: '\\subseteq', voice: { phrase: 'a is a subset of or equal to b', latex: 'a\\subseteq b' } },
      { label: 'Union', visual: '∪', template: '\\cup', voice: { phrase: 'a union b', latex: 'a\\cup b' } },
      { label: 'Intersection', visual: '∩', template: '\\cap', voice: { phrase: 'a intersection b', latex: 'a\\cap b' } },
      { label: 'Empty set', visual: '∅', template: '\\varnothing', voice: { phrase: 'empty set', latex: '\\varnothing' } },
      { label: 'For all', visual: '∀', template: '\\forall', voice: { phrase: 'for all x', latex: '\\forall x' } },
      { label: 'There exists', visual: '∃', template: '\\exists', voice: { phrase: 'there exists x', latex: '\\exists x' } },
      { label: 'Implies', visual: '⇒', template: '\\Rightarrow', voice: { phrase: 'p implies q', latex: 'p\\Rightarrow q' } },
      { label: 'Equivalent', visual: '⇔', template: '\\Leftrightarrow', voice: { phrase: 'p if and only if q', latex: 'p\\Leftrightarrow q' } },
    ],
  },
];
